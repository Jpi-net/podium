import { HistoryScanner, type HistorySource } from './history'
import { Journal } from './journal'
import { Learner, type ModelAnswer, type ModelPort, type ModelRequest, type Progress, type Repository, type RunReport } from './learner'
import { SignaturePaths, type SignatureFiles } from './paths'
import { Profile, type ProfileData } from './profile'
import { Redactor } from './redactor'
import { SignatureSettings, type Consent, type Settings } from './settings'
import { SignalExtractor, type PlanInput, type QuestionInput, type Signal, type SignalContext } from './signals'
import { SignatureStore, type FsPort, type Sizes, type StoreState } from './store'
import { Vocabulary } from './vocabulary'

export type GitPort = (argv: readonly string[], cwd: string) => Promise<{ exitCode: number, stdout: string }>

export type SignaturePorts = {
  fs: FsPort
  git: GitPort
  now: () => number
  env: (name: string) => string
  toast: (text: string) => void
  changed: (state: SignatureViewState) => void
  model?: ModelPort
  wait?: (ms: number) => Promise<void>
}

export type SignatureDraft = { sessions: boolean, history: boolean, pastSessions: boolean, background: boolean, apply: boolean }

export type SignatureLearning = {
  isRunning: boolean, step: string, done: number, total: number, lastRunAt: number, lastError: string, nextRunHint: string
}

export type SignatureCounts = { traits: number, confirmed: number, cases: number, newTraits: number }

export type SignatureLens = { lens: string, strength: number, summary: string, blindSpot: string }

export type SignatureReview = { id: string, statement: string, lens: string, confidence: number }

export type SignatureRepository = { name: string, state: 'done' | 'learning' | 'pending' | 'excluded' | 'no-identity' }

export type SignatureViewState = {
  consent: Consent
  draft: SignatureDraft
  isExcluded: boolean
  exclusionReason: string
  root: string
  signals: number
  buffered: number
  lost: number
  dropped: string[]
  storage: Sizes
  confirmErase: boolean
  confirmUntil: number
  lastError: string
  learning: SignatureLearning
  counts: SignatureCounts
  lenses: SignatureLens[]
  review: SignatureReview[]
  repositories: SignatureRepository[]
  tokensToday: number
}

export type StartInput = { cwd: string, session: string, isInteractive: boolean }

export type PromptEvent = { text: string, command: string, args: string, isUserOrigin: boolean, isMeta: boolean, isNotification: boolean }

type Located = { root: string, remote: string, stack: string[] }

type Context = Omit<SignalContext, 'at'>

export class Signature {
  private static readonly CONFIRM_MS = 30_000
  private static readonly INTRO_GAP_MS = 24 * 3_600_000
  private static readonly NOT_NOW_MS = 7 * 24 * 3_600_000
  private static readonly MAX_LEVELS = 32
  private static readonly MAX_LINES = 20_000
  private static readonly MAX_KEYS = 200
  private static readonly STACK_TAGS = 3
  private static readonly MAX_EXCLUDE = 100
  private static readonly MAX_GLOB = 256
  private static readonly MAX_ERROR = 160
  private static readonly PRIVATE = '.podium-private'
  private static readonly USAGE = 'Usage: /podium-stage signature [on|off|pause|resume|learn-now|rebuild|forget <trait id or #case>|exclude <folder>|include <folder>|erase]'
  private static readonly ENABLED = 'Signature is on: it records your decisions from now on.'
  private static readonly NOT_READY = 'Signature is not ready yet.'
  private static readonly BUSY = 'A learning run is in progress; try again in a moment.'
  private static readonly MAX_TURN = 2000
  private static readonly DUE_CHANGES = 10
  private static readonly MAX_MANUAL = 10
  private static readonly MAX_JOURNAL_FILES = 100
  private static readonly MINUTE = 60_000
  private static readonly URL = /^(?:[a-z][a-z0-9+.-]*:\/\/|[^/\\\s]+@[^:\s]+:)/i

  private static ports: SignaturePorts | undefined
  private static files: SignatureFiles | undefined
  private static input: StartInput = { cwd: '', session: '', isInteractive: false }
  private static settings: Settings = SignatureSettings.defaults()
  private static draft: SignatureDraft = Signature.draftOf(SignatureSettings.defaults())
  private static home = ''
  private static startedAt = 0
  private static buffer: Signal[] = []
  private static part = 0
  private static signals = 0
  private static lost = 0
  private static realRoot = ''
  private static isErasing = false
  private static isMeasureWanted = true
  private static dropped: string[] = []
  private static storage: Sizes = { indexBytes: 0, casesBytes: 0, journalBytes: 0, emptyFiles: 0 }
  private static consent: Consent = 'undecided'
  private static isExcluded = false
  private static exclusionReason = ''
  private static lastError = ''
  private static isReady = false
  private static isBlocked = false
  private static isOff = false
  private static isAfterAbort = false
  private static isFlushQueued = false
  private static location: Located | undefined
  private static base: Context | undefined
  private static running: Promise<void> | undefined
  private static confirmAt = 0
  private static introAt = 0
  private static notNowAt = 0
  private static lastActivityAt = 0
  private static lastTurn = ''
  private static learning: SignatureLearning = Signature.idle()
  private static counts: SignatureCounts = { traits: 0, confirmed: 0, cases: 0, newTraits: 0 }
  private static lenses: SignatureLens[] = []
  private static review: SignatureReview[] = []
  private static repositories: SignatureRepository[] = []
  private static tokensToday = 0
  private static profile: ProfileData = Profile.empty()
  private static manual: Repository[] = []
  private static unnamed = new Set<string>()
  private static runs = 0
  private static waiters: (() => void)[] = []
  private static lineCounts = new Map<string, { bytes: number, lines: number }>()

  static empty(): SignatureViewState {
    return {
      consent: 'undecided',
      draft: Signature.draftOf(SignatureSettings.defaults()),
      isExcluded: false,
      exclusionReason: '',
      root: '',
      signals: 0,
      buffered: 0,
      lost: 0,
      dropped: [],
      storage: { indexBytes: 0, casesBytes: 0, journalBytes: 0, emptyFiles: 0 },
      confirmErase: false,
      confirmUntil: 0,
      lastError: '',
      learning: Signature.idle(),
      counts: { traits: 0, confirmed: 0, cases: 0, newTraits: 0 },
      lenses: [],
      review: [],
      repositories: [],
      tokensToday: 0
    }
  }

  static remember(introAt: number, notNowAt: number): void {
    Signature.introAt = typeof introAt === 'number' && Number.isFinite(introAt) ? introAt : 0
    Signature.notNowAt = typeof notNowAt === 'number' && Number.isFinite(notNowAt) ? notNowAt : 0
  }

