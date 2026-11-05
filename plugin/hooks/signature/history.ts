import { Redactor } from './redactor'

export type CommitFile = { path: string, added: number, deleted: number, isBinary?: boolean }

export type Commit = { sha: string, at: string, subject: string, body: string, files: CommitFile[] }

export type HistorySource = 'auto' | 'manual'

export type HistoryCursor = {
  version: 1, root: string, name: string, identities: string[], head: string, done: string[]
  scanned: number, selected: number, isComplete: boolean, source: HistorySource
}

export class HistoryScanner {
  static readonly PAGE = 500
  static readonly PER_RUN = 60
  static readonly BACKLOG = 600

  private static readonly EARLY = 30
  private static readonly MAX_DONE = 2000
  private static readonly MAX_IDENTITIES = 20
  private static readonly MAX_EMAIL = 254
  private static readonly MAX_NAME = 64
  private static readonly MAX_PATHS = 6
  private static readonly MAX_SUMMARY = 10
  private static readonly MAX_BODY = 600
  private static readonly MAX_SUBJECT = 300
  private static readonly MAX_DIFF = 3000
  private static readonly MAX_PATH = 300
  private static readonly MAX_CURSOR_TEXT = 1024 * 1024
  private static readonly MAX_COUNT = 10000000
  private static readonly SHA = /^[0-9a-f]{7,40}$/
  private static readonly EMAIL = /^[^\s@]{1,64}@[^\s@.]{1,63}(?:\.[^\s@.]{1,63}){1,8}$/
  private static readonly HEADER = /^[0-9a-f]{7,40}\u001f/
  private static readonly NUMSTAT = /^(\d+|-)\t(\d+|-)\t[^\n]+$/
  private static readonly UNSAFE_NAME = /[^A-Za-z0-9._-]/g
  private static readonly REVERT = /\b(?:revert|fixup|undo|rollback)\b|Revert "/i
  private static readonly WHY = /\b(?:because|so that|to avoid|instead of|pour|afin)\b/i
  private static readonly REFACTOR = /\brefactor/i
  private static readonly FORMATTING = /\b(?:format|formatting|reformat|whitespace|prettier)\b/i
  private static readonly SECURITY = /auth|crypto|permission|secret|token|guard|sanitize|validate|(?:^|\/)\.env|settings\.json/i
  private static readonly PROJECT = /(?:^|\/)(?:\.claude\/|claude\.md$|rules\/|\.github\/workflows\/|\.gitlab-ci\.yml$|\.circleci\/|jenkinsfile$|azure-pipelines\.yml$)/i
  private static readonly MANIFEST = /(?:^|\/)(?:package\.json|cargo\.toml|pyproject\.toml|requirements\.txt|go\.mod|gemfile|composer\.json|pom\.xml|build\.gradle|build\.gradle\.kts|deno\.json)$/i
  private static readonly TEST = /(?:^|\/)(?:tests?|__tests__|specs?)\/|\.(?:test|spec)\.|_test\.|(?:^|\/)test_[^/]*$/i

  private static readonly LOCKS: ReadonlySet<string> = new Set([
    'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'cargo.lock', 'poetry.lock', 'gemfile.lock', 'composer.lock', 'go.sum'
  ])

  private static readonly GENERATED_DIRS: readonly string[] = ['dist', 'build', 'vendor', 'node_modules']

  private static readonly SECRET_EXTENSIONS: readonly string[] = ['.pem', '.key', '.p12', '.pfx', '.env', '.jks', '.keystore', '.p8', '.kdbx']

  private static readonly SECRET_PREFIXES: readonly string[] = ['.env', 'id_', 'credentials']

  private static readonly SECRET_PARTS: readonly string[] = ['.env.', '.tfstate']

  private static readonly SECRET_NAMES: ReadonlySet<string> = new Set([
    '.git-credentials', '.npmrc', '.netrc', '.pypirc', '.htpasswd', 'kubeconfig', 'secrets.yml', 'secrets.yaml'
  ])

