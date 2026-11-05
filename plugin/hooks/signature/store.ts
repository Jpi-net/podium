import { Cases, type Case } from './cases'
import { FormatVersion } from './format-version'
import { HistoryScanner, type HistoryCursor } from './history'
import { Journal } from './journal'
import { SignaturePaths, type SignatureFiles } from './paths'
import { Profile, type ProfileData } from './profile'
import { SignatureSettings, type Settings } from './settings'
import type { Signal } from './signals'
import { TagIndex, type TagIndexData } from './tag-index'
import { Vocabulary, type VocabularyOverlay } from './vocabulary'

export type FsEntryLike = { name: string, kind: 'file' | 'dir' | 'other', size: number, mtimeMs: number }

export type FsStat = { kind: 'file' | 'dir' | 'other', isLink: boolean, realPath: string }

export type FsPort = {
  read: (path: string) => Promise<string>
  write: (path: string, text: string) => Promise<void>
  exists: (path: string) => Promise<boolean>
  list: (path: string) => Promise<FsEntryLike[]>
  stat: (path: string) => Promise<FsStat | undefined>
}

export type EraseLock = { owner: string, now: () => number, wait: (ms: number) => Promise<void> }

export type EraseResult = { emptied: number, isComplete: boolean, isLocked: boolean }

export type Lock = { owner: string, expiresAt: number }

export type CaseSet = { cases: Case[], archived: Case[], bad: number }

export type JournalFile = { path: string, key: string, bytes: number, mtimeMs: number }

export type RunEntry = { at: number, ok: boolean, tokens: number, cases: number, traits: number, note: string }

export type StoreState = {
  version: 1, nextCaseId: number, journal: Record<string, number>, runs: RunEntry[], day: string
  tokensToday: number, runsToday: number, backoffUntil: number, lastError: string
}

export type ReadResult<T> = { value: T, isNewer: boolean, isCorrupt: boolean }

export type Sizes = { indexBytes: number, casesBytes: number, journalBytes: number, emptyFiles: number }

export class SignatureStore {
  private static readonly KNOWN_VERSION = 1
  private static readonly MAX_JOURNAL_KEYS = 2000
  private static readonly MAX_RUNS = 30
  private static readonly MAX_ROTATIONS = 8
  private static readonly MAX_DEPTH = 4
  private static readonly MAX_ENTRIES = 20000
  private static readonly MAX_TEXT = 500
  private static readonly JOURNAL_KEY = /^\d{4}-\d{2}\/[A-Za-z0-9_-]{1,200}(?:\.\d{1,3})?\.jsonl$/
  private static readonly DAY = /^\d{4}-\d{2}-\d{2}$/
  private static readonly LOCK_MS = 15 * 60 * 1000
  private static readonly ERASE_TRIES = 10
  private static readonly ERASE_PAUSE = 1000
  private static readonly LOCK_WAIT = 300
  private static readonly CASES_BUDGET = 6 * 1024 * 1024
  private static readonly ARCHIVE_BUDGET = 6 * 1024 * 1024
  private static readonly SHARD = /^\d{3,}\.jsonl$/
  private static readonly MONTH = /^\d{4}-\d{2}$/
  private static readonly JOURNAL_NAME = /^[A-Za-z0-9_-]{1,200}(?:\.\d{1,3})?\.jsonl$/
  private static readonly NAME = /^[^/\\]+$/

  static async text(fs: FsPort, path: string): Promise<string> {
    try {
      const text = await fs.read(path)
      return typeof text === 'string' ? text : ''
    } catch {
      return ''
    }
  }

  static async readSettings(fs: FsPort, files: SignatureFiles): Promise<ReadResult<Settings> & { dropped: string[] }> {
    const defaults = SignatureSettings.defaults()
    try {
      if (!SignatureStore.isRooted(files)) return { value: defaults, isNewer: false, isCorrupt: false, dropped: [] }
      const text = await SignatureStore.text(fs, files.settings)
      if (text.trim() === '') return { value: defaults, isNewer: false, isCorrupt: false, dropped: [] }
      if (FormatVersion.isNewer(text, SignatureStore.KNOWN_VERSION)) return { value: defaults, isNewer: true, isCorrupt: false, dropped: [] }
      return {
        value: SignatureSettings.parse(text),
        isNewer: false,
        isCorrupt: !SignatureStore.isObject(text),
        dropped: SignatureSettings.dropped(text)
      }
    } catch {
      return { value: defaults, isNewer: false, isCorrupt: false, dropped: [] }
    }
  }

