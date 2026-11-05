import { expect, test } from 'claude-code/testing'
import { HistoryScanner, type Commit, type CommitFile, type HistoryCursor } from '../hooks/signature/history'
import { ScriptedGit } from './fixtures/signature-fs'

class HistoryFixture {
  static sha(index: number): string {
    return index.toString(16).padStart(40, '0')
  }

  static commit(partial: Partial<Commit> = {}): Commit {
    return { sha: HistoryFixture.sha(1), at: '2026-01-02T10:00:00+00:00', subject: 'Add feature', body: '', files: [HistoryFixture.file('src/a.ts')], ...partial }
  }

  static file(path: string, added = 1, deleted = 1): CommitFile {
    return { path, added, deleted }
  }

  static record(commit: Commit, numstat: string[]): string {
    return `${commit.sha}\u001f${commit.at}\u001f${commit.subject}\u001f${commit.body}\u001e\n\n${numstat.join('\n')}\n`
  }

  static cursor(partial: Partial<HistoryCursor> = {}): HistoryCursor {
    return { ...HistoryScanner.emptyCursor('/r/repo', 'repo', 'auto'), ...partial }
  }

  static score(partial: Partial<Commit>, isEarly = false): number {
    return HistoryScanner.priority(HistoryFixture.commit(partial), isEarly)
  }
}

test('isSha accepts lower case hexadecimal of 7 to 40 characters', () => {
  // Assert
  expect([HistoryScanner.isSha('abc1234'), HistoryScanner.isSha('a'.repeat(40))]).toEqual([true, true])
})

test('isSha rejects short, long, upper case and non hexadecimal text', () => {
  // Assert
  expect(['abc123', 'a'.repeat(41), 'ABC1234', 'zzzzzzz', '--help', ''].map((text) => HistoryScanner.isSha(text))).toEqual([false, false, false, false, false, false])
})

test('isSha rejects a non-string', () => {
  // Assert
  expect(HistoryScanner.isSha(undefined as never)).toBe(false)
})

test('isIdentity accepts an email address', () => {
  // Assert
  expect(HistoryScanner.isIdentity('jo@example.com')).toBe(true)
})

test('isIdentity rejects text that is not an email', () => {
  // Assert
  expect(['jo', 'jo@example', 'j o@example.com', '--author=x', ''].map((text) => HistoryScanner.isIdentity(text))).toEqual([false, false, false, false, false])
})

test('isIdentity rejects an address longer than 254 characters', () => {
  // Assert
  expect(HistoryScanner.isIdentity('a'.repeat(64) + '@' + ('b'.repeat(63) + '.').repeat(3) + 'com')).toBe(false)
})

test('repoName takes the last path segment', () => {
  // Assert
  expect(HistoryScanner.repoName('/home/j/podium')).toBe('podium')
})

test('repoName takes the last segment of a Windows path', () => {
  // Assert
  expect(HistoryScanner.repoName('C:\\work\\app')).toBe('app')
})

test('repoName ignores a trailing slash', () => {
  // Assert
  expect(HistoryScanner.repoName('/a/b/')).toBe('b')
})

test('repoName replaces unsafe characters', () => {
  // Assert
  expect(HistoryScanner.repoName('/a/My Repo:1')).toBe('My-Repo-1')
})

test('repoName is repo for empty, dot only or non-string input', () => {
  // Assert
  expect(['', '..', '/'].map((root) => HistoryScanner.repoName(root))).toEqual(['repo', 'repo', 'repo'])
  expect(HistoryScanner.repoName(undefined as never)).toBe('repo')
})

test('repoName is cut to 64 characters', () => {
  // Assert
  expect(HistoryScanner.repoName('/a/' + 'x'.repeat(100)).length).toBe(64)
})

test('logArgs without an identity is empty', () => {
  // Assert
  expect(HistoryScanner.logArgs([], 0, 500)).toEqual([])
})

test('logArgs ignores identities that are not emails', () => {
  // Assert
  expect(HistoryScanner.logArgs(['--all', 'x'], 0, 500)).toEqual([])
})

test('logArgs gives one author option per identity', () => {
  // Act
  const args = HistoryScanner.logArgs(['a@b.co', 'c@d.io'], 0, 500)

  // Assert
  expect(args.filter((arg) => arg.startsWith('--author='))).toEqual(['--author=a@b.co', '--author=c@d.io'])
})

