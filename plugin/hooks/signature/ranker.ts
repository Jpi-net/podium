import { TagIndex, type CaseMeta, type TagIndexData } from './tag-index'
import { Vocabulary, type Facet, type VocabularyData } from './vocabulary'

export type RankQuery = { tags: readonly string[], stack: readonly string[], projectId: string, now: number, halfLifeMonths: number }

export type Ranked = { id: number, score: number }

type Plan = { direct: string[], up: string[], down: Map<string, readonly string[]>, terms: Map<string, number> }

export class CaseRanker {
  static readonly WEIGHTS: Readonly<Record<Facet, number>> = { concept: 3, decision: 2.5, artifact: 2, lens: 1.5, phase: 1, stack: 1 }

  private static readonly PARENT = 0.4
  private static readonly CHILDREN = new WeakMap<object, Map<string, string[]>>()
  private static readonly DAY = 86400000
  private static readonly MONTH_DAYS = 30.4375
  private static readonly SCOPE_FACTORS = { sameProject: 1.3, otherProject: 0.5, sharedStack: 1.15, otherStack: 0.6 }
  private static readonly STATUS_FACTORS: readonly number[] = [0, 0.7, 1, 0.3]

  static idf(index: TagIndexData, tag: string): number {
    const stored = Object.prototype.hasOwnProperty.call(index.df, tag) ? index.df[tag] : undefined
    const df = typeof stored === 'number' && stored > 0 ? stored : 1
    return Math.log(1 + Math.max(index.n, 1) / df)
  }

  static recency(lastSeen: number, now: number, halfLifeMonths: number): number {
    const then = TagIndex.dateMs(lastSeen)
    if (then === 0) return 1
    const days = Math.max(0, (now - then) / CaseRanker.DAY)
    const half = halfLifeMonths > 0 ? halfLifeMonths : 12
    return 0.5 ** (days / CaseRanker.MONTH_DAYS / half)
  }

  static isSituational(vocabulary: VocabularyData, tags: readonly string[]): boolean {
    try {
      return tags.some((tag) => {
        const facet = Vocabulary.facetOf(vocabulary, tag)
        return facet !== undefined && facet !== 'stack' && facet !== 'phase'
      })
    } catch {
      return false
    }
  }

  static score(index: TagIndexData, vocabulary: VocabularyData, query: RankQuery, id: number): number {
    try {
      return CaseRanker.scorePlanned(index, query, CaseRanker.plan(index, vocabulary, query), id)
    } catch {
      return 0
    }
  }

  static top(index: TagIndexData, vocabulary: VocabularyData, query: RankQuery, k: number, minScore: number): Ranked[] {
    try {
      if (!(k > 0) || !CaseRanker.isSituational(vocabulary, query.tags)) return []
      const plan = CaseRanker.plan(index, vocabulary, query)
      const candidates = new Set<number>()
      const walked = [...plan.direct, ...plan.up, ...[...plan.down.values()].flat()]
      for (const tag of walked) for (const id of TagIndex.postingsOf(index, tag)) candidates.add(id)
      const scored: Ranked[] = []
      for (const id of candidates) {
        const score = CaseRanker.scorePlanned(index, query, plan, id)
        if (score > 0 && score >= minScore) scored.push({ id, score })
      }
      const meta = (id: number) => TagIndex.metaFor(index, id)
      scored.sort(
        (a, b) =>
          b.score - a.score ||
          (meta(b.id)?.[0] ?? 0) - (meta(a.id)?.[0] ?? 0) ||
          (meta(b.id)?.[1] ?? 0) - (meta(a.id)?.[1] ?? 0) ||
          a.id - b.id
      )
      return scored.slice(0, Math.floor(k))
    } catch {
      return []
    }
  }

  private static plan(index: TagIndexData, vocabulary: VocabularyData, query: RankQuery): Plan {
    const direct = [...new Set(query.tags)].filter((tag) => Vocabulary.facetOf(vocabulary, tag) !== undefined)
    const known = new Set(direct)
    const up: string[] = []
    for (const tag of direct) {
      for (const parent of Vocabulary.ancestors(vocabulary, tag)) {
        if (!known.has(parent) && !up.includes(parent)) up.push(parent)
      }
    }
    const children = CaseRanker.children(vocabulary)
    const down = new Map<string, readonly string[]>()
    const terms = new Map<string, number>()
    for (const tag of [...direct, ...up]) {
      const facet = Vocabulary.facetOf(vocabulary, tag)
      terms.set(tag, facet === undefined ? 0 : CaseRanker.WEIGHTS[facet] * CaseRanker.idf(index, tag))
    }
    for (const tag of direct) down.set(tag, children.get(tag) ?? [])
    return { direct, up, down, terms }
  }

  private static children(vocabulary: VocabularyData): Map<string, string[]> {
    const cached = CaseRanker.CHILDREN.get(vocabulary)
    if (cached) return cached
    const map = new Map<string, string[]>()
    for (const tag of Object.keys(vocabulary.tags)) {
      for (const ancestor of Vocabulary.ancestors(vocabulary, tag)) {
        const list = map.get(ancestor)
        if (list) list.push(tag)
        else map.set(ancestor, [tag])
      }
    }
    CaseRanker.CHILDREN.set(vocabulary, map)
    return map
  }

  private static scorePlanned(index: TagIndexData, query: RankQuery, plan: Plan, id: number): number {
    const meta = TagIndex.metaFor(index, id)
    if (!meta) return 0
    const statusFactor = CaseRanker.STATUS_FACTORS[meta[3]] ?? 0
    if (statusFactor === 0) return 0
    const holds = (tag: string) => TagIndex.contains(index, tag, id)
    let raw = 0
    for (const tag of plan.direct) {
      const term = plan.terms.get(tag) ?? 0
      if (holds(tag)) raw += term
      if ((plan.down.get(tag) ?? []).some(holds)) raw += CaseRanker.PARENT * term
    }
    for (const tag of plan.up) {
      if (holds(tag)) raw += CaseRanker.PARENT * (plan.terms.get(tag) ?? 0)
    }
    if (raw === 0) return 0
    const recency = CaseRanker.recency(meta[1], query.now, query.halfLifeMonths)
    return raw * meta[0] * recency * CaseRanker.scopeFactor(meta, query) * statusFactor
  }

  private static scopeFactor(meta: CaseMeta, query: RankQuery): number {
    const factors = CaseRanker.SCOPE_FACTORS
    if (meta[2] === 2) return meta[5] !== '' && meta[5] === query.projectId ? factors.sameProject : factors.otherProject
    if (meta[2] === 1) return meta[4] !== '' && query.stack.includes(meta[4]) ? factors.sharedStack : factors.otherStack
    return 1
  }
}
