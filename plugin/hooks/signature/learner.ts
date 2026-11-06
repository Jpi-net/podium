import { Cases, type Case, type CandidateTag, type ParsedOutput } from './cases'
import { HistoryScanner, type Commit, type HistoryCursor, type HistorySource } from './history'
import { Journal } from './journal'
import { CaseMerger } from './merger'
import { SignaturePaths, type SignatureFiles } from './paths'
import { Profile, type ProfileData } from './profile'
import { LearningPrompts, type Batch } from './prompts'
import { Redactor } from './redactor'
import type { Settings } from './settings'
import type { Signal } from './signals'
import type { GitPort } from './signature'
import { SignatureStore, type FsPort, type JournalFile, type RunEntry, type StoreState } from './store'
import { TagIndex } from './tag-index'
import { Vocabulary, type TagDef, type VocabularyData, type VocabularyOverlay } from './vocabulary'

export type ModelRequest = {
  model: string, system: { text: string, cache: boolean }[], prompt: string, maxTokens: number, timeoutMs: number, effort: 'low'
}

export type ModelAnswer = { isAnswered: boolean, text: string, reason: string, inputTokens: number, outputTokens: number }

export type ModelPort = (request: ModelRequest) => Promise<ModelAnswer>

export type LearnPorts = { fs: FsPort, git: GitPort, model: ModelPort, now: () => number, wait: (ms: number) => Promise<void> }

export type Repository = { root: string, name: string, id: string, source: HistorySource }

export type RunInput = {
  files: SignatureFiles, realRoot: string, settings: Settings, owner: string, home: string, project: string, projectId: string
  stack: string, repositories: readonly Repository[], isForced: boolean, isRebuild: boolean, liveKeys: readonly string[]
}

export type Progress = { step: string, done: number, total: number }

export type RunReport = {
  isOk: boolean, tokens: number, added: number, reinforced: number, traits: number, newTraits: number, newTags: number, note: string
}

type Item = { text: string, evidence: string[], source: number, first: number }

type Source = { file: JournalFile, total: number, index: number }

type Entry = { signal: Signal, line: number }

type Merged = { active: Case[], archived: Case[], nextId: number, added: number, reinforced: number }

type Origin = { name: string, id: string, stack: string, isProject: boolean, isManual: boolean }

type Listing = { commits: Commit[], isExhausted: boolean, isFailed: boolean, isRewritten: boolean }

type Run = {
  now: number, today: string, allowance: number, model: string, settings: Settings, halt: string
  state: StoreState, profile: ProfileData, overlay: VocabularyOverlay, vocabulary: VocabularyData
  active: Case[], archived: Case[]
  tokens: number, saved: number, calls: number, added: number, reinforced: number, traits: number, newTraits: number, newTags: number
  tally: Map<string, number>, defs: Map<string, CandidateTag>
  notes: string[], error: string, unparsed: number
  isFailed: boolean, isStopped: boolean, isCrashed: boolean, isHalted: boolean
  writes: { ok: number, refused: number }
}

export class Learner {
  static readonly RUN_TOKENS = 120000

  private static readonly CHARS_PER_TOKEN = 3.5
  private static readonly OUTPUT_TOKENS = 4000
  private static readonly SYNTHESIS_TOKENS = 8000
  private static readonly SYNTHESIS_RESERVE = 20000
  private static readonly TIMEOUT_MS = 120000
  private static readonly MIN_PENDING = 20
  private static readonly MAX_RUNS = 30
  private static readonly MAX_PAGES = 4
  private static readonly MAX_IDENTITIES = 20
  private static readonly ACTIVE_CAP = 5000
  private static readonly CANDIDATE_MIN = 3
  private static readonly CANDIDATES_KEPT = 500
  private static readonly OVERLAY_TAGS = 200
  private static readonly DUE_CHANGES = 10
  private static readonly EARLY = 30
  private static readonly MAX_NOTE = 300
  private static readonly MAX_ERROR = 200
  private static readonly HOUR = 60 * 60 * 1000
  private static readonly BACKOFF: readonly number[] = [1, 4, 24]
  private static readonly GIT: readonly string[] = ['git', '--no-optional-locks']

  static estimate(text: string): number {
    if (typeof text !== 'string') return 0
    let ascii = 0
    let other = 0
    for (const char of text) {
      if (char.charCodeAt(0) < 128) ascii += 1
      else other += 1
    }
    return Math.ceil(ascii / Learner.CHARS_PER_TOKEN) + other
  }

  static pending(state: StoreState, files: readonly JournalFile[], counts: ReadonlyMap<string, number>): number {
    let total = 0
    for (const file of Array.isArray(files) ? files : []) {
      const lines = counts.get(file.key)
      if (typeof lines !== 'number' || !Number.isFinite(lines)) continue
      total += Math.max(0, Math.floor(lines) - (state.journal[file.key] ?? 0))
    }
    return total
  }