test('logArgs asks for the format with numstat and no merges', () => {
  // Act
  const args = HistoryScanner.logArgs(['a@b.co'], 0, 500)

  // Assert
  expect(args.slice(0, 3)).toEqual(['log', '--no-merges', '--no-color'])
  expect(args).toContain('--numstat')
  expect(args).toContain('--format=%H%x1f%aI%x1f%s%x1f%b%x1e')
})

test('logArgs passes the skip and the count', () => {
  // Assert
  expect(HistoryScanner.logArgs(['a@b.co'], 1000, 500).slice(-3)).toEqual(['--skip=1000', '-n', '500'])
})

test('logArgs clamps a negative or invalid skip to zero and a count to at least one', () => {
  // Assert
  expect(HistoryScanner.logArgs(['a@b.co'], -5, 0).slice(-3)).toEqual(['--skip=0', '-n', '1'])
  expect(HistoryScanner.logArgs(['a@b.co'], Number.NaN, 2.9).slice(-3)).toEqual(['--skip=0', '-n', '2'])
})

test('logArgs ends with the range from a valid since sha to HEAD', () => {
  // Assert
  expect(HistoryScanner.logArgs(['a@b.co'], 0, 500, HistoryFixture.sha(7)).slice(-4)).toEqual(['--skip=0', '-n', '500', HistoryFixture.sha(7) + '..HEAD'])
})

test('logArgs leaves the arguments unchanged for an empty or invalid since', () => {
  // Arrange
  const plain = HistoryScanner.logArgs(['a@b.co'], 0, 500)

  // Assert
  expect(['', 'nope', '--all', 'ABC1234'].map((since) => HistoryScanner.logArgs(['a@b.co'], 0, 500, since))).toEqual([plain, plain, plain, plain])
})

test('parseLog reads numstat lines placed after the record separator', () => {
  // Arrange
  const first = HistoryFixture.commit({ sha: HistoryFixture.sha(1), subject: 'One', body: '' })
  const second = HistoryFixture.commit({ sha: HistoryFixture.sha(2), subject: 'Two', body: 'why' })
  const text = HistoryFixture.record(first, ['1\t2\tsrc/a.ts', '3\t4\tsrc/b.ts']) + HistoryFixture.record(second, ['5\t6\tsrc/c.ts'])

  // Act
  const commits = HistoryScanner.parseLog(text)

  // Assert
  expect(commits.map((commit) => commit.subject)).toEqual(['One', 'Two'])
  expect(commits[0]?.files).toEqual([{ path: 'src/a.ts', added: 1, deleted: 2 }, { path: 'src/b.ts', added: 3, deleted: 4 }])
  expect(commits[1]?.files).toEqual([{ path: 'src/c.ts', added: 5, deleted: 6 }])
  expect(commits[1]?.body).toBe('why')
})

test('parseLog keeps numstat looking lines of a body in the body and adds no file', () => {
  // Arrange
  const text = `${HistoryFixture.sha(1)}\u001f2026-01-02T10:00:00+00:00\u001fSubject\u001fbody line\n\n1\t1\t*\u001e`

  // Act
  const commit = HistoryScanner.parseLog(text)[0]

  // Assert
  expect(commit?.files).toEqual([])
  expect(commit?.body).toBe('body line\n\n1\t1\t*')
})

test('parseLog counts a binary file as zero lines and marks it binary', () => {
  // Arrange
  const text = HistoryFixture.record(HistoryFixture.commit(), ['-\t-\tlogo.png'])

  // Assert
  expect(HistoryScanner.parseLog(text)[0]?.files).toEqual([{ path: 'logo.png', added: 0, deleted: 0, isBinary: true }])
})

test('parseLog reads a rename inside braces', () => {
  // Arrange
  const text = HistoryFixture.record(HistoryFixture.commit(), ['0\t0\tsrc/{old => new}/a.ts'])

  // Assert
  expect(HistoryScanner.parseLog(text)[0]?.files[0]?.path).toBe('src/new/a.ts')
})

test('parseLog reads a whole path rename', () => {
  // Arrange
  const text = HistoryFixture.record(HistoryFixture.commit(), ['0\t0\told.ts => new.ts'])

  // Assert
  expect(HistoryScanner.parseLog(text)[0]?.files[0]?.path).toBe('new.ts')
})

