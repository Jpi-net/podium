import { FormatVersion } from './format-version'
import { Journal } from './journal'
import { SignaturePaths, type SignatureFiles } from './paths'
import { SignatureSettings, type Settings } from './settings'
import type { Signal } from './signals'
import { TagIndex, type TagIndexData } from './tag-index'

export type FsEntryLike = { name: string, kind: 'file' | 'dir' | 'other', size: number, mtimeMs: number }

export type FsStat = { kind: 'file' | 'dir' | 'other', isLink: boolean, realPath: string }

export type FsPort = {
  read: (path: string) => Promise<string>
  write: (path: string, text: string) => Promise<void>
  exists: (path: string) => Promise<boolean>
  list: (path: string) => Promise<FsEntryLike[]>
  stat: (path: string) => Promise<FsStat | undefined>
}

export type EraseResult = { emptied: number, isComplete: boolean }

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

  static async erase(fs: FsPort, files: SignatureFiles, realRoot: string = ''): Promise<EraseResult> {
    try {
      if (!SignatureStore.isRooted(files)) return { emptied: 0, isComplete: false }
      const budget = { left: SignatureStore.MAX_ENTRIES, isCut: false }
      const found = await SignatureStore.walk(fs, files.root, files.root, 0, budget)
      let emptied = 0
      let isComplete = !budget.isCut
      for (const item of found) {
        if (item.size === 0) continue
        try {
          if (!await SignatureStore.canWrite(fs, files.root, realRoot, item.path)) {
            isComplete = false
            continue
          }
          await fs.write(item.path, '')
          emptied += 1
        } catch {
          isComplete = false
        }
      }
      const settings = SignatureSettings.defaults()
      settings.consent = 'declined'
      if (!await SignatureStore.writeSettings(fs, files, settings, realRoot)) isComplete = false
      return { emptied, isComplete }
    } catch {
      return { emptied: 0, isComplete: false }
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
