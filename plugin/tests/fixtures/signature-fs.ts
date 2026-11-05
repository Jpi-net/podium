import { Journal } from '../../hooks/signature/journal'
import { SignaturePaths, type SignatureFiles } from '../../hooks/signature/paths'
import type { SignalContext, Signal, SignalKind } from '../../hooks/signature/signals'
import type { FsEntryLike, FsPort, FsStat } from '../../hooks/signature/store'

export class MemoryFs implements FsPort {
  readonly files = new Map<string, { text: string, mtimeMs: number }>()
  readonly links = new Map<string, number>()
  readonly realPaths = new Map<string, string>()
  readonly directories = new Set<string>()
  readonly writes: string[] = []
  readonly calls: string[] = []
  private readonly brokenReads = new Set<string>()
  private readonly brokenWrites = new Set<string>()
  private clock = 1000

  seed(path: string, text: string): MemoryFs {
    this.clock += 1
    this.files.set(path, { text, mtimeMs: this.clock })
    return this
  }

  mkdir(path: string): MemoryFs {
    this.directories.add(path)
    return this
  }

  link(path: string, size: number): MemoryFs {
    this.links.set(path, size)
    return this
  }

  failRead(path: string): MemoryFs {
    this.brokenReads.add(path)
    return this
  }

  failWrite(path: string): MemoryFs {
    this.brokenWrites.add(path)
    return this
  }

  text(path: string): string | undefined {
    return this.files.get(path)?.text
  }

  async read(path: string): Promise<string> {
    this.calls.push('read ' + path)
    if (this.brokenReads.has(path)) throw new Error('read failed')
    const file = this.files.get(path)
    if (file === undefined) throw new Error('missing')
    return file.text
  }

  async write(path: string, text: string): Promise<void> {
    this.calls.push('write ' + path)
    this.writes.push(path)
    if (this.brokenWrites.has(path)) throw new Error('write failed')
    this.clock += 1
    this.files.set(path, { text, mtimeMs: this.clock })
  }

  async exists(path: string): Promise<boolean> {
    this.calls.push('exists ' + path)
    if (this.files.has(path) || this.directories.has(path)) return true
    const prefix = path + '/'
    return [...this.files.keys()].some((key) => key.startsWith(prefix))
  }

  alias(path: string, real: string): MemoryFs {
    this.realPaths.set(path, real)
    return this
  }

  real(path: string): string {
    for (const [from, to] of this.realPaths) {
      if (path === from) return to
      if (path.startsWith(from + '/')) return to + path.slice(from.length)
    }
    return path
  }

  async stat(path: string): Promise<FsStat | undefined> {
    this.calls.push('stat ' + path)
    if (path === '/' || /^[A-Za-z]:\/?$/.test(path)) return { kind: 'dir', isLink: false, realPath: path }
    if (this.links.has(path)) return { kind: 'other', isLink: true, realPath: this.real(path) }
    if (this.files.has(path)) return { kind: 'file', isLink: false, realPath: this.real(path) }
    if (await this.exists(path)) return { kind: 'dir', isLink: this.realPaths.has(path), realPath: this.real(path) }
    return undefined
  }

  async list(path: string): Promise<FsEntryLike[]> {
    this.calls.push('list ' + path)
    const prefix = path + '/'
    const entries = new Map<string, FsEntryLike>()
    for (const [key, file] of this.files) {
      if (!key.startsWith(prefix)) continue
      const rest = key.slice(prefix.length)
      const slash = rest.indexOf('/')
      if (slash < 0) entries.set(rest, { name: rest, kind: 'file', size: Journal.byteLength(file.text), mtimeMs: file.mtimeMs })
      else entries.set(rest.slice(0, slash), { name: rest.slice(0, slash), kind: 'dir', size: 0, mtimeMs: file.mtimeMs })
    }
    for (const directory of this.directories) {
      if (!directory.startsWith(prefix)) continue
      const name = directory.slice(prefix.length).split('/')[0] ?? ''
      if (name !== '' && !entries.has(name)) entries.set(name, { name, kind: 'dir', size: 0, mtimeMs: 0 })
    }
    for (const [key, size] of this.links) {
      if (!key.startsWith(prefix) || key.slice(prefix.length).includes('/')) continue
      const name = key.slice(prefix.length)
      entries.set(name, { name, kind: 'other', size, mtimeMs: 0 })
    }
    return [...entries.values()]
  }
}

export class SignatureStoreFixture {
  static readonly ROOT = '/r/podium'
  static readonly AT = Date.UTC(2026, 10, 5)

  static files(root: string = SignatureStoreFixture.ROOT): SignatureFiles {
    return SignaturePaths.files(root)
  }

  static context(partial: Partial<SignalContext> = {}): SignalContext {
    return { session: 's1', project: 'podium', projectId: 'abcd1234', stack: ['typescript'], home: '/Users/j', at: 1000, ...partial }
  }

  static signal(index = 0, kind: SignalKind = 'prompt'): Signal {
    return { v: 1, at: 1000 + index, session: 's1', project: 'podium', projectId: 'abcd1234', stack: ['typescript'], kind, data: { index } }
  }

  static signals(count: number): Signal[] {
    return Array.from({ length: count }, (_, index) => SignatureStoreFixture.signal(index))
  }

  static runs(count: number): unknown[] {
    return Array.from({ length: count }, (_, index) => ({ at: index, ok: true, tokens: 1, cases: 1, traits: 1, note: '' }))
  }

  static fresh(): MemoryFs {
    return new MemoryFs().mkdir(SignatureStoreFixture.ROOT)
  }

  static badRoots(): string[] {
    return ['', 'relative/podium', '/']
  }

  static filled(): MemoryFs {
    const files = SignatureStoreFixture.files()
    return new MemoryFs()
      .seed(files.settings, '{"version":1,"consent":"enabled"}')
      .seed(files.state, '{"version":1}')
      .seed(files.index, 'abc')
      .seed(files.cases + '/000.jsonl', 'x'.repeat(10))
      .seed(files.cases + '/001.jsonl', '')
      .seed(files.journal + '/2026-11/s1.jsonl', 'éé')
      .seed(files.journal + '/2026-10/s0.jsonl', 'line\n')
  }
}