  static async start(ports: SignaturePorts, input: StartInput): Promise<void> {
    Signature.reset()
    Signature.ports = ports
    try {
      Signature.input = {
        cwd: typeof input.cwd === 'string' ? input.cwd : '',
        session: typeof input.session === 'string' ? input.session : '',
        isInteractive: input.isInteractive === true
      }
      Signature.startedAt = ports.now()
      Signature.home = Signature.env('HOME') !== '' ? Signature.env('HOME') : Signature.env('USERPROFILE')
      const root = SignaturePaths.root({
        claudeConfigDir: Signature.env('CLAUDE_CONFIG_DIR'),
        home: Signature.env('HOME'),
        userProfile: Signature.env('USERPROFILE')
      })
      if (root === '') {
        Signature.block('Signature is off: no home folder was found.')
        return
      }
      const files = SignaturePaths.files(root)
      Signature.files = files
      Signature.realRoot = await SignatureStore.resolveRoot(ports.fs, root)
      const read = await SignatureStore.readSettings(ports.fs, files)
      if (read.isNewer) {
        Signature.block('Signature is off: settings.json was written by a newer Podium.')
        return
      }
      Signature.settings = read.value
      Signature.dropped = read.dropped
      Signature.consent = read.value.consent
      Signature.draft = Signature.draftOf(read.value)
      Signature.lastActivityAt = ports.now()
      if (Signature.consent === 'enabled') await Signature.prepare()
      await Signature.measure()
      if (Signature.consent === 'enabled') await Signature.restoreManual()
      if (Signature.consent === 'enabled' || Signature.consent === 'paused') await Signature.refresh()
    } catch (error) {
      Signature.fail(error)
    } finally {
      Signature.isReady = true
      Signature.emit()
    }
  }

  static isCapturing(): boolean {
    return Signature.ports !== undefined
      && Signature.files !== undefined
      && Signature.base !== undefined
      && Signature.isReady
      && !Signature.isBlocked
      && !Signature.isOff
      && !Signature.isErasing
      && Signature.consent === 'enabled'
      && Signature.settings.capture.sessions
      && Signature.input.isInteractive
      && !Signature.isExcluded
  }

  static onPrompt(event: PromptEvent): void {
    try {
      Signature.touch()
      if (!Signature.isCapturing() || !event) return
      if (event.isUserOrigin !== true || event.isMeta === true || event.isNotification === true) return
      if (typeof event.text === 'string' && event.text.trimStart().startsWith('!')) return
      const isAfterAbort = Signature.isAfterAbort
      Signature.isAfterAbort = false
      const context = Signature.context()
      if (context === undefined) return
      const body = event.command === '' ? event.text : event.args
      const signals: Signal[] = []
      if (Signature.lastTurn !== '' && (isAfterAbort || SignalExtractor.isCorrection(body))) {
        signals.push(SignalExtractor.turn(context, Signature.lastTurn))
        Signature.lastTurn = ''
      }
      signals.push(SignalExtractor.prompt(context, { text: event.text, command: event.command, args: event.args, isAfterAbort }))
      Signature.record(signals)
    } catch (error) {
      Signature.fail(error)
    }
  }

  static onQuestion(input: Omit<QuestionInput, 'predicted'>): void {
    try {
      if (!Signature.isCapturing() || !input) return
      const context = Signature.context()
      if (context === undefined) return
      Signature.record(SignalExtractor.questions(context, { ...input, predicted: {} }))
    } catch (error) {
      Signature.fail(error)
    }
  }

  static onPlan(input: PlanInput): void {
    try {
      if (!Signature.isCapturing() || !input) return
      const context = Signature.context()
      if (context === undefined) return
      Signature.record([SignalExtractor.plan(context, input)])
    } catch (error) {
      Signature.fail(error)
    }
  }

  static onTurn(reason: string, agentId: string, turnId: string, text: string = ''): void {
    try {
      Signature.touch()
      if (agentId !== '' && agentId !== undefined) return
      if (Signature.isCapturing()) Signature.lastTurn = typeof text === 'string' ? text.slice(0, Signature.MAX_TURN) : ''
      if (Signature.isCapturing() && reason === 'aborted') {
        const context = Signature.context()
        if (context !== undefined) Signature.record([SignalExtractor.abort(context, turnId)])
        Signature.isAfterAbort = true
      }
      if (Signature.buffer.length >= Journal.FLUSH_AT) Signature.flush().catch(() => undefined)
    } catch (error) {
      Signature.fail(error)
    }
  }

  static onTool(): void {
    Signature.touch()
  }

  static onAgent(type: string, model: string): void {
    try {
      if (!Signature.isCapturing()) return
      const context = Signature.context()
      if (context === undefined) return
      Signature.record([SignalExtractor.agent(context, type, model)])
    } catch (error) {
      Signature.fail(error)
    }
  }

  static flush(): Promise<void> {
    return Signature.request(true)
  }

  static async renew(session: string): Promise<void> {
    try {
      await Signature.request(false)
      const id = typeof session === 'string' ? session : ''
      Signature.input = { ...Signature.input, session: id }
      if (Signature.base !== undefined) Signature.base = { ...Signature.base, session: id }
      Signature.part = 0
      Signature.startedAt = Signature.now()
      Signature.isAfterAbort = false
    } catch (error) {
      Signature.fail(error)
    }
  }

  static async end(): Promise<void> {
    try {
      await Signature.request(false)
    } catch (error) {
      Signature.fail(error)
    }
  }

  static view(): SignatureViewState {
    return {
      consent: Signature.consent,
      draft: { ...Signature.draft },
      isExcluded: Signature.isExcluded,
      exclusionReason: Signature.exclusionReason,
      root: Signature.files === undefined ? '' : Signature.files.root,
      signals: Signature.signals,
      buffered: Signature.buffer.length,
      lost: Signature.lost,
      dropped: [...Signature.dropped],
      storage: { ...Signature.storage },
      confirmErase: Signature.isConfirming(),
      confirmUntil: Signature.confirmAt > 0 ? Signature.confirmAt + Signature.CONFIRM_MS : 0,
      lastError: Signature.lastError,
      learning: { ...Signature.learning },
      counts: { ...Signature.counts },
      lenses: Signature.lenses.map((item) => ({ ...item })),
      review: Signature.review.map((item) => ({ ...item })),
      repositories: Signature.repositories.map((item) => ({ ...item })),
      tokensToday: Signature.tokensToday
    }
  }

  static toggle(key: keyof SignatureDraft): void {
    try {
      if (!(key in Signature.draft)) return
      Signature.draft = { ...Signature.draft, [key]: !Signature.draft[key] }
      Signature.emit()
    } catch (error) {
      Signature.fail(error)
    }
  }

  static async enable(): Promise<string> {
    try {
      const refusal = Signature.refusal()
      if (refusal !== '') return refusal
      const next = Signature.copy(Signature.settings)
      next.capture.sessions = Signature.draft.sessions
      next.capture.history = Signature.draft.history
      next.capture.pastSessions = Signature.draft.pastSessions
      next.learning.background = Signature.draft.background
      next.apply = { section: Signature.draft.apply, context: Signature.draft.apply, hints: Signature.draft.apply, proxy: Signature.draft.apply }
      next.consent = 'enabled'
      if (!await Signature.save(next)) return 'Signature could not write its settings.'
      Signature.consent = 'enabled'
      Signature.isOff = false
      Signature.lastError = ''
      await Signature.prepare()
      await Signature.measure()
      await Signature.refresh()
      Signature.emit()
      if (Signature.isExcluded) return `Signature is on, but it does not learn here: ${Signature.exclusionReason}.`
      return Signature.ENABLED
    } catch (error) {
      Signature.fail(error)
      return Signature.lastError
    }
  }

