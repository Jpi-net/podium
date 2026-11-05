import { Cases, type Case } from './cases'
import { SignaturePaths, type SignatureFiles } from './paths'
import { CaseRanker, type RankQuery, type Ranked } from './ranker'
import { Sanitizer } from './sanitizer'
import { SignatureStore, type FsPort } from './store'
import { type TagIndexData } from './tag-index'
import { SituationTagger, type Situation } from './tagger'
import { Vocabulary, type VocabularyData } from './vocabulary'

export type RecallInput = { situation: string, tags: readonly string[], limit: number }

export type Recalled = { value: Case, score: number }

export class Recall {
  static readonly TOOL = 'recall'
  static readonly FAST_K = 3
  static readonly FAST_MIN = 6.0
  static readonly DEEP_MIN = 2.0

  private static readonly MAX_SITUATION = 400
  private static readonly MAX_TAGS = 12
  private static readonly MAX_TAG_LENGTH = 64
  private static readonly MIN_LIMIT = 1
  private static readonly MAX_LIMIT = 20
  private static readonly DEFAULT_LIMIT = 10
  private static readonly MAX_DESCRIPTION = 3000
  private static readonly MAX_OUTPUT = 8000
  private static readonly EMPTY = 'No precedent found for this situation.'
  private static readonly INTRO =
    "Returns the developer's past decisions (Podium Signature) that match a situation, so you can propose or decide the way they would. Pass the situation in one sentence and the tags that describe it, chosen from the vocabulary below. Read the returned cases, keep the ones that truly apply, and say which you followed.\nVocabulary:"

  static description(vocabulary: VocabularyData): string {
    try {
      let text = Recall.INTRO
      for (const facet of Vocabulary.FACETS) {
        const names = Object.keys(vocabulary.tags).filter((name) => vocabulary.tags[name]?.facet === facet).sort()
        if (names.length === 0) continue
        const line = `\n${facet}: ${names.join(', ')}`
        if (text.length + line.length <= Recall.MAX_DESCRIPTION) {
          text += line
          continue
        }
        const room = Recall.MAX_DESCRIPTION - text.length
        const cut = line.slice(0, Math.max(0, room))
        const comma = cut.lastIndexOf(',')
        if (comma > facet.length + 2) text += cut.slice(0, comma)
        break
      }
      return text.slice(0, Recall.MAX_DESCRIPTION)
    } catch {
      return Recall.INTRO.slice(0, Recall.MAX_DESCRIPTION)
    }
  }

  static schema(): Record<string, unknown> {
    return {
      type: 'object',
      properties: {
        situation: { type: 'string', maxLength: Recall.MAX_SITUATION },
        tags: { type: 'array', items: { type: 'string' }, maxItems: Recall.MAX_TAGS },
        limit: { type: 'integer', minimum: Recall.MIN_LIMIT, maximum: Recall.MAX_LIMIT }
      },
      required: ['situation'],
      additionalProperties: false
    }
  }

  static parseInput(raw: unknown): RecallInput | undefined {
    try {
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined
      const record = raw as Record<string, unknown>
      if (typeof record.situation !== 'string') return undefined
      const situation = record.situation.trim().slice(0, Recall.MAX_SITUATION).trim()
      if (situation === '') return undefined
      const tags: string[] = []
      if (Array.isArray(record.tags)) {
        for (const item of record.tags) {
          if (tags.length >= Recall.MAX_TAGS) break
          if (typeof item === 'string' && item.length <= Recall.MAX_TAG_LENGTH) tags.push(item)
        }
      }
      let limit = Recall.DEFAULT_LIMIT
      if (typeof record.limit === 'number' && Number.isFinite(record.limit)) {
        limit = Math.min(Recall.MAX_LIMIT, Math.max(Recall.MIN_LIMIT, Math.floor(record.limit)))
      }
      return { situation, tags, limit }
    } catch {
      return undefined
    }
  }

  static query(
    vocabulary: VocabularyData,
    tags: readonly string[],
    stack: readonly string[],
    projectId: string,
    now: number,
    halfLifeMonths: number
  ): RankQuery {
    return {
      tags: Vocabulary.normalize(vocabulary, tags),
      stack: Array.isArray(stack) ? stack : [],
      projectId: typeof projectId === 'string' ? projectId : '',
      now,
      halfLifeMonths
    }
  }

