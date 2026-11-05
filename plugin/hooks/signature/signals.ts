import { Redactor } from './redactor'

export type SignalKind = 'prompt' | 'question' | 'plan' | 'abort' | 'agent' | 'use' | 'turn'

export type SignalContext = { session: string, project: string, projectId: string, stack: readonly string[], home: string, at: number }

export type Signal = { v: 1, at: number, session: string, project: string, projectId: string, stack: string[], kind: SignalKind, data: Record<string, unknown> }

export type PromptInput = { text: string, command: string, args: string, isAfterAbort: boolean }

export type QuestionInput = { questions: unknown, answers: unknown, response: unknown, afkTimeoutMs: unknown, predicted: Readonly<Record<string, string>> }

export type PlanInput = { plan: unknown, isRefused: boolean, feedback: string, isEdited: boolean }

type Remote = { host: string, path: string }

export class SignalExtractor {
  private static readonly EXCERPT = 400
  private static readonly QUESTION = 300
  private static readonly LABEL = 120
  private static readonly OTHER = 300
  private static readonly PLAN = 1500
  private static readonly FEEDBACK = 600
  private static readonly SHORT = 64
  private static readonly TURN = 600
  private static readonly REJECTIONS: readonly string[] = [
    'The agent proposed a plan that was rejected by the user.',
    "The user doesn't want to proceed with this tool use."
  ]
  private static readonly SAID = 'the user said:'
  private static readonly ID = 128
  private static readonly MAX_QUESTIONS = 8
  private static readonly MAX_OPTIONS = 12
  private static readonly MAX_CASES = 50
  private static readonly MAX_LANGUAGE_TEXT = 4000
  private static readonly MAX_CORRECTION_TEXT = 4000
  private static readonly MIN_MATCHES = 3
  private static readonly RECOMMENDED = /[ \t]?\(Recommended\)\s*$/
  private static readonly LETTERS = /[^\p{L}]+/u
  private static readonly APOSTROPHES = /[‘’ʼ`]/g
  private static readonly ACCENTS = /[̀-ͯ]/g
  private static readonly WORD_CHAR = /[\p{L}\p{N}]/u
  private static readonly SCHEME = /^([a-z][a-z0-9+.-]{0,15}):\/\/(.*)$/i
  private static readonly SCP = /^(?:[^@/\s]{1,128}@)?([^:/\s@]{2,255}):(?!\/\/)(.+)$/

  private static readonly PREFIXES: readonly string[] = [
    'no', 'non', 'not', 'pas', 'stop', 'wait', 'attends', 'actually', 'en fait', 'instead',
    'plutot', 'rather', "don't", 'ne', 'undo', 'revert', 'annule'
  ]

  private static readonly PHRASES: readonly string[] = ['not like that', 'pas comme ca', 'i said', "j'ai dit"]

  private static readonly FRENCH: ReadonlySet<string> = new Set([
    'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'et', 'est', 'que', 'qui', 'pour', 'pas', 'avec', 'dans',
    'sur', 'ce', 'cette', 'il', 'elle', 'je', 'tu', 'nous', 'vous', 'ne', 'en', 'au', 'aux', 'mais', 'ou', 'plus',
    'sont', 'ces', 'mon', 'ma', 'mes', 'ton', 'sa', 'son', 'ses', 'par', 'sans', 'fait', 'faire', 'comme', 'tout'
  ])

  private static readonly ENGLISH: ReadonlySet<string> = new Set([
    'the', 'and', 'is', 'are', 'to', 'of', 'in', 'that', 'it', 'for', 'with', 'this', 'not', 'be', 'as', 'you',
    'i', 'we', 'was', 'have', 'has', 'do', 'does', 'but', 'or', 'if', 'on', 'at', 'by', 'from', 'my', 'your',
    'they', 'them', 'what', 'when', 'how', 'should', 'would', 'can', 'will', 'there'
  ])

  static language(text: string): 'fr' | 'en' | 'other' {
    if (typeof text !== 'string') return 'other'
    const words = SignalExtractor.fold(text.slice(0, SignalExtractor.MAX_LANGUAGE_TEXT)).split(SignalExtractor.LETTERS)
    let french = 0
    let english = 0
    for (const word of words) {
      if (word === '') continue
      if (SignalExtractor.FRENCH.has(word)) french += 1
      if (SignalExtractor.ENGLISH.has(word)) english += 1
    }
    const best = Math.max(french, english)
    if (best < SignalExtractor.MIN_MATCHES || french === english) return 'other'
    return french > english ? 'fr' : 'en'
  }

  static isCorrection(text: string): boolean {
    if (typeof text !== 'string') return false
    const folded = SignalExtractor.fold(text.slice(0, SignalExtractor.MAX_CORRECTION_TEXT))
      .replace(SignalExtractor.APOSTROPHES, "'")
      .trim()
    if (folded === '') return false
    for (const prefix of SignalExtractor.PREFIXES) {
      if (folded.startsWith(prefix) && !SignalExtractor.WORD_CHAR.test(folded.charAt(prefix.length))) return true
    }
    for (const phrase of SignalExtractor.PHRASES) {
      let from = 0
      for (;;) {
        const at = folded.indexOf(phrase, from)
        if (at < 0) break
        const isStart = at === 0 || !SignalExtractor.WORD_CHAR.test(folded.charAt(at - 1))
        const isEnd = !SignalExtractor.WORD_CHAR.test(folded.charAt(at + phrase.length))
        if (isStart && isEnd) return true
        from = at + 1
      }
    }
    return false
  }

  static prompt(context: SignalContext, input: PromptInput): Signal {
    const command = SignalExtractor.str(input.command)
    const text = SignalExtractor.str(input.text)
    const args = SignalExtractor.str(input.args)
    const body = command === '' ? text : args
    return SignalExtractor.signal(context, 'prompt', {
      length: text.length,
      language: SignalExtractor.language(body),
      command: Redactor.clean(command, SignalExtractor.SHORT, context.home),
      excerpt: Redactor.clean(body, SignalExtractor.EXCERPT, context.home),
      isCorrection: SignalExtractor.isCorrection(body),
      afterAbort: input.isAfterAbort === true
    })
  }

  static questions(context: SignalContext, input: QuestionInput): Signal[] {
    try {
      if (!input || typeof input.afkTimeoutMs === 'number') return []
      if (!Array.isArray(input.questions)) return []
      const answers = SignalExtractor.record(input.answers) ?? {}
      const predicted = SignalExtractor.record(input.predicted) ?? {}
      let freeform = typeof input.response === 'string' ? input.response : ''
      const signals: Signal[] = []
      for (const item of input.questions.slice(0, SignalExtractor.MAX_QUESTIONS)) {
        const signal = SignalExtractor.question(context, item, answers, predicted, freeform)
        if (signal === undefined) continue
        if (signal.freeform) freeform = ''
        signals.push(signal.signal)
      }
      return signals
    } catch {
      return []
    }
  }

  static plan(context: SignalContext, input: PlanInput): Signal {
    return SignalExtractor.signal(context, 'plan', {
      outcome: input.isRefused === true ? 'refused' : 'accepted',
      excerpt: typeof input.plan === 'string' ? Redactor.clean(input.plan, SignalExtractor.PLAN, context.home) : '',
      feedback: Redactor.clean(SignalExtractor.str(input.feedback), SignalExtractor.FEEDBACK, context.home),
      isEdited: input.isEdited === true
    })
  }

  static abort(context: SignalContext, turnId: string): Signal {
    return SignalExtractor.signal(context, 'abort', { turnId: SignalExtractor.str(turnId).slice(0, SignalExtractor.ID) })
  }

  static agent(context: SignalContext, type: string, model: string): Signal {
    return SignalExtractor.signal(context, 'agent', {
      type: Redactor.clean(SignalExtractor.str(type), SignalExtractor.SHORT, context.home),
      model: Redactor.clean(SignalExtractor.str(model), SignalExtractor.SHORT, context.home)
    })
  }

  static use(context: SignalContext, caseIds: readonly number[]): Signal {
    const ids = Array.isArray(caseIds)
      ? caseIds.filter((id) => typeof id === 'number' && Number.isInteger(id) && id >= 0).slice(0, SignalExtractor.MAX_CASES)
      : []
    return SignalExtractor.signal(context, 'use', { caseIds: ids })
  }

  static turn(context: SignalContext, text: string): Signal {
    return SignalExtractor.signal(context, 'turn', { text: Redactor.clean(SignalExtractor.str(text), SignalExtractor.TURN, context.home) })
  }

  static isRejection(text: string): boolean {
    if (typeof text !== 'string') return false
    const head = text.trimStart()
    return SignalExtractor.REJECTIONS.some((prefix) => head.startsWith(prefix))
  }

  static rejectionFeedback(text: string): string {
    if (!SignalExtractor.isRejection(text)) return ''
    const at = text.indexOf(SignalExtractor.SAID)
    return at < 0 ? '' : text.slice(at + SignalExtractor.SAID.length).trim()
  }

  static normalizeRemote(url: string): string {
    if (typeof url !== 'string') return ''
    const remote = SignalExtractor.remote(url.trim())
    if (remote === undefined) return url.trim()
    return remote.path === '' ? remote.host : remote.host + '/' + remote.path
  }

  static projectId(remoteOrRoot: string): string {
    if (typeof remoteOrRoot !== 'string') return SignalExtractor.hash('')
    const trimmed = remoteOrRoot.trim()
    const remote = SignalExtractor.remote(trimmed)
    const source = remote === undefined ? remoteOrRoot : (remote.path === '' ? remote.host : remote.host + '/' + remote.path)
    return SignalExtractor.hash(source)
  }

  private static question(context: SignalContext, item: unknown, answers: Record<string, unknown>, predicted: Record<string, unknown>, freeform: string): { signal: Signal, freeform: boolean } | undefined {
    const raw = SignalExtractor.record(item)
    if (raw === undefined || typeof raw.question !== 'string') return undefined
    const key = raw.question
    const isAnswered = Object.prototype.hasOwnProperty.call(answers, key)
    const isFreeform = !isAnswered && freeform.trim() !== ''
    const labels = SignalExtractor.labels(raw.options)
    const answer = SignalExtractor.answer(Object.prototype.hasOwnProperty.call(answers, key) ? answers[key] : undefined)
    const options = labels.map((label) => Redactor.clean(label.text, SignalExtractor.LABEL, context.home))
    const isMulti = raw.multiSelect === true
    const chosen: string[] = []
    const leftover: string[] = []
    if (isFreeform) {
      leftover.push(freeform)
    } else if (answer !== '') {
      const whole = labels.findIndex((label) => label.text === answer.trim())
      if (whole >= 0) {
        chosen.push(options[whole] ?? '')
      } else if (labels.length > 0 && isMulti) {
        for (const part of answer.split(', ')) {
          const at = labels.findIndex((label) => label.text === part.trim())
          if (at >= 0) chosen.push(options[at] ?? '')
          else leftover.push(part)
        }
      } else {
        leftover.push(answer)
      }
    }
    const other = leftover.join(', ')
    const hint = Object.prototype.hasOwnProperty.call(predicted, key) ? predicted[key] : ''
    const signal = SignalExtractor.signal(context, 'question', {
      header: Redactor.clean(SignalExtractor.str(raw.header), SignalExtractor.QUESTION, context.home),
      question: Redactor.clean(key, SignalExtractor.QUESTION, context.home),
      options,
      recommended: labels.findIndex((label) => label.isRecommended),
      chosen,
      isOther: leftover.length > 0,
      other: Redactor.clean(other, SignalExtractor.OTHER, context.home),
      isMulti,
      predicted: typeof hint === 'string' ? Redactor.clean(hint, SignalExtractor.LABEL, context.home) : ''
    })
    return { signal, freeform: isFreeform }
  }

  private static labels(value: unknown): { text: string, isRecommended: boolean }[] {
    const result: { text: string, isRecommended: boolean }[] = []
    if (!Array.isArray(value)) return result
    for (const option of value.slice(0, SignalExtractor.MAX_OPTIONS)) {
      const raw = typeof option === 'string' ? option : SignalExtractor.record(option)?.label
      if (typeof raw !== 'string') continue
      const isRecommended = SignalExtractor.RECOMMENDED.test(raw)
      result.push({ text: raw.replace(SignalExtractor.RECOMMENDED, '').trim(), isRecommended })
    }
    return result
  }

  private static answer(value: unknown): string {
    if (typeof value === 'string') return value
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
    if (Array.isArray(value)) return value.filter((part) => typeof part === 'string').join(', ')
    return ''
  }

  private static remote(text: string): Remote | undefined {
    if (text === '') return undefined
    const scheme = SignalExtractor.SCHEME.exec(text)
    if (scheme !== null) {
      const rest = scheme[2] ?? ''
      const slash = rest.indexOf('/')
      const authority = slash < 0 ? rest : rest.slice(0, slash)
      const path = slash < 0 ? '' : rest.slice(slash)
      const host = authority.slice(authority.lastIndexOf('@') + 1).replace(/:\d{0,5}$/, '').toLowerCase()
      if (host === '') return undefined
      return { host, path: SignalExtractor.tidy(path) }
    }
    const scp = SignalExtractor.SCP.exec(text)
    if (scp === null) return undefined
    return { host: (scp[1] ?? '').toLowerCase(), path: SignalExtractor.tidy(scp[2] ?? '') }
  }

  private static tidy(path: string): string {
    let out = path.replace(/[?#].*$/s, '').replace(/\\/g, '/')
    out = out.replace(/\/{2,}/g, '/').replace(/^\/+|\/+$/g, '')
    if (out.endsWith('.git')) out = out.slice(0, -4)
    return out.replace(/\/+$/g, '')
  }

  private static hash(text: string): string {
    let value = 0x811c9dc5
    for (const byte of SignalExtractor.bytes(text)) {
      value = Math.imul(value ^ byte, 0x01000193) >>> 0
    }
    return value.toString(16).padStart(8, '0')
  }

  private static bytes(text: string): number[] {
    const out: number[] = []
    for (let index = 0; index < text.length; index += 1) {
      let code = text.charCodeAt(index)
      if (code >= 0xD800 && code <= 0xDBFF && index + 1 < text.length) {
        const low = text.charCodeAt(index + 1)
        if (low >= 0xDC00 && low <= 0xDFFF) {
          code = 0x10000 + ((code - 0xD800) << 10) + (low - 0xDC00)
          index += 1
        }
      }
      if (code >= 0xD800 && code <= 0xDFFF) code = 0xFFFD
      if (code < 0x80) out.push(code)
      else if (code < 0x800) out.push(0xC0 | (code >> 6), 0x80 | (code & 0x3F))
      else if (code < 0x10000) out.push(0xE0 | (code >> 12), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F))
      else out.push(0xF0 | (code >> 18), 0x80 | ((code >> 12) & 0x3F), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F))
    }
    return out
  }

  private static signal(context: SignalContext, kind: Signal['kind'], data: Record<string, unknown>): Signal {
    return {
      v: 1,
      at: context.at,
      session: context.session,
      project: context.project,
      projectId: context.projectId,
      stack: [...context.stack],
      kind,
      data
    }
  }

  private static fold(text: string): string {
    return text.toLowerCase().normalize('NFD').replace(SignalExtractor.ACCENTS, '')
  }

  private static str(value: unknown): string {
    return typeof value === 'string' ? value : ''
  }

  private static record(value: unknown): Record<string, unknown> | undefined {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
    return value as Record<string, unknown>
  }
}
