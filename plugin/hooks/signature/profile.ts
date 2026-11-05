import { Cases, type Case, type Scope } from './cases'
import { Vocabulary } from './vocabulary'

export type Facet5 = 'what' | 'when' | 'depth' | 'tradeoff' | 'blind-spot'

export type TraitStatus = 'observed' | 'confirmed' | 'rejected' | 'stale'

export type Trait = {
  id: string, lens: string, facet: Facet5, statement: string, scope: Scope, stack: string
  confidence: number, cases: number[], status: TraitStatus, defaultCovered: boolean, isBlindSpot: boolean
  updatedAt: string, isNew: boolean
}

export type ProfileStats = { predictions: number, hits: number, missed: number }

export type ProfileData = { version: 1, updatedAt: string, synthesizedAt: number, changedSince: number, traits: Trait[], stats: ProfileStats }

export type LensSummary = { lens: string, strength: number, summary: string, blindSpot: string }

export class Profile {
  static readonly MAX_TRAITS = 200
  private static readonly MAX_CASES = 50
  private static readonly MAX_STATEMENT = 200
  private static readonly MIN_STATEMENT = 8
  private static readonly MAX_STACK = 32
  private static readonly MAX_REVIEW = 20
  private static readonly MAX_SUMMARY = 80
  private static readonly DUE_CHANGES = 10
  private static readonly DUE_AGE = 7 * 24 * 60 * 60 * 1000
  private static readonly ID = /^[a-z0-9-]{1,32}\.[a-z0-9-]{1,64}$/
  private static readonly DATE = /^\d{4}-\d{2}-\d{2}$/
  private static readonly SCRIPT = /(?![A-Za-zßæœøẞÆŒØ])\p{L}/u
  private static readonly MARKS = /\p{M}/gu
  private static readonly FACETS: readonly Facet5[] = ['what', 'when', 'depth', 'tradeoff', 'blind-spot']
  private static readonly SCOPES: readonly Scope[] = ['global', 'stack', 'project']
  private static readonly STATUSES: readonly TraitStatus[] = ['observed', 'confirmed', 'rejected', 'stale']
  private static readonly LENS_ORDER: readonly string[] = ['security', 'architecture', 'robustness', 'testing', 'git', 'dx', 'product']
  private static readonly TIERS: readonly TraitStatus[] = ['observed', 'stale', 'rejected', 'confirmed']

  static empty(): ProfileData {
    return { version: 1, updatedAt: '', synthesizedAt: 0, changedSince: 0, traits: [], stats: { predictions: 0, hits: 0, missed: 0 } }
  }

  static parse(text: string): ProfileData {
    try {
      const raw: unknown = JSON.parse(text)
      if (!Profile.isRecord(raw) || raw.version !== 1) return Profile.empty()
      const traits: Trait[] = []
      const seen = new Set<string>()
      for (const item of Array.isArray(raw.traits) ? raw.traits : []) {
        if (traits.length >= Profile.MAX_TRAITS) break
        const trait = Profile.trait(item, false)
        if (trait === undefined || seen.has(trait.id)) continue
        seen.add(trait.id)
        traits.push(trait)
      }
      const stats = Profile.isRecord(raw.stats) ? raw.stats : {}
      return {
        version: 1,
        updatedAt: Profile.date(raw.updatedAt),
        synthesizedAt: Profile.nonNegative(raw.synthesizedAt),
        changedSince: Profile.nonNegative(raw.changedSince),
        traits,
        stats: { predictions: Profile.count(stats.predictions), hits: Profile.count(stats.hits), missed: Profile.count(stats.missed) }
      }
    } catch {
      return Profile.empty()
    }
  }

  static serialize(profile: ProfileData): string {
    return `${JSON.stringify(profile, null, 2)}\n`
  }

  static isId(text: string): boolean {
    return typeof text === 'string' && Profile.ID.test(text)
  }