test('parseLog reads a rename into and out of a directory without a double slash', () => {
  // Arrange
  const text = HistoryFixture.record(HistoryFixture.commit(), ['0\t0\tsrc/{ => sub}/a.ts', '0\t0\tsrc/{old => }/b.ts'])

  // Assert
  expect(HistoryScanner.parseLog(text)[0]?.files.map((file) => file.path)).toEqual(['src/sub/a.ts', 'src/b.ts'])
})

test('parseLog accepts CRLF line endings', () => {
  // Arrange
  const text = `${HistoryFixture.sha(1)}\u001f2026-01-02T10:00:00+00:00\u001fSubject\u001f\u001e\r\n\r\n1\t2\ta.ts\r\n`

  // Assert
  expect(HistoryScanner.parseLog(text)[0]?.files).toEqual([{ path: 'a.ts', added: 1, deleted: 2 }])
})

test('parseLog of an empty or non-string output is empty', () => {
  // Assert
  expect(HistoryScanner.parseLog('')).toEqual([])
  expect(HistoryScanner.parseLog(undefined as never)).toEqual([])
})

test('parseLog skips a malformed header', () => {
  // Assert
  expect(HistoryScanner.parseLog('garbage\u001fnot a header\u001e')).toEqual([])
})

test('parseLog gives a commit without files an empty file list', () => {
  // Assert
  expect(HistoryScanner.parseLog(HistoryFixture.record(HistoryFixture.commit(), []))[0]?.files).toEqual([])
})

test('parseLog keeps a multi line body', () => {
  // Arrange
  const text = HistoryFixture.record(HistoryFixture.commit({ body: 'line one\nline two' }), ['1\t1\ta.ts'])

  // Assert
  expect(HistoryScanner.parseLog(text)[0]?.body).toBe('line one\nline two')
})

test('isNoise flags lock files', () => {
  // Assert
  expect(['package-lock.json', 'yarn.lock', 'sub/Cargo.lock', 'pnpm-lock.yaml', 'go.sum'].map((path) => HistoryScanner.isNoise(path))).toEqual([true, true, true, true, true])
})

test('isNoise flags generated and vendored directories', () => {
  // Assert
  expect(['dist/a.js', 'vendor/x.go', 'node_modules/p/i.js', 'src/build/x.ts', 'dist\\a.js'].map((path) => HistoryScanner.isNoise(path))).toEqual([true, true, true, true, true])
})

test('isNoise does not flag a file named dist', () => {
  // Assert
  expect(HistoryScanner.isNoise('dist')).toBe(false)
})

test('isNoise flags environment and key files', () => {
  // Assert
  expect(['.env', '.env.local', '.envrc', 'k.pem', 'id_rsa', 'cert.p12'].map((path) => HistoryScanner.isNoise(path))).toEqual([true, true, true, true, true, true])
})

test('isNoise flags binaries and minified files', () => {
  // Assert
  expect(['logo.png', 'doc.pdf', 'app.min.js', 'font.woff2'].map((path) => HistoryScanner.isNoise(path))).toEqual([true, true, true, true])
})

test('isNoise does not flag ordinary source files', () => {
  // Assert
  expect(['src/app.ts', 'README.md', 'tests/a.test.ts'].map((path) => HistoryScanner.isNoise(path))).toEqual([false, false, false])
})

test('priority gives 5 for a revert subject', () => {
  // Assert
  expect(HistoryFixture.score({ subject: 'Revert "Add feature"' })).toBe(5)
})

test('priority gives 5 for a rollback mentioned in the body', () => {
  // Assert
  expect(HistoryFixture.score({ body: 'this is a rollback of x' })).toBe(5)
})

test('priority gives 4 for a security sensitive path', () => {
  // Assert
  expect(HistoryFixture.score({ files: [HistoryFixture.file('src/auth/login.ts')] })).toBe(4)
})

test('priority gives 4 for a project configuration path', () => {
  // Assert
  expect(HistoryFixture.score({ files: [HistoryFixture.file('.claude/rules/x.md')] })).toBe(4)
})

test('priority gives 4 for a dependency manifest', () => {
  // Assert
  expect(HistoryFixture.score({ files: [HistoryFixture.file('package.json')] })).toBe(4)
})

test('priority gives 4 for a CI workflow', () => {
  // Assert
  expect(HistoryFixture.score({ files: [HistoryFixture.file('.github/workflows/ci.yml')] })).toBe(4)
})

