import { Sanitizer } from './sanitizer'
import { Vocabulary, type Facet, type VocabularyData } from './vocabulary'

export type Scope = 'global' | 'stack' | 'project'

export type CaseStatus = 'observed' | 'confirmed' | 'rejected' | 'stale'

export type CaseKind = 'choice' | 'habit' | 'refusal' | 'blind-spot'

export type Case = {
  id: number, situation: string, options: string[], choice: string, why: string, tags: string[]
  scope: Scope, project: string, projectId: string, projects: string[], stack: string, kind: CaseKind
  confidence: number, evidenceCount: number, evidence: string[], counterCount: number
  status: CaseStatus, isConfirmedByUser: boolean, firstSeen: string, lastSeen: string, statusAt: string
  uses: number, hits: number, defaultCovered: boolean, extractor: string, vocabulary: number
}

export type ExtractedCase = { situation: string, options: string[], choice: string, why: string, tags: string[], kind: CaseKind, evidence: string[] }

export type CandidateTag = { tag: string, facet: Facet, parent: string, aliases: string[] }

export type ParsedOutput = { cases: ExtractedCase[], candidateTags: CandidateTag[], dropped: { index: number, reason: string }[] }

export type CaseLines = { cases: Case[], superseded: number, bad: number }

type Span = [number, number]

type Verdict = { value: ExtractedCase | undefined, reason: string }