  static merge(profile: ProfileData, output: string, cases: readonly Case[], today: string): { profile: ProfileData, added: number, dropped: number, isParsed: boolean } {
    try {
      const span = Cases.firstObject(output)
      const root: unknown = span === '' ? undefined : JSON.parse(span)
      if (!Profile.isRecord(root) || !Array.isArray(root.traits)) return { profile, added: 0, dropped: 0, isParsed: false }
      const byId = new Map<number, Case>(cases.map((item) => [item.id, item]))
      const traits = new Map<string, Trait>(profile.traits.map((trait) => [trait.id, trait]))
      let added = 0
      let dropped = 0
      for (const item of root.traits) {
        const incoming = Profile.incoming(item, byId)
        if (incoming === undefined) {
          dropped += 1
          continue
        }
        const existing = traits.get(incoming.id)
        const linked = incoming.cases.map((id) => byId.get(id)).filter((entry): entry is Case => entry !== undefined)
        const confidence = Profile.weighted(linked)
        if (existing === undefined) {
          traits.set(incoming.id, { ...incoming, confidence, status: Profile.isAllDead(linked) ? 'stale' : 'observed', updatedAt: today, isNew: true })
          added += 1
          continue
        }
        if (existing.status === 'confirmed' || existing.status === 'rejected') {
          traits.set(existing.id, { ...existing, cases: incoming.cases, confidence })
          continue
        }
        const status: TraitStatus = Profile.isAllDead(linked) ? 'stale' : 'observed'
        const isChanged = existing.statement !== incoming.statement || existing.status !== status
        traits.set(existing.id, {
          ...existing,
          lens: incoming.lens,
          facet: incoming.facet,
          statement: incoming.statement,
          scope: incoming.scope,
          stack: incoming.stack,
          cases: incoming.cases,
          confidence,
          status,
          isBlindSpot: incoming.isBlindSpot,
          updatedAt: isChanged ? today : existing.updatedAt
        })
      }
      const all = [...traits.values()]
      const kept = Profile.cap(all)
      dropped += all.length - kept.length
      return { profile: { ...profile, traits: kept }, added, dropped, isParsed: true }
    } catch {
      return { profile, added: 0, dropped: 0, isParsed: false }
    }
  }

  static recompute(profile: ProfileData, cases: readonly Case[], today: string): ProfileData {
    const byId = new Map<number, Case>(cases.map((item) => [item.id, item]))
    const traits = profile.traits.map((trait): Trait => {
      const linked = trait.cases.map((id) => byId.get(id)).filter((entry): entry is Case => entry !== undefined)
      const confidence = Profile.weighted(linked)
      if (trait.status === 'confirmed' || trait.status === 'rejected') return { ...trait, confidence }
      const isDead = trait.cases.length > 0 && Profile.isAllDead(linked)
      const status: TraitStatus = isDead ? 'stale' : 'observed'
      return { ...trait, confidence, status, updatedAt: status === trait.status ? trait.updatedAt : today }
    })
    return { ...profile, traits }
  }

  static confirm(profile: ProfileData, id: string, today: string): ProfileData {
    return Profile.decide(profile, id, 'confirmed', today)
  }

  static reject(profile: ProfileData, id: string, today: string): ProfileData {
    return Profile.decide(profile, id, 'rejected', today)
  }

  static isDue(profile: ProfileData, now: number, isForced: boolean): boolean {
    if (isForced) return true
    if (profile.changedSince >= Profile.DUE_CHANGES) return true
    return profile.changedSince > 0 && now - profile.synthesizedAt > Profile.DUE_AGE
  }

  static review(profile: ProfileData): Trait[] {
    return profile.traits
      .map((trait, index) => ({ trait, index }))
      .filter(({ trait }) => trait.isNew && trait.status === 'observed')
      .sort((a, b) => (a.trait.updatedAt === b.trait.updatedAt ? b.index - a.index : a.trait.updatedAt < b.trait.updatedAt ? 1 : -1))
      .slice(0, Profile.MAX_REVIEW)
      .map(({ trait }) => trait)
  }

  static lenses(profile: ProfileData): LensSummary[] {
    const groups = new Map<string, Trait[]>()
    for (const trait of profile.traits) {
      if (trait.status !== 'confirmed' && trait.status !== 'observed') continue
      groups.set(trait.lens, [...(groups.get(trait.lens) ?? []), trait])
    }
    return [...groups.entries()]
      .sort(([a], [b]) => Profile.rank(a) - Profile.rank(b) || (a < b ? -1 : a > b ? 1 : 0))
      .map(([lens, traits]) => {
        const sorted = [...traits].sort((a, b) => b.confidence - a.confidence)
        const mean = traits.reduce((sum, trait) => sum + trait.confidence, 0) / traits.length
        const joined = sorted.slice(0, 2).map((trait) => trait.statement).join('; ')
        const summary = joined.length > Profile.MAX_SUMMARY ? `${joined.slice(0, Profile.MAX_SUMMARY - 1)}…` : joined
        const blind = sorted.find((trait) => trait.isBlindSpot)
        return { lens, strength: Math.round(Math.min(1, Math.max(0, mean)) * 1000) / 1000, summary, blindSpot: blind?.statement ?? '' }
      })
  }