  static isDue(state: StoreState, settings: Settings, now: number, pending: number, hasHistory: boolean, isForced: boolean): boolean {
    try {
      if (!settings || settings.consent !== 'enabled') return false
      if (isForced !== true && settings.learning.background !== true) return false
      const isNewDay = state.day !== Learner.day(now)
      const runs = isNewDay ? 0 : state.runsToday
      const tokens = isNewDay ? 0 : state.tokensToday
      if (isForced !== true && runs >= settings.learning.runsPerDay) return false
      if (tokens >= settings.learning.tokensPerDay) return false
      if (isForced !== true && now < state.backoffUntil) return false
      return isForced === true || pending >= Learner.MIN_PENDING || hasHistory === true
    } catch {
      return false
    }
  }

  static async run(ports: LearnPorts, input: RunInput, progress: (value: Progress) => void): Promise<RunReport> {
    try {
      if (!Learner.isUsable(ports, input)) return Learner.blank('invalid-input')
      if (input.settings.consent !== 'enabled') return Learner.blank('disabled')
      const now = ports.now()
      if (typeof now !== 'number' || !Number.isFinite(now)) return Learner.blank('invalid-input')
      const isTaken = await SignatureStore.takeLock(ports.fs, input.files, input.owner, now, input.realRoot, ports.wait)
      if (!isTaken) return Learner.blank('locked')
      let report = Learner.blank('error')
      try {
        const disk = await SignatureStore.readSettings(ports.fs, input.files)
        if (disk.isNewer || disk.value.consent !== 'enabled') report = Learner.blank('disabled')
        else report = await Learner.locked(ports, input, progress, now, disk.value)
      } catch {
        report = Learner.blank('error')
      }
      await SignatureStore.releaseLock(ports.fs, input.files, input.owner, input.realRoot).catch(() => undefined)
      return report
    } catch {
      return Learner.blank('error')
    }
  }

  private static isUsable(ports: LearnPorts, input: RunInput): boolean {
    if (!ports || typeof ports.fs !== 'object' || typeof ports.git !== 'function' || typeof ports.model !== 'function') return false
    if (typeof ports.now !== 'function' || typeof ports.wait !== 'function') return false
    if (!input || !input.files || !input.settings || !input.settings.learning) return false
    if (typeof input.owner !== 'string' || input.owner === '' || typeof input.realRoot !== 'string' || input.realRoot === '') return false
    return Array.isArray(input.repositories)
  }

  private static blank(note: string): RunReport {
    return { isOk: false, tokens: 0, added: 0, reinforced: 0, traits: 0, newTraits: 0, newTags: 0, note }
  }

  private static day(now: number): string {
    if (typeof now !== 'number' || !Number.isFinite(now)) return '1970-01-01'
    const date = new Date(now)
    return Number.isNaN(date.getTime()) ? '1970-01-01' : date.toISOString().slice(0, 10)
  }

  private static async locked(
    ports: LearnPorts, input: RunInput, progress: (value: Progress) => void, now: number, settings: Settings
  ): Promise<RunReport> {
    const run = await Learner.load(ports, input, now, settings)
    if (run === undefined) return Learner.blank('newer-format')
    const steps: (() => Promise<void>)[] = []
    if (!input.isRebuild) {
      steps.push(() => Learner.sessions(ports, input, progress, run))
      steps.push(() => Learner.history(ports, input, progress, run))
    }
    steps.push(() => Learner.index(ports, input, progress, run))
    steps.push(() => Learner.synthesis(ports, input, progress, run))
    steps.push(() => Learner.vocabulary(ports, input, progress, run))
    steps.push(() => Learner.archive(ports, input, progress, run))
    for (const step of steps) {
      if (run.isCrashed || run.isHalted) break
      try {
        await step()
      } catch (error) {
        run.isCrashed = true
        run.isFailed = true
        run.error = Learner.message(error, input.home)
      }
    }
    return Learner.finish(ports, input, run)
  }

  private static async load(ports: LearnPorts, input: RunInput, now: number, settings: Settings): Promise<Run | undefined> {
    const files = input.files
    const state = await SignatureStore.readState(ports.fs, files)
    if (state.isNewer) return undefined
    const profile = await SignatureStore.readProfile(ports.fs, files)
    if (profile.isNewer) return undefined
    const overlay = await SignatureStore.readOverlay(ports.fs, files)
    if (overlay.isNewer) return undefined
    if (state.isCorrupt) await Learner.quarantine(ports, input, files.state, now)
    if (profile.isCorrupt) await Learner.quarantine(ports, input, files.profile, now)
    if (overlay.isCorrupt) await Learner.quarantine(ports, input, files.vocabulary, now)
    const set = await SignatureStore.readCases(ports.fs, files)
    const today = Learner.day(now)
    const value = state.value
    if (value.day !== today) {
      value.day = today
      value.tokensToday = 0
      value.runsToday = 0
    }
    let highest = -1
    for (const item of [...set.cases, ...set.archived]) if (item.id > highest) highest = item.id
    value.nextCaseId = Math.max(value.nextCaseId, highest + 1)
    const left = settings.learning.tokensPerDay - value.tokensToday
    return {
      now,
      today,
      allowance: Math.max(0, Math.min(left, Learner.RUN_TOKENS)),
      model: settings.learning.model,
      settings,
      halt: '',
      state: value,
      profile: profile.value,
      overlay: overlay.value,
      vocabulary: Vocabulary.merge(Vocabulary.base(), overlay.value),
      active: set.cases,
      archived: set.archived,
      tokens: 0,
      saved: 0,
      calls: 0,
      added: 0,
      reinforced: 0,
      traits: 0,
      newTraits: 0,
      newTags: 0,
      tally: new Map<string, number>(),
      defs: new Map<string, CandidateTag>(),
      notes: [],
      error: '',
      unparsed: 0,
      isFailed: false,
      isStopped: false,
      isCrashed: false,
      isHalted: false,
      writes: { ok: 0, refused: 0 }
    }
  }