  static async writeSettings(fs: FsPort, files: SignatureFiles, settings: Settings, realRoot: string = ''): Promise<boolean> {
    try {
      return await SignatureStore.guardedWrite(fs, files, realRoot, files.settings, SignatureSettings.serialize(settings))
    } catch {
      return false
    }
  }

  static emptyState(): StoreState {
    return { version: 1, nextCaseId: 0, journal: {}, runs: [], day: '', tokensToday: 0, runsToday: 0, backoffUntil: 0, lastError: '' }
  }

  static parseState(text: string): StoreState {
    const state = SignatureStore.emptyState()
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      return state
    }
    const root = SignatureStore.record(raw)
    if (root === undefined) return state
    state.nextCaseId = SignatureStore.count(root.nextCaseId)
    state.journal = SignatureStore.journal(root.journal)
    state.runs = SignatureStore.runs(root.runs)
    state.day = typeof root.day === 'string' && SignatureStore.DAY.test(root.day) ? root.day : ''
    state.tokensToday = SignatureStore.count(root.tokensToday)
    state.runsToday = SignatureStore.count(root.runsToday)
    state.backoffUntil = SignatureStore.count(root.backoffUntil)
    state.lastError = typeof root.lastError === 'string' ? root.lastError.slice(0, SignatureStore.MAX_TEXT) : ''
    return state
  }

  static async readState(fs: FsPort, files: SignatureFiles): Promise<ReadResult<StoreState>> {
    try {
      if (!SignatureStore.isRooted(files)) return { value: SignatureStore.emptyState(), isNewer: false, isCorrupt: false }
      const text = await SignatureStore.text(fs, files.state)
      if (text.trim() === '') return { value: SignatureStore.emptyState(), isNewer: false, isCorrupt: false }
      if (FormatVersion.isNewer(text, SignatureStore.KNOWN_VERSION)) return { value: SignatureStore.emptyState(), isNewer: true, isCorrupt: false }
      return { value: SignatureStore.parseState(text), isNewer: false, isCorrupt: !SignatureStore.isObject(text) }
    } catch {
      return { value: SignatureStore.emptyState(), isNewer: false, isCorrupt: false }
    }
  }

  static async writeState(fs: FsPort, files: SignatureFiles, state: StoreState, realRoot: string = ''): Promise<boolean> {
    try {
      return await SignatureStore.guardedWrite(fs, files, realRoot, files.state, JSON.stringify(state, null, 2) + '\n')
    } catch {
      return false
    }
  }

  static async flushJournal(
    fs: FsPort, root: string, session: string, at: number, signals: readonly Signal[], part: number, realRoot: string = ''
  ): Promise<{ part: number, written: number }> {
    const start = typeof part === 'number' && Number.isFinite(part) && part > 0 ? Math.floor(part) : 0
    try {
      if (!Array.isArray(signals) || signals.length === 0) return { part: start, written: 0 }
      const base = SignaturePaths.normalize(root)
      if (!SignatureStore.isSafeRoot(base)) return { part: start, written: 0 }
      const addition = Journal.lines(signals)
      if (addition === '') return { part: start, written: 0 }
      let used = start
      let existing = ''
      let path = ''
      for (let tries = 0; tries <= SignatureStore.MAX_ROTATIONS; tries += 1) {
        path = SignaturePaths.journalFile(base, at, session, used)
        if (!await SignatureStore.canWrite(fs, base, realRoot, path)) return { part: start, written: 0 }
        existing = await SignatureStore.text(fs, path)
        const isFull = existing !== '' && Journal.shouldRotate(Journal.byteLength(existing), addition)
        if (!isFull || tries === SignatureStore.MAX_ROTATIONS) break
        used += 1
      }
      await fs.write(path, Journal.append(existing, signals))
      return { part: used, written: signals.length }
    } catch {
      return { part: start, written: 0 }
    }
  }

  static async readIndex(fs: FsPort, files: SignatureFiles): Promise<ReadResult<TagIndexData | undefined>> {
    try {
      if (!SignatureStore.isRooted(files)) return { value: undefined, isNewer: false, isCorrupt: false }
      const text = await SignatureStore.text(fs, files.index)
      if (text.trim() === '') return { value: undefined, isNewer: false, isCorrupt: false }
      if (FormatVersion.isNewer(text, SignatureStore.KNOWN_VERSION)) return { value: undefined, isNewer: true, isCorrupt: false }
      const value = TagIndex.parse(text)
      return { value, isNewer: false, isCorrupt: value === undefined }
    } catch {
      return { value: undefined, isNewer: false, isCorrupt: false }
    }
  }

  static async sizes(fs: FsPort, files: SignatureFiles): Promise<Sizes> {
    const sizes: Sizes = { indexBytes: 0, casesBytes: 0, journalBytes: 0, emptyFiles: 0 }
    try {
      if (!SignatureStore.isRooted(files)) return sizes
      const budget = { left: SignatureStore.MAX_ENTRIES, isCut: false }
      const index = await SignatureStore.walk(fs, files.root, files.root, 0, budget)
      for (const item of index) {
        const path = item.path
        if (item.size === 0) sizes.emptyFiles += 1
        if (path === files.index) sizes.indexBytes += item.size
        else if (path.startsWith(files.cases + '/')) sizes.casesBytes += item.size
        else if (path.startsWith(files.journal + '/')) sizes.journalBytes += item.size
      }
      return sizes
    } catch {
      return sizes
    }
  }

  static async erase(fs: FsPort, files: SignatureFiles, realRoot: string = '', lock?: EraseLock): Promise<EraseResult> {
    try {
      if (!SignatureStore.isRooted(files)) return { emptied: 0, isComplete: false, isLocked: false }
      if (lock === undefined) return await SignatureStore.eraseAll(fs, files, realRoot)
      let isTaken = false
      for (let tries = 0; tries < SignatureStore.ERASE_TRIES && !isTaken; tries += 1) {
        isTaken = await SignatureStore.takeLock(fs, files, lock.owner, lock.now(), realRoot, lock.wait)
        if (!isTaken && tries < SignatureStore.ERASE_TRIES - 1) await lock.wait(SignatureStore.ERASE_PAUSE)
      }
      if (!isTaken) return { emptied: 0, isComplete: false, isLocked: true }
      return await SignatureStore.eraseAll(fs, files, realRoot)
    } catch {
      return { emptied: 0, isComplete: false, isLocked: false }
    }
  }

  static async listCursors(fs: FsPort, files: SignatureFiles): Promise<HistoryCursor[]> {
    const found: HistoryCursor[] = []
    try {
      if (!SignatureStore.isRooted(files)) return found
      const entries = await SignatureStore.entries(fs, files.root, files.history)
      for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
        if (entry.kind !== 'file' || !(entry.size > 0) || !entry.name.endsWith('.json')) continue
        const text = await SignatureStore.text(fs, files.history + '/' + entry.name)
        if (text.trim() === '' || FormatVersion.isNewer(text, SignatureStore.KNOWN_VERSION)) continue
        const cursor = HistoryScanner.parseCursor(text)
        if (cursor !== undefined) found.push(cursor)
      }
      return found
    } catch {
      return found
    }
  }

  static async resolveRoot(fs: FsPort, root: string): Promise<string> {
    try {
      const base = SignaturePaths.normalize(root)
      if (!SignatureStore.isSafeRoot(base)) return ''
      const rest: string[] = []
      let current = base
      for (let steps = 0; steps < 64; steps += 1) {
        const info = await fs.stat(current)
        if (info !== undefined && typeof info.realPath === 'string' && info.realPath !== '') {
          const real = SignaturePaths.normalize(info.realPath)
          if (!SignaturePaths.isAbsolute(real)) return ''
          return SignaturePaths.normalize(real.replace(/\/$/, '') + '/' + rest.join('/'))
        }
        if (current === '/') return ''
        const cut = current.lastIndexOf('/')
        if (cut < 0) return ''
        rest.unshift(current.slice(cut + 1))
        current = cut === 0 ? '/' : current.slice(0, cut)
      }
      return ''
    } catch {
      return ''
    }
  }

  static async takeLock(
    fs: FsPort, files: SignatureFiles, owner: string, now: number, realRoot: string, wait: (ms: number) => Promise<void>
  ): Promise<boolean> {
    try {
      if (!SignatureStore.isRooted(files) || typeof owner !== 'string' || owner === '' || !Number.isFinite(now)) return false
      const text = await SignatureStore.text(fs, files.lock)
      if (text.trim() !== '' && FormatVersion.isNewer(text, SignatureStore.KNOWN_VERSION)) return false
      const held = SignatureStore.parseLock(text)
      const isFree = held === undefined || held.owner === owner || held.expiresAt < now
      if (!isFree) return false
      const lock = { version: 1, owner, expiresAt: now + SignatureStore.LOCK_MS }
      if (!await SignatureStore.guardedWrite(fs, files, realRoot, files.lock, JSON.stringify(lock) + '\n')) return false
      await wait(SignatureStore.LOCK_WAIT)
      const again = SignatureStore.parseLock(await SignatureStore.text(fs, files.lock))
      return again !== undefined && again.owner === owner
    } catch {
      return false
    }
  }

  static async releaseLock(fs: FsPort, files: SignatureFiles, owner: string, realRoot: string): Promise<void> {
    try {
      if (!SignatureStore.isRooted(files)) return
      const held = SignatureStore.parseLock(await SignatureStore.text(fs, files.lock))
      if (held === undefined || held.owner !== owner) return
      await SignatureStore.guardedWrite(fs, files, realRoot, files.lock, '')
    } catch {
      return
    }
  }

  static async readCases(fs: FsPort, files: SignatureFiles): Promise<CaseSet> {
    const set: CaseSet = { cases: [], archived: [], bad: 0 }
    try {
      if (!SignatureStore.isRooted(files)) return set
      const active = await SignatureStore.readShards(fs, files.root, files.cases)
      const archived = await SignatureStore.readShards(fs, files.root, files.archive)
      const ids = new Set<number>()
      for (const item of active.cases) {
        ids.add(item.id)
        set.cases.push(item)
      }
      for (const item of archived.cases) {
        if (!ids.has(item.id)) set.archived.push(item)
      }
      set.bad = active.bad + archived.bad
      return set
    } catch {
      return set
    }
  }

  static async writeCases(
    fs: FsPort, files: SignatureFiles, cases: readonly Case[], archived: readonly Case[], realRoot: string
  ): Promise<boolean> {
    try {
      if (!SignatureStore.isRooted(files)) return false
      const active = SignatureStore.fit(cases, SignatureStore.CASES_BUDGET)
      const kept = new Set(active.map((item) => item.id))
      const old = SignatureStore.fit(archived.filter((item) => !kept.has(item.id)), SignatureStore.ARCHIVE_BUDGET)
      const first = await SignatureStore.writeShards(fs, files, files.cases, active, realRoot)
      const second = await SignatureStore.writeShards(fs, files, files.archive, old, realRoot)
      return first && second
    } catch {
      return false
    }
  }

  static async writeIndex(fs: FsPort, files: SignatureFiles, index: TagIndexData, realRoot: string): Promise<boolean> {
    return SignatureStore.safeWrite(fs, files, realRoot, files.index, () => TagIndex.serialize(index))
  }

  static async readProfile(fs: FsPort, files: SignatureFiles): Promise<ReadResult<ProfileData>> {
    return SignatureStore.readTolerant(fs, files, files.profile, (text) => Profile.parse(text), () => Profile.empty())
  }

  static async writeProfile(fs: FsPort, files: SignatureFiles, profile: ProfileData, realRoot: string): Promise<boolean> {
    return SignatureStore.safeWrite(fs, files, realRoot, files.profile, () => Profile.serialize(profile))
  }

  static async readOverlay(fs: FsPort, files: SignatureFiles): Promise<ReadResult<VocabularyOverlay>> {
    return SignatureStore.readTolerant(fs, files, files.vocabulary, (text) => Vocabulary.parseOverlay(text), () => Vocabulary.parseOverlay(''))
  }

  static async writeOverlay(fs: FsPort, files: SignatureFiles, overlay: VocabularyOverlay, realRoot: string): Promise<boolean> {
    return SignatureStore.safeWrite(fs, files, realRoot, files.vocabulary, () => Vocabulary.serializeOverlay(overlay))
  }

  static async readCursor(fs: FsPort, files: SignatureFiles, repoId: string): Promise<HistoryCursor | undefined> {
    try {
      if (!SignatureStore.isRooted(files)) return undefined
      const path = SignaturePaths.historyFile(files.root, repoId)
      if (!SignaturePaths.isInside(files.root, path)) return undefined
      const text = await SignatureStore.text(fs, path)
      if (text.trim() === '' || FormatVersion.isNewer(text, SignatureStore.KNOWN_VERSION)) return undefined
      return HistoryScanner.parseCursor(text)
    } catch {
      return undefined
    }
  }

  static async writeCursor(fs: FsPort, files: SignatureFiles, repoId: string, cursor: HistoryCursor, realRoot: string): Promise<boolean> {
    if (!SignatureStore.isRooted(files)) return false
    const path = SignaturePaths.historyFile(files.root, repoId)
    return SignatureStore.safeWrite(fs, files, realRoot, path, () => HistoryScanner.serializeCursor(cursor))
  }

  static async journalFiles(fs: FsPort, files: SignatureFiles): Promise<JournalFile[]> {
    const found: JournalFile[] = []
    try {
      if (!SignatureStore.isRooted(files)) return found
      for (const month of await SignatureStore.entries(fs, files.root, files.journal)) {
        if (month.kind !== 'dir' || !SignatureStore.MONTH.test(month.name)) continue
        const dir = files.journal + '/' + month.name
        for (const entry of await SignatureStore.entries(fs, files.root, dir)) {
          const bytes = typeof entry.size === 'number' && Number.isFinite(entry.size) ? entry.size : 0
          if (entry.kind !== 'file' || bytes <= 0 || !SignatureStore.JOURNAL_NAME.test(entry.name)) continue
          const mtimeMs = typeof entry.mtimeMs === 'number' && Number.isFinite(entry.mtimeMs) ? entry.mtimeMs : 0
          found.push({ path: dir + '/' + entry.name, key: month.name + '/' + entry.name, bytes, mtimeMs })
        }
      }
      return found.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    } catch {
      return found
    }
  }

  static async emptyFile(fs: FsPort, files: SignatureFiles, path: string, realRoot: string): Promise<boolean> {
    return SignatureStore.put(fs, files, realRoot, path, '')
  }

  static async quarantine(fs: FsPort, files: SignatureFiles, path: string, text: string, now: number, realRoot: string): Promise<boolean> {
    if (typeof path !== 'string' || typeof text !== 'string' || !Number.isFinite(now)) return false
    return SignatureStore.put(fs, files, realRoot, path + '.corrupt-' + Math.floor(now), text)
  }

  private static async eraseAll(fs: FsPort, files: SignatureFiles, realRoot: string): Promise<EraseResult> {
    const budget = { left: SignatureStore.MAX_ENTRIES, isCut: false }
    const found = await SignatureStore.walk(fs, files.root, files.root, 0, budget)
    let emptied = 0
    let isComplete = !budget.isCut
    let hasLock = false
    for (const item of found) {
      if (item.size === 0) continue
      if (item.path === files.lock) {
        hasLock = true
        continue
      }
      if (await SignatureStore.put(fs, files, realRoot, item.path, '')) emptied += 1
      else isComplete = false
    }
    const settings = SignatureSettings.defaults()
    settings.consent = 'declined'
    if (!await SignatureStore.writeSettings(fs, files, settings, realRoot)) isComplete = false
    if (hasLock) {
      if (await SignatureStore.put(fs, files, realRoot, files.lock, '')) emptied += 1
      else isComplete = false
    }
    return { emptied, isComplete, isLocked: false }
  }

  private static async walk(
    fs: FsPort, root: string, dir: string, depth: number, budget: { left: number, isCut: boolean }
  ): Promise<{ path: string, size: number }[]> {
    const found: { path: string, size: number }[] = []
    if (!SignaturePaths.isInside(root, dir)) return found
    if (depth > SignatureStore.MAX_DEPTH) {
      budget.isCut = true
      return found
    }
    let entries: FsEntryLike[] = []
    try {
      const listed = await fs.list(dir)
      entries = Array.isArray(listed) ? listed : []
    } catch {
      return found
    }
    for (const entry of entries) {
      if (budget.left <= 0) {
        budget.isCut = true
        break
      }
      if (!entry || typeof entry.name !== 'string' || !SignatureStore.NAME.test(entry.name) || entry.name === '.' || entry.name === '..') continue
      const path = dir + '/' + entry.name
      if (!SignaturePaths.isInside(root, path)) continue
      budget.left -= 1
      if (entry.kind === 'dir') {
        found.push(...await SignatureStore.walk(fs, root, path, depth + 1, budget))
      } else if (entry.kind === 'file') {
        const size = typeof entry.size === 'number' && Number.isFinite(entry.size) && entry.size > 0 ? entry.size : 0
        found.push({ path, size })
      }
    }
    return found
  }

  private static parseLock(text: string): Lock | undefined {
    try {
      const raw = SignatureStore.record(JSON.parse(text))
      if (raw === undefined || typeof raw.owner !== 'string' || raw.owner === '') return undefined
      if (typeof raw.expiresAt !== 'number' || !Number.isFinite(raw.expiresAt)) return undefined
      return { owner: raw.owner, expiresAt: raw.expiresAt }
    } catch {
      return undefined
    }
  }

  private static async entries(fs: FsPort, root: string, dir: string): Promise<FsEntryLike[]> {
    try {
      if (!SignaturePaths.isInside(root, dir)) return []
      const listed = await fs.list(dir)
      if (!Array.isArray(listed)) return []
      return listed.filter((entry) => entry && typeof entry.name === 'string' && SignatureStore.NAME.test(entry.name) && entry.name !== '.' && entry.name !== '..')
    } catch {
      return []
    }
  }

  private static async shardNames(fs: FsPort, root: string, dir: string): Promise<FsEntryLike[]> {
    const entries = await SignatureStore.entries(fs, root, dir)
    return entries
      .filter((entry) => entry.kind === 'file' && SignatureStore.SHARD.test(entry.name))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  }

  private static async readShards(fs: FsPort, root: string, dir: string): Promise<{ cases: Case[], bad: number }> {
    const byId = new Map<number, Case>()
    let bad = 0
    for (const entry of await SignatureStore.shardNames(fs, root, dir)) {
      if (!(entry.size > 0)) continue
      let text = ''
      try {
        text = await fs.read(dir + '/' + entry.name)
      } catch {
        bad += 1
        continue
      }
      const parsed = Cases.fromLines(typeof text === 'string' ? text : '')
      bad += parsed.bad
      for (const item of parsed.cases) byId.set(item.id, item)
    }
    return { cases: [...byId.values()].sort((a, b) => a.id - b.id), bad }
  }

  private static fit(cases: readonly Case[], limit: number): Case[] {
    const unique = new Map<number, Case>()
    for (const item of cases) unique.set(item.id, item)
    const list = [...unique.values()].sort((a, b) => a.id - b.id)
    let total = 0
    for (const item of list) total += Journal.byteLength(Cases.toLine(item)) + 1
    if (total <= limit) return list
    const order = [...list].sort((a, b) => (a.lastSeen < b.lastSeen ? -1 : a.lastSeen > b.lastSeen ? 1 : a.id - b.id))
    const dropped = new Set<number>()
    for (const item of order) {
      if (total <= limit) break
      total -= Journal.byteLength(Cases.toLine(item)) + 1
      dropped.add(item.id)
    }
    return list.filter((item) => !dropped.has(item.id))
  }

  private static async writeShards(fs: FsPort, files: SignatureFiles, dir: string, cases: readonly Case[], realRoot: string): Promise<boolean> {
    const shards = new Map<number, Case[]>()
    for (const item of cases) {
      const shard = SignaturePaths.shardOf(item.id)
      const list = shards.get(shard) ?? []
      list.push(item)
      shards.set(shard, list)
    }
    let isDone = true
    const written = new Set<string>()
    for (const [shard, list] of [...shards.entries()].sort((a, b) => a[0] - b[0])) {
      const path = SignaturePaths.shardFile(dir, shard)
      written.add(path)
      const text = list.map((item) => Cases.toLine(item)).join('\n') + '\n'
      if (!await SignatureStore.put(fs, files, realRoot, path, text)) isDone = false
    }
    for (const entry of await SignatureStore.shardNames(fs, files.root, dir)) {
      const path = dir + '/' + entry.name
      if (written.has(path) || !(entry.size > 0)) continue
      if (!await SignatureStore.put(fs, files, realRoot, path, '')) isDone = false
    }
    return isDone
  }

  private static async readTolerant<T>(
    fs: FsPort, files: SignatureFiles, path: string, parse: (text: string) => T, empty: () => T
  ): Promise<ReadResult<T>> {
    try {
      if (!SignatureStore.isRooted(files)) return { value: empty(), isNewer: false, isCorrupt: false }
      const text = await SignatureStore.text(fs, path)
      if (text.trim() === '') return { value: empty(), isNewer: false, isCorrupt: false }
      if (FormatVersion.isNewer(text, SignatureStore.KNOWN_VERSION)) return { value: empty(), isNewer: true, isCorrupt: false }
      return { value: parse(text), isNewer: false, isCorrupt: !SignatureStore.isObject(text) }
    } catch {
      return { value: empty(), isNewer: false, isCorrupt: false }
    }
  }

  private static async safeWrite(
    fs: FsPort, files: SignatureFiles, realRoot: string, path: string, render: () => string
  ): Promise<boolean> {
    try {
      return await SignatureStore.guardedWrite(fs, files, realRoot, path, render())
    } catch {
      return false
    }
  }

  private static async put(fs: FsPort, files: SignatureFiles, realRoot: string, path: string, text: string): Promise<boolean> {
    try {
      if (!SignatureStore.isRooted(files) || !await SignatureStore.canWrite(fs, files.root, realRoot, path)) return false
      await fs.write(path, text)
      return true
    } catch {
      return false
    }
  }

  private static async guardedWrite(fs: FsPort, files: SignatureFiles, realRoot: string, path: string, text: string): Promise<boolean> {
    if (!SignatureStore.isRooted(files) || !await SignatureStore.canWrite(fs, files.root, realRoot, path)) return false
    const existing = await SignatureStore.text(fs, path)
    if (existing !== '' && FormatVersion.isNewer(existing, SignatureStore.KNOWN_VERSION)) return false
    await fs.write(path, text)
    return true
  }

  private static async canWrite(fs: FsPort, root: string, realRoot: string, path: string): Promise<boolean> {
    try {
      const real = SignaturePaths.normalize(realRoot)
      if (real === '' || !SignaturePaths.isAbsolute(real) || !SignaturePaths.isInside(root, path)) return false
      const target = SignaturePaths.normalize(path)
      let ancestor = target
      for (let steps = 0; steps < 64; steps += 1) {
        if (ancestor === '/') return false
        const cut = ancestor.lastIndexOf('/')
        if (cut < 0) return false
        ancestor = cut === 0 ? '/' : ancestor.slice(0, cut)
        const info = await fs.stat(ancestor)
        if (info === undefined) continue
        if (info.kind !== 'dir' || typeof info.realPath !== 'string') return false
        const candidate = SignaturePaths.normalize(SignaturePaths.normalize(info.realPath).replace(/\/$/, '') + '/' + target.slice(ancestor.length).replace(/^\//, ''))
        if (!SignaturePaths.isInside(real, candidate)) return false
        break
      }
      const found = await fs.stat(path)
      return found === undefined || (found.kind === 'file' && !found.isLink)
    } catch {
      return false
    }
  }

  private static isRooted(files: SignatureFiles): boolean {
    if (!files || typeof files.root !== 'string') return false
    return SignatureStore.isSafeRoot(SignaturePaths.normalize(files.root))
  }

  private static isSafeRoot(root: string): boolean {
    return root !== '' && root !== '/' && SignaturePaths.isAbsolute(root) && SignaturePaths.isInside(root, root)
  }

  private static isObject(text: string): boolean {
    try {
      return SignatureStore.record(JSON.parse(text)) !== undefined
    } catch {
      return false
    }
  }

  private static record(value: unknown): Record<string, unknown> | undefined {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
    return value as Record<string, unknown>
  }

  private static count(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
  }

  private static journal(value: unknown): Record<string, number> {
    const result: Record<string, number> = {}
    const map = SignatureStore.record(value)
    if (map === undefined) return result
    let kept = 0
    for (const key of Object.keys(map)) {
      if (kept >= SignatureStore.MAX_JOURNAL_KEYS) break
      const lines = map[key]
      if (!SignatureStore.JOURNAL_KEY.test(key) || typeof lines !== 'number' || !Number.isInteger(lines) || lines < 0) continue
      result[key] = lines
      kept += 1
    }
    return result
  }

  private static runs(value: unknown): RunEntry[] {
    if (!Array.isArray(value)) return []
    const valid: RunEntry[] = []
    for (const item of value) {
      const run = SignatureStore.record(item)
      if (run === undefined || typeof run.ok !== 'boolean') continue
      const numbers = [run.at, run.tokens, run.cases, run.traits]
      if (!numbers.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0)) continue
      const note = typeof run.note === 'string' ? run.note.slice(0, SignatureStore.MAX_TEXT) : ''
      valid.push({ at: run.at as number, ok: run.ok, tokens: run.tokens as number, cases: run.cases as number, traits: run.traits as number, note })
    }
    return valid.slice(-SignatureStore.MAX_RUNS)
  }
}
