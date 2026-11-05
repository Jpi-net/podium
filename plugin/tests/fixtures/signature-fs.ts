import { Cases, type Case } from '../../hooks/signature/cases'
import { Journal } from '../../hooks/signature/journal'
import { SignaturePaths, type SignatureFiles } from '../../hooks/signature/paths'
import type { GitPort } from '../../hooks/signature/signature'
import type { ModelAnswer, ModelPort, ModelRequest } from '../../hooks/signature/learner'
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
  private refusing: Set<string> | undefined
  private writeHook: ((path: string) => void) | undefined

  seed(path: string, text: string): MemoryFs {
    this.clock += 1
    this.files.set(path, { text, mtimeMs: this.clock })
    return this
  }

  mkdir(path: string): MemoryFs {
    this.directories.add(path)
    return this
  }

  touch(path: string, mtimeMs: number): MemoryFs {
    const file = this.files.get(path)
    if (file !== undefined) file.mtimeMs = mtimeMs
    return this
  }

  onWrite(hook: (path: string) => void): MemoryFs {
    this.writeHook = hook
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

  refuseWritesExcept(...allowed: string[]): MemoryFs {
    this.refusing = new Set(allowed)
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
    if (this.brokenWrites.has(path) || (this.refusing !== undefined && !this.refusing.has(path))) throw new Error('write failed')
    this.clock += 1
    this.files.set(path, { text, mtimeMs: this.clock })
    this.writeHook?.(path)
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

  static line(value: Case): string {
    return Cases.toLine(value) + '\n'
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

export type GitResult = { exitCode: number, stdout: string }

export class ScriptedGit {
  readonly calls: string[][] = []
  readonly cwds: string[] = []
  readonly port: GitPort = (argv, cwd) => this.answer(argv, cwd)
  private pages: string[] = []
  private page = 0
  private readonly diffs = new Map<string, string>()
  private emailText = ''
  private headSha = ''
  private toplevel = ''
  private readonly failing = new Set<string>()
  private isCrashing = false
  private readonly failingOnce = new Set<string>()

  log(pages: string[]): ScriptedGit {
    this.pages = pages
    this.page = 0
    return this
  }

  show(sha: string, diff: string): ScriptedGit {
    this.diffs.set(sha, diff)
    return this
  }

  email(text: string): ScriptedGit {
    this.emailText = text
    return this
  }

  head(sha: string): ScriptedGit {
    this.headSha = sha
    return this
  }

  top(path: string): ScriptedGit {
    this.toplevel = path
    return this
  }

  crash(): ScriptedGit {
    this.isCrashing = true
    return this
  }

  failOnce(subcommand: string): ScriptedGit {
    this.failingOnce.add(subcommand)
    return this
  }

  fail(subcommand: string): ScriptedGit {
    this.failing.add(subcommand)
    return this
  }

  subcommands(): string[] {
    return this.calls.map((argv) => ScriptedGit.parse(argv).sub)
  }

  private async answer(argv: readonly string[], cwd: string): Promise<GitResult> {
    this.calls.push([...argv])
    if (this.isCrashing) throw new Error('git crashed')
    const parsed = ScriptedGit.parse(argv)
    this.cwds.push(parsed.root ?? cwd)
    const sub = parsed.sub
    if (this.failingOnce.delete(sub)) return { exitCode: 1, stdout: '' }
    if (this.failing.has(sub)) return { exitCode: 1, stdout: '' }
    if (sub === 'log') {
      const stdout = this.pages[this.page] ?? ''
      this.page += 1
      return { exitCode: 0, stdout }
    }
    if (sub === 'show') {
      const sha = argv.find((item) => /^[0-9a-f]{7,40}$/.test(item)) ?? ''
      return { exitCode: 0, stdout: this.diffs.get(sha) ?? '' }
    }
    if (sub === 'config') {
      return this.emailText === '' ? { exitCode: 1, stdout: '' } : { exitCode: 0, stdout: this.emailText + '\n' }
    }
    if (sub === 'rev-parse') {
      const value = argv.includes('--show-toplevel') ? this.toplevel : this.headSha
      return value === '' ? { exitCode: 128, stdout: '' } : { exitCode: 0, stdout: value + '\n' }
    }
    return { exitCode: 0, stdout: '' }
  }

  private static parse(argv: readonly string[]): { sub: string, root: string | undefined } {
    let root: string | undefined
    let index = 0
    while (index < argv.length) {
      const item = argv[index] ?? ''
      if (item === 'git' || item === '--no-optional-locks') index += 1
      else if (item === '-c') index += 2
      else if (item === '-C') {
        root = argv[index + 1]
        index += 2
      } else break
    }
    return { sub: argv[index] ?? '', root }
  }
}

export class ScriptedModel {
  readonly requests: ModelRequest[] = []
  readonly port: ModelPort = (request) => this.answer(request)
  private readonly queue: (ModelAnswer | Error)[] = []
  private fallback: ModelAnswer | Error | undefined
  private hook: ((request: ModelRequest, count: number) => void) | undefined

  static ok(text: string, inputTokens = 100, outputTokens = 50): ModelAnswer {
    return { isAnswered: true, text, reason: '', inputTokens, outputTokens }
  }

  static failed(reason: string): ModelAnswer {
    return { isAnswered: false, text: '', reason, inputTokens: 0, outputTokens: 0 }
  }

  next(...answers: (ModelAnswer | Error)[]): ScriptedModel {
    this.queue.push(...answers)
    return this
  }

  always(answer: ModelAnswer | Error): ScriptedModel {
    this.fallback = answer
    return this
  }

  during(hook: (request: ModelRequest, count: number) => void): ScriptedModel {
    this.hook = hook
    return this
  }

  crash(): ScriptedModel {
    return this.always(new Error('model crashed'))
  }

  private async answer(request: ModelRequest): Promise<ModelAnswer> {
    this.requests.push(request)
    this.hook?.(request, this.requests.length)
    const item = this.queue.shift() ?? this.fallback ?? ScriptedModel.failed('queue empty')
    if (item instanceof Error) throw item
    return item
  }
}

export class LearnSeed {
  static readonly NOW = Date.UTC(2026, 10, 5, 12)
  static readonly BASE = Date.UTC(2026, 10, 4, 10)
  static readonly KEY = '2026-11/s1.jsonl'
  static readonly SHA = 'a'.repeat(40)
  static readonly HEAD = 'b'.repeat(40)

  static evidence(index: number, session = 's1'): string {
    return `session:${session}:${LearnSeed.BASE + index * 1000}`
  }

  static commitEvidence(): string {
    return 'commit:repo:aaaaaaa'
  }

  static prompt(index: number, text = 'always validate the input before use', session = 's1'): Signal {
    return {
      v: 1,
      at: LearnSeed.BASE + index * 1000,
      session,
      project: 'podium',
      projectId: 'p1',
      stack: ['node'],
      kind: 'prompt',
      data: { length: text.length, language: 'en', command: '', excerpt: text, isCorrection: false, afterAbort: false }
    }
  }

  static prompts(fs: MemoryFs, count: number, key = LearnSeed.KEY, session = 's1', text?: string): MemoryFs {
    const signals = Array.from({ length: count }, (_, index) => LearnSeed.prompt(index, text, session))
    return fs.seed(SignatureStoreFixture.ROOT + '/journal/' + key, Journal.lines(signals))
  }

  static raw(partial: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      situation: 'Reading a user-editable config value in a hook',
      options: ['Validate', 'Trust'],
      choice: 'Validate it and fall back to a default',
      why: 'To never crash on a bad value',
      kind: 'choice',
      tags: ['fail-open'],
      evidence: [LearnSeed.evidence(0)],
      ...partial
    }
  }

  static answer(cases: unknown[], candidateTags: unknown[] = []): string {
    return JSON.stringify({ cases, candidateTags })
  }

  static candidate(tag = 'rate-limit', parent = 'security'): Record<string, unknown> {
    return { tag, facet: 'concept', parent, aliases: ['throttling'], why: 'seen often' }
  }

  static log(sha = LearnSeed.SHA, subject = 'Add feature', numstat: string[] = ['3\t1\tsrc/a.ts']): string {
    return `${sha}\u001f2026-01-02T10:00:00+00:00\u001f${subject}\u001f\u001e\n\n${numstat.join('\n')}\n`
  }

  static state(fs: MemoryFs, partial: Record<string, unknown>): MemoryFs {
    return fs.seed(SignatureStoreFixture.ROOT + '/state.json', JSON.stringify({ version: 1, ...partial }))
  }

  static failures(count: number): unknown[] {
    return Array.from({ length: count }, (_, index) => ({ at: index + 1, ok: false, tokens: 0, cases: 0, traits: 0, note: '' }))
  }

  static cases(fs: MemoryFs, cases: readonly Case[], dir = 'cases'): MemoryFs {
    const lines = cases.map((item) => SignatureStoreFixture.line(item)).join('')
    return fs.seed(SignatureStoreFixture.ROOT + '/' + dir + '/000.jsonl', lines)
  }
}