  private static async quarantine(ports: LearnPorts, input: RunInput, path: string, now: number): Promise<void> {
    const text = await SignatureStore.text(ports.fs, path)
    if (text === '') return
    await SignatureStore.quarantine(ports.fs, input.files, path, text, now, input.realRoot)
  }

  private static async sessions(ports: LearnPorts, input: RunInput, progress: (value: Progress) => void, run: Run): Promise<void> {
    const limit = Math.floor(run.allowance / 2)
    const { sources, items } = await Learner.collect(ports, input, run, limit)
    const batches = LearningPrompts.batches(items)
    const counts = Learner.consumed(items, batches)
    const system = LearningPrompts.extraction(run.vocabulary)
    const origin: Origin = { name: input.project, id: input.projectId, stack: input.stack, isProject: false, isManual: false }
    Learner.report(progress, 'sessions', 0, batches.length)
    let at = 0
    for (let number = 0; number < batches.length; number += 1) {
      const batch = batches[number]
      if (batch === undefined) break
      at += counts[number] ?? 0
      let merged: Merged | undefined
      if (batch.evidence.length > 0) {
        if (!Learner.fits(run, limit, system, batch.text)) {
          Learner.note(run, 'budget')
          break
        }
        const parsed = await Learner.extract(ports, input, run, system, batch.text)
        if (parsed === undefined) break
        merged = Learner.merge(run, parsed, batch.evidence, origin)
      }
      const rest = items.slice(at)
      const isSaved = await Learner.persist(ports, input, run, merged, () => Learner.advance(run, sources, rest))
      if (!isSaved) break
      Learner.report(progress, 'sessions', number + 1, batches.length)
    }
    await Learner.settle(ports, input, run, sources)
  }

  private static async collect(ports: LearnPorts, input: RunInput, run: Run, limit: number): Promise<{ sources: Source[], items: Item[] }> {
    const listed = await SignatureStore.journalFiles(ports.fs, input.files)
    const known = new Set(listed.map((file) => file.key))
    for (const key of Object.keys(run.state.journal)) if (!known.has(key)) delete run.state.journal[key]
    const sources: Source[] = []
    const items: Item[] = []
    const budget = Math.floor(limit * Learner.CHARS_PER_TOKEN)
    let chars = 0
    for (const file of listed) {
      if (chars > budget) break
      const text = await SignatureStore.text(ports.fs, file.path)
      const lines = text.split('\n').filter((line) => line.trim() !== '')
      const total = lines.length
      const done = Math.min(run.state.journal[file.key] ?? 0, total)
      const source: Source = { file, total, index: sources.length }
      sources.push(source)
      const entries: Entry[] = []
      for (let line = done; line < total; line += 1) {
        const signal = Journal.parse(lines[line] ?? '')[0]
        if (signal !== undefined) entries.push({ signal, line })
      }
      const found = Learner.episodesOf(entries, source.index)
      if (found.length === 0) {
        run.state.journal[file.key] = total
        continue
      }
      run.state.journal[file.key] = done
      for (const item of found) chars += item.text.length
      items.push(...found)
    }
    return { sources, items }
  }

  private static episodesOf(entries: readonly Entry[], source: number): Item[] {
    if (entries.length === 0) return []
    const episodes = LearningPrompts.episodes(entries.map((entry) => entry.signal))
    const starts = new Map<string, { at: number, index: number }[]>()
    episodes.forEach((episode, index) => {
      const list = starts.get(episode.session) ?? []
      list.push({ at: episode.at, index })
      starts.set(episode.session, list)
    })
    const first = new Array<number>(episodes.length).fill(Number.MAX_SAFE_INTEGER)
    for (const entry of entries) {
      const list = starts.get(entry.signal.session)
      if (list === undefined) continue
      let pick = list[0]
      for (const start of list) if (start.at <= entry.signal.at) pick = start
      if (pick !== undefined && entry.line < (first[pick.index] ?? Number.MAX_SAFE_INTEGER)) first[pick.index] = entry.line
    }
    return episodes.map((episode, index) => ({
      text: LearningPrompts.render(episode),
      evidence: episode.evidence,
      source,
      first: first[index] ?? 0
    }))
  }

  private static consumed(items: readonly { text: string }[], batches: readonly Batch[]): number[] {
    const counts: number[] = []
    let at = 0
    for (const batch of batches) {
      let joined = ''
      let count = 0
      while (at < items.length) {
        const item = items[at]
        at += 1
        count += 1
        if (item === undefined || item.text === '') continue
        const piece = Redactor.truncate(item.text, LearningPrompts.BATCH_CHARS)
        joined = joined === '' ? piece : joined + '\n\n' + piece
        if (joined === batch.text) break
      }
      counts.push(count)
    }
    return counts
  }

