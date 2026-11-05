import { expect, test } from 'claude-code/testing'
import { SignaturePaths, type SignatureEnv } from '../hooks/signature/paths'

class PathsFixture {
  static env(partial: Partial<SignatureEnv>): SignatureEnv {
    return { claudeConfigDir: '', home: '', userProfile: '', ...partial }
  }
}

test('root prefers the config directory over home and the user profile', () => {
  // Arrange
  const env = PathsFixture.env({ claudeConfigDir: '/cfg', home: '/home/j', userProfile: 'C:/Users/j' })

  // Act
  const root = SignaturePaths.root(env)

  // Assert
  expect(root).toBe('/cfg/podium')
})

test('root falls back to home when there is no config directory', () => {
  // Arrange
  const env = PathsFixture.env({ home: '/home/j', userProfile: 'C:/Users/j' })

  // Act
  const root = SignaturePaths.root(env)

  // Assert
  expect(root).toBe('/home/j/.claude/podium')
})

test('root falls back to the user profile when home is empty', () => {
  // Arrange
  const env = PathsFixture.env({ userProfile: '/profile/j' })

  // Act
  const root = SignaturePaths.root(env)

  // Assert
  expect(root).toBe('/profile/j/.claude/podium')
})

test('root is empty when no directory is known', () => {
  // Act
  const root = SignaturePaths.root(PathsFixture.env({}))

  // Assert
  expect(root).toBe('')
})

test('root normalises Windows separators', () => {
  // Arrange
  const env = PathsFixture.env({ userProfile: 'C:\\Users\\j' })

  // Act
  const root = SignaturePaths.root(env)

  // Assert
  expect(root).toBe('C:/Users/j/.claude/podium')
})

test('files lays every path out under the root', () => {
  // Act
  const files = SignaturePaths.files('/r/podium')

  // Assert
  expect(files).toEqual({
    root: '/r/podium',
    settings: '/r/podium/settings.json',
    state: '/r/podium/state.json',
    lock: '/r/podium/lock.json',
    vocabulary: '/r/podium/vocabulary.json',
    index: '/r/podium/index.json',
    profile: '/r/podium/profile.json',
    cases: '/r/podium/cases',
    archive: '/r/podium/archive',
    journal: '/r/podium/journal',
    history: '/r/podium/history',
    exports: '/r/podium/exports'
  })
})

test('shardOf groups 256 ids per shard', () => {
  // Assert
  expect([SignaturePaths.shardOf(0), SignaturePaths.shardOf(255), SignaturePaths.shardOf(256), SignaturePaths.shardOf(513)]).toEqual([0, 0, 1, 2])
})

test('shardOf maps invalid ids to the first shard', () => {
  // Assert
  expect([SignaturePaths.shardOf(-1), SignaturePaths.shardOf(Number.NaN), SignaturePaths.shardOf(Infinity)]).toEqual([0, 0, 0])
})

test('shardFile pads the shard number to three digits', () => {
  // Assert
  expect(SignaturePaths.shardFile('/r/cases', 3)).toBe('/r/cases/003.jsonl')
})

test('shardFile keeps a shard number wider than three digits', () => {
  // Assert
  expect(SignaturePaths.shardFile('/r/cases', 1234)).toBe('/r/cases/1234.jsonl')
})

test('shardFile of the shard for id 256 is 001', () => {
  // Act
  const file = SignaturePaths.shardFile('/r/cases', SignaturePaths.shardOf(256))

  // Assert
  expect(file).toBe('/r/cases/001.jsonl')
})

test('journalFile files a session under the UTC month of its timestamp', () => {
  // Arrange
  const at = Date.UTC(2026, 10, 30, 23, 59, 59)

  // Act
  const file = SignaturePaths.journalFile('/r', at, 'abc-123', 0)

  // Assert
  expect(file).toBe('/r/journal/2026-11/abc-123.jsonl')
})

test('journalFile rolls over to the next UTC month at midnight UTC', () => {
  // Arrange
  const at = Date.UTC(2026, 11, 1, 0, 0, 0)

  // Act
  const file = SignaturePaths.journalFile('/r', at, 'abc', 0)

  // Assert
  expect(file).toBe('/r/journal/2026-12/abc.jsonl')
})

test('journalFile replaces unsafe session characters', () => {
  // Act
  const file = SignaturePaths.journalFile('/r', Date.UTC(2026, 0, 5), '../a b/c', 0)

  // Assert
  expect(file).toBe('/r/journal/2026-01/___a_b_c.jsonl')
})

test('journalFile names an empty session session', () => {
  // Act
  const file = SignaturePaths.journalFile('/r', Date.UTC(2026, 0, 5), '', 0)

  // Assert
  expect(file).toBe('/r/journal/2026-01/session.jsonl')
})

test('journalFile adds a part suffix after the first part', () => {
  // Act
  const file = SignaturePaths.journalFile('/r', Date.UTC(2026, 0, 5), 's', 2)

  // Assert
  expect(file).toBe('/r/journal/2026-01/s.2.jsonl')
})