  private static readonly FORGED = /^[+-]?\s*\[(?:commit|episode) /

  private static readonly BINARY_EXTENSIONS: ReadonlySet<string> = new Set([
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'pdf', 'zip', 'gz', 'tgz', 'jar', 'woff', 'woff2', 'ttf', 'eot', 'mp4', 'mov'
  ])

  static isSha(text: string): boolean {
    return typeof text === 'string' && HistoryScanner.SHA.test(text)
  }

  static isIdentity(text: string): boolean {
    return typeof text === 'string' && text.length <= HistoryScanner.MAX_EMAIL && HistoryScanner.EMAIL.test(text)
  }

  static repoName(root: string): string {
    if (typeof root !== 'string') return 'repo'
    const parts = root.split(/[\\/]/).filter((part) => part !== '')
    const base = (parts[parts.length - 1] ?? '').replace(HistoryScanner.UNSAFE_NAME, '-').slice(0, HistoryScanner.MAX_NAME)
    if (base === '' || /^\.+$/.test(base)) return 'repo'
    return base
  }

  static logArgs(identities: readonly string[], skip: number, count: number, since: string = ''): string[] {
    const valid = Array.isArray(identities) ? identities.filter((identity) => HistoryScanner.isIdentity(identity)) : []
    if (valid.length === 0) return []
    return [
      'log', '--no-merges', '--no-color',
      ...valid.map((identity) => '--author=' + identity),
      '--no-textconv', '--format=%H%x1f%aI%x1f%s%x1f%b%x1e', '--numstat',
      '--skip=' + HistoryScanner.int(skip, 0), '-n', String(Math.max(1, HistoryScanner.int(count, 1))),
      ...(HistoryScanner.isSha(since) ? [since + '..HEAD'] : [])
    ]
  }

  static parseLog(stdout: string): Commit[] {
    const commits: Commit[] = []
    if (typeof stdout !== 'string' || stdout === '') return commits
    let current: Commit | undefined
    for (const chunk of stdout.split('\u001e')) {
      const lines = chunk.split('\n')
      let header = -1
      for (let index = 0; index < lines.length; index += 1) {
        if (HistoryScanner.HEADER.test(lines[index] ?? '')) {
          header = index
          break
        }
      }
      const stat = header < 0 ? lines : lines.slice(0, header)
      if (current !== undefined) HistoryScanner.addFiles(current, stat)
      if (header < 0) continue
      const commit = HistoryScanner.header(lines.slice(header).join('\n'))
      if (commit === undefined) continue
      commits.push(commit)
      current = commit
    }
    return commits
  }

  static isNoise(path: string): boolean {
    if (typeof path !== 'string' || path === '') return false
    const lower = path.toLowerCase().replace(/\\/g, '/')
    const segments = lower.split('/')
    const base = segments[segments.length - 1] ?? ''
    if (HistoryScanner.LOCKS.has(base)) return true
    if (base.includes('.min.') || HistoryScanner.SECRET_NAMES.has(base)) return true
    if (HistoryScanner.SECRET_PARTS.some((part) => base.includes(part))) return true
    for (let index = 0; index < segments.length - 1; index += 1) {
      if (HistoryScanner.GENERATED_DIRS.includes(segments[index] ?? '')) return true
    }
    if (HistoryScanner.SECRET_PREFIXES.some((prefix) => base.startsWith(prefix))) return true
    if (HistoryScanner.SECRET_EXTENSIONS.some((extension) => base.endsWith(extension))) return true
    if (base.endsWith('.json') && (base.startsWith('service-account') || base.startsWith('gcloud') || base.includes('secret') || base.includes('credential'))) return true
    const dot = base.lastIndexOf('.')
    return dot >= 0 && HistoryScanner.BINARY_EXTENSIONS.has(base.slice(dot + 1))
  }

  static priority(commit: Commit, isEarly: boolean): number {
    const subject = typeof commit.subject === 'string' ? commit.subject : ''
    const body = typeof commit.body === 'string' ? commit.body : ''
    const files = Array.isArray(commit.files) ? commit.files : []
    const real = files.filter((file) => !HistoryScanner.isNoise(file.path))
    let points = 0
    if (HistoryScanner.REVERT.test(subject) || HistoryScanner.REVERT.test(body.slice(0, 2000))) points += 5
    if (real.some((file) => HistoryScanner.SECURITY.test(file.path))) points += 4
    if (real.some((file) => HistoryScanner.PROJECT.test(file.path) || HistoryScanner.MANIFEST.test(file.path))) points += 4
    if (isEarly === true) points += 4
    if (HistoryScanner.REFACTOR.test(subject) || HistoryScanner.isBalanced(real)) points += 3
    const bodyLines = body.split('\n').filter((line) => line.trim() !== '').length
    if (HistoryScanner.WHY.test(subject) || bodyLines >= 2) points += 2
    if (real.length > 0 && real.every((file) => HistoryScanner.TEST.test(file.path))) points += 1
    const isOnlyNoise = files.length > 0 && real.length === 0
    const isFormatting = files.length > 0 && HistoryScanner.FORMATTING.test(subject) && files.every((file) => file.added === file.deleted)
    if (isOnlyNoise || isFormatting) points -= 5
    return points
  }

  static select(commits: readonly Commit[], cursor: HistoryCursor, earliest: ReadonlySet<string>): Commit[] {
    if (!Array.isArray(commits)) return []
    const room = Math.max(0, HistoryScanner.BACKLOG - HistoryScanner.int(cursor.selected, 0))
    if (room === 0) return []
    const done = new Set(cursor.done)
    const seen = new Set<string>()
    const ranked: { commit: Commit, score: number, time: number, isEarly: boolean }[] = []
    for (const commit of commits) {
      if (done.has(commit.sha) || seen.has(commit.sha)) continue
      seen.add(commit.sha)
      const isEarly = earliest.has(commit.sha)
      const score = HistoryScanner.priority(commit, isEarly)
      if (score < 0) continue
      const time = Date.parse(commit.at)
      ranked.push({ commit, score, time: Number.isNaN(time) ? 0 : time, isEarly })
    }
    ranked.sort((left, right) => right.score - left.score || right.time - left.time)
    const picked = ranked.slice(0, HistoryScanner.PER_RUN)
    if (cursor.done.length === 0) {
      const chosen = new Set(picked.map((item) => item.commit.sha))
      const early = ranked.filter((item) => item.isEarly && !chosen.has(item.commit.sha)).slice(0, HistoryScanner.EARLY)
      picked.push(...early)
    }
    return picked.slice(0, room).map((item) => item.commit)
  }

  static showArgs(sha: string, paths: readonly string[]): string[] {
    if (!HistoryScanner.isSha(sha) || !Array.isArray(paths)) return []
    const kept = paths
      .filter((path) => typeof path === 'string' && path !== '' && path.length <= HistoryScanner.MAX_PATH && !/[\n\r\0]/.test(path) && !HistoryScanner.isNoise(path))
      .slice(0, HistoryScanner.MAX_PATHS)
    if (kept.length === 0) return []
    return ['show', '--format=', '--unified=1', '--no-color', '--no-ext-diff', '--no-textconv', sha, '--', ...kept.map((path) => ':(literal)' + path)]
  }

  static diffPaths(commit: Commit): string[] {
    const files = Array.isArray(commit.files) ? commit.files : []
    return files.filter((file) => file.isBinary !== true && !HistoryScanner.isNoise(file.path)).map((file) => file.path)
  }

  static excerpt(repo: string, commit: Commit, diff: string, home: string): { id: string, text: string } {
    const name = HistoryScanner.repoName(repo)
    const id = 'commit:' + name + ':' + String(commit.sha).slice(0, 7)
    const date = typeof commit.at === 'string' ? commit.at.slice(0, 10) : ''
    const files = Array.isArray(commit.files) ? commit.files : []
    const summary = files.slice(0, HistoryScanner.MAX_SUMMARY)
      .map((file) => Redactor.clean(file.path, HistoryScanner.MAX_PATH, home) + ' (+' + file.added + ' -' + file.deleted + ')')
    const parts = [
      '[commit ' + id + ' · ' + date + ']',
      HistoryScanner.unforged(Redactor.clean(commit.subject, HistoryScanner.MAX_SUBJECT, home))
    ]
    const body = HistoryScanner.unforged(Redactor.clean(commit.body, HistoryScanner.MAX_BODY, home)).trim()
    if (body !== '') parts.push(body)
    if (summary.length > 0) {
      const more = files.length > summary.length ? ' and ' + (files.length - summary.length) + ' more' : ''
      parts.push('files: ' + summary.join(', ') + more)
    }
    const patch = HistoryScanner.unforged(Redactor.clean(diff, HistoryScanner.MAX_DIFF, home)).trim()
    if (patch !== '') parts.push(patch)
    return { id, text: parts.join('\n') }
  }

  static emptyCursor(root: string, name: string, source: HistorySource): HistoryCursor {
    return {
      version: 1, root, name, identities: [], head: '', done: [], scanned: 0, selected: 0, isComplete: false,
      source: source === 'manual' ? 'manual' : 'auto'
    }
  }

  static parseCursor(text: string): HistoryCursor | undefined {
    if (typeof text !== 'string' || text.length > HistoryScanner.MAX_CURSOR_TEXT) return undefined
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      return undefined
    }
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined
    const data = raw as Record<string, unknown>
    if (data.version !== 1 || typeof data.root !== 'string' || data.root === '') return undefined
    const identities = Array.isArray(data.identities)
      ? [...new Set(data.identities.filter((item): item is string => typeof item === 'string' && HistoryScanner.isIdentity(item)))].slice(0, HistoryScanner.MAX_IDENTITIES)
      : []
    const done = Array.isArray(data.done)
      ? [...new Set(data.done.filter((item): item is string => typeof item === 'string' && HistoryScanner.isSha(item)))].slice(-HistoryScanner.MAX_DONE)
      : []
    const flag = typeof data.isComplete === 'boolean' ? data.isComplete : data.complete
    return {
      version: 1,
      root: data.root,
      name: typeof data.name === 'string' && data.name !== '' ? data.name.slice(0, HistoryScanner.MAX_NAME) : HistoryScanner.repoName(data.root),
      identities,
      head: typeof data.head === 'string' && HistoryScanner.isSha(data.head) ? data.head : '',
      done,
      scanned: HistoryScanner.int(data.scanned, 0),
      selected: HistoryScanner.int(data.selected, 0),
      isComplete: flag === true,
      source: data.source === 'manual' ? 'manual' : 'auto'
    }
  }