  private static advance(run: Run, sources: readonly Source[], rest: readonly Item[]): void {
    for (const source of sources) {
      let value = source.total
      for (const item of rest) if (item.source === source.index && item.first < value) value = item.first
      run.state.journal[source.file.key] = Math.max(run.state.journal[source.file.key] ?? 0, value)
    }
  }

  private static async settle(ports: LearnPorts, input: RunInput, run: Run, sources: readonly Source[]): Promise<void> {
    if (run.isHalted) return
    let isChanged = false
    const live = new Set<string>(Array.isArray(input.liveKeys) ? input.liveKeys : [])
    const fresh = new Map<string, number>()
    for (const file of await SignatureStore.journalFiles(ports.fs, input.files)) fresh.set(file.key, file.mtimeMs)
    const idle = run.settings.learning.idleMinutes * 60 * 1000
    for (const source of sources) {
      const cursor = run.state.journal[source.file.key] ?? 0
      if (source.total === 0 || cursor < source.total || live.has(source.file.key)) continue
      const modified = fresh.get(source.file.key) ?? source.file.mtimeMs
      if (!(run.now - modified >= idle)) continue
      if (!await Learner.guard(ports, input, run)) return
      const text = await SignatureStore.text(ports.fs, source.file.path)
      const count = text.split('\n').filter((line) => line.trim() !== '').length
      if (count !== source.total) continue
      const isEmptied = await SignatureStore.emptyFile(ports.fs, input.files, source.file.path, input.realRoot)
      Learner.mark(run, isEmptied)
      if (!isEmptied) continue
      delete run.state.journal[source.file.key]
      isChanged = true
    }
    if (!isChanged) return
    const isSaved = await SignatureStore.writeState(ports.fs, input.files, run.state, input.realRoot)
    Learner.mark(run, isSaved)
    if (isSaved) run.saved = run.tokens
  }

  private static async history(ports: LearnPorts, input: RunInput, progress: (value: Progress) => void, run: Run): Promise<void> {
    if (run.isStopped) return
    const system = LearningPrompts.extraction(run.vocabulary)
    const total = input.repositories.length
    for (let index = 0; index < total; index += 1) {
      const repo = input.repositories[index]
      if (repo === undefined || run.isStopped) break
      Learner.report(progress, 'history', index, total)
      try {
        await Learner.research(ports, input, run, repo, system)
      } catch {
        Learner.note(run, 'error:' + Learner.label(repo.name))
      }
    }
    Learner.report(progress, 'history', total, total)
  }

  private static async research(ports: LearnPorts, input: RunInput, run: Run, repo: Repository, system: string): Promise<void> {
    if (repo.source === 'auto' && run.settings.capture.history !== true) return
    const name = Learner.label(repo.name)
    const root = repo.root
    if (!Learner.isRoot(root) || typeof repo.id !== 'string' || repo.id === '') {
      Learner.note(run, 'bad-root:' + name)
      return
    }
    const identities = await Learner.identities(ports, run.settings, root)
    if (identities.length === 0) {
      Learner.note(run, 'no-identity:' + name)
      return
    }
    const stored = await SignatureStore.readCursor(ports.fs, input.files, repo.id)
    const base: HistoryCursor = { ...(stored ?? HistoryScanner.emptyCursor(root, repo.name, repo.source)), root, name: repo.name, identities, source: repo.source }
    const isSince = (base.selected >= HistoryScanner.BACKLOG || base.isComplete) && HistoryScanner.isSha(base.head)
    const listing = await Learner.listing(ports, root, identities, base, isSince)
    if (listing.isFailed) {
      Learner.note(run, 'git-failed:' + name)
      return
    }
    const commits = listing.commits
    if (listing.isRewritten) Learner.note(run, 'history-rewritten:' + name)
    const earliest = new Set<string>(base.done.length === 0 && listing.isExhausted ? commits.slice(-Learner.EARLY).map((commit) => commit.sha) : [])
    const view = isSince ? { ...base, selected: 0 } : base
    const selected = HistoryScanner.select(commits, view, earliest)
    let cursor: HistoryCursor = { ...base, scanned: Math.max(base.scanned, commits.length) }
    let isDone = true
    let tip = ''
    if (selected.length > 0) {
      const head = await Learner.head(ports, root)
      tip = head
      const items: { text: string, evidence: string[] }[] = []
      const shas = new Map<string, string>()
      for (const commit of selected) {
        const diff = await Learner.diff(ports, root, commit)
        const excerpt = HistoryScanner.excerpt(root, commit, diff, input.home)
        items.push({ text: excerpt.text, evidence: [excerpt.id] })
        shas.set(excerpt.id, commit.sha)
      }
      const batches = LearningPrompts.batches(items)
      const origin: Origin = { name: repo.name, id: repo.id, stack: repo.source === 'auto' ? input.stack : '', isProject: true, isManual: repo.source === 'manual' }
      for (const batch of batches) {
        if (!Learner.fits(run, Learner.historyLimit(run), system, batch.text)) {
          Learner.note(run, 'budget')
          isDone = false
          break
        }
        const parsed = await Learner.extract(ports, input, run, system, batch.text)
        if (parsed === undefined) {
          isDone = false
          break
        }
        const merged = Learner.merge(run, parsed, batch.evidence, origin)
        const batchShas = batch.evidence.map((id) => shas.get(id) ?? '').filter((sha) => sha !== '')
        cursor = HistoryScanner.remember(cursor, batchShas, isSince ? '' : head)
        const isSaved = await Learner.persist(ports, input, run, merged, () => undefined, { id: repo.id, value: cursor })
        if (!isSaved) {
          isDone = false
          break
        }
      }
    }
    if (!isDone || run.isStopped) return
    const isNothingLeft = listing.isExhausted && HistoryScanner.select(commits, isSince ? { ...cursor, selected: 0 } : cursor, earliest).length === 0
    const isComplete = isSince || isNothingLeft
    const isMoving = isSince && isNothingLeft && (commits.length > 0 || listing.isRewritten)
    const head = isMoving ? (tip !== '' ? tip : await Learner.head(ports, root)) : cursor.head
    const final: HistoryCursor = { ...cursor, head: head === '' ? cursor.head : head, isComplete }
    if (stored !== undefined && HistoryScanner.serializeCursor(final) === HistoryScanner.serializeCursor(stored)) return
    if (!await Learner.guard(ports, input, run)) return
    Learner.mark(run, await SignatureStore.writeCursor(ports.fs, input.files, repo.id, final, input.realRoot))
  }