test('priority gives 4 for an early commit', () => {
  // Assert
  expect(HistoryFixture.score({}, true)).toBe(4)
})

test('priority gives 3 for a refactor subject', () => {
  // Assert
  expect(HistoryFixture.score({ subject: 'Refactor the parser' })).toBe(3)
})

test('priority gives 3 for ten files touched with balanced additions and deletions', () => {
  // Arrange
  const files = Array.from({ length: 10 }, (_, index) => HistoryFixture.file(`src/f${index}.ts`, 5, 5))

  // Assert
  expect(HistoryFixture.score({ files })).toBe(3)
})

test('priority gives nothing for ten files with only additions', () => {
  // Arrange
  const files = Array.from({ length: 10 }, (_, index) => HistoryFixture.file(`src/f${index}.ts`, 10, 0))

  // Assert
  expect(HistoryFixture.score({ files })).toBe(0)
})

test('priority gives 2 when the subject says why', () => {
  // Assert
  expect(HistoryFixture.score({ subject: 'Drop it because it is slow' })).toBe(2)
})

test('priority gives 2 for a body of two lines', () => {
  // Assert
  expect(HistoryFixture.score({ body: 'first\nsecond' })).toBe(2)
})

test('priority gives 1 for tests only', () => {
  // Assert
  expect(HistoryFixture.score({ files: [HistoryFixture.file('tests/a.test.ts')] })).toBe(1)
})

test('priority gives minus 5 for a lock file only', () => {
  // Assert
  expect(HistoryFixture.score({ files: [HistoryFixture.file('package-lock.json')] })).toBe(-5)
})

test('priority gives minus 5 for formatting only', () => {
  // Assert
  expect(HistoryFixture.score({ subject: 'Format code', files: [HistoryFixture.file('src/a.ts', 3, 3)] })).toBe(-5)
})

test('priority does not penalise a formatting subject that changes line counts', () => {
  // Assert
  expect(HistoryFixture.score({ subject: 'Format code', files: [HistoryFixture.file('src/a.ts', 3, 1)] })).toBe(0)
})

test('priority of an ordinary commit is zero', () => {
  // Assert
  expect(HistoryFixture.score({})).toBe(0)
})

test('select leaves out commits already done', () => {
  // Arrange
  const commits = [HistoryFixture.commit({ sha: HistoryFixture.sha(1) }), HistoryFixture.commit({ sha: HistoryFixture.sha(2) })]

  // Act
  const picked = HistoryScanner.select(commits, HistoryFixture.cursor({ done: [HistoryFixture.sha(1)] }), new Set())

  // Assert
  expect(picked.map((commit) => commit.sha)).toEqual([HistoryFixture.sha(2)])
})

test('select takes at most 60 commits per run', () => {
  // Arrange
  const commits = Array.from({ length: 80 }, (_, index) => HistoryFixture.commit({ sha: HistoryFixture.sha(index + 1) }))

  // Assert
  expect(HistoryScanner.select(commits, HistoryFixture.cursor(), new Set()).length).toBe(60)
})

test('select adds the earliest commits on the first run only', () => {
  // Arrange
  const reverts = Array.from({ length: 70 }, (_, index) => HistoryFixture.commit({ sha: HistoryFixture.sha(index + 1), subject: 'Revert x' }))
  const early = Array.from({ length: 40 }, (_, index) => HistoryFixture.commit({ sha: HistoryFixture.sha(1000 + index) }))
  const earliest = new Set(early.map((commit) => commit.sha))

  // Act
  const first = HistoryScanner.select([...reverts, ...early], HistoryFixture.cursor(), earliest)
  const later = HistoryScanner.select([...reverts, ...early], HistoryFixture.cursor({ done: [HistoryFixture.sha(5000)] }), earliest)

  // Assert
  expect(first.length).toBe(90)
  expect(later.length).toBe(60)
})

test('select never picks a commit with a negative priority', () => {
  // Arrange
  const commits = [HistoryFixture.commit({ files: [HistoryFixture.file('package-lock.json')] })]

  // Assert
  expect(HistoryScanner.select(commits, HistoryFixture.cursor(), new Set())).toEqual([])
})