export class Cases {
  private static readonly KINDS: readonly CaseKind[] = ['choice', 'habit', 'refusal', 'blind-spot']
  private static readonly EVIDENCE = /^(commit:[A-Za-z0-9._-]+:[0-9a-f]{7,40}|session:[A-Za-z0-9_-]+:\d+)$/
  private static readonly COMMIT = /^commit:([A-Za-z0-9._-]+):[0-9a-f]{7,40}$/
  private static readonly SCOPES: readonly Scope[] = ['global', 'stack', 'project']
  private static readonly STATUSES: readonly CaseStatus[] = ['observed', 'confirmed', 'rejected', 'stale']
  private static readonly DATE = /^\d{4}-\d{2}-\d{2}$/
  private static readonly VERB = /(^|[^a-z0-9])((?:skip|disabl|bypass|remov|ignor|weaken|silenc|delet|drop|omit|circumvent|avoid running|turn\w* (?:\S+ ){0,3}off|comment\w* out|desactiv|deactivat|contourn|saut|supprim|overrid|stop\w* running|switch\w* off|mut(?:e|es|ed|ing)(?![a-z0-9]))\w*)/g
  private static readonly WITHOUT = /(^|[^a-z0-9])(without)(?![a-z0-9])/g
  private static readonly POSITIVE = /(^|[^a-z0-9])(run(?:s|ning)?|writ(?:e|es|ing)|add(?:s|ing)?|requir(?:e|es|ing)|wait(?:s|ing)? for|execut(?:e|es|ing)|bother\w*)(?![a-z0-9])/g
  private static readonly TARGET = /(^|[^a-z0-9])((?:test|guard|hook|review|permission|check|lint|validation|security|pre-commit|coverage|typecheck|type check|verification|assert|eslint|pytest|vitest|mypy|husky|pipeline)\w*|(?:ci|specs?|qa|tsc|jest)(?![a-z0-9]))/g
  private static readonly GRANT = /(^|[^a-z0-9])((?:grant|approv|auto-?approv|allow|accept)\w*)/g
  private static readonly PERMISSION = /(^|[^a-z0-9])(permission\w*|full access|sudo|dangerous\w*|all tools|every tool|any tool|without (?:asking|confirmation|prompting)|bypass\w* permissions?)/g
  private static readonly OPTIONAL = /(^|[^a-z0-9])(optional|acceptable|unnecessary|not needed|skippable|nice to have)(?![a-z0-9])/g
  private static readonly AHEAD = /\bbefore\b.{0,40}?\b(?:finish\w*|pass\w*|complet\w*|green)/g
  private static readonly RED = /\bred\b.{0,40}?\b(?:acceptable|fine|ok|okay|tolerable)(?![a-z0-9])/g
  private static readonly GOVERN = 5
  private static readonly MAX_CANDIDATES = 5
  private static readonly MAX_ALIASES = 16
  private static readonly ALIAS_LENGTH = 64
  private static readonly SINGLE_NEGATORS: ReadonlySet<string> = new Set(['never', 'dont', "don't", 'doesnt', 'jamais', 'ne'])
  private static readonly VERB_NEGATORS: ReadonlySet<string> = new Set(['do not', 'does not', 'must not', 'should not', 'refuses to', 'refused to'])
  private static readonly POSITIVE_NEGATORS: ReadonlySet<string> = new Set(['never', 'not', 'no', 'dont', "don't", 'doesnt', 'hardly', 'seldom', 'rarely', 'wont', "won't", 'cant', "can't", 'cannot', 'shouldnt', "shouldn't", 'isnt', "isn't", 'nobody', 'neither', 'nor'])
  private static readonly DOUBLERS: ReadonlySet<string> = new Set(['never', 'not', 'dont', "don't", 'doesnt', 'jamais', 'ne', 'rarely', 'seldom', 'hardly', 'almost', 'sometimes', 'often'])
  private static readonly SCRIPT = /(?![A-Za-z\u00DF\u00E6\u0153\u00F8\u1E9E\u00C6\u0152\u00D8])\p{L}/u
  private static readonly MARKS = /\p{M}/gu
  private static readonly MAX_CASES = 40
  private static readonly MAX_EVIDENCE = 20
  private static readonly FLAGS: readonly RegExp[] = [
    /--no-verify/,
    /husky=0/,
    /\[(skip ci|ci skip)\]/,
    /\bxit\b/,
    /\.skip\(/,
    /\.only\(/,
    /bypass ?permissions/,
    /dangerously/
  ]
  private static readonly DASH_N = /(^|\s)-n(\s|$)/
  private static readonly DASH_F = /(^|\s)-f(\s|$)/
  private static readonly CONFUSABLES: Readonly<Record<string, string>> = {
    'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x',
    'ѕ': 's', 'і': 'i', 'ј': 'j', 'ԁ': 'd', 'ο': 'o', 'ν': 'v', 'κ': 'k',
    'ι': 'i', 'α': 'a', 'ε': 'e', 'ρ': 'p', 'τ': 't', 'υ': 'u', 'ɑ': 'a',
    'һ': 'h', 'յ': 'j', 'ա': 'a', 'ս': 'u'
  }
  private static readonly CONFUSABLE = new RegExp(`[${Object.keys(Cases.CONFUSABLES).join('')}]`, 'g')
  private static readonly NEAR = 300
  private static readonly TAIL = 64
  private static readonly MAX_TEXT = 64 * 1024
  private static readonly ATTEMPTS = 64
  private static readonly NORMALISED = 20000

  static firstObject(text: string): string {
    return Cases.scan(text)?.span ?? ''
  }

  static parseModelOutput(text: string, vocabulary: VocabularyData): ParsedOutput {
    const output: ParsedOutput = { cases: [], candidateTags: [], dropped: [] }
    const parsed = Cases.scan(text)?.value
    if (!parsed) return output
    if (Array.isArray(parsed.cases)) {
      const first = new Map<string, number>()
      const entries: unknown[] = []
      parsed.cases.forEach((raw, index) => {
        if (index >= Cases.MAX_CASES) {
          output.dropped.push({ index, reason: 'cap' })
          return
        }
        const key = Cases.identity(raw)
        const at = key === '' ? undefined : first.get(key)
        if (at === undefined) {
          if (key !== '') first.set(key, index)
          entries[index] = raw
          return
        }
        entries[at] = Cases.union(entries[at], raw)
      })
      entries.forEach((raw, index) => {
        const verdict = Cases.validate(raw, vocabulary)
        if (verdict.value) output.cases.push(verdict.value)
        else output.dropped.push({ index, reason: verdict.reason })
      })
    }
    if (Array.isArray(parsed.candidateTags)) {
      for (const raw of parsed.candidateTags) {
        if (output.candidateTags.length >= Cases.MAX_CANDIDATES) break
        const candidate = Cases.candidate(raw, vocabulary)
        if (candidate && !output.candidateTags.some((c) => c.tag === candidate.tag)) output.candidateTags.push(candidate)
      }
    }
    output.dropped.sort((a, b) => a.index - b.index)
    return output
  }

  static validate(raw: unknown, vocabulary: VocabularyData): Verdict {
    try {
      return Cases.check(raw, vocabulary)
    } catch {
      return Cases.reject('invalid')
    }
  }

  static isUnsafe(text: string): boolean {
    return Cases.breaksFloor(text, Cases.NEAR)
  }

  static isForeign(text: string): boolean {
    return Cases.SCRIPT.test(text.slice(0, Cases.NORMALISED).normalize('NFKD').replace(Cases.MARKS, ''))
  }

  static confidence(evidenceCount: number, counterCount: number, projects: number, isConfirmedByUser: boolean): number {
    const e = Math.max(0, Number(evidenceCount) || 0)
    const c = Math.max(0, Number(counterCount) || 0)
    const p = Math.max(0, Number(projects) || 0)
    const total = e + c === 0 ? 1 : e + c
    const raw = 0.35 + 0.15 * Math.log(1 + e) + 0.1 * Math.min(p, 3) - (0.2 * c) / total + (isConfirmedByUser ? 0.25 : 0)
    return Math.round(Math.min(1, Math.max(0, raw)) * 1000) / 1000
  }

  static repositoryOf(evidence: string): string {
    if (typeof evidence !== 'string') return ''
    const match = Cases.COMMIT.exec(evidence)
    return match ? (match[1] ?? '') : ''
  }

  static fromLines(text: string): CaseLines {
    const byId = new Map<number, Case>()
    let valid = 0
    let bad = 0
    const lines = typeof text === 'string' ? text.split('\n') : []
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed === '') continue
      let parsed: unknown
      try {
        parsed = JSON.parse(trimmed)
      } catch {
        bad += 1
        continue
      }
      if (!Cases.isRecord(parsed) || typeof parsed.id !== 'number' || !Number.isInteger(parsed.id) || parsed.id < 0) {
        bad += 1
        continue
      }
      const id = parsed.id
      if (parsed.deleted === true) {
        valid += 1
        byId.delete(id)
        continue
      }
      const value = Cases.normalise(parsed, id)
      if (!value) {
        bad += 1
        continue
      }
      valid += 1
      byId.set(id, value)
    }
    const cases = [...byId.values()].sort((a, b) => a.id - b.id)
    return { cases, superseded: valid - cases.length, bad }
  }