  private static async listing(
    ports: LearnPorts, root: string, identities: readonly string[], cursor: HistoryCursor, isSince: boolean
  ): Promise<Listing> {
    const commits: Commit[] = []
    let isExhausted = false
    let since = isSince ? cursor.head : ''
    let isRewritten = false
    for (let page = 0; page < Learner.MAX_PAGES; page += 1) {
      let out = await Learner.log(ports, root, identities, page, since)
      if (page === 0 && since !== '' && (out === undefined || out.exitCode !== 0)) {
        since = ''
        isRewritten = true
        out = await Learner.log(ports, root, identities, page, since)
      }
      if (out === undefined || out.exitCode !== 0) return { commits, isExhausted: false, isFailed: page === 0, isRewritten }
      const parsed = HistoryScanner.parseLog(out.stdout)
      commits.push(...parsed)
      if (parsed.length < HistoryScanner.PAGE) {
        isExhausted = true
        break
      }
      const view = isSince ? { ...cursor, selected: 0 } : cursor
      if (cursor.done.length > 0 && HistoryScanner.select(commits, view, new Set<string>()).length >= HistoryScanner.PER_RUN) break
    }
    return { commits, isExhausted, isFailed: false, isRewritten }
  }

  private static async log(
    ports: LearnPorts, root: string, identities: readonly string[], page: number, since: string
  ): Promise<{ exitCode: number, stdout: string } | undefined> {
    const argv = [...Learner.GIT, '-C', root, ...HistoryScanner.logArgs(identities, page * HistoryScanner.PAGE, HistoryScanner.PAGE, since)]
    try {
      const out = await ports.git(argv, root)
      return out && typeof out.stdout === 'string' && typeof out.exitCode === 'number' ? out : undefined
    } catch {
      return undefined
    }
  }

  private static async identities(ports: LearnPorts, settings: Settings, root: string): Promise<string[]> {
    const configured = Array.isArray(settings.identities) ? settings.identities.filter((email) => HistoryScanner.isIdentity(email)) : []
    if (configured.length > 0) return configured.slice(0, Learner.MAX_IDENTITIES)
    try {
      const out = await ports.git([...Learner.GIT, '-C', root, 'config', '--get', 'user.email'], root)
      const email = out && out.exitCode === 0 && typeof out.stdout === 'string' ? out.stdout.trim() : ''
      return HistoryScanner.isIdentity(email) ? [email] : []
    } catch {
      return []
    }
  }

  private static async head(ports: LearnPorts, root: string): Promise<string> {
    try {
      const out = await ports.git([...Learner.GIT, '-C', root, 'rev-parse', 'HEAD'], root)
      const sha = out && out.exitCode === 0 && typeof out.stdout === 'string' ? out.stdout.trim() : ''
      return HistoryScanner.isSha(sha) ? sha : ''
    } catch {
      return ''
    }
  }

  private static async diff(ports: LearnPorts, root: string, commit: Commit): Promise<string> {
    const sizes = new Map<string, number>()
    for (const file of commit.files) sizes.set(file.path, file.added + file.deleted)
    const paths = HistoryScanner.diffPaths(commit).sort((a, b) => (sizes.get(b) ?? 0) - (sizes.get(a) ?? 0))
    const args = HistoryScanner.showArgs(commit.sha, paths)
    if (args.length === 0) return ''
    try {
      const out = await ports.git([...Learner.GIT, '-C', root, ...args], root)
      return out && out.exitCode === 0 && typeof out.stdout === 'string' ? out.stdout : ''
    } catch {
      return ''
    }
  }

