import { Journal } from './journal'
import { SignaturePaths, type SignatureFiles } from './paths'
import { Redactor } from './redactor'
import { SignatureSettings, type Consent, type Settings } from './settings'
import { SignalExtractor, type PlanInput, type QuestionInput, type Signal, type SignalContext } from './signals'
import { SignatureStore, type FsPort, type Sizes } from './store'
import { Vocabulary } from './vocabulary'

export type GitPort = (argv: readonly string[], cwd: string) => Promise<{ exitCode: number, stdout: string }>

export type SignaturePorts = {
  fs: FsPort
  git: GitPort
  now: () => number
  env: (name: string) => string
  toast: (text: string) => void
  changed: (state: SignatureViewState) => void
}

export type SignatureDraft = { sessions: boolean, history: boolean, pastSessions: boolean, background: boolean, apply: boolean }

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
  private static readonly USAGE = 'Usage: /podium-stage signature [on|off|pause|resume|exclude <folder>|include <folder>|erase]'
  private static readonly NOT_READY = 'Signature is not ready yet.'

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
      lastError: ''
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
      if (Signature.consent === 'enabled') await Signature.prepare()
      await Signature.measure()
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
      if (!Signature.isCapturing() || !event) return
      if (event.isUserOrigin !== true || event.isMeta === true || event.isNotification === true) return
      if (typeof event.text === 'string' && event.text.trimStart().startsWith('!')) return
      const isAfterAbort = Signature.isAfterAbort
      Signature.isAfterAbort = false
      const context = Signature.context()
      if (context === undefined) return
      Signature.record([SignalExtractor.prompt(context, { text: event.text, command: event.command, args: event.args, isAfterAbort })])
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

  static onTurn(reason: string, agentId: string, turnId: string): void {
    try {
      if (agentId !== '' && agentId !== undefined) return
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
      lastError: Signature.lastError
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
      Signature.emit()
      if (Signature.isExcluded) return `Signature is on, but it does not learn here: ${Signature.exclusionReason}.`
      return 'Signature is on: it records your decisions from now on.'
    } catch (error) {
      Signature.fail(error)
      return Signature.lastError
    }
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
      if (!Signature.isConfirming()) {
        Signature.confirmAt = Signature.now()
        Signature.emit()
        return 'Run it again within 30 seconds to erase everything Signature stored.'
      }
      Signature.confirmAt = 0
      Signature.isErasing = true
      Signature.consent = 'declined'
      Signature.buffer = []
      Signature.signals = 0
      Signature.lost = 0
      try {
        if (Signature.running !== undefined) await Signature.running
        const ports = Signature.ports
        const files = Signature.files
        if (ports === undefined || files === undefined) return Signature.NOT_READY
        const result = await SignatureStore.erase(ports.fs, files, Signature.realRoot)
        Signature.buffer = []
        Signature.settings = SignatureSettings.defaults()
        Signature.settings.consent = 'declined'
        Signature.dropped = []
        Signature.part = 0
        Signature.isBlocked = false
        Signature.isOff = false
        Signature.lastError = ''
        Signature.isExcluded = false
        Signature.exclusionReason = ''
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
          return await Signature.enable()
        case 'off':
          return await Signature.decline()
        case 'pause':
          return await Signature.pause()
        case 'resume':
          return await Signature.resume()
        case 'erase':
          return await Signature.erase()
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
    const batch = [...Signature.buffer]
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
