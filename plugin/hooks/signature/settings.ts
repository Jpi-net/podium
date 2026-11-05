import { SignaturePaths } from './paths'

export type Consent = 'undecided' | 'enabled' | 'paused' | 'declined' | 'never'

export type LearningModel = 'haiku' | 'sonnet' | 'opus'

export type Settings = {
  version: 1
  consent: Consent
  capture: { sessions: boolean, history: boolean, pastSessions: boolean }
  apply: { section: boolean, context: boolean, hints: boolean, proxy: boolean }
  learning: { background: boolean, model: LearningModel, runsPerDay: number, tokensPerDay: number, idleMinutes: number }
  identities: string[]
  exclude: string[]
  notify: boolean
  halfLifeMonths: number
}

export class SignatureSettings {
  private static readonly CONSENTS: readonly Consent[] = ['undecided', 'enabled', 'paused', 'declined', 'never']
  private static readonly MODELS: readonly LearningModel[] = ['haiku', 'sonnet', 'opus']
  private static readonly EMAIL = /^[^\s@]{1,64}@[^\s@.]{1,63}(?:\.[^\s@.]{1,63}){1,8}$/
  private static readonly MAX_EMAIL = 254
  private static readonly MAX_IDENTITIES = 20
  private static readonly MAX_EXCLUDE = 100
  private static readonly MAX_GLOB = 256
  private static readonly MAX_PATH = 4096
  private static readonly ABSOLUTE = /^(?:[\\/]|[A-Za-z]:[\\/]|(?:~|\$HOME|\$\{HOME\}|%USERPROFILE%)(?=$|[\\/]))/i
  private static readonly HOME_PREFIX = /^(?:~|\$HOME|\$\{HOME\}|%USERPROFILE%)(?=$|[\\/])/i

  static defaults(): Settings {
    return {
      version: 1,
      consent: 'undecided',
      capture: { sessions: true, history: true, pastSessions: false },
      apply: { section: true, context: true, hints: true, proxy: true },
      learning: { background: true, model: 'sonnet', runsPerDay: 2, tokensPerDay: 300000, idleMinutes: 10 },
      identities: [],
      exclude: [],
      notify: true,
      halfLifeMonths: 12
    }
  }