  private static async index(ports: LearnPorts, input: RunInput, progress: (value: Progress) => void, run: Run): Promise<void> {
    Learner.report(progress, 'index', 0, 1)
    if (!await Learner.guard(ports, input, run)) return
    Learner.mark(run, await SignatureStore.writeIndex(ports.fs, input.files, TagIndex.build(run.active), input.realRoot))
    Learner.report(progress, 'index', 1, 1)
  }

  private static async synthesis(ports: LearnPorts, input: RunInput, progress: (value: Progress) => void, run: Run): Promise<void> {
    Learner.report(progress, 'synthesis', 0, 1)
    const changes = run.added + run.reinforced
    const accumulated: ProfileData = { ...run.profile, changedSince: run.profile.changedSince + changes }
    const isDue = Profile.isDue(accumulated, run.now, input.isRebuild) || changes >= Learner.DUE_CHANGES
    let profile = accumulated
    const isAny = run.active.some((item) => item.status !== 'rejected')
    if (isDue && isAny && !run.isStopped) {
      const system = LearningPrompts.synthesis()
      const prompt = LearningPrompts.synthesisInput(accumulated, run.active)
      if (Learner.fits(run, run.allowance, system, prompt, Learner.SYNTHESIS_TOKENS)) {
        const answer = await Learner.call(ports, input, run, system, prompt, Learner.SYNTHESIS_TOKENS)
        if (answer !== undefined) {
          const merged = Profile.merge(accumulated, answer.text, run.active, run.today)
          if (merged.isParsed) {
            run.newTraits = merged.added
            profile = { ...merged.profile, synthesizedAt: run.now, changedSince: 0 }
          } else {
            run.unparsed += 1
          }
        }
      } else {
        Learner.note(run, 'budget')
      }
    }
    if (run.isHalted) return
    profile = { ...Profile.recompute(profile, run.active, run.today), updatedAt: run.today }
    run.profile = profile
    run.traits = profile.traits.length
    if (!await Learner.guard(ports, input, run)) return
    Learner.mark(run, await SignatureStore.writeProfile(ports.fs, input.files, profile, input.realRoot))
    Learner.report(progress, 'synthesis', 1, 1)
  }

  private static async vocabulary(ports: LearnPorts, input: RunInput, progress: (value: Progress) => void, run: Run): Promise<void> {
    Learner.report(progress, 'vocabulary', 0, 1)
    if (run.tally.size > 0) {
      const candidates: Record<string, number> = { ...run.overlay.candidates }
      const tags: Record<string, TagDef> = { ...run.overlay.tags }
      let added = 0
      for (const [tag, seen] of run.tally) {
        const total = (candidates[tag] ?? 0) + seen
        const known: VocabularyData = { revision: run.vocabulary.revision, tags: { ...run.vocabulary.tags, ...tags } }
        const def = run.defs.get(tag)
        if (Vocabulary.has(known, tag)) {
          delete candidates[tag]
          continue
        }
        const hasRoom = total >= Learner.CANDIDATE_MIN && Object.keys(tags).length < Learner.OVERLAY_TAGS
        if (hasRoom && def !== undefined && (def.parent === '' || Vocabulary.has(known, def.parent))) {
          tags[tag] = { facet: def.facet, parent: def.parent, aliases: def.aliases.map((alias) => alias.toLowerCase()), paths: [] }
          delete candidates[tag]
          added += 1
          continue
        }
        candidates[tag] = total
      }
      const kept = Object.entries(candidates)
        .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
        .slice(0, Learner.CANDIDATES_KEPT)
      const overlay: VocabularyOverlay = {
        revision: run.overlay.revision + (added > 0 ? 1 : 0),
        tags,
        candidates: Object.fromEntries(kept)
      }
      if (!await Learner.guard(ports, input, run)) return
      const isWritten = await SignatureStore.writeOverlay(ports.fs, input.files, overlay, input.realRoot)
      Learner.mark(run, isWritten)
      if (isWritten) {
        run.overlay = overlay
        run.vocabulary = Vocabulary.merge(Vocabulary.base(), overlay)
        run.newTags = added
      }
    }
    Learner.report(progress, 'vocabulary', 1, 1)
  }

  private static async archive(ports: LearnPorts, input: RunInput, progress: (value: Progress) => void, run: Run): Promise<void> {
    Learner.report(progress, 'archive', 0, 1)
    const ids = new Set(CaseMerger.selectForArchive(run.active, run.today, Learner.ACTIVE_CAP, run.settings.halfLifeMonths))
    if (ids.size > 0) {
      const active = run.active.filter((item) => !ids.has(item.id))
      const archived = [...run.archived.filter((item) => !ids.has(item.id)), ...run.active.filter((item) => ids.has(item.id))]
      if (!await Learner.guard(ports, input, run)) return
      const isWritten = await SignatureStore.writeCases(ports.fs, input.files, active, archived, input.realRoot)
      Learner.mark(run, isWritten)
      if (isWritten) {
        run.active = active
        run.archived = archived
        Learner.mark(run, await SignatureStore.writeIndex(ports.fs, input.files, TagIndex.build(run.active), input.realRoot))
      }
    }
    Learner.report(progress, 'archive', 1, 1)
  }