  static serializeCursor(cursor: HistoryCursor): string {
    return JSON.stringify(cursor, null, 2) + '\n'
  }

  static remember(cursor: HistoryCursor, shas: readonly string[], head: string): HistoryCursor {
    const known = new Set(cursor.done)
    const added: string[] = []
    for (const sha of Array.isArray(shas) ? shas : []) {
      if (!HistoryScanner.isSha(sha) || known.has(sha)) continue
      known.add(sha)
      added.push(sha)
    }
    return {
      ...cursor,
      done: [...cursor.done, ...added].slice(-HistoryScanner.MAX_DONE),
      selected: cursor.selected + (Array.isArray(shas) ? shas.length : 0),
      head: HistoryScanner.isSha(head) ? head : cursor.head
    }
  }

  private static unforged(text: string): string {
    return text.split('\n').filter((line) => !HistoryScanner.FORGED.test(line.trim())).join('\n')
  }

  private static int(value: unknown, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
    return Math.min(HistoryScanner.MAX_COUNT, Math.max(0, Math.floor(value)))
  }

  private static isBalanced(files: readonly CommitFile[]): boolean {
    if (files.length < 10) return false
    let added = 0
    let deleted = 0
    for (const file of files) {
      added += file.added
      deleted += file.deleted
    }
    const high = Math.max(added, deleted)
    return high > 0 && Math.min(added, deleted) / high >= 0.5
  }