  static parse(text: string): Settings {
    const settings = SignatureSettings.defaults()
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      return settings
    }
    const root = SignatureSettings.record(raw)
    if (root === undefined) return settings
    const consent = root.consent
    if (typeof consent === 'string' && (SignatureSettings.CONSENTS as readonly string[]).includes(consent)) {
      settings.consent = consent as Consent
    }
    const capture = SignatureSettings.record(root.capture)
    if (capture !== undefined) {
      settings.capture.sessions = SignatureSettings.flag(capture.sessions, settings.capture.sessions)
      settings.capture.history = SignatureSettings.flag(capture.history, settings.capture.history)
      settings.capture.pastSessions = SignatureSettings.flag(capture.pastSessions, settings.capture.pastSessions)
    }
    const apply = SignatureSettings.record(root.apply)
    if (apply !== undefined) {
      settings.apply.section = SignatureSettings.flag(apply.section, settings.apply.section)
      settings.apply.context = SignatureSettings.flag(apply.context, settings.apply.context)
      settings.apply.hints = SignatureSettings.flag(apply.hints, settings.apply.hints)
      settings.apply.proxy = SignatureSettings.flag(apply.proxy, settings.apply.proxy)
    }
    const learning = SignatureSettings.record(root.learning)
    if (learning !== undefined) {
      settings.learning.background = SignatureSettings.flag(learning.background, settings.learning.background)
      const model = learning.model
      if (typeof model === 'string') {
        settings.learning.model = (SignatureSettings.MODELS as readonly string[]).includes(model) ? model as LearningModel : 'sonnet'
      }
      settings.learning.runsPerDay = SignatureSettings.number(learning.runsPerDay, 0, 24, true, settings.learning.runsPerDay)
      settings.learning.tokensPerDay = SignatureSettings.number(learning.tokensPerDay, 0, 5000000, true, settings.learning.tokensPerDay)
      settings.learning.idleMinutes = SignatureSettings.number(learning.idleMinutes, 3, 120, false, settings.learning.idleMinutes)
    }
    settings.identities = SignatureSettings.identities(root.identities)
    settings.exclude = SignatureSettings.split(root.exclude).kept
    settings.notify = SignatureSettings.flag(root.notify, settings.notify)
    settings.halfLifeMonths = SignatureSettings.number(root.halfLifeMonths, 1, 120, false, settings.halfLifeMonths)
    return settings
  }

  static dropped(text: string): string[] {
    try {
      const raw: unknown = JSON.parse(text)
      const root = SignatureSettings.record(raw)
      return root === undefined ? [] : SignatureSettings.split(root.exclude).dropped
    } catch {
      return []
    }
  }

  static serialize(settings: Settings): string {
    return JSON.stringify(settings, null, 2) + '\n'
  }

  static isActive(settings: Settings): boolean {
    return !!settings && settings.consent === 'enabled'
  }

  static matches(glob: string, path: string, home: string): boolean {
    if (typeof glob !== 'string' || typeof path !== 'string') return false
    if (glob.length > SignatureSettings.MAX_GLOB || path.length > SignatureSettings.MAX_PATH) return false
    try {
      const pattern = SignatureSettings.fold(SignaturePaths.normalize(SignatureSettings.expand(glob.trim(), home)))
      const target = SignatureSettings.fold(SignaturePaths.normalize(SignatureSettings.expand(path.trim(), home)))
      if (pattern === '' || target === '') return false
      if (pattern === target) return true
      let body = pattern
      while (body.endsWith('/**')) body = body.slice(0, -3)
      if (body === '') return target.startsWith('/')
      return SignatureSettings.test(SignatureSettings.tokens(body), target)
    } catch {
      return false
    }
  }

  static isExcluded(settings: Settings, path: string, home: string): boolean {
    if (!settings || !Array.isArray(settings.exclude)) return false
    return settings.exclude.some((glob) => SignatureSettings.matches(glob, path, home))
  }

  private static fold(text: string): string {
    return text.normalize('NFC').toLowerCase()
  }

  private static expand(text: string, home: string): string {
    if (typeof home !== 'string' || home === '') return text
    return text.replace(SignatureSettings.HOME_PREFIX, () => home)
  }

  private static tokens(pattern: string): string[] {
    const list: string[] = []
    let index = 0
    while (index < pattern.length) {
      if (pattern.startsWith('/**/', index)) {
        list.push('/**/')
        index += 4
        continue
      }
      const char = pattern.charAt(index)
      if (char === '*') {
        let end = index
        while (pattern.charAt(end) === '*') end += 1
        list.push(end - index > 1 ? '**' : '*')
        index = end
        continue
      }
      list.push(char)
      index += 1
    }
    return list
  }

  private static test(tokens: readonly string[], text: string): boolean {
    const size = text.length
    let current = new Uint8Array(size + 1)
    current[0] = 1
    for (const token of tokens) {
      const next = new Uint8Array(size + 1)
      let isAlive = false
      if (token === '**') {
        for (let at = 0; at <= size; at += 1) {
          if (current[at] === 1 || (at > 0 && next[at - 1] === 1)) next[at] = 1
        }
      } else if (token === '*') {
        for (let at = 0; at <= size; at += 1) {
          if (current[at] === 1 || (at > 0 && next[at - 1] === 1 && text.charAt(at - 1) !== '/')) next[at] = 1
        }
      } else if (token === '/**/') {
        const spans = new Uint8Array(size + 1)
        for (let at = 0; at < size; at += 1) {
          if (current[at] === 1 && text.charAt(at) === '/') next[at + 1] = 1
        }
        for (let at = 0; at <= size; at += 1) {
          if (next[at] === 1 || (at > 0 && spans[at - 1] === 1)) spans[at] = 1
        }
        for (let at = 0; at < size; at += 1) {
          if (spans[at] === 1 && text.charAt(at) === '/') next[at + 1] = 1
        }
      } else {
        for (let at = 0; at < size; at += 1) {
          if (current[at] !== 1) continue
          const char = text.charAt(at)
          if (token === '?' ? char !== '/' : char === token) next[at + 1] = 1
        }
      }
      for (let at = 0; at <= size; at += 1) {
        if (next[at] === 1) {
          isAlive = true
          break
        }
      }
      if (!isAlive) return false
      current = next
    }
    for (let at = 0; at <= size; at += 1) {
      if (current[at] === 1 && (at === size || text.charAt(at) === '/')) return true
    }
    return false
  }

  private static record(value: unknown): Record<string, unknown> | undefined {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
    return value as Record<string, unknown>
  }

  private static flag(value: unknown, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : fallback
  }

  private static number(value: unknown, min: number, max: number, isInteger: boolean, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
    const clamped = Math.min(max, Math.max(min, value))
    return isInteger ? Math.round(clamped) : clamped
  }

  private static identities(value: unknown): string[] {
    if (!Array.isArray(value)) return []
    const result: string[] = []
    for (const item of value) {
      if (typeof item !== 'string') continue
      const email = item.trim()
      if (email.length > SignatureSettings.MAX_EMAIL || !SignatureSettings.EMAIL.test(email) || result.includes(email)) continue
      result.push(email)
      if (result.length >= SignatureSettings.MAX_IDENTITIES) break
    }
    return result
  }

  private static split(value: unknown): { kept: string[], dropped: string[] } {
    const kept: string[] = []
    const dropped: string[] = []
    if (!Array.isArray(value)) return { kept, dropped }
    for (const item of value) {
      if (typeof item !== 'string') continue
      const glob = item.trim()
      if (glob === '') continue
      const isValid = glob.length <= SignatureSettings.MAX_GLOB && SignatureSettings.ABSOLUTE.test(glob)
      if (isValid && kept.length < SignatureSettings.MAX_EXCLUDE) kept.push(glob)
      else dropped.push(glob.slice(0, SignatureSettings.MAX_GLOB))
    }
    return { kept, dropped }
  }
}