test('select prefers the newer commit on a tie', () => {
  // Arrange
  const older = HistoryFixture.commit({ sha: HistoryFixture.sha(1), at: '2025-01-01T00:00:00+00:00' })
  const newer = HistoryFixture.commit({ sha: HistoryFixture.sha(2), at: '2026-01-01T00:00:00+00:00' })

  // Assert
  expect(HistoryScanner.select([older, newer], HistoryFixture.cursor(), new Set()).map((commit) => commit.sha)).toEqual([newer.sha, older.sha])
})

test('select ranks a higher score first', () => {
  // Arrange
  const plain = HistoryFixture.commit({ sha: HistoryFixture.sha(1), at: '2026-06-01T00:00:00+00:00' })
  const revert = HistoryFixture.commit({ sha: HistoryFixture.sha(2), subject: 'Revert x', at: '2020-01-01T00:00:00+00:00' })

  // Assert
  expect(HistoryScanner.select([plain, revert], HistoryFixture.cursor(), new Set())[0]?.sha).toBe(revert.sha)
})

test('select returns nothing when the backlog room is used up', () => {
  // Assert
  expect(HistoryScanner.select([HistoryFixture.commit()], HistoryFixture.cursor({ selected: 600 }), new Set())).toEqual([])
})

test('select limits the picks to the room left in the backlog', () => {
  // Arrange
  const commits = Array.from({ length: 30 }, (_, index) => HistoryFixture.commit({ sha: HistoryFixture.sha(index + 1) }))

  // Assert
  expect(HistoryScanner.select(commits, HistoryFixture.cursor({ selected: 590 }), new Set()).length).toBe(10)
})

test('select counts a repeated sha once', () => {
  // Arrange
  const commit = HistoryFixture.commit()

  // Assert
  expect(HistoryScanner.select([commit, commit], HistoryFixture.cursor(), new Set()).length).toBe(1)
})

test('select of something that is not an array is empty', () => {
  // Assert
  expect(HistoryScanner.select(undefined as never, HistoryFixture.cursor(), new Set())).toEqual([])
})

test('showArgs builds a read only show command for the paths', () => {
  // Assert
  expect(HistoryScanner.showArgs(HistoryFixture.sha(1), ['src/a.ts'])).toEqual(['show', '--format=', '--unified=1', '--no-color', '--no-ext-diff', '--no-textconv', HistoryFixture.sha(1), '--', ':(literal)src/a.ts'])
})

test('showArgs of an invalid sha is empty', () => {
  // Assert
  expect(HistoryScanner.showArgs('--output=x', ['src/a.ts'])).toEqual([])
})

test('showArgs removes noise paths', () => {
  // Assert
  expect(HistoryScanner.showArgs(HistoryFixture.sha(1), ['package-lock.json', 'src/a.ts']).slice(-2)).toEqual(['--', ':(literal)src/a.ts'])
})

test('showArgs of only noise paths is empty', () => {
  // Assert
  expect(HistoryScanner.showArgs(HistoryFixture.sha(1), ['package-lock.json', 'dist/a.js'])).toEqual([])
})

test('showArgs keeps at most 6 paths', () => {
  // Arrange
  const paths = Array.from({ length: 9 }, (_, index) => `src/f${index}.ts`)

  // Assert
  expect(HistoryScanner.showArgs(HistoryFixture.sha(1), paths).slice(8)).toEqual(paths.slice(0, 6).map((path) => ':(literal)' + path))
})

test('showArgs rejects a path with a newline', () => {
  // Assert
  expect(HistoryScanner.showArgs(HistoryFixture.sha(1), ['src/a\nb.ts', 'src/ok.ts']).slice(8)).toEqual([':(literal)src/ok.ts'])
})

test('excerpt builds an id from the repository name and the short sha', () => {
  // Act
  const result = HistoryScanner.excerpt('/x/my-repo', HistoryFixture.commit({ sha: HistoryFixture.sha(255) }), '', '')

  // Assert
  expect(result.id).toBe('commit:my-repo:0000000')
})

test('excerpt starts with the id and the date', () => {
  // Act
  const result = HistoryScanner.excerpt('/x/my-repo', HistoryFixture.commit({ sha: 'abcdef1234567' }), '', '')

  // Assert
  expect(result.text.split('\n')[0]).toBe('[commit commit:my-repo:abcdef1 · 2026-01-02]')
})

