import { Cases, type Case, type ExtractedCase, type Scope } from './cases'
import { CaseRanker } from './ranker'
import { TagIndex } from './tag-index'
import { Vocabulary, type VocabularyData } from './vocabulary'

export type MergeContext = { nextId: number, today: string, project: string, projectId: string, stack: string, extractor: string, vocabularyRevision: number, isProjectBatch: boolean, allowedEvidence?: readonly string[] }

type Folded = { text: string, words: Set<string>, negated: Set<string> }

type State = { working: Map<number, Case>, fresh: Set<number>, seen: Map<number, Set<string>>, countered: Set<number>, folded: Map<number, Folded>, result: MergeResult }

export type MergeResult = { cases: Case[], nextId: number, added: number[], reinforced: number[], contradicted: number[], dropped: number }

export class CaseMerger {
  private static readonly STOPWORDS: ReadonlySet<string> = new Set([
    'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'use', 'uses', 'le', 'la', 'les', 'des', 'une', 'pour', 'avec', 'dans', 'est'
  ])
  private static readonly NEGATIONS: ReadonlySet<string> = new Set([
    'no', 'not', 'never', 'ne', 'pas', 'sans', 'without', 'nor', 'cannot', 'aucun', 'aucune', 'jamais', 'dont', 'doesnt', 'didnt', 'cant', 'couldnt', 'wont', 'wouldnt', 'shouldnt', 'mustnt', 'isnt', 'arent', 'wasnt', 'werent', 'havent', 'hasnt', 'hadnt'
  ])
  private static readonly OPPOSITE_POLARITY = 0.2
  private static readonly SAME_TAGS = 0.8
  private static readonly SAME_CHOICE = 0.5
  private static readonly EVIDENCE_KEPT = 5
  private static readonly PROJECTS_KEPT = 10
  private static readonly REJECTED_DAYS = 30
  private static readonly STALE_DAYS = 180
  private static readonly DAY = 86400000

  static tagSimilarity(vocabulary: VocabularyData, a: readonly string[], b: readonly string[]): number {
    const left = new Set(a)
    const right = new Set(b)
    let shared = 0
    let total = 0
    for (const tag of new Set([...left, ...right])) {
      const weight = CaseMerger.weight(vocabulary, tag)
      total += weight
      if (left.has(tag) && right.has(tag)) shared += weight
    }
    return total === 0 ? 0 : shared / total
  }

  static choiceSimilarity(a: string, b: string): number {
    return CaseMerger.compare(CaseMerger.parse(a), CaseMerger.parse(b))
  }

  static merge(existing: readonly Case[], incoming: readonly ExtractedCase[], context: MergeContext, vocabulary: VocabularyData): MergeResult {
    const result: MergeResult = { cases: [], nextId: context.nextId, added: [], reinforced: [], contradicted: [], dropped: 0 }
    const state: State = { working: new Map(), fresh: new Set(), seen: new Map(), countered: new Set(), folded: new Map(), result }
    for (const value of existing) state.working.set(value.id, CaseMerger.copy(value))
    for (const item of incoming) {
      try {
        CaseMerger.absorb(state, item, context, vocabulary)
      } catch {
        result.dropped += 1
      }
    }
    result.cases = [...state.working.values()].sort((a, b) => a.id - b.id)
    return result
  }

  static value(value: Case, today: string, halfLifeMonths: number): number {
    const recency = CaseRanker.recency(TagIndex.dateNumber(value.lastSeen), TagIndex.dateMs(TagIndex.dateNumber(today)), halfLifeMonths)
    return (Number(value.confidence) || 0) * recency * (1 + (Number(value.hits) || 0))
  }

  static selectForArchive(cases: readonly Case[], today: string, cap: number, halfLifeMonths: number): number[] {
    const now = TagIndex.dateMs(TagIndex.dateNumber(today))
    const picked = new Set<number>()
    const rest: Case[] = []
    for (const value of cases) {
      const age = CaseMerger.ageDays(value.statusAt ? value.statusAt : value.lastSeen, now)
      const isOld =
        (value.status === 'rejected' && age > CaseMerger.REJECTED_DAYS) || (value.status === 'stale' && age > CaseMerger.STALE_DAYS)
      if (isOld) picked.add(value.id)
      else rest.push(value)
    }
    const keep = Math.max(0, Math.floor(Number.isFinite(cap) ? cap : rest.length))
    if (rest.length > keep) {
      const ranked = rest
        .map((value) => ({ value, score: CaseMerger.value(value, today, halfLifeMonths), seen: TagIndex.dateNumber(value.lastSeen) }))
        .sort((a, b) => a.score - b.score || a.seen - b.seen || a.value.id - b.value.id)
      for (const entry of ranked.slice(0, rest.length - keep)) picked.add(entry.value.id)
    }
    return [...picked].sort((a, b) => a - b)
  }