  private static async switchOn(): Promise<string> {
    const text = await Signature.enable()
    if (text !== Signature.ENABLED) return text
    const learning = Signature.settings.learning
    const budget = String(learning.tokensPerDay).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    const clause = learning.background ? ` and learns from them in the background with your Claude plan (up to ${budget} tokens a day)` : ''
    return `Signature is on: it records your decisions${clause}. Open /podium-stage signature to change it.`
  }

  static async notNow(): Promise<string> {
    return 'Not now: Signature will ask again in a week.'
  }

  static async never(): Promise<string> {
    return Signature.change('never', 'Signature will not ask again. Run /podium-stage signature on to change your mind.')
  }

  static async pause(): Promise<string> {
    if (Signature.consent !== 'enabled') return 'Signature is not on.'
    return Signature.change('paused', 'Signature is paused: nothing is recorded until you resume.')
  }

  static async resume(): Promise<string> {
    if (Signature.consent !== 'paused') return 'Signature is not paused.'
    const text = await Signature.change('enabled', 'Signature is on again: it records your decisions.')
    if ((Signature.consent as Consent) !== 'enabled') return text
    try {
      await Signature.prepare()
      await Signature.refresh()
      Signature.emit()
      if (Signature.isExcluded) return `Signature is on again, but it does not learn here: ${Signature.exclusionReason}.`
    } catch (error) {
      Signature.fail(error)
      return Signature.lastError
    }
    return text
  }

  static async decline(): Promise<string> {
    return Signature.change('declined', 'Signature is off. Run /podium-stage signature on to turn it on.')
  }

  static async exclude(folder: string): Promise<string> {
    try {
      const refusal = Signature.refusal()
      if (refusal !== '') return refusal
      const glob = Signature.resolve(folder)
      if (glob === '') return 'Give an absolute folder or one starting with ~, for example ~/clients.'
      if (Signature.settings.exclude.includes(glob)) return `Signature already skips ${glob}.`
      if (Signature.settings.exclude.length >= Signature.MAX_EXCLUDE) return 'Signature cannot skip more folders: remove one with include first.'
      const next = Signature.copy(Signature.settings)
      next.exclude = [...next.exclude, glob]
      if (!await Signature.save(next)) return 'Signature could not write its settings.'
      await Signature.reevaluate()
      return `Signature will not learn in ${glob}.`
    } catch (error) {
      Signature.fail(error)
      return Signature.lastError
    }
  }

  static async include(folder: string): Promise<string> {
    try {
      const refusal = Signature.refusal()
      if (refusal !== '') return refusal
      const glob = Signature.resolve(folder)
      if (glob === '') return 'Give an absolute folder or one starting with ~, for example ~/clients.'
      const target = SignaturePaths.normalize(glob)
      const kept = Signature.settings.exclude.filter((item) => item !== glob && SignaturePaths.normalize(item) !== target)
      if (kept.length === Signature.settings.exclude.length) return `${glob} is not in the skipped folders.`
      const next = Signature.copy(Signature.settings)
      next.exclude = kept
      if (!await Signature.save(next)) return 'Signature could not write its settings.'
      await Signature.reevaluate()
      return `Signature may learn in ${glob} again.`
    } catch (error) {
      Signature.fail(error)
      return Signature.lastError
    }
  }

  static async erase(): Promise<string> {
    try {
      const refusal = Signature.refusal(true)
      if (refusal !== '') return refusal
      if (Signature.learning.isRunning) return Signature.BUSY
      if (!Signature.isConfirming()) {
        Signature.confirmAt = Signature.now()
        Signature.emit()
        return 'Run it again within 30 seconds to erase everything Signature stored.'
      }
      Signature.confirmAt = 0
      Signature.isErasing = true
      Signature.consent = 'declined'
      try {
        if (Signature.running !== undefined) await Signature.running
        const ports = Signature.ports
        const files = Signature.files
        if (ports === undefined || files === undefined) return Signature.NOT_READY
        const wait = ports.wait
        const lock = {
          owner: `${Signature.input.session === '' ? 'signature' : Signature.input.session}:erase`,
          now: () => ports.now(),
          wait: wait === undefined ? () => Promise.resolve() : wait
        }
        const result = await SignatureStore.erase(ports.fs, files, Signature.realRoot, lock)
        if (result.isLocked) {
          Signature.consent = Signature.settings.consent
          Signature.emit()
          return 'A learning run is in progress in another session; try again in a moment.'
        }
        Signature.buffer = []
        Signature.signals = 0
        Signature.lost = 0
        Signature.settings = SignatureSettings.defaults()
        Signature.settings.consent = 'declined'
        Signature.dropped = []
        Signature.part = 0
        Signature.isBlocked = false
        Signature.isOff = false
        Signature.lastError = ''
        Signature.isExcluded = false
        Signature.exclusionReason = ''
        Signature.resetLearning()
        await Signature.measure()
        Signature.emit()
        if (!result.isComplete) return `Signature emptied ${result.emptied} ${result.emptied === 1 ? 'file' : 'files'}; some could not be reached.`
        return `Signature erased ${result.emptied} ${result.emptied === 1 ? 'file' : 'files'} and is off.`
      } finally {
        Signature.isErasing = false
      }
    } catch (error) {
      Signature.fail(error)
      return Signature.lastError
    }
  }

  static async command(args: string): Promise<string> {
    try {
      const text = typeof args === 'string' ? args.trim() : ''
      if (text === '') return ''
      const space = text.search(/\s/)
      const word = (space < 0 ? text : text.slice(0, space)).toLowerCase()
      const rest = space < 0 ? '' : text.slice(space).trim()
      switch (word) {
        case 'on':
          return await Signature.switchOn()
        case 'off':
          return await Signature.decline()
        case 'pause':
          return await Signature.pause()
        case 'resume':
          return await Signature.resume()
        case 'erase':
          return await Signature.erase()
        case 'learn-now':
          return await Signature.learnNow()
        case 'rebuild':
          return await Signature.rebuild()
        case 'learn':
          return await Signature.learn(rest)
        case 'forget':
          return await Signature.forget(rest)
        case 'exclude':
          return rest === '' ? Signature.USAGE : await Signature.exclude(rest)
        case 'include':
          return rest === '' ? Signature.USAGE : await Signature.include(rest)
        default:
          return Signature.USAGE
      }
    } catch (error) {
      Signature.fail(error)
      return Signature.lastError
    }
  }

  static shouldIntroduce(now: number): boolean {
    try {
      if (!Signature.isReady || Signature.isBlocked || Signature.consent !== 'undecided' || !Signature.input.isInteractive) return false
      return now - Signature.introAt >= Signature.INTRO_GAP_MS && now - Signature.notNowAt >= Signature.NOT_NOW_MS
    } catch {
      return false
    }
  }