test('excerpt redacts secrets in the body and the diff', () => {
  // Act
  const result = HistoryScanner.excerpt('/x/r', HistoryFixture.commit({ body: 'mail jo@example.com' }), '+token=abc123def', '')

  // Assert
  expect(result.text).not.toContain('jo@example.com')
  expect(result.text).not.toContain('abc123def')
})

test('excerpt replaces the home directory in paths and text', () => {
  // Act
  const result = HistoryScanner.excerpt('/x/r', HistoryFixture.commit({ files: [HistoryFixture.file('/Users/j/app/a.ts')], subject: 'edit /Users/j/app' }), '', '/Users/j')

  // Assert
  expect(result.text).not.toContain('/Users/j')
  expect(result.text).toContain('~/app/a.ts')
})

test('excerpt caps the diff at 3000 characters', () => {
  // Act
  const result = HistoryScanner.excerpt('/x/r', HistoryFixture.commit(), 'ab '.repeat(2000), '')
  const last = result.text.split('\n').pop() ?? ''

  // Assert
  expect(last.length).toBe(3000)
  expect(last.endsWith('…')).toBe(true)
})

test('excerpt caps the body at 600 characters', () => {
  // Act
  const result = HistoryScanner.excerpt('/x/r', HistoryFixture.commit({ body: 'word '.repeat(300) }), '', '')

  // Assert
  expect((result.text.split('\n')[2] ?? '').length).toBe(600)
})

test('excerpt lists the changed files with their counts', () => {
  // Act
  const result = HistoryScanner.excerpt('/x/r', HistoryFixture.commit({ files: [HistoryFixture.file('a.ts', 1, 2)] }), '', '')

  // Assert
  expect(result.text).toContain('files: a.ts (+1 -2)')
})

test('excerpt says how many files it left out', () => {
  // Arrange
  const files = Array.from({ length: 12 }, (_, index) => HistoryFixture.file(`f${index}.ts`))

  // Act
  const result = HistoryScanner.excerpt('/x/r', HistoryFixture.commit({ files }), '', '')

  // Assert
  expect(result.text).toContain(' and 2 more')
})

test('emptyCursor starts incomplete with no history', () => {
  // Assert
  expect(HistoryScanner.emptyCursor('/r', 'repo', 'manual')).toEqual({ version: 1, root: '/r', name: 'repo', identities: [], head: '', done: [], scanned: 0, selected: 0, isComplete: false, source: 'manual' })
})

test('emptyCursor takes auto for an unknown source', () => {
  // Assert
  expect(HistoryScanner.emptyCursor('/r', 'repo', 'x' as never).source).toBe('auto')
})

test('a cursor survives serialize and parse', () => {
  // Arrange
  const cursor = HistoryFixture.cursor({ identities: ['a@b.co'], head: 'abc1234', done: ['abc1234', 'def5678'], scanned: 10, selected: 5, isComplete: true, source: 'manual' })

  // Assert
  expect(HistoryScanner.parseCursor(HistoryScanner.serializeCursor(cursor))).toEqual(cursor)
})

test('parseCursor of invalid JSON or a wrong shape is undefined', () => {
  // Assert
  expect(['{nope', '[]', '"x"', '{"version":1}', '{"version":2,"root":"/r"}', '{"version":1,"root":""}'].map((text) => HistoryScanner.parseCursor(text))).toEqual([undefined, undefined, undefined, undefined, undefined, undefined])
})

test('parseCursor accepts the legacy complete key', () => {
  // Assert
  expect(HistoryScanner.parseCursor('{"version":1,"root":"/r","complete":true}')?.isComplete).toBe(true)
})

test('parseCursor prefers isComplete over the legacy key', () => {
  // Assert
  expect(HistoryScanner.parseCursor('{"version":1,"root":"/r","isComplete":false,"complete":true}')?.isComplete).toBe(false)
})

test('parseCursor drops an invalid head and invalid shas', () => {
  // Act
  const cursor = HistoryScanner.parseCursor('{"version":1,"root":"/r","head":"nope","done":["abc1234","x",5,"abc1234"]}')

  // Assert
  expect(cursor?.head).toBe('')
  expect(cursor?.done).toEqual(['abc1234'])
})