  private static absorb(state: State, raw: ExtractedCase, context: MergeContext, vocabulary: VocabularyData): void {
    const { working, fresh, result } = state
    const allowed = Array.isArray(context.allowedEvidence) && context.allowedEvidence.length > 0 ? new Set(context.allowedEvidence) : undefined
    const item = allowed ? { ...raw, evidence: raw.evidence.filter((id) => allowed.has(id)) } : raw
    if (item.evidence.length === 0) {
      result.dropped += 1
      return
    }
    const incoming = CaseMerger.parse(item.choice)
    const same: Case[] = []
    const opposite: Case[] = []
    for (const value of working.values()) {
      if (CaseMerger.tagSimilarity(vocabulary, item.tags, value.tags) < CaseMerger.SAME_TAGS) continue
      const other = CaseMerger.foldedOf(state, value)
      if (CaseMerger.compare(incoming, other) >= CaseMerger.SAME_CHOICE) same.push(value)
      else if (CaseMerger.isOpposed(incoming, other)) opposite.push(value)
    }
    if (same.some((value) => value.status === 'rejected')) {
      result.dropped += 1
      return
    }
    const target = same.sort(
      (a, b) =>
        CaseMerger.compare(incoming, CaseMerger.foldedOf(state, b)) - CaseMerger.compare(incoming, CaseMerger.foldedOf(state, a)) ||
        CaseMerger.tagSimilarity(vocabulary, item.tags, b.tags) - CaseMerger.tagSimilarity(vocabulary, item.tags, a.tags) ||
        a.id - b.id
    )[0]
    for (const value of opposite) {
      if (value.status === 'rejected' || value.id === target?.id || state.countered.has(value.id)) continue
      state.countered.add(value.id)
      value.counterCount = (Number(value.counterCount) || 0) + 1
      if (value.counterCount > value.evidenceCount && value.status !== 'stale' && !value.isConfirmedByUser) {
        value.status = 'stale'
        value.statusAt = context.today
      }
      value.confidence = Cases.confidence(value.evidenceCount, value.counterCount, value.projects.length, value.isConfirmedByUser)
      if (!fresh.has(value.id) && !result.contradicted.includes(value.id)) result.contradicted.push(value.id)
    }
    if (target) {
      CaseMerger.reinforce(state, target, item, context)
      if (!fresh.has(target.id) && !result.reinforced.includes(target.id)) result.reinforced.push(target.id)
      return
    }
    const created = CaseMerger.create(item, context, vocabulary, result.nextId)
    result.nextId += 1
    working.set(created.id, created)
    state.seen.set(created.id, new Set(item.evidence))
    fresh.add(created.id)
    result.added.push(created.id)
  }

  private static reinforce(state: State, target: Case, item: ExtractedCase, context: MergeContext): void {
    let known = state.seen.get(target.id)
    if (!known) {
      known = new Set(target.evidence)
      state.seen.set(target.id, known)
    }
    const novel = [...new Set(item.evidence)].filter((id) => !known.has(id))
    for (const id of novel) known.add(id)
    target.evidence = [...new Set([...novel, ...target.evidence])].slice(0, CaseMerger.EVIDENCE_KEPT)
    target.evidenceCount = (Number(target.evidenceCount) || 0) + novel.length
    if (context.today > target.lastSeen) target.lastSeen = context.today
    const repositories = novel.map((id) => Cases.repositoryOf(id)).filter((name) => name !== '')
    const sessions = context.project !== '' && novel.some((id) => id.startsWith('session:')) ? [context.project] : []
    target.projects = [...new Set([...target.projects, ...repositories, ...sessions])].slice(0, CaseMerger.PROJECTS_KEPT)
    if (target.status === 'stale' && target.evidenceCount > target.counterCount) {
      target.status = target.isConfirmedByUser ? 'confirmed' : 'observed'
      target.statusAt = context.today
    }
    target.confidence = Cases.confidence(target.evidenceCount, target.counterCount, target.projects.length, target.isConfirmedByUser)
  }