  static toLine(value: Case): string {
    return JSON.stringify(value)
  }

  static tombstone(id: number): string {
    return JSON.stringify({ id, deleted: true })
  }

  private static check(raw: unknown, vocabulary: VocabularyData): Verdict {
    if (!Cases.isRecord(raw)) return Cases.reject('not-object')
    const situation = Cases.bounded(raw.situation, 8, 300)
    if (situation === undefined) return Cases.reject('situation')
    const choice = Cases.bounded(raw.choice, 8, 300)
    if (choice === undefined) return Cases.reject('choice')
    const options = Cases.options(raw.options ?? undefined)
    if (options === undefined) return Cases.reject('options')
    const why = raw.why === undefined || raw.why === null ? '' : Cases.bounded(raw.why, 0, 300)
    if (why === undefined) return Cases.reject('why')
    const kind = raw.kind === undefined || raw.kind === null ? 'choice' : Cases.KINDS.find((k) => k === raw.kind)
    if (kind === undefined) return Cases.reject('kind')
    if (!Array.isArray(raw.tags)) return Cases.reject('tags')
    const tags = Vocabulary.normalize(vocabulary, raw.tags.filter((t): t is string => typeof t === 'string'))
    if (tags.length < 1 || tags.length > 12) return Cases.reject('tags')
    const isAnchored = tags.some((tag) => {
      const facet = Vocabulary.facetOf(vocabulary, tag)
      return facet === 'concept' || facet === 'decision'
    })
    if (!isAnchored) return Cases.reject('concept')
    const evidence = Cases.evidence(raw.evidence)
    if (evidence === undefined) return Cases.reject('evidence')
    if ([situation, choice, why, ...options].some((part) => Sanitizer.isInjection(part))) return Cases.reject('injection')
    if ([situation, choice, why, ...options].some((part) => Cases.isForeign(part))) return Cases.reject('script')
    if ([situation, choice, why, ...options].some((part) => Cases.isUnsafe(part))) return Cases.reject('unsafe')
    if (Cases.breaksFloor([situation, choice, why, ...options].join('. '), Infinity)) return Cases.reject('unsafe')
    if ((kind === 'refusal' || kind === 'blind-spot') && Cases.hasTarget(choice)) return Cases.reject('unsafe')
    return { value: { situation, options, choice, why, tags, kind, evidence }, reason: '' }
  }