test('parseCursor keeps only valid distinct identities up to 20', () => {
  // Arrange
  const identities = ['a@b.co', 'a@b.co', 'bad', ...Array.from({ length: 30 }, (_, index) => `u${index}@x.io`)]

  // Act
  const cursor = HistoryScanner.parseCursor(JSON.stringify({ version: 1, root: '/r', identities }))

  // Assert
  expect(cursor?.identities.length).toBe(20)
  expect(cursor?.identities[0]).toBe('a@b.co')
})

test('parseCursor keeps the last 2000 done shas', () => {
  // Arrange
  const done = Array.from({ length: 2100 }, (_, index) => HistoryFixture.sha(index + 1))

  // Act
  const cursor = HistoryScanner.parseCursor(JSON.stringify({ version: 1, root: '/r', done }))

  // Assert
  expect(cursor?.done.length).toBe(2000)
  expect(cursor?.done[1999]).toBe(HistoryFixture.sha(2100))
})

test('parseCursor turns negative counters into zero and derives a missing name', () => {
  // Act
  const cursor = HistoryScanner.parseCursor('{"version":1,"root":"/x/my repo","scanned":-4,"selected":"x"}')

  // Assert
  expect([cursor?.scanned, cursor?.selected, cursor?.name]).toEqual([0, 0, 'my-repo'])
})

test('parseCursor refuses a text over one megabyte', () => {
  // Assert
  expect(HistoryScanner.parseCursor('{"version":1,"root":"/r","pad":"' + 'a'.repeat(1024 * 1024) + '"}')).toBe(undefined)
})

test('remember appends new shas and counts them as selected', () => {
  // Act
  const next = HistoryScanner.remember(HistoryFixture.cursor({ done: ['abc1234'], selected: 1 }), ['def5678', 'abc1234'], 'fff9999')

  // Assert
  expect(next.done).toEqual(['abc1234', 'def5678'])
  expect(next.selected).toBe(3)
  expect(next.head).toBe('fff9999')
})

test('remember skips invalid shas in the done list', () => {
  // Assert
  expect(HistoryScanner.remember(HistoryFixture.cursor(), ['nope', 'abc1234'], '').done).toEqual(['abc1234'])
})

test('remember keeps the old head when the new one is invalid', () => {
  // Assert
  expect(HistoryScanner.remember(HistoryFixture.cursor({ head: 'abc1234' }), [], 'nope').head).toBe('abc1234')
})

test('remember keeps at most 2000 done shas and drops the oldest', () => {
  // Arrange
  const done = Array.from({ length: 2000 }, (_, index) => HistoryFixture.sha(index + 1))

  // Act
  const next = HistoryScanner.remember(HistoryFixture.cursor({ done }), [HistoryFixture.sha(5000)], '')

  // Assert
  expect(next.done.length).toBe(2000)
  expect(next.done[0]).toBe(HistoryFixture.sha(2))
  expect(next.done[1999]).toBe(HistoryFixture.sha(5000))
})

test('remember does not change the cursor it was given', () => {
  // Arrange
  const cursor = HistoryFixture.cursor()

  // Act
  HistoryScanner.remember(cursor, ['abc1234'], 'abc1234')

  // Assert
  expect(cursor.done).toEqual([])
})

test('ScriptedGit answers log pages in order and records the calls', async () => {
  // Arrange
  const git = new ScriptedGit().log(['page one', 'page two'])

  // Act
  const first = await git.port(['git', '--no-optional-locks', '-C', '/r', 'log', '-n', '500'], '/cwd')
  const second = await git.port(['git', '--no-optional-locks', '-C', '/r', 'log', '-n', '500'], '/cwd')

  // Assert
  expect([first.stdout, second.stdout]).toEqual(['page one', 'page two'])
  expect(git.subcommands()).toEqual(['log', 'log'])
  expect(git.cwds).toEqual(['/r', '/r'])
})

test('ScriptedGit records the -C path as the root and the cwd when there is none', async () => {
  // Arrange
  const git = new ScriptedGit()

  // Act
  await git.port(['git', '--no-optional-locks', '-C', '/repo', 'status'], '/cwd')
  await git.port(['git', 'status'], '/cwd')

  // Assert
  expect(git.cwds).toEqual(['/repo', '/cwd'])
  expect(git.subcommands()).toEqual(['status', 'status'])
})