test('journalFile falls back to January 1970 for an invalid timestamp', () => {
  // Act
  const file = SignaturePaths.journalFile('/r', Number.NaN, 's', 0)

  // Assert
  expect(file).toBe('/r/journal/1970-01/s.jsonl')
})

test('historyFile replaces unsafe repository id characters', () => {
  // Act
  const file = SignaturePaths.historyFile('/r', 'git@host:org/repo')

  // Assert
  expect(file).toBe('/r/history/git_host_org_repo.json')
})

test('historyFile keeps a safe repository id', () => {
  // Assert
  expect(SignaturePaths.historyFile('/r', 'abc_DEF-123')).toBe('/r/history/abc_DEF-123.json')
})

test('normalize resolves dot segments and drops the trailing slash', () => {
  // Assert
  expect(SignaturePaths.normalize('a/b/../c/')).toBe('a/c')
})

test('normalize keeps the root slash', () => {
  // Assert
  expect(SignaturePaths.normalize('/')).toBe('/')
})

test('normalize converts backslashes to slashes', () => {
  // Assert
  expect(SignaturePaths.normalize('C:\\Users\\j\\.claude')).toBe('C:/Users/j/.claude')
})

test('normalize cannot climb above the root of an absolute path', () => {
  // Assert
  expect(SignaturePaths.normalize('/a/../../b')).toBe('/b')
})

test('normalize keeps leading parent segments of a relative path', () => {
  // Assert
  expect(SignaturePaths.normalize('../a')).toBe('../a')
})

test('normalize returns an empty string for a non-string', () => {
  // Assert
  expect(SignaturePaths.normalize(undefined as never)).toBe('')
})

test('isInside accepts a descendant', () => {
  // Assert
  expect(SignaturePaths.isInside('/root', '/root/a/b')).toBe(true)
})

test('isInside accepts the root itself', () => {
  // Assert
  expect(SignaturePaths.isInside('/root', '/root/')).toBe(true)
})

test('isInside rejects a sibling sharing the root prefix', () => {
  // Assert
  expect(SignaturePaths.isInside('/root', '/root2/a')).toBe(false)
})

test('isInside rejects a path escaping through a parent segment', () => {
  // Assert
  expect(SignaturePaths.isInside('/root', '/root/../etc')).toBe(false)
})

test('isInside rejects an empty root', () => {
  // Assert
  expect(SignaturePaths.isInside('', '/root/a')).toBe(false)
})

test('isInside accepts Windows separators', () => {
  // Assert
  expect(SignaturePaths.isInside('C:/r', 'C:\\r\\a')).toBe(true)
})

test('root expands a tilde in the config directory with home', () => {
  // Arrange
  const env = PathsFixture.env({ claudeConfigDir: '~/cfg', home: '/home/j' })

  // Act
  const root = SignaturePaths.root(env)

  // Assert
  expect(root).toBe('/home/j/cfg/podium')
})

test('root is empty when a tilde cannot be expanded', () => {
  // Assert
  expect(SignaturePaths.root(PathsFixture.env({ claudeConfigDir: '~/cfg' }))).toBe('')
})

test('root is empty for a relative config directory', () => {
  // Assert
  expect(SignaturePaths.root(PathsFixture.env({ claudeConfigDir: '.claude', home: '/home/j' }))).toBe('')
})

test('root keeps a UNC config directory as a UNC path', () => {
  // Arrange
  const env = PathsFixture.env({ claudeConfigDir: '\\\\srv\\share\\claude' })

  // Act
  const root = SignaturePaths.root(env)

  // Assert
  expect(root).toBe('//srv/share/claude/podium')
})

test('isAbsolute accepts a POSIX path', () => {
  // Assert
  expect(SignaturePaths.isAbsolute('/a/b')).toBe(true)
})

test('isAbsolute accepts a drive path with either separator', () => {
  // Assert
  expect([SignaturePaths.isAbsolute('C:/a'), SignaturePaths.isAbsolute('C:\\a')]).toEqual([true, true])
})

test('isAbsolute accepts a UNC path', () => {
  // Assert
  expect(SignaturePaths.isAbsolute('\\\\srv\\share')).toBe(true)
})

test('isAbsolute rejects relative, tilde, bare drive and empty paths', () => {
  // Assert
  expect(['a/b', '~/x', 'C:', '', '.'].map((path) => SignaturePaths.isAbsolute(path))).toEqual([false, false, false, false, false])
})

test('isAbsolute rejects a non-string', () => {
  // Assert
  expect(SignaturePaths.isAbsolute(undefined as never)).toBe(false)
})

test('isInside rejects a relative root', () => {
  // Assert
  expect(SignaturePaths.isInside('rel', 'rel/a')).toBe(false)
})

test('normalize keeps the double slash of a UNC path', () => {
  // Assert
  expect(SignaturePaths.normalize('\\\\srv\\share\\..\\x')).toBe('//srv/x')
})