  private static rank(lens: string): number {
    const index = Profile.LENS_ORDER.indexOf(lens)
    return index === -1 ? Profile.LENS_ORDER.length : index
  }

  private static decide(profile: ProfileData, id: string, status: TraitStatus, today: string): ProfileData {
    if (!profile.traits.some((trait) => trait.id === id)) return profile
    return { ...profile, traits: profile.traits.map((trait) => (trait.id === id ? { ...trait, status, isNew: false, updatedAt: today } : trait)) }
  }

  private static cap(traits: Trait[]): Trait[] {
    if (traits.length <= Profile.MAX_TRAITS) return traits
    const order = (trait: Trait) => Profile.TIERS.indexOf(trait.status)
    const ranked = traits
      .map((trait, index) => ({ trait, index }))
      .sort((a, b) => order(a.trait) - order(b.trait) || a.trait.confidence - b.trait.confidence || a.index - b.index)
    const removed = new Set(ranked.slice(0, traits.length - Profile.MAX_TRAITS).map(({ index }) => index))
    return traits.filter((_, index) => !removed.has(index))
  }

  private static isAllDead(linked: readonly Case[]): boolean {
    return linked.length > 0 && linked.every((item) => item.status === 'stale' || item.status === 'rejected')
  }

  private static weighted(linked: readonly Case[]): number {
    if (linked.length === 0) return 0
    const weight = linked.reduce((sum, item) => sum + Math.max(0, Number(item.evidenceCount) || 0), 0)
    const total = weight > 0
      ? linked.reduce((sum, item) => sum + (Number(item.confidence) || 0) * Math.max(0, Number(item.evidenceCount) || 0), 0) / weight
      : linked.reduce((sum, item) => sum + (Number(item.confidence) || 0), 0) / linked.length
    return Math.round(Math.min(1, Math.max(0, total)) * 1000) / 1000
  }

  private static incoming(raw: unknown, byId: ReadonlyMap<number, Case>): Trait | undefined {
    const trait = Profile.trait(raw, true)
    if (trait === undefined) return undefined
    if (Cases.isUnsafe(trait.statement) || Profile.isForeign(trait.statement)) return undefined
    return { ...trait, cases: trait.cases.filter((id) => byId.has(id)), status: 'observed', isNew: true }
  }

  private static trait(raw: unknown, isModel: boolean): Trait | undefined {
    if (!Profile.isRecord(raw)) return undefined
    const id = raw.id
    if (typeof id !== 'string' || !Profile.isId(id)) return undefined
    const lens = raw.lens
    if (typeof lens !== 'string' || !Profile.isLens(lens)) return undefined
    const facet = Profile.FACETS.find((value) => value === raw.facet)
    if (facet === undefined) return undefined
    const statement = typeof raw.statement === 'string' ? raw.statement.trim() : ''
    if (statement.length < Profile.MIN_STATEMENT || statement.length > Profile.MAX_STATEMENT) return undefined
    const scope = Profile.SCOPES.find((value) => value === raw.scope)
    if (scope === undefined) return undefined
    const stack = raw.stack === undefined ? '' : raw.stack
    if (typeof stack !== 'string' || stack.length > Profile.MAX_STACK) return undefined
    const caseIds = raw.cases === undefined ? [] : raw.cases
    if (!Array.isArray(caseIds)) return undefined
    const ids = [...new Set(caseIds.filter((value): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0))].slice(0, Profile.MAX_CASES)
    const defaultCovered = !isModel && raw.defaultCovered === true
    const isBlindSpot = raw.isBlindSpot === true || facet === 'blind-spot'
    if (isModel) {
      return { id, lens, facet, statement, scope, stack, confidence: 0, cases: ids, status: 'observed', defaultCovered, isBlindSpot, updatedAt: '', isNew: true }
    }
    const confidence = raw.confidence
    if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) return undefined
    const status = Profile.STATUSES.find((value) => value === raw.status)
    if (status === undefined) return undefined
    return { id, lens, facet, statement, scope, stack, confidence, cases: ids, status, defaultCovered, isBlindSpot, updatedAt: Profile.date(raw.updatedAt), isNew: raw.isNew === true }
  }

  private static isLens(lens: string): boolean {
    return lens === 'other' || Vocabulary.isName(lens)
  }

  private static isForeign(text: string): boolean {
    return Profile.SCRIPT.test(text.normalize('NFKD').replace(Profile.MARKS, ''))
  }

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
  }

  private static date(value: unknown): string {
    return typeof value === 'string' && Profile.DATE.test(value) ? value : ''
  }

  private static nonNegative(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
  }

  private static count(value: unknown): number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0
  }
}