  private static candidate(raw: unknown, vocabulary: VocabularyData): CandidateTag | undefined {
    if (!Cases.isRecord(raw)) return undefined
    const tag = typeof raw.tag === 'string' ? raw.tag.trim() : ''
    if (!Vocabulary.isName(tag) || Vocabulary.has(vocabulary, tag)) return undefined
    const facet = Vocabulary.FACETS.find((f) => f === raw.facet)
    if (facet === undefined) return undefined
    const parent = raw.parent === undefined || raw.parent === null ? '' : raw.parent
    if (typeof parent !== 'string') return undefined
    if (parent !== '' && !Vocabulary.has(vocabulary, parent)) return undefined
    const aliases = Array.isArray(raw.aliases)
      ? raw.aliases
          .filter((a): a is string => typeof a === 'string')
          .map((a) => a.trim().toLowerCase())
          .map((a) => a.slice(0, Cases.ALIAS_LENGTH))
          .filter((a) => a !== '')
          .slice(0, Cases.MAX_ALIASES)
      : []
    return { tag, facet, parent, aliases }
  }

  private static options(value: unknown): string[] | undefined {
    if (value === undefined) return []
    if (!Array.isArray(value) || value.length > 6) return undefined
    const out: string[] = []
    for (const item of value) {
      const text = Cases.bounded(item, 1, 120)
      if (text === undefined) return undefined
      out.push(text)
    }
    return out
  }

  private static evidence(value: unknown): string[] | undefined {
    if (!Array.isArray(value) || value.length < 1 || value.length > 20) return undefined
    const out: string[] = []
    for (const item of value) {
      if (typeof item !== 'string' || !Cases.EVIDENCE.test(item)) return undefined
      if (!out.includes(item)) out.push(item)
    }
    return out
  }

  private static bounded(value: unknown, min: number, max: number): string | undefined {
    if (typeof value !== 'string') return undefined
    const text = Sanitizer.flat(value)
    return text.length >= min && text.length <= max ? text : undefined
  }

  private static reject(reason: string): Verdict {
    return { value: undefined, reason }
  }