test('ScriptedGit answers show, config, rev-parse and scripted failures', async () => {
  // Arrange
  const git = new ScriptedGit().show('abc1234', 'diff').email('a@b.co').head('def5678').fail('status')

  // Act
  const show = await git.port(['git', '--no-optional-locks', '-C', '/r', 'show', 'abc1234', '--', 'a.ts'], '/cwd')
  const email = await git.port(['git', '-c', 'core.quotepath=off', '-C', '/r', 'config', '--get', 'user.email'], '/cwd')
  const head = await git.port(['git', '-C', '/r', 'rev-parse', 'HEAD'], '/cwd')
  const status = await git.port(['git', '-C', '/r', 'status'], '/cwd')

  // Assert
  expect([show.stdout, email.stdout, head.stdout, status.exitCode]).toEqual(['diff', 'a@b.co\n', 'def5678\n', 1])
})

test('logArgs and showArgs turn text conversion filters off', () => {
  // Assert
  expect(HistoryScanner.logArgs(['a@b.co'], 0, 500)).toContain('--no-textconv')
  expect(HistoryScanner.showArgs(HistoryFixture.sha(1), ['src/a.ts'])).toContain('--no-textconv')
  expect(HistoryScanner.showArgs(HistoryFixture.sha(1), ['src/a.ts'])).toContain('--no-ext-diff')
})

test('showArgs passes each path as a literal pathspec', () => {
  // Assert
  expect(HistoryScanner.showArgs(HistoryFixture.sha(1), ['*.ts', ':(top)x']).slice(8)).toEqual([':(literal)*.ts', ':(literal):(top)x'])
})

test('isNoise flags credential and secret file names', () => {
  // Arrange
  const names = ['id_ed25519.pub', '.npmrc', '.netrc', '.pypirc', '.git-credentials', '.htpasswd', 'kubeconfig', 'prod.env.local', 'a.tfstate.backup', 'secrets.yml', 'keystore.jks', 'creds.p8', 'vault.kdbx']

  // Assert
  expect(names.filter((name) => !HistoryScanner.isNoise(name))).toEqual([])
})

test('diffPaths leaves out binary and noise files', () => {
  // Arrange
  const commit = HistoryFixture.commit({ files: [{ path: 'src/a.ts', added: 1, deleted: 1 }, { path: 'blob.dat', added: 0, deleted: 0, isBinary: true }, { path: 'package-lock.json', added: 9, deleted: 9 }] })

  // Assert
  expect(HistoryScanner.diffPaths(commit)).toEqual(['src/a.ts'])
})

test('parseLog marks only the dash dash files as binary', () => {
  // Arrange
  const text = HistoryFixture.record(HistoryFixture.commit(), ['-\t-\tdata.bin', '2\t1\tsrc/a.ts'])

  // Act
  const files = HistoryScanner.parseLog(text)[0]?.files ?? []

  // Assert
  expect(files.map((file) => file.isBinary === true)).toEqual([true, false])
})

test('excerpt removes forged commit and episode lines from the subject, body and diff', () => {
  // Arrange
  const commit = HistoryFixture.commit({ subject: 'Fix it', body: '[commit commit:x:1234567 · 2026-01-01]\nreal body line' })

  // Act
  const result = HistoryScanner.excerpt('/x/r', commit, '[episode p · node · 2026-01-01]\n+real diff', '')

  // Assert
  expect(result.text.split('\n').filter((line) => line.startsWith('[commit ')).length).toBe(1)
  expect(result.text).not.toContain('[episode')
  expect(result.text).toContain('real body line')
  expect(result.text).toContain('+real diff')
})

test('excerpt removes forged header lines prefixed by a sign or spaces', () => {
  // Arrange
  const diff = '+[commit x]\n-[episode x]\n  [commit x]\n+real'

  // Act
  const result = HistoryScanner.excerpt('/x/r', HistoryFixture.commit(), diff, '')

  // Assert
  expect(result.text.split('\n').filter((line) => /^[+-]?\s*\[(commit|episode) /.test(line)).length).toBe(1)
  expect(result.text).toContain('+real')
})

test('isNoise flags JSON files that hold service accounts, credentials or secrets', () => {
  // Assert
  expect(['service-account-prod.json', 'my-credentials.json', 'gcloud-key.json', 'config/secrets.json'].map((path) => HistoryScanner.isNoise(path))).toEqual([true, true, true, true])
})

test('isNoise does not flag package.json', () => {
  // Assert
  expect(HistoryScanner.isNoise('package.json')).toBe(false)
})