  private static header(text: string): Commit | undefined {
    const first = text.indexOf('\u001f')
    const second = text.indexOf('\u001f', first + 1)
    const third = text.indexOf('\u001f', second + 1)
    if (first < 0 || second < 0) return undefined
    const sha = text.slice(0, first)
    if (!HistoryScanner.isSha(sha)) return undefined
    const subject = third < 0 ? text.slice(second + 1) : text.slice(second + 1, third)
    return {
      sha,
      at: text.slice(first + 1, second),
      subject: subject.trim(),
      body: third < 0 ? '' : text.slice(third + 1).trim(),
      files: []
    }
  }

  private static addFiles(commit: Commit, lines: readonly string[]): void {
    for (const line of lines) {
      const file = HistoryScanner.numstat(line.replace(/\r$/, ''))
      if (file !== undefined) commit.files.push(file)
    }
  }

  private static numstat(line: string): CommitFile | undefined {
    if (!HistoryScanner.NUMSTAT.test(line)) return undefined
    const parts = line.split('\t')
    const path = HistoryScanner.renamed(parts.slice(2).join('\t'))
    if (path === '') return undefined
    const file: CommitFile = {
      path,
      added: parts[0] === '-' ? 0 : HistoryScanner.int(Number(parts[0]), 0),
      deleted: parts[1] === '-' ? 0 : HistoryScanner.int(Number(parts[1]), 0)
    }
    if (parts[0] === '-' && parts[1] === '-') file.isBinary = true
    return file
  }

  private static renamed(path: string): string {
    const arrow = path.indexOf(' => ')
    if (arrow < 0) return path
    const open = path.lastIndexOf('{', arrow)
    const close = path.indexOf('}', arrow)
    if (open >= 0 && close > arrow) {
      const merged = path.slice(0, open) + path.slice(arrow + 4, close) + path.slice(close + 1)
      return merged.replace(/\/{2,}/g, '/')
    }
    return path.slice(arrow + 4)
  }
}