  static modelRequest(request: ModelRequest): { model: string, system: { text: string, cache?: true }[], prompt: string, maxTokens: number, timeoutMs: number } {
    return {
      model: request.model,
      system: request.system.map((block) => (block.cache ? { text: block.text, cache: true as const } : { text: block.text })),
      prompt: request.prompt,
      maxTokens: request.maxTokens,
      timeoutMs: request.timeoutMs
    }
  }

  static modelAnswer(result: unknown): ModelAnswer {
    const invalid: ModelAnswer = { isAnswered: false, text: '', reason: 'invalid', inputTokens: 0, outputTokens: 0 }
    if (typeof result !== 'object' || result === null) return invalid
    const raw = result as Record<string, unknown>
    const usage = typeof raw.usage === 'object' && raw.usage !== null ? raw.usage as Record<string, unknown> : {}
    const count = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0)
    const inputTokens = count(usage.input_tokens) + count(usage.cache_creation_input_tokens) + count(usage.cache_read_input_tokens)
    const outputTokens = count(usage.output_tokens)
    if (raw.isAnswered === true) {
      return { isAnswered: true, text: typeof raw.text === 'string' ? raw.text : '', reason: '', inputTokens, outputTokens }
    }
    if (raw.isAnswered === false) {
      return { isAnswered: false, text: '', reason: typeof raw.reason === 'string' && raw.reason !== '' ? raw.reason : 'invalid', inputTokens, outputTokens }
    }
    return invalid
  }

  static tick(now: number): Promise<void> {
    try {
      return Signature.sync().then(() => Signature.maybeLearn(now)).catch(() => undefined)
    } catch {
      return Promise.resolve()
    }
  }

  private static async sync(): Promise<boolean> {
    if (Signature.isErasing || Signature.ports === undefined || Signature.files === undefined) return false
    const fresh = await Signature.reload()
    if (fresh !== undefined && fresh.consent === 'enabled') return true
    if (Signature.buffer.length > 0) {
      Signature.buffer = []
      Signature.emit()
    }
    return false
  }

  static whenIdle(): Promise<void> {
    if (!Signature.learning.isRunning) return Promise.resolve()
    return new Promise<void>((resolve) => {
      Signature.waiters.push(resolve)
    })
  }

  static async learnNow(): Promise<string> {
    return Signature.begin(true, false, [], 'Signature is learning now. Progress shows in the Signature tab.')
  }

  static async rebuild(): Promise<string> {
    return Signature.begin(true, true, [], 'Signature is rebuilding its index and profile.')
  }

  static async learn(path: string): Promise<string> {
    try {
      const text = typeof path === 'string' ? path.trim() : ''
      if (text === '') return 'Usage: /podium-stage learn <path to a local repository>'
      const refusal = Signature.runRefusal()
      if (refusal !== '') return refusal
      if (Signature.URL.test(text)) return 'Clone the repository first, then pass its folder.'
      const repository = await Signature.repositoryAt(text)
      if (typeof repository === 'string') return repository
      Signature.manual = [...Signature.manual.filter((item) => item.id !== repository.id), repository]
      return await Signature.begin(true, false, [], `Signature is learning from ${repository.name}. Progress shows in the Signature tab.`)
    } catch (error) {
      Signature.fail(error)
      return Signature.lastError
    }
  }

  static async forget(target: string): Promise<string> {
    return Signature.decide(target, 'reject')
  }

  static async keep(id: string): Promise<string> {
    return Signature.decide(id, 'confirm')
  }

  private static idle(): SignatureLearning {
    return { isRunning: false, step: '', done: 0, total: 0, lastRunAt: 0, lastError: '', nextRunHint: '' }
  }

  private static touch(): void {
    if (Signature.ports !== undefined) Signature.lastActivityAt = Signature.now()
  }

  private static resetLearning(): void {
    Signature.learning = Signature.idle()
    Signature.counts = { traits: 0, confirmed: 0, cases: 0, newTraits: 0 }
    Signature.lenses = []
    Signature.review = []
    Signature.repositories = []
    Signature.tokensToday = 0
    Signature.profile = Profile.empty()
    Signature.unnamed = new Set<string>()
  }

  private static day(now: number): string {
    const date = new Date(now)
    return Number.isNaN(date.getTime()) ? '1970-01-01' : date.toISOString().slice(0, 10)
  }

  private static runRefusal(): string {
    const refusal = Signature.refusal()
    if (refusal !== '') return refusal
    if (Signature.ports === undefined || Signature.ports.model === undefined) return 'Learning is not available in this session.'
    if (Signature.consent !== 'enabled') return 'Signature is not on.'
    if (Signature.isExcluded) return `Not learning here: ${Signature.exclusionReason}.`
    if (Signature.isOff) return Signature.lastError
    if (Signature.isErasing) return 'Signature is erasing its data.'
    if (Signature.learning.isRunning) return 'A learning run is already in progress.'
    if (Signature.realRoot === '') return 'Signature cannot write to its folder.'
    return ''
  }

  private static async begin(isForced: boolean, isRebuild: boolean, extra: readonly Repository[], message: string): Promise<string> {
    try {
      const refusal = Signature.runRefusal()
      if (refusal !== '') return refusal
      Signature.learning = { ...Signature.learning, isRunning: true, step: 'starting', done: 0, total: 0 }
      Signature.emit()
      Signature.launch(isForced, isRebuild, extra).catch(() => undefined)
      return message
    } catch (error) {
      Signature.learning = { ...Signature.learning, isRunning: false, step: '' }
      Signature.fail(error)
      return Signature.lastError
    }
  }

  private static async launch(isForced: boolean, isRebuild: boolean, extra: readonly Repository[]): Promise<void> {
    let report: RunReport | undefined
    try {
      await Signature.request(true)
      await Signature.restoreManual()
      const fresh = await Signature.reload()
      const ports = Signature.ports
      const files = Signature.files
      const base = Signature.base
      if (fresh !== undefined && fresh.consent === 'enabled' && ports !== undefined && files !== undefined && base !== undefined && ports.model !== undefined) {
        const wait = ports.wait
        Signature.runs += 1
        report = await Learner.run(
          {
            fs: ports.fs,
            git: ports.git,
            model: Signature.guarded(),
            now: () => ports.now(),
            wait: wait === undefined ? () => Promise.resolve() : wait
          },
          {
            files,
            realRoot: Signature.realRoot,
            settings: Signature.copy(fresh),
            owner: `${Signature.input.session === '' ? 'signature' : Signature.input.session}:${Signature.startedAt}:${Signature.runs}`,
            home: Signature.home,
            project: base.project,
            projectId: base.projectId,
            stack: base.stack[0] ?? '',
            repositories: [...Signature.repositoryList(), ...extra.filter((item) => !Signature.repositoryList().some((known) => known.id === item.id))],
            isForced,
            isRebuild,
            liveKeys: Signature.liveKeys()
          },
          (value: Progress) => {
            Signature.learning = { ...Signature.learning, step: value.step, done: value.done, total: value.total }
            Signature.emit()
          }
        )
      }
    } catch (error) {
      Signature.learning = { ...Signature.learning, lastError: Signature.describe(error) }
    }
    await Signature.settle(report)
  }

  private static liveKeys(): string[] {
    const files = Signature.files
    if (files === undefined) return []
    const prefix = `${files.root}/journal/`
    const keys: string[] = []
    for (let part = 0; part <= Signature.part; part += 1) {
      const path = SignaturePaths.journalFile(files.root, Signature.startedAt, Signature.input.session, part)
      if (path.startsWith(prefix)) keys.push(path.slice(prefix.length))
    }
    return keys
  }

  private static async reload(): Promise<Settings | undefined> {
    try {
      const ports = Signature.ports
      const files = Signature.files
      if (ports === undefined || files === undefined) return undefined
      const read = await SignatureStore.readSettings(ports.fs, files)
      if (read.isNewer) return undefined
      const wasConsent = Signature.consent
      Signature.settings = read.value
      Signature.consent = read.value.consent
      if (wasConsent !== Signature.consent) Signature.emit()
      return read.value
    } catch {
      return undefined
    }
  }

  private static async restoreManual(): Promise<void> {
    try {
      const ports = Signature.ports
      const files = Signature.files
      if (ports === undefined || files === undefined || !Signature.input.isInteractive) return
      const cursors = await SignatureStore.listCursors(ports.fs, files)
      let checked = 0
      for (const cursor of cursors) {
        if (cursor.source !== 'manual' || cursor.isComplete || checked >= Signature.MAX_MANUAL) continue
        checked += 1
        const repository = await Signature.repositoryAt(cursor.root)
        if (typeof repository === 'string') continue
        Signature.manual = [...Signature.manual.filter((item) => item.id !== repository.id), repository]
      }
    } catch {
      return
    }
  }

  private static guarded(): ModelPort {
    return async (request) => {
      const stopped: ModelAnswer = { isAnswered: false, text: '', reason: 'stopped', inputTokens: 0, outputTokens: 0 }
      const model = Signature.ports === undefined ? undefined : Signature.ports.model
      if (model === undefined || Signature.consent !== 'enabled' || Signature.isErasing) return stopped
      const fresh = await Signature.reload()
      if (fresh === undefined || fresh.consent !== 'enabled' || Signature.isErasing) return stopped
      return model(request)
    }
  }

  private static async settle(report: RunReport | undefined): Promise<void> {
    try {
      const at = Signature.now()
      const lastError = report === undefined ? Signature.learning.lastError : report.isOk || report.note === 'locked' ? '' : report.note
      Signature.learning = { ...Signature.learning, isRunning: false, step: '', done: 0, total: 0, lastRunAt: at, lastError }
      if (report !== undefined) Signature.markUnnamed(report.note)
      await Signature.refresh()
      const learned = report === undefined ? 0 : report.newTraits + report.added
      if (learned > 0 && Signature.settings.notify && Signature.ports !== undefined) {
        Signature.ports.toast(`Signature learned ${learned} new ${learned === 1 ? 'thing' : 'things'} about how you work.`)
      }
    } catch {
      Signature.learning = { ...Signature.learning, isRunning: false, step: '' }
    }
    Signature.emit()
    const waiting = Signature.waiters
    Signature.waiters = []
    for (const resolve of waiting) resolve()
  }

  private static markUnnamed(note: string): void {
    for (const repository of Signature.repositoryList()) {
      if (note.includes('no-identity:' + HistoryScanner.repoName(repository.name))) Signature.unnamed.add(repository.id)
    }
  }

  private static describe(error: unknown): string {
    try {
      const raw = error instanceof Error ? error.message : String(error)
      return Redactor.clean(raw, Signature.MAX_ERROR, Signature.home)
    } catch {
      return 'unexpected error'
    }
  }

  private static repositoryList(): Repository[] {
    const list: Repository[] = []
    const location = Signature.location
    if (Signature.settings.capture.history && location !== undefined && location.root !== '' && Signature.base !== undefined) {
      list.push({ root: location.root, name: HistoryScanner.repoName(location.root), id: Signature.base.projectId, source: 'auto' })
    }
    for (const item of Signature.manual) {
      if (!list.some((known) => known.id === item.id)) list.push(item)
    }
    return list
  }

  private static async repositoryAt(text: string): Promise<Repository | string> {
    const ports = Signature.ports
    if (ports === undefined) return Signature.NOT_READY
    const expanded = text === '~' || text.startsWith('~/') || text.startsWith('~\\') ? Signature.home + text.slice(1) : text
    const absolute = SignaturePaths.isAbsolute(expanded) ? expanded : Signature.input.cwd + '/' + expanded
    const path = SignaturePaths.normalize(absolute)
    if (path === '' || !SignaturePaths.isAbsolute(path) || /[\n\r\0]/.test(path)) return 'That path is not a usable folder.'
    const info = await ports.fs.stat(path)
    if (info === undefined || info.kind !== 'dir' || typeof info.realPath !== 'string' || info.realPath === '') return 'That path is not a folder.'
    const real = SignaturePaths.normalize(info.realPath)
    if (!SignaturePaths.isAbsolute(real) || /[\n\r\0]/.test(real)) return 'That path is not a usable folder.'
    const top = (await Signature.git(['-C', real, 'rev-parse', '--show-toplevel'], real)).split('\n')[0]?.trim() ?? ''
    if (top === '' || !SignaturePaths.isAbsolute(SignaturePaths.normalize(top)) || /[\n\r\0]/.test(top)) return 'That folder is not a git repository.'
    if (SignatureSettings.isExcluded(Signature.settings, top, Signature.home) || SignatureSettings.isExcluded(Signature.settings, real, Signature.home)) {
      return 'That folder is excluded from Signature.'
    }
    if (await ports.fs.exists(top + '/' + Signature.PRIVATE)) return `That folder has a ${Signature.PRIVATE} file.`
    const remote = (await Signature.git(['-C', top, 'config', '--get', 'remote.origin.url'], top)).split('\n')[0]?.trim() ?? ''
    const source: HistorySource = 'manual'
    return { root: top, name: HistoryScanner.repoName(top), id: SignalExtractor.projectId(remote !== '' ? remote : top), source }
  }

  private static async refresh(): Promise<void> {
    try {
      const ports = Signature.ports
      const files = Signature.files
      if (ports === undefined || files === undefined || Signature.isBlocked) return
      const state = await SignatureStore.readState(ports.fs, files)
      const profile = await SignatureStore.readProfile(ports.fs, files)
      const set = await SignatureStore.readCases(ports.fs, files)
      const now = Signature.now()
      if (!state.isNewer) {
        const value = state.value
        Signature.tokensToday = value.day === Signature.day(now) ? value.tokensToday : 0
        const last = value.runs[value.runs.length - 1]
        Signature.learning = {
          ...Signature.learning,
          lastRunAt: last === undefined ? Signature.learning.lastRunAt : last.at,
          lastError: Signature.learning.isRunning ? '' : (value.lastError === 'model: stopped' ? '' : value.lastError !== '' ? value.lastError : Signature.learning.lastError)
        }
      }
      if (!profile.isNewer) {
        Signature.profile = profile.value
        const live = profile.value.traits.filter((trait) => trait.status === 'observed' || trait.status === 'confirmed')
        Signature.counts = {
          traits: live.length,
          confirmed: live.filter((trait) => trait.status === 'confirmed').length,
          cases: set.cases.length,
          newTraits: live.filter((trait) => trait.isNew && trait.status === 'observed').length
        }
        Signature.lenses = Profile.lenses(profile.value).map((item) => ({ ...item }))
        Signature.review = Profile.review(profile.value).map((trait) => ({ id: trait.id, statement: trait.statement, lens: trait.lens, confidence: trait.confidence }))
      }
      Signature.learning = { ...Signature.learning, nextRunHint: Signature.settings.learning.background ? 'when idle' : 'on request' }
      Signature.repositories = await Signature.statesOf()
    } catch {
      return
    }
  }

  private static async statesOf(): Promise<SignatureRepository[]> {
    const ports = Signature.ports
    const files = Signature.files
    if (ports === undefined || files === undefined) return []
    const list: SignatureRepository[] = []
    for (const repository of Signature.repositoryList()) {
      let state: SignatureRepository['state'] = 'pending'
      if (Signature.unnamed.has(repository.id)) {
        state = 'no-identity'
      } else {
        const cursor = await SignatureStore.readCursor(ports.fs, files, repository.id)
        if (cursor !== undefined && cursor.isComplete) state = 'done'
        else if (Signature.learning.isRunning) state = 'learning'
      }
      list.push({ name: repository.name, state })
    }
    return list
  }

  private static async maybeLearn(now: number): Promise<void> {
    const ports = Signature.ports
    const files = Signature.files
    if (ports === undefined || files === undefined || Signature.runRefusal() !== '') return
    if (!Signature.settings.learning.background) return
    if (now - Signature.lastActivityAt < Signature.settings.learning.idleMinutes * Signature.MINUTE) return
    const fresh = await Signature.reload()
    if (fresh === undefined || fresh.consent !== 'enabled' || !fresh.learning.background) return
    const read = await SignatureStore.readState(ports.fs, files)
    if (read.isNewer) return
    const state = read.value
    const settings = Signature.settings
    if (!Learner.isDue(state, settings, now, Number.MAX_SAFE_INTEGER, false, false)) return
    const hasHistory = Signature.repositories.some((item) => item.state === 'pending')
    const hasWork = hasHistory || Profile.isDue(Signature.profile, now, false)
    if (!hasWork) {
      const pending = await Signature.pending(state)
      if (!Learner.isDue(state, settings, now, pending, false, false)) return
    }
    await Signature.begin(false, false, [], '')
  }

  private static async pending(state: StoreState): Promise<number> {
    const ports = Signature.ports
    const files = Signature.files
    if (ports === undefined || files === undefined) return 0
    const listed = (await SignatureStore.journalFiles(ports.fs, files)).slice(0, Signature.MAX_JOURNAL_FILES)
    const known = new Map<string, { bytes: number, lines: number }>()
    const counts = new Map<string, number>()
    for (const file of listed) {
      const cached = Signature.lineCounts.get(file.key)
      let lines = cached !== undefined && cached.bytes === file.bytes ? cached.lines : -1
      if (lines < 0) {
        const text = await SignatureStore.text(ports.fs, file.path)
        lines = text.split('\n').filter((line) => line.trim() !== '').length
      }
      known.set(file.key, { bytes: file.bytes, lines })
      counts.set(file.key, lines)
    }
    Signature.lineCounts = known
    return Signature.buffer.length + Learner.pending(state, listed, counts)
  }

  private static async decide(target: string, action: 'confirm' | 'reject'): Promise<string> {
    try {
      const refusal = Signature.refusal()
      if (refusal !== '') return refusal
      if (Signature.learning.isRunning) return Signature.BUSY
      const text = typeof target === 'string' ? target.trim() : ''
      const isCase = text.startsWith('#')
      if (isCase && action === 'confirm') return 'Cases are rejected by number only.'
      const id = isCase ? Number(text.slice(1)) : -1
      if (isCase ? !Number.isInteger(id) || id < 0 : !Profile.isId(text)) return 'Give a trait id or #<case number>.'
      const ports = Signature.ports
      const files = Signature.files
      if (ports === undefined || files === undefined) return Signature.NOT_READY
      const owner = (Signature.input.session === '' ? 'signature' : Signature.input.session) + ':edit'
      const wait = ports.wait
      const isTaken = await SignatureStore.takeLock(ports.fs, files, owner, ports.now(), Signature.realRoot, wait === undefined ? () => Promise.resolve() : wait)
      if (!isTaken) return Signature.BUSY
      try {
        const today = Signature.day(ports.now())
        const message = isCase ? await Signature.rejectCase(id, today) : await Signature.decideTrait(text, action, today)
        await Signature.refresh()
        Signature.emit()
        return message
      } finally {
        await SignatureStore.releaseLock(ports.fs, files, owner, Signature.realRoot).catch(() => undefined)
      }
    } catch (error) {
      Signature.fail(error)
      return Signature.lastError
    }
  }

  private static async rejectCase(id: number, today: string): Promise<string> {
    const ports = Signature.ports
    const files = Signature.files
    if (ports === undefined || files === undefined) return Signature.NOT_READY
    const set = await SignatureStore.readCases(ports.fs, files)
    const hit = set.cases.some((item) => item.id === id) || set.archived.some((item) => item.id === id)
    if (!hit) return `There is no case #${id}.`
    const mark = <T extends { id: number }>(list: readonly T[]): T[] => list.map((item) => (item.id === id ? { ...item, status: 'rejected' as const, statusAt: today } : item))
    const isWritten = await SignatureStore.writeCases(ports.fs, files, mark(set.cases), mark(set.archived), Signature.realRoot)
    if (!isWritten) return 'Signature could not write its cases.'
    const profile = await SignatureStore.readProfile(ports.fs, files)
    if (!profile.isNewer) await SignatureStore.writeProfile(ports.fs, files, Signature.raised(profile.value), Signature.realRoot)
    return `Case #${id} rejected.`
  }

  private static raised(profile: ProfileData): ProfileData {
    return { ...profile, changedSince: Math.max(profile.changedSince, Signature.DUE_CHANGES) }
  }

  private static async decideTrait(id: string, action: 'confirm' | 'reject', today: string): Promise<string> {
    const ports = Signature.ports
    const files = Signature.files
    if (ports === undefined || files === undefined) return Signature.NOT_READY
    const read = await SignatureStore.readProfile(ports.fs, files)
    if (read.isNewer) return 'Signature will not touch a profile written by a newer Podium.'
    if (!read.value.traits.some((trait) => trait.id === id)) return `There is no trait ${id}.`
    const decided = action === 'confirm' ? Profile.confirm(read.value, id, today) : Profile.reject(read.value, id, today)
    const next = Signature.raised(decided)
    const isWritten = await SignatureStore.writeProfile(ports.fs, files, next, Signature.realRoot)
    if (!isWritten) return 'Signature could not write its profile.'
    return action === 'confirm' ? `Trait ${id} kept.` : `Trait ${id} rejected.`
  }

  private static reset(): void {
    Signature.ports = undefined
    Signature.files = undefined
    Signature.input = { cwd: '', session: '', isInteractive: false }
    Signature.settings = SignatureSettings.defaults()
    Signature.draft = Signature.draftOf(Signature.settings)
    Signature.home = ''
    Signature.startedAt = 0
    Signature.buffer = []
    Signature.part = 0
    Signature.signals = 0
    Signature.lost = 0
    Signature.realRoot = ''
    Signature.isErasing = false
    Signature.isMeasureWanted = true
    Signature.lastActivityAt = 0
    Signature.lastTurn = ''
    Signature.manual = []
    Signature.resetLearning()
    Signature.dropped = []
    Signature.storage = { indexBytes: 0, casesBytes: 0, journalBytes: 0, emptyFiles: 0 }
    Signature.consent = 'undecided'
    Signature.isExcluded = false
    Signature.exclusionReason = ''
    Signature.lastError = ''
    Signature.isReady = false
    Signature.isBlocked = false
    Signature.isOff = false
    Signature.isAfterAbort = false
    Signature.isFlushQueued = false
    Signature.location = undefined
    Signature.base = undefined
    Signature.running = undefined
    Signature.confirmAt = 0
  }

  private static draftOf(settings: Settings): SignatureDraft {
    return {
      sessions: settings.capture.sessions,
      history: settings.capture.history,
      pastSessions: settings.capture.pastSessions,
      background: settings.learning.background,
      apply: settings.apply.section && settings.apply.context && settings.apply.hints && settings.apply.proxy
    }
  }

  private static copy(settings: Settings): Settings {
    return JSON.parse(JSON.stringify(settings)) as Settings
  }

  private static env(name: string): string {
    try {
      const value = Signature.ports === undefined ? '' : Signature.ports.env(name)
      return typeof value === 'string' ? value : ''
    } catch {
      return ''
    }
  }

  private static now(): number {
    return Signature.ports === undefined ? 0 : Signature.ports.now()
  }

  private static emit(): void {
    try {
      if (Signature.ports !== undefined) Signature.ports.changed(Signature.view())
    } catch {
      return
    }
  }

  private static block(message: string): void {
    Signature.isBlocked = true
    Signature.lastError = message
  }

  private static fail(error: unknown): void {
    try {
      const raw = error instanceof Error ? error.message : String(error)
      Signature.lastError = 'Signature stopped: ' + Redactor.clean(raw, Signature.MAX_ERROR, Signature.home)
    } catch {
      Signature.lastError = 'Signature stopped: unexpected error.'
    }
    Signature.isOff = true
    Signature.emit()
  }

  private static refusal(isErase = false): string {
    if (Signature.ports === undefined || Signature.files === undefined || !Signature.isReady) {
      return Signature.isBlocked && Signature.lastError !== '' ? Signature.lastError : Signature.NOT_READY
    }
    if (Signature.isBlocked && !isErase) return Signature.lastError !== '' ? Signature.lastError : Signature.NOT_READY
    return ''
  }

  private static isConfirming(): boolean {
    return Signature.confirmAt > 0 && Signature.now() - Signature.confirmAt <= Signature.CONFIRM_MS
  }

  private static expireConfirm(): void {
    if (Signature.confirmAt > 0 && !Signature.isConfirming()) {
      Signature.confirmAt = 0
      Signature.emit()
    }
  }

  private static async save(settings: Settings): Promise<boolean> {
    const ports = Signature.ports
    const files = Signature.files
    if (ports === undefined || files === undefined) return false
    const isSaved = await SignatureStore.writeSettings(ports.fs, files, settings, Signature.realRoot)
    if (isSaved) Signature.settings = settings
    return isSaved
  }

  private static async change(consent: Consent, message: string): Promise<string> {
    try {
      const refusal = Signature.refusal()
      if (refusal !== '') return refusal
      const next = Signature.copy(Signature.settings)
      next.consent = consent
      if (consent === 'paused') await Signature.request(false)
      if (!await Signature.save(next)) return 'Signature could not write its settings.'
      Signature.consent = consent
      if (consent === 'enabled') {
        Signature.isOff = false
        Signature.lastError = ''
      } else if (consent === 'paused') {
        await Signature.flush()
      } else {
        Signature.buffer = []
      }
      Signature.emit()
      return message
    } catch (error) {
      Signature.fail(error)
      return Signature.lastError
    }
  }

  private static async measure(): Promise<void> {
    const ports = Signature.ports
    const files = Signature.files
    if (ports === undefined || files === undefined) return
    Signature.storage = await SignatureStore.sizes(ports.fs, files)
  }

  private static context(): SignalContext | undefined {
    if (Signature.base === undefined) return undefined
    return { ...Signature.base, at: Signature.now() }
  }

  private static record(signals: readonly Signal[]): void {
    for (const signal of signals) {
      const pushed = Journal.push(Signature.buffer, signal)
      Signature.buffer = pushed.buffer
      Signature.lost += pushed.dropped
      Signature.signals += 1
    }
    if (signals.length > 0) Signature.emit()
  }

  private static request(isMeasuring: boolean): Promise<void> {
    try {
      Signature.expireConfirm()
      if (Signature.running !== undefined) {
        Signature.isFlushQueued = true
        if (isMeasuring) Signature.isMeasureWanted = true
        return Signature.running
      }
      Signature.isMeasureWanted = isMeasuring
      Signature.running = Signature.loop()
      return Signature.running
    } catch (error) {
      Signature.fail(error)
      return Promise.resolve()
    }
  }

  private static async loop(): Promise<void> {
    try {
      do {
        Signature.isFlushQueued = false
        await Signature.write()
      } while (Signature.isFlushQueued)
    } catch (error) {
      Signature.fail(error)
    } finally {
      Signature.running = undefined
    }
  }

  private static async write(): Promise<void> {
    const ports = Signature.ports
    const files = Signature.files
    if (ports === undefined || files === undefined || Signature.isBlocked || Signature.isErasing || Signature.buffer.length === 0) return
    if (!await Signature.sync()) return
    const batch = [...Signature.buffer]
    if (batch.length === 0) return
    const result = await SignatureStore.flushJournal(ports.fs, files.root, Signature.input.session, Signature.startedAt, batch, Signature.part, Signature.realRoot)
    if (result.written === 0) {
      Signature.lastError = 'Signature stopped: its folder is not writable.'
      Signature.isOff = true
      Signature.emit()
      return
    }
    Signature.part = result.part
    const sent = new Set<Signal>(batch)
    Signature.buffer = Signature.buffer.filter((signal) => !sent.has(signal))
    if (Signature.isMeasureWanted) await Signature.measure()
    Signature.emit()
  }

  private static async prepare(): Promise<void> {
    if (!Signature.input.isInteractive) {
      Signature.isExcluded = true
      Signature.exclusionReason = 'this is not an interactive session'
      return
    }
    Signature.location = await Signature.locate()
    Signature.base = Signature.contextOf(Signature.location)
    await Signature.evaluate()
  }

  private static async reevaluate(): Promise<void> {
    if (Signature.consent === 'enabled') {
      if (Signature.location === undefined) await Signature.prepare()
      else await Signature.evaluate()
    }
    Signature.emit()
  }

  private static async locate(): Promise<Located> {
    const ports = Signature.ports
    const cwd = Signature.input.cwd
    if (ports === undefined) return { root: '', remote: '', stack: [] }
    const root = (await Signature.git(['rev-parse', '--show-toplevel'], cwd)).split('\n')[0]?.trim() ?? ''
    if (root === '') return { root: '', remote: '', stack: [] }
    const remote = (await Signature.git(['config', '--get', 'remote.origin.url'], cwd)).split('\n')[0]?.trim() ?? ''
    const listing = await Signature.git(['ls-files'], cwd)
    return { root, remote, stack: Signature.stack(listing) }
  }

  private static async git(args: readonly string[], cwd: string): Promise<string> {
    try {
      if (Signature.ports === undefined) return ''
      const result = await Signature.ports.git(['git', '--no-optional-locks', ...args], cwd)
      return result.exitCode === 0 && typeof result.stdout === 'string' ? result.stdout : ''
    } catch {
      return ''
    }
  }

  private static stack(listing: string): string[] {
    try {
      const base = Vocabulary.base()
      const keys = new Map<string, { path: string, count: number }>()
      for (const line of listing.split('\n', Signature.MAX_LINES)) {
        const path = line.trim()
        if (path === '') continue
        const name = path.slice(path.lastIndexOf('/') + 1)
        const dot = name.lastIndexOf('.')
        const key = dot > 0 ? name.slice(dot).toLowerCase() : name
        const known = keys.get(key)
        if (known !== undefined) known.count += 1
        else if (keys.size < Signature.MAX_KEYS) keys.set(key, { path, count: 1 })
      }
      const tags = new Map<string, number>()
      for (const item of keys.values()) {
        for (const tag of Vocabulary.fromPaths(base, [item.path])) {
          if (Vocabulary.facetOf(base, tag) === 'stack') tags.set(tag, (tags.get(tag) ?? 0) + item.count)
        }
      }
      return [...tags.entries()]
        .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
        .slice(0, Signature.STACK_TAGS)
        .map((entry) => entry[0])
    } catch {
      return []
    }
  }

  private static contextOf(location: Located): Context {
    const place = location.root !== '' ? location.root : Signature.input.cwd
    const trimmed = SignaturePaths.normalize(place).replace(/\/+$/, '')
    const name = trimmed.slice(trimmed.lastIndexOf('/') + 1)
    return {
      session: Signature.input.session,
      project: Redactor.clean(name === '' ? 'project' : name, 64, Signature.home),
      projectId: SignalExtractor.projectId(location.remote !== '' ? location.remote : place),
      stack: location.stack,
      home: Signature.home
    }
  }

  private static async evaluate(): Promise<void> {
    const found = await Signature.excluded()
    Signature.isExcluded = found.isExcluded
    Signature.exclusionReason = found.reason
  }

  private static async excluded(): Promise<{ isExcluded: boolean, reason: string }> {
    if (!Signature.input.isInteractive) return { isExcluded: true, reason: 'this is not an interactive session' }
    const root = Signature.location === undefined ? '' : Signature.location.root
    const places = root !== '' && root !== Signature.input.cwd ? [Signature.input.cwd, root] : [Signature.input.cwd]
    for (const glob of Signature.settings.exclude) {
      for (const place of places) {
        if (SignatureSettings.matches(glob, place, Signature.home)) return { isExcluded: true, reason: `excluded by ${glob}` }
      }
    }
    try {
      const dir = await Signature.privateDir(root)
      if (dir !== '') return { isExcluded: true, reason: `${Signature.PRIVATE} found in ${Redactor.clean(dir, 120, Signature.home)}` }
      return { isExcluded: false, reason: '' }
    } catch {
      return { isExcluded: true, reason: `${Signature.PRIVATE} could not be checked` }
    }
  }

  private static async privateDir(root: string): Promise<string> {
    const ports = Signature.ports
    if (ports === undefined) return ''
    const top = SignaturePaths.normalize(root)
    const cwd = SignaturePaths.normalize(Signature.input.cwd)
    const realCwd = cwd === '' ? '' : await Signature.real(cwd)
    const realTop = top === '' ? '' : await Signature.real(top)
    for (const base of top === '' ? [] : [top, realTop]) {
      if (base !== '' && await ports.fs.exists(base + '/' + Signature.PRIVATE)) return base
    }
    const starts = [cwd]
    if (realCwd !== '' && realCwd !== cwd) starts.push(realCwd)
    for (const start of starts) {
      const found = await Signature.walk(start, top, realTop)
      if (found !== '') return found
    }
    return ''
  }

  private static async walk(start: string, top: string, realTop: string): Promise<string> {
    const ports = Signature.ports
    if (ports === undefined || start === '') return ''
    let limit = ''
    if (top === '') limit = start
    else if (SignaturePaths.isInside(top, start)) limit = top
    else if (realTop !== '' && SignaturePaths.isInside(realTop, start)) limit = realTop
    let dir = start
    for (let level = 0; level < Signature.MAX_LEVELS; level += 1) {
      if (await ports.fs.exists(dir + '/' + Signature.PRIVATE)) return dir
      if (limit !== '' && dir === limit) return ''
      const cut = dir.lastIndexOf('/')
      if (cut < 0) return ''
      if (cut === 0) return dir !== '/' && await ports.fs.exists('/' + Signature.PRIVATE) ? '/' : ''
      dir = dir.slice(0, cut)
    }
    return ''
  }

  private static async real(path: string): Promise<string> {
    try {
      const ports = Signature.ports
      if (ports === undefined) return ''
      const info = await ports.fs.stat(path)
      if (info === undefined || typeof info.realPath !== 'string' || info.realPath === '') return ''
      const real = SignaturePaths.normalize(info.realPath)
      return SignaturePaths.isAbsolute(real) ? real : ''
    } catch {
      return ''
    }
  }

  private static resolve(folder: string): string {
    let text = typeof folder === 'string' ? folder.trim() : ''
    const first = text.charAt(0)
    if (text.length > 1 && (first === '"' || first === "'") && text.endsWith(first)) text = text.slice(1, -1).trim()
    while (text.length > 1 && (text.endsWith('/') || text.endsWith('\\'))) text = text.slice(0, -1)
    const isHome = text === '~' || text.startsWith('~/') || text.startsWith('~\\')
    if (!isHome && !SignaturePaths.isAbsolute(text)) return ''
    return text.length > Signature.MAX_GLOB ? '' : text
  }
}