  private static isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
  }

  private static breaksFloor(text: string, window: number): boolean {
    try {
      const flat = Cases.flatten(text)
      if (flat === '') return false
      if (Cases.FLAGS.some((flag) => flag.test(flat))) return true
      if (Cases.DASH_N.test(flat) && flat.includes('commit')) return true
      if (flat.includes('push') && (flat.includes('--force') || Cases.DASH_F.test(flat))) return true
      if (Cases.weakens(flat, window)) return true
      const targets = Cases.spans(flat, Cases.TARGET)
      if (targets.length === 0) return false
      const isNear = (word: Span) => targets.some((target) => Cases.gap(word, target) <= window)
      if (Cases.spans(flat, Cases.VERB).some((verb) => !Cases.isNegated(flat, verb[0], Cases.VERB_NEGATORS) && isNear(verb))) return true
      if (Cases.spans(flat, Cases.POSITIVE).some((verb) => Cases.isNegatedPositive(flat, verb[0]) && isNear(verb))) return true
      return Cases.spans(flat, Cases.WITHOUT).some((word) => targets.some((target) => target[0] >= word[1] && target[0] - word[1] <= window))
    } catch {
      return false
    }
  }

  private static identity(raw: unknown): string {
    if (!Cases.isRecord(raw) || typeof raw.situation !== 'string' || typeof raw.choice !== 'string') return ''
    return `${Vocabulary.fold(raw.situation).trim().replace(/\s+/g, ' ')}|${Vocabulary.fold(raw.choice).trim().replace(/\s+/g, ' ')}`
  }

  private static union(base: unknown, extra: unknown): unknown {
    if (!Cases.isRecord(base) || !Cases.isRecord(extra)) return base
    const left = Array.isArray(base.evidence) ? base.evidence : []
    const right = Array.isArray(extra.evidence) ? extra.evidence : []
    const merged = [...new Set([...left, ...right].filter((id): id is string => typeof id === 'string'))].slice(0, Cases.MAX_EVIDENCE)
    return { ...base, evidence: merged }
  }

  private static scan(text: string): { span: string, value: Record<string, unknown> } | undefined {
    if (typeof text !== 'string') return undefined
    const capped = text.slice(0, Cases.MAX_TEXT)
    let from = capped.indexOf('{')
    for (let attempt = 0; from !== -1 && attempt < Cases.ATTEMPTS; attempt += 1) {
      const end = Cases.closing(capped, from)
      if (end !== -1) {
        const span = capped.slice(from, end + 1)
        try {
          const value: unknown = JSON.parse(span)
          if (Cases.isRecord(value)) return { span, value }
        } catch {
          from = capped.indexOf('{', from + 1)
          continue
        }
      }
      from = capped.indexOf('{', from + 1)
    }
    return undefined
  }

  private static normalise(raw: Record<string, unknown>, id: number): Case | undefined {
    const situation = Cases.clip(raw.situation, 300)
    const choice = Cases.clip(raw.choice, 300)
    if (situation === '' || choice === '' || !Array.isArray(raw.tags)) return undefined
    const tags = [...new Set(raw.tags.filter((tag): tag is string => typeof tag === 'string' && Vocabulary.isName(tag)))].slice(0, 12)
    if (tags.length === 0) return undefined
    const strings = (value: unknown, max: number, size: number) =>
      Array.isArray(value) ? value.map((item) => Cases.clip(item, size)).filter((item) => item !== '').slice(0, max) : []
    return {
      id,
      situation,
      options: strings(raw.options, 6, 120),
      choice,
      why: Cases.clip(raw.why, 300),
      tags,
      scope: Cases.SCOPES.find((x) => x === raw.scope) ?? 'global',
      project: Cases.clip(raw.project, 100),
      projectId: Cases.clip(raw.projectId, 100),
      projects: strings(raw.projects, 10, 100),
      stack: Cases.clip(raw.stack, 64),
      kind: Cases.KINDS.find((x) => x === raw.kind) ?? 'choice',
      confidence: Cases.number(raw.confidence, 0, 1, false),
      evidenceCount: Cases.number(raw.evidenceCount, 0, 1000000, true),
      evidence: strings(raw.evidence, 5, 200),
      counterCount: Cases.number(raw.counterCount, 0, 1000000, true),
      status: Cases.STATUSES.find((x) => x === raw.status) ?? 'observed',
      isConfirmedByUser: raw.isConfirmedByUser === true,
      firstSeen: Cases.date(raw.firstSeen),
      lastSeen: Cases.date(raw.lastSeen),
      statusAt: Cases.date(raw.statusAt),
      uses: Cases.number(raw.uses, 0, 1000000, true),
      hits: Cases.number(raw.hits, 0, 1000000, true),
      defaultCovered: raw.defaultCovered === true,
      extractor: Cases.clip(raw.extractor, 64),
      vocabulary: Cases.number(raw.vocabulary, 0, 1000000, true)
    }
  }

  private static clip(value: unknown, max: number): string {
    return typeof value === 'string' ? value.trim().slice(0, max) : ''
  }

  private static number(value: unknown, min: number, max: number, isInteger: boolean): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return min
    const bounded = Math.min(max, Math.max(min, value))
    return isInteger ? Math.floor(bounded) : bounded
  }

  private static date(value: unknown): string {
    return typeof value === 'string' && Cases.DATE.test(value) ? value : ''
  }

  private static flatten(text: string): string {
    if (typeof text !== 'string') return ''
    const base = text.slice(0, Cases.NORMALISED).normalize('NFKC').replace(/[\p{Default_Ignorable_Code_Point}\u2800]/gu, '').replace(/[\u2018\u2019]/g, "'")
    return Vocabulary.fold(base).replace(Cases.CONFUSABLE, (ch) => Cases.CONFUSABLES[ch] ?? ch)
  }

  private static hasTarget(text: string): boolean {
    return Cases.spans(Cases.flatten(text), Cases.TARGET).length > 0
  }

  private static weakens(flat: string, window: number): boolean {
    const permissions = Cases.spans(flat, Cases.PERMISSION)
    if (permissions.length > 0) {
      const grants = Cases.spans(flat, Cases.GRANT)
      if (grants.some((grant) => !Cases.isNegated(flat, grant[0], Cases.VERB_NEGATORS) && permissions.some((word) => Cases.gap(grant, word) <= window))) return true
    }
    const targets = Cases.spans(flat, Cases.TARGET)
    if (targets.length === 0) return false
    const optionals = Cases.spans(flat, Cases.OPTIONAL)
    if (optionals.some((word) => !Cases.isGoverned(flat, word[0]) && targets.some((target) => Cases.gap(word, target) <= window))) return true
    for (const pattern of [Cases.AHEAD, Cases.RED]) {
      for (const match of flat.matchAll(pattern)) {
        if (Cases.spans(match[0], Cases.TARGET).length > 0 && !Cases.isGoverned(flat, match.index ?? 0)) return true
      }
    }
    return false
  }

  private static isGoverned(text: string, start: number): boolean {
    const prefix = text.slice(Math.max(0, start - Cases.TAIL), start)
    const cut = Math.max(prefix.lastIndexOf(','), prefix.lastIndexOf('.'), prefix.lastIndexOf(';'), prefix.lastIndexOf(':'), prefix.lastIndexOf('!'), prefix.lastIndexOf('?'))
    const words = prefix.slice(cut + 1).split(/[^a-z0-9']+/).filter((word) => word !== '')
    for (let i = Math.max(0, words.length - Cases.GOVERN); i < words.length; i += 1) {
      const word = words[i] ?? ''
      const width = Cases.SINGLE_NEGATORS.has(word) ? 1 : Cases.VERB_NEGATORS.has(`${word} ${words[i + 1] ?? ''}`) ? 2 : 0
      if (width !== 0 && !Cases.DOUBLERS.has(words[i - 1] ?? '')) return true
    }
    return false
  }

  private static isNegatedPositive(text: string, start: number): boolean {
    const prefix = text.slice(Math.max(0, start - Cases.TAIL), start)
    const cut = Math.max(prefix.lastIndexOf('.'), prefix.lastIndexOf(';'), prefix.lastIndexOf('!'), prefix.lastIndexOf('?'))
    const words = prefix.slice(cut + 1).split(/[^a-z0-9']+/).filter((word) => word !== '')
    for (let i = 0; i < words.length; i += 1) {
      const word = words[i] ?? ''
      const at = word === 'longer' && words[i - 1] === 'no' ? i - 1 : i
      if (at === i && !Cases.POSITIVE_NEGATORS.has(word) && !word.startsWith('refrain')) continue
      if (at !== i || !Cases.DOUBLERS.has(words[at - 1] ?? '')) return true
    }
    return false
  }

  private static isNegated(text: string, start: number, doubles: ReadonlySet<string>): boolean {
    const prefix = text.slice(Math.max(0, start - Cases.TAIL), start)
    const cut = Math.max(prefix.lastIndexOf(','), prefix.lastIndexOf('.'), prefix.lastIndexOf(';'), prefix.lastIndexOf(':'), prefix.lastIndexOf('!'), prefix.lastIndexOf('?'))
    const words = prefix.slice(cut + 1).split(/[^a-z0-9']+/).filter((word) => word !== '')
    const last = words[words.length - 1] ?? ''
    let width = 0
    if (Cases.SINGLE_NEGATORS.has(last)) width = 1
    else if (doubles.has(words.slice(-2).join(' '))) width = 2
    if (width === 0) return false
    const before = words[words.length - 1 - width]
    return before === undefined || !Cases.DOUBLERS.has(before)
  }

  private static closing(text: string, from: number): number {
    let depth = 0
    let isString = false
    let isEscaped = false
    for (let i = from; i < text.length; i += 1) {
      const ch = text[i]
      if (isString) {
        if (isEscaped) isEscaped = false
        else if (ch === '\\') isEscaped = true
        else if (ch === '"') isString = false
        continue
      }
      if (ch === '"') isString = true
      else if (ch === '{') depth += 1
      else if (ch === '}') {
        depth -= 1
        if (depth === 0) return i
      }
    }
    return -1
  }

  private static spans(text: string, pattern: RegExp): Span[] {
    const out: Span[] = []
    for (const match of text.matchAll(pattern)) {
      const start = (match.index ?? 0) + (match[1] ?? '').length
      out.push([start, start + (match[2] ?? '').length])
    }
    return out
  }

  private static gap(a: Span, b: Span): number {
    if (a[1] <= b[0]) return b[0] - a[1]
    if (b[1] <= a[0]) return a[0] - b[1]
    return 0
  }
}
