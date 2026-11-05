import type { Case, CaseStatus, Scope } from './cases'
import { Vocabulary } from './vocabulary'

export type CaseMeta = [number, number, number, number, string, string]

export type TagIndexData = { version: 1, n: number, df: Record<string, number>, postings: Record<string, number[]>, meta: Record<string, CaseMeta> }

export class TagIndex {
  private static readonly SCOPES: readonly Scope[] = ['global', 'stack', 'project']
  private static readonly STATUSES: readonly CaseStatus[] = ['rejected', 'observed', 'confirmed', 'stale']
  private static readonly DATE = /^(\d{4})-(\d{2})-(\d{2})$/

  static empty(): TagIndexData {
    return { version: 1, n: 0, df: {}, postings: {}, meta: {} }
  }

  static metaOf(value: Case): CaseMeta {
    return [
      Number(value.confidence) || 0,
      TagIndex.dateNumber(value.lastSeen),
      Math.max(0, TagIndex.SCOPES.indexOf(value.scope)),
      Math.max(0, TagIndex.STATUSES.indexOf(value.status)),
      typeof value.stack === 'string' ? value.stack : '',
      typeof value.projectId === 'string' ? value.projectId : ''
    ]
  }

  static dateNumber(date: string): number {
    const match = typeof date === 'string' ? TagIndex.DATE.exec(date) : null
    if (!match) return 0
    return Number(match[1]) * 10000 + Number(match[2]) * 100 + Number(match[3])
  }

  static dateMs(date: number): number {
    if (!(date > 0)) return 0
    return Date.UTC(Math.floor(date / 10000), (Math.floor(date / 100) % 100) - 1, date % 100)
  }

  static postingsOf(index: TagIndexData, tag: string): number[] {
    return Object.prototype.hasOwnProperty.call(index.postings, tag) ? (index.postings[tag] ?? []) : []
  }

  static contains(index: TagIndexData, tag: string, id: number): boolean {
    return TagIndex.find(TagIndex.postingsOf(index, tag), id) !== -1
  }

  static metaFor(index: TagIndexData, id: number): CaseMeta | undefined {
    const key = String(id)
    return Object.prototype.hasOwnProperty.call(index.meta, key) ? index.meta[key] : undefined
  }

  static build(cases: readonly Case[]): TagIndexData {
    const index = TagIndex.empty()
    for (const value of cases) {
      const old = TagIndex.metaFor(index, value.id) ? TagIndex.holding(index, value.id) : []
      TagIndex.drop(index, value.id, old, true)
      TagIndex.place(index, value, true)
    }
    index.n = Object.keys(index.meta).length
    return index
  }

  static add(index: TagIndexData, value: Case): TagIndexData {
    const next = TagIndex.clone(index)
    TagIndex.drop(next, value.id, TagIndex.holding(next, value.id), false)
    TagIndex.place(next, value, false)
    next.n = Object.keys(next.meta).length
    return next
  }

  static remove(index: TagIndexData, id: number, tags: readonly string[]): TagIndexData {
    const next = TagIndex.clone(index)
    TagIndex.drop(next, id, [...tags, ...TagIndex.holding(next, id)], false)
    next.n = Object.keys(next.meta).length
    return next
  }

  static parse(text: string): TagIndexData | undefined {
    try {
      const parsed: unknown = JSON.parse(text)
      return TagIndex.isIndex(parsed) ? parsed : undefined
    } catch {
      return undefined
    }
  }

  static serialize(index: TagIndexData): string {
    return JSON.stringify(index)
  }

  private static clone(index: TagIndexData): TagIndexData {
    return { version: 1, n: index.n, df: { ...index.df }, postings: { ...index.postings }, meta: { ...index.meta } }
  }

  private static holding(index: TagIndexData, id: number): string[] {
    return Object.keys(index.postings).filter((tag) => TagIndex.find(index.postings[tag] ?? [], id) !== -1)
  }

  private static drop(index: TagIndexData, id: number, tags: readonly string[], isOwned: boolean): void {
    for (const tag of new Set(tags)) {
      const list = TagIndex.postingsOf(index, tag)
      const at = TagIndex.find(list, id)
      if (at === -1) continue
      const rest = isOwned ? list : list.slice()
      rest.splice(at, 1)
      if (rest.length === 0) {
        delete index.postings[tag]
        delete index.df[tag]
      } else {
        index.postings[tag] = rest
        index.df[tag] = rest.length
      }
    }
    delete index.meta[String(id)]
  }

  private static place(index: TagIndexData, value: Case, isOwned: boolean): void {
    const tags = Array.isArray(value.tags) ? value.tags.filter((tag) => Vocabulary.isName(tag)) : []
    for (const tag of new Set(tags)) {
      const list = TagIndex.postingsOf(index, tag)
      const at = TagIndex.lower(list, value.id)
      if (list[at] === value.id) continue
      const grown = isOwned ? list : list.slice()
      grown.splice(at, 0, value.id)
      index.postings[tag] = grown
      index.df[tag] = grown.length
    }
    index.meta[String(value.id)] = TagIndex.metaOf(value)
  }

  private static lower(list: readonly number[], id: number): number {
    let low = 0
    let high = list.length
    while (low < high) {
      const mid = (low + high) >> 1
      if ((list[mid] ?? 0) < id) low = mid + 1
      else high = mid
    }
    return low
  }

  private static find(list: readonly number[], id: number): number {
    const at = TagIndex.lower(list, id)
    return list[at] === id ? at : -1
  }

  private static isIndex(value: unknown): value is TagIndexData {
    if (!TagIndex.isRecord(value) || value.version !== 1 || typeof value.n !== 'number') return false
    const { df, postings, meta } = value
    if (!TagIndex.isRecord(df) || !TagIndex.isRecord(postings) || !TagIndex.isRecord(meta)) return false
    if (!Object.values(meta).every((m) => TagIndex.isMeta(m))) return false
    if (Object.keys(meta).length !== value.n) return false
    const tags = Object.keys(postings)
    if (Object.keys(df).length !== tags.length) return false
    return tags.every((tag) => {
      const list = postings[tag]
      if (!Vocabulary.isName(tag) || !Array.isArray(list) || list.length === 0 || df[tag] !== list.length) return false
      return list.every(
        (id, at) =>
          typeof id === 'number' &&
          Number.isInteger(id) &&
          id >= 0 &&
          Object.prototype.hasOwnProperty.call(meta, String(id)) &&
          (at === 0 || id > (list[at - 1] as number))
      )
    })
  }

  private static isMeta(m: unknown): boolean {
    return (
      Array.isArray(m) &&
      m.length === 6 &&
      [0, 1, 2, 3].every((i) => typeof m[i] === 'number' && Number.isFinite(m[i])) &&
      typeof m[4] === 'string' &&
      typeof m[5] === 'string'
    )
  }

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
  }
}