  private static foldedOf(state: State, value: Case): Folded {
    let folded = state.folded.get(value.id)
    if (!folded) {
      folded = CaseMerger.parse(value.choice)
      state.folded.set(value.id, folded)
    }
    return folded
  }

  private static create(item: ExtractedCase, context: MergeContext, vocabulary: VocabularyData, id: number): Case {
    const evidence = [...new Set(item.evidence)]
    const repositories = [...new Set(evidence.map((entry) => Cases.repositoryOf(entry)).filter((name) => name !== ''))]
    const isSession = evidence.some((entry) => entry.startsWith('session:'))
    const projects = [...repositories]
    if (context.project !== '' && (isSession || projects.length === 0) && !projects.includes(context.project)) projects.push(context.project)
    return {
      id,
      situation: item.situation,
      options: [...item.options],
      choice: item.choice,
      why: item.why,
      tags: [...item.tags],
      scope: CaseMerger.scopeOf(item, evidence, repositories, context, vocabulary),
      project: context.project,
      projectId: context.projectId,
      projects,
      stack: context.stack,
      kind: item.kind,
      confidence: Cases.confidence(evidence.length, 0, projects.length, false),
      evidenceCount: evidence.length,
      evidence: evidence.slice(0, CaseMerger.EVIDENCE_KEPT),
      counterCount: 0,
      status: 'observed',
      isConfirmedByUser: false,
      firstSeen: context.today,
      lastSeen: context.today,
      statusAt: context.today,
      uses: 0,
      hits: 0,
      defaultCovered: false,
      extractor: context.extractor,
      vocabulary: context.vocabularyRevision
    }
  }

  private static scopeOf(item: ExtractedCase, evidence: readonly string[], repositories: readonly string[], context: MergeContext, vocabulary: VocabularyData): Scope {
    const isOneSource = repositories.length <= 1 && evidence.every((entry) => entry.startsWith('session:') || Cases.repositoryOf(entry) !== '')
    if (context.isProjectBatch && isOneSource) return 'project'
    return item.tags.some((tag) => Vocabulary.facetOf(vocabulary, tag) === 'stack') ? 'stack' : 'global'
  }

  private static weight(vocabulary: VocabularyData, tag: string): number {
    const facet = Vocabulary.facetOf(vocabulary, tag)
    return facet === 'concept' || facet === 'decision' ? 2 : 1
  }

  private static clean(text: string): string {
    return typeof text === 'string' ? Vocabulary.fold(text).trim() : ''
  }

  private static compare(left: Folded, right: Folded): number {
    if (left.text !== '' && left.text === right.text) return 1
    let shared = 0
    for (const word of left.words) if (right.words.has(word)) shared += 1
    const total = left.words.size + right.words.size - shared
    if (total === 0) return 0
    const jaccard = shared / total
    return CaseMerger.isOpposed(left, right) ? jaccard * CaseMerger.OPPOSITE_POLARITY : jaccard
  }

  private static parse(text: string): Folded {
    const words = new Set<string>()
    const negated = new Set<string>()
    let isPending = false
    const folded = CaseMerger.clean(text)
    for (const word of folded.replace(/['\u2019]/g, '').split(/[^a-z0-9]+/)) {
      if (CaseMerger.NEGATIONS.has(word)) {
        isPending = true
        continue
      }
      if (word.length <= 2 || CaseMerger.STOPWORDS.has(word)) continue
      words.add(word)
      if (isPending) negated.add(word)
      isPending = false
    }
    return { text: folded, words, negated }
  }

  private static isOpposed(a: Folded, b: Folded): boolean {
    for (const word of a.negated) if (b.words.has(word) && !b.negated.has(word)) return true
    for (const word of b.negated) if (a.words.has(word) && !a.negated.has(word)) return true
    return false
  }

  private static ageDays(date: string, now: number): number {
    const then = TagIndex.dateMs(TagIndex.dateNumber(date))
    return then === 0 || now === 0 ? 0 : Math.max(0, (now - then) / CaseMerger.DAY)
  }

  private static copy(value: Case): Case {
    return {
      ...value,
      options: Array.isArray(value.options) ? [...value.options] : [],
      tags: Array.isArray(value.tags) ? [...value.tags] : [],
      projects: Array.isArray(value.projects) ? [...value.projects] : [],
      evidence: Array.isArray(value.evidence) ? [...value.evidence] : []
    }
  }
}