  private static merge(run: Run, parsed: ParsedOutput, evidence: readonly string[], origin: Origin): Merged | undefined {
    if (parsed.cases.length === 0) return undefined
    const result = CaseMerger.merge(
      [...run.active, ...run.archived],
      parsed.cases,
      {
        nextId: run.state.nextCaseId,
        today: run.today,
        project: origin.name,
        projectId: origin.id,
        stack: origin.stack,
        extractor: LearningPrompts.extractor(run.today),
        vocabularyRevision: run.vocabulary.revision,
        isProjectBatch: origin.isProject,
        allowedEvidence: evidence
      },
      run.vocabulary
    )
    const accepted = Math.max(0, parsed.cases.length - result.dropped)
    if (accepted > 0 && !origin.isManual) {
      for (const candidate of parsed.candidateTags) {
        run.defs.set(candidate.tag, candidate)
        run.tally.set(candidate.tag, (run.tally.get(candidate.tag) ?? 0) + 1)
      }
    }
    if (result.added.length + result.reinforced.length + result.contradicted.length === 0) return undefined
    const ids = new Set<number>(run.active.map((item) => item.id))
    for (const id of result.added) ids.add(id)
    for (const id of result.reinforced) ids.add(id)
    return {
      active: result.cases.filter((item) => ids.has(item.id)),
      archived: result.cases.filter((item) => !ids.has(item.id)),
      nextId: result.nextId,
      added: result.added.length,
      reinforced: result.reinforced.length
    }
  }

  private static async persist(
    ports: LearnPorts, input: RunInput, run: Run, merged: Merged | undefined, update: () => void, cursor?: { id: string, value: HistoryCursor }
  ): Promise<boolean> {
    if (!await Learner.guard(ports, input, run)) return false
    if (merged !== undefined) {
      const isWritten = await SignatureStore.writeCases(ports.fs, input.files, merged.active, merged.archived, input.realRoot)
      Learner.mark(run, isWritten)
      if (!isWritten) {
        run.isStopped = true
        return false
      }
      run.active = merged.active
      run.archived = merged.archived
      run.state.nextCaseId = merged.nextId
      run.added += merged.added
      run.reinforced += merged.reinforced
    }
    update()
    let isOk = true
    if (cursor !== undefined) {
      const isCursor = await SignatureStore.writeCursor(ports.fs, input.files, cursor.id, cursor.value, input.realRoot)
      Learner.mark(run, isCursor)
      if (!isCursor) isOk = false
    }
    const isState = await SignatureStore.writeState(ports.fs, input.files, run.state, input.realRoot)
    Learner.mark(run, isState)
    if (isState) run.saved = run.tokens
    if (!isState) isOk = false
    if (!isOk) run.isStopped = true
    return isOk
  }

  private static historyLimit(run: Run): number {
    return run.allowance >= Learner.SYNTHESIS_RESERVE * 2 ? run.allowance - Learner.SYNTHESIS_RESERVE : run.allowance
  }

  private static fits(run: Run, limit: number, system: string, prompt: string, output: number = Learner.OUTPUT_TOKENS): boolean {
    const needed = Learner.estimate(system) + Learner.estimate(prompt) + output
    return needed <= limit - run.tokens
  }

  private static async call(
    ports: LearnPorts, input: RunInput, run: Run, system: string, prompt: string, output: number = Learner.OUTPUT_TOKENS
  ): Promise<ModelAnswer | undefined> {
    if (!await Learner.guard(ports, input, run)) return undefined
    let answer: ModelAnswer
    try {
      answer = await ports.model({
        model: run.model,
        system: [{ text: system, cache: true }],
        prompt,
        maxTokens: output,
        timeoutMs: Learner.TIMEOUT_MS,
        effort: 'low'
      })
    } catch {
      answer = { isAnswered: false, text: '', reason: 'error', inputTokens: 0, outputTokens: 0 }
    }
    run.calls += 1
    const reported = Learner.positive(answer?.inputTokens) + Learner.positive(answer?.outputTokens)
    const text = typeof answer?.text === 'string' ? answer.text : ''
    const used = Math.max(reported, Learner.estimate(system) + Learner.estimate(prompt) + Learner.estimate(text))
    run.tokens += used
    run.state.tokensToday += used
    if (!answer || answer.isAnswered !== true || typeof answer.text !== 'string') {
      const reason = typeof answer?.reason === 'string' ? answer.reason : ''
      if (reason === 'stopped') {
        Learner.halt(run, 'stopped')
        return undefined
      }
      run.isStopped = true
      run.isFailed = true
      run.error = 'model: ' + Redactor.clean(reason === '' ? 'not answered' : reason, 120, input.home)
      return undefined
    }
    return answer
  }

  private static async extract(ports: LearnPorts, input: RunInput, run: Run, system: string, prompt: string): Promise<ParsedOutput | undefined> {
    const answer = await Learner.call(ports, input, run, system, prompt)
    if (answer === undefined) return undefined
    if (Cases.firstObject(answer.text) === '') run.unparsed += 1
    return Cases.parseModelOutput(answer.text, run.vocabulary)
  }