  static fast(
    index: TagIndexData,
    vocabulary: VocabularyData,
    situation: Situation,
    projectId: string,
    now: number,
    halfLifeMonths: number
  ): Ranked[] {
    try {
      const tags = SituationTagger.tag(vocabulary, situation)
      const query = Recall.query(vocabulary, tags, situation.stack, projectId, now, halfLifeMonths)
      return CaseRanker.top(index, vocabulary, query, Recall.FAST_K, Recall.FAST_MIN)
    } catch {
      return []
    }
  }

  static deep(
    index: TagIndexData,
    vocabulary: VocabularyData,
    input: RecallInput,
    stack: readonly string[],
    projectId: string,
    now: number,
    halfLifeMonths: number
  ): Ranked[] {
    try {
      const given = Vocabulary.normalize(vocabulary, input.tags)
      const tags = [...new Set([...given, ...Vocabulary.fromText(vocabulary, input.situation)])]
      const query = Recall.query(vocabulary, tags, stack, projectId, now, halfLifeMonths)
      return CaseRanker.top(index, vocabulary, query, input.limit, Recall.DEEP_MIN)
    } catch {
      return []
    }
  }

  static async read(fs: FsPort, files: SignatureFiles, ids: readonly number[]): Promise<Case[]> {
    try {
      if (!Array.isArray(ids) || typeof files.cases !== 'string' || files.cases === '') return []
      const wanted: number[] = []
      for (const id of ids) {
        if (wanted.length >= Recall.MAX_LIMIT) break
        if (typeof id === 'number' && Number.isInteger(id) && id >= 0 && !wanted.includes(id)) wanted.push(id)
      }
      const shards = [...new Set(wanted.map((id) => SignaturePaths.shardOf(id)))]
      const loaded = await Promise.all(
        shards.map(async (shard) => {
          const text = await SignatureStore.text(fs, SignaturePaths.shardFile(files.cases, shard))
          return Cases.fromLines(text).cases
        })
      )
      const byId = new Map<number, Case>()
      for (const list of loaded) for (const value of list) byId.set(value.id, value)
      const out: Case[] = []
      for (const id of wanted) {
        const value = byId.get(id)
        if (value) out.push(value)
      }
      return out
    } catch {
      return []
    }
  }

  static format(cases: readonly Recalled[]): string {
    try {
      if (!Array.isArray(cases) || cases.length === 0) return Recall.EMPTY
      const blocks: string[] = []
      let length = 0
      for (const { value } of cases) {
        if (!Recall.isSafe(value)) continue
        const block = Recall.block(value)
        const added = block.length + (blocks.length > 0 ? 2 : 0)
        if (length + added > Recall.MAX_OUTPUT) {
          if (blocks.length === 0) blocks.push(block.slice(0, Recall.MAX_OUTPUT))
          break
        }
        blocks.push(block)
        length += added
      }
      return blocks.length === 0 ? Recall.EMPTY : blocks.join('\n\n')
    } catch {
      return Recall.EMPTY
    }
  }

  static applicable(value: Case, projectId: string): boolean {
    try {
      if (value.status === 'rejected' || value.status === 'stale') return false
      if (!Recall.isSafe(value)) return false
      if (value.scope === 'project') return typeof projectId === 'string' && projectId !== '' && value.projectId === projectId
      return true
    } catch {
      return false
    }
  }

  private static isSafe(value: Case): boolean {
    return [value.situation, value.choice, value.why].every((text) => Sanitizer.isQuotable(text) && !Cases.isUnsafe(text) && !Cases.isForeign(text))
  }

  private static block(value: Case): string {
    const lines = [
      `#${value.id} (${value.status}, ${value.evidenceCount}×, ${value.scope})`,
      `Situation: ${Sanitizer.flat(value.situation)}`,
      `Choice: ${Sanitizer.flat(value.choice)}`
    ]
    const why = Sanitizer.flat(value.why)
    if (why !== '') lines.push(`Why: ${why}`)
    lines.push(`Tags: ${value.tags.join(', ')}`)
    return lines.join('\n')
  }
}