  private static async guard(ports: LearnPorts, input: RunInput, run: Run): Promise<boolean> {
    if (run.isHalted) return false
    try {
      const disk = await SignatureStore.readSettings(ports.fs, input.files)
      if (disk.isNewer || disk.value.consent !== 'enabled') {
        Learner.halt(run, 'stopped')
        return false
      }
      run.settings = disk.value
      const isOurs = await SignatureStore.takeLock(ports.fs, input.files, input.owner, ports.now(), input.realRoot, ports.wait)
      if (!isOurs) {
        Learner.halt(run, 'lock-lost')
        return false
      }
      return true
    } catch {
      Learner.halt(run, 'lock-lost')
      return false
    }
  }

  private static async spend(ports: LearnPorts, input: RunInput, run: Run): Promise<void> {
    try {
      const unsaved = run.tokens - run.saved
      if (unsaved <= 0) return
      const read = await SignatureStore.readState(ports.fs, input.files)
      if (read.isNewer) return
      const state = read.value
      if (state.day !== run.today) {
        state.day = run.today
        state.tokensToday = 0
        state.runsToday = 0
      }
      state.tokensToday += unsaved
      await SignatureStore.writeState(ports.fs, input.files, state, input.realRoot)
    } catch {
      return
    }
  }

  private static halt(run: Run, reason: string): void {
    run.isHalted = true
    run.isStopped = true
    run.halt = reason
    Learner.note(run, reason)
  }

  private static async finish(ports: LearnPorts, input: RunInput, run: Run): Promise<RunReport> {
    if (run.halt === '') await Learner.guard(ports, input, run)
    if (run.halt === 'lock-lost') {
      await Learner.spend(ports, input, run)
      return { isOk: false, tokens: run.tokens, added: run.added, reinforced: run.reinforced, traits: run.traits, newTraits: run.newTraits, newTags: run.newTags, note: run.notes.join(',').slice(0, Learner.MAX_NOTE) }
    }
    const notes = [...run.notes]
    if (run.unparsed > 0) notes.push('unparsed:' + run.unparsed)
    const isRefused = run.writes.refused > 0
    if (isRefused) notes.push(run.writes.ok === 0 ? 'not-writable' : 'partial-write')
    const isOk = !run.isFailed && !isRefused
    const failures = Learner.failures(run.state.runs)
    const entry: RunEntry = {
      at: run.now,
      ok: isOk,
      tokens: run.tokens,
      cases: run.added,
      traits: run.newTraits,
      note: notes.join(',').slice(0, Learner.MAX_NOTE)
    }
    run.state.runs = [...run.state.runs, entry].slice(-Learner.MAX_RUNS)
    run.state.runsToday += run.calls > 0 || input.isForced !== true ? 1 : 0
    run.state.day = run.today
    run.state.backoffUntil = isOk ? 0 : run.now + (Learner.BACKOFF[Math.min(failures, Learner.BACKOFF.length - 1)] ?? 1) * Learner.HOUR
    run.state.lastError = isOk ? '' : (run.error !== '' ? run.error : notes.join(',')).slice(0, Learner.MAX_ERROR)
    let isSaved = false
    try {
      isSaved = await SignatureStore.writeState(ports.fs, input.files, run.state, input.realRoot)
    } catch {
      isSaved = false
    }
    Learner.mark(run, isSaved)
    const isLost = !isSaved && !isRefused
    if (isLost) notes.push(run.writes.ok === 0 ? 'not-writable' : 'partial-write')
    return {
      isOk: isOk && isSaved,
      tokens: run.tokens,
      added: run.added,
      reinforced: run.reinforced,
      traits: run.traits,
      newTraits: run.newTraits,
      newTags: run.newTags,
      note: notes.join(',').slice(0, Learner.MAX_NOTE)
    }
  }

  private static failures(runs: readonly RunEntry[]): number {
    let count = 0
    for (let index = runs.length - 1; index >= 0; index -= 1) {
      if (runs[index]?.ok !== false) break
      count += 1
    }
    return count
  }

  private static report(progress: (value: Progress) => void, step: string, done: number, total: number): void {
    try {
      progress({ step, done, total })
    } catch {
      return
    }
  }

  private static mark(run: Run, isWritten: boolean): void {
    if (isWritten) run.writes.ok += 1
    else run.writes.refused += 1
  }

  private static note(run: Run, text: string): void {
    if (!run.notes.includes(text)) run.notes.push(text)
  }

  private static message(error: unknown, home: string): string {
    const text = error instanceof Error ? error.message : String(error)
    return Redactor.clean(text === '' ? 'error' : text, Learner.MAX_ERROR, home)
  }

  private static label(name: string): string {
    return HistoryScanner.repoName(typeof name === 'string' ? name : '')
  }

  private static positive(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
  }

  private static isRoot(root: string): boolean {
    if (typeof root !== 'string' || root === '' || root.startsWith('-')) return false
    if (/[\n\r\0]/.test(root)) return false
    return SignaturePaths.isAbsolute(root)
  }
}
