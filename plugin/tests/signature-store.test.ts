import { expect, test } from 'claude-code/testing'
import { SignaturePaths } from '../hooks/signature/paths'
import { SignatureSettings } from '../hooks/signature/settings'
import { SignatureStore } from '../hooks/signature/store'
import { HistoryScanner } from '../hooks/signature/history'
import { Profile } from '../hooks/signature/profile'
import { TagIndex } from '../hooks/signature/tag-index'
import { Vocabulary } from '../hooks/signature/vocabulary'
import { SignatureFixtures } from './fixtures/signature'
import { MemoryFs, SignatureStoreFixture } from './fixtures/signature-fs'

const files = SignatureStoreFixture.files()
const root = SignatureStoreFixture.ROOT

test('readSettings with a bad root never touches the file system', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh()

  // Act
  for (const bad of SignatureStoreFixture.badRoots()) await SignatureStore.readSettings(fs, SignaturePaths.files(bad))

  // Assert
  expect(fs.calls).toEqual([])
})

test('writeSettings with a bad root never touches the file system', async () => {
  // Arrange
  const fs = new MemoryFs()

  // Act
  const results: boolean[] = []
  for (const bad of SignatureStoreFixture.badRoots()) results.push(await SignatureStore.writeSettings(fs, SignaturePaths.files(bad), SignatureSettings.defaults()))

  // Assert
  expect(results).toEqual([false, false, false])
  expect(fs.calls).toEqual([])
})

test('readState, readIndex, sizes and erase with a bad root never touch the file system', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh()

  // Act
  for (const bad of SignatureStoreFixture.badRoots()) {
    const bound = SignaturePaths.files(bad)
    await SignatureStore.readState(fs, bound)
    await SignatureStore.readIndex(fs, bound)
    await SignatureStore.sizes(fs, bound)
    await SignatureStore.erase(fs, bound)
  }

  // Assert
  expect(fs.calls).toEqual([])
})

test('flushJournal with a bad root never touches the file system', async () => {
  // Arrange
  const fs = new MemoryFs()

  // Act
  const results = []
  for (const bad of SignatureStoreFixture.badRoots()) results.push(await SignatureStore.flushJournal(fs, bad, 's1', SignatureStoreFixture.AT, SignatureStoreFixture.signals(1), 0))

  // Assert
  expect(results.map((result) => result.written)).toEqual([0, 0, 0])
  expect(fs.calls).toEqual([])
})

test('text is empty for a missing file', async () => {
  // Assert
  expect(await SignatureStore.text(SignatureStoreFixture.fresh(), root + '/x')).toBe('')
})

test('text is empty when the read fails', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh().seed(root + '/x', 'data').failRead(root + '/x')

  // Assert
  expect(await SignatureStore.text(fs, root + '/x')).toBe('')
})

test('text of an empty file is empty', async () => {
  // Assert
  expect(await SignatureStore.text(SignatureStoreFixture.fresh().seed(root + '/x', ''), root + '/x')).toBe('')
})

test('text gives the content of a file', async () => {
  // Assert
  expect(await SignatureStore.text(SignatureStoreFixture.fresh().seed(root + '/x', 'data'), root + '/x')).toBe('data')
})

test('readSettings gives the defaults when the file is absent', async () => {
  // Act
  const result = await SignatureStore.readSettings(SignatureStoreFixture.fresh(), files)

  // Assert
  expect(result.value).toEqual(SignatureSettings.defaults())
  expect([result.isNewer, result.isCorrupt]).toEqual([false, false])
})

test('readSettings gives the defaults for an empty file', async () => {
  // Act
  const result = await SignatureStore.readSettings(SignatureStoreFixture.fresh().seed(files.settings, ''), files)

  // Assert
  expect(result.value).toEqual(SignatureSettings.defaults())
  expect(result.isCorrupt).toBe(false)
})

test('readSettings parses a valid file', async () => {
  // Act
  const result = await SignatureStore.readSettings(SignatureStoreFixture.fresh().seed(files.settings, '{"version":1,"consent":"enabled"}'), files)

  // Assert
  expect(result.value.consent).toBe('enabled')
})

test('readSettings flags a file that is not a JSON object as corrupt', async () => {
  // Act
  const array = await SignatureStore.readSettings(SignatureStoreFixture.fresh().seed(files.settings, '[1]'), files)
  const garbage = await SignatureStore.readSettings(SignatureStoreFixture.fresh().seed(files.settings, 'garbage'), files)

  // Assert
  expect([array.isCorrupt, garbage.isCorrupt]).toEqual([true, true])
})

test('readSettings flags a newer version and does not parse it', async () => {
  // Act
  const result = await SignatureStore.readSettings(SignatureStoreFixture.fresh().seed(files.settings, '{"version":2,"consent":"enabled"}'), files)

  // Assert
  expect(result.isNewer).toBe(true)
  expect(result.value.consent).toBe('undecided')
})

test('readSettings lists the dropped exclude entries', async () => {
  // Act
  const result = await SignatureStore.readSettings(SignatureStoreFixture.fresh().seed(files.settings, '{"exclude":["rel/x","/ok"]}'), files)

  // Assert
  expect(result.dropped).toEqual(['rel/x'])
})

test('writeSettings writes the serialised settings to a new file', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh()
  const settings = { ...SignatureSettings.defaults(), consent: 'enabled' as const }

  // Act
  const isWritten = await SignatureStore.writeSettings(fs, files, settings, root)

  // Assert
  expect(isWritten).toBe(true)
  expect(fs.text(files.settings)).toBe(SignatureSettings.serialize(settings))
})

test('writeSettings refuses to overwrite a newer file', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh().seed(files.settings, '{"version":2}')

  // Act
  const isWritten = await SignatureStore.writeSettings(fs, files, SignatureSettings.defaults(), root)

  // Assert
  expect(isWritten).toBe(false)
  expect(fs.text(files.settings)).toBe('{"version":2}')
  expect(fs.writes).toEqual([])
})

test('writeSettings writes over an empty file', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh().seed(files.settings, '')

  // Act
  const isWritten = await SignatureStore.writeSettings(fs, files, SignatureSettings.defaults(), root)

  // Assert
  expect(isWritten).toBe(true)
  expect(fs.text(files.settings)).not.toBe('')
})

test('writeSettings returns false when the write fails', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh().failWrite(files.settings)

  // Assert
  expect(await SignatureStore.writeSettings(fs, files, SignatureSettings.defaults(), root)).toBe(false)
})

test('parseState of garbage gives the empty state', () => {
  // Assert
  expect(SignatureStore.parseState('garbage')).toEqual(SignatureStore.emptyState())
})

test('parseState turns negative and non numeric counters into zero', () => {
  // Act
  const state = SignatureStore.parseState(JSON.stringify({ nextCaseId: -3, tokensToday: 'x', runsToday: null, backoffUntil: -1 }))

  // Assert
  expect([state.nextCaseId, state.tokensToday, state.runsToday, state.backoffUntil]).toEqual([0, 0, 0, 0])
})

test('parseState keeps valid counters', () => {
  // Act
  const state = SignatureStore.parseState(JSON.stringify({ nextCaseId: 12, tokensToday: 500, runsToday: 2, backoffUntil: 99 }))

  // Assert
  expect([state.nextCaseId, state.tokensToday, state.runsToday, state.backoffUntil]).toEqual([12, 500, 2, 99])
})

test('parseState keeps only well formed journal keys with integer counts', () => {
  // Arrange
  const journal = { '2026-11/s1.jsonl': 3, '2026-11/s1.2.jsonl': 4, '../x.jsonl': 1, 'a.jsonl': 1, '2026-11/s2.jsonl': 1.5, '2026-11/s3.jsonl': -1 }

  // Act
  const state = SignatureStore.parseState(JSON.stringify({ journal }))

  // Assert
  expect(state.journal).toEqual({ '2026-11/s1.jsonl': 3, '2026-11/s1.2.jsonl': 4 })
})

test('parseState keeps the last 30 runs', () => {
  // Act
  const state = SignatureStore.parseState(JSON.stringify({ runs: SignatureStoreFixture.runs(40) }))

  // Assert
  expect(state.runs.length).toBe(30)
  expect(state.runs[0]?.at).toBe(10)
  expect(state.runs[29]?.at).toBe(39)
})

test('parseState skips malformed runs', () => {
  // Arrange
  const runs = [{ at: 1, ok: 'yes', tokens: 1, cases: 1, traits: 1 }, { at: -1, ok: true, tokens: 1, cases: 1, traits: 1 }, 5, { at: 2, ok: false, tokens: 1, cases: 1, traits: 1 }]

  // Act
  const state = SignatureStore.parseState(JSON.stringify({ runs }))

  // Assert
  expect(state.runs.map((run) => run.at)).toEqual([2])
})

test('parseState drops a bad day and keeps a good one', () => {
  // Assert
  expect(SignatureStore.parseState('{"day":"yesterday"}').day).toBe('')
  expect(SignatureStore.parseState('{"day":"2026-11-05"}').day).toBe('2026-11-05')
})

test('parseState cuts a long last error to 500 characters', () => {
  // Assert
  expect(SignatureStore.parseState(JSON.stringify({ lastError: 'e'.repeat(900) })).lastError.length).toBe(500)
})

test('readState gives the empty state for an absent file', async () => {
  // Act
  const result = await SignatureStore.readState(SignatureStoreFixture.fresh(), files)

  // Assert
  expect(result.value).toEqual(SignatureStore.emptyState())
})

test('readState flags a newer version', async () => {
  // Assert
  expect((await SignatureStore.readState(SignatureStoreFixture.fresh().seed(files.state, '{"version":2}'), files)).isNewer).toBe(true)
})

test('readState flags a corrupt file', async () => {
  // Assert
  expect((await SignatureStore.readState(SignatureStoreFixture.fresh().seed(files.state, '[]'), files)).isCorrupt).toBe(true)
})

test('writeState then readState gives back the state', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh()
  const state = { ...SignatureStore.emptyState(), nextCaseId: 7, day: '2026-11-05', lastError: 'boom' }

  // Act
  await SignatureStore.writeState(fs, files, state, root)
  const result = await SignatureStore.readState(fs, files)

  // Assert
  expect(result.value).toEqual(state)
})

test('writeState refuses to overwrite a newer file', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh().seed(files.state, '{"version":2}')

  // Assert
  expect(await SignatureStore.writeState(fs, files, SignatureStore.emptyState(), root)).toBe(false)
  expect(fs.writes).toEqual([])
})

test('flushJournal writes the signals to the file of their month and session', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh()

  // Act
  const result = await SignatureStore.flushJournal(fs, root, 's1', SignatureStoreFixture.AT, SignatureStoreFixture.signals(2), 0, root)

  // Assert
  expect(result).toEqual({ part: 0, written: 2 })
  expect(fs.writes).toEqual([root + '/journal/2026-11/s1.jsonl'])
  expect(fs.text(root + '/journal/2026-11/s1.jsonl')?.split('\n').filter((line) => line !== '').length).toBe(2)
})

test('flushJournal appends to an existing file', async () => {
  // Arrange
  const path = root + '/journal/2026-11/s1.jsonl'
  const fs = SignatureStoreFixture.fresh().seed(path, '{"old":1}\n')

  // Act
  await SignatureStore.flushJournal(fs, root, 's1', SignatureStoreFixture.AT, SignatureStoreFixture.signals(1), 0, root)

  // Assert
  expect(fs.text(path)?.startsWith('{"old":1}\n{')).toBe(true)
})

test('flushJournal rotates to part 1 when the next write would exceed 512 KiB', async () => {
  // Arrange
  const first = root + '/journal/2026-11/s1.jsonl'
  const fs = SignatureStoreFixture.fresh().seed(first, 'x'.repeat(524288 - 5) + '\n')

  // Act
  const result = await SignatureStore.flushJournal(fs, root, 's1', SignatureStoreFixture.AT, SignatureStoreFixture.signals(1), 0, root)

  // Assert
  expect(result).toEqual({ part: 1, written: 1 })
  expect(fs.writes).toEqual([root + '/journal/2026-11/s1.1.jsonl'])
})

test('flushJournal continues in the given part', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh()

  // Act
  const result = await SignatureStore.flushJournal(fs, root, 's1', SignatureStoreFixture.AT, SignatureStoreFixture.signals(1), 1, root)

  // Assert
  expect(result.part).toBe(1)
  expect(fs.writes).toEqual([root + '/journal/2026-11/s1.1.jsonl'])
})

test('flushJournal of no signals writes nothing', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh()

  // Act
  const result = await SignatureStore.flushJournal(fs, root, 's1', SignatureStoreFixture.AT, [], 0, root)

  // Assert
  expect(result.written).toBe(0)
  expect(fs.writes).toEqual([])
})

test('flushJournal survives a write error', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh().failWrite(root + '/journal/2026-11/s1.jsonl')

  // Act
  const result = await SignatureStore.flushJournal(fs, root, 's1', SignatureStoreFixture.AT, SignatureStoreFixture.signals(1), 0, root)

  // Assert
  expect(result).toEqual({ part: 0, written: 0 })
})

test('flushJournal keeps an unsafe session id inside the root', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh()

  // Act
  await SignatureStore.flushJournal(fs, root, '../../evil', SignatureStoreFixture.AT, SignatureStoreFixture.signals(1), 0, root)

  // Assert
  expect(fs.writes.every((path) => path.startsWith(root + '/'))).toBe(true)
})

test('readIndex of an absent file is undefined and not corrupt', async () => {
  // Act
  const result = await SignatureStore.readIndex(SignatureStoreFixture.fresh(), files)

  // Assert
  expect(result.value).toBe(undefined)
  expect([result.isNewer, result.isCorrupt]).toEqual([false, false])
})

test('readIndex flags a corrupt file', async () => {
  // Act
  const result = await SignatureStore.readIndex(SignatureStoreFixture.fresh().seed(files.index, 'garbage'), files)

  // Assert
  expect(result.value).toBe(undefined)
  expect(result.isCorrupt).toBe(true)
})

test('readIndex flags a newer version', async () => {
  // Assert
  expect((await SignatureStore.readIndex(SignatureStoreFixture.fresh().seed(files.index, '{"version":2}'), files)).isNewer).toBe(true)
})

test('readIndex reads a valid index', async () => {
  // Act
  const result = await SignatureStore.readIndex(SignatureStoreFixture.fresh().seed(files.index, TagIndex.serialize(TagIndex.empty())), files)

  // Assert
  expect(result.value).toEqual(TagIndex.empty())
  expect(result.isCorrupt).toBe(false)
})

test('sizes sums the index, the cases and the journal in bytes', async () => {
  // Act
  const sizes = await SignatureStore.sizes(SignatureStoreFixture.filled(), files)

  // Assert
  expect(sizes.indexBytes).toBe(3)
  expect(sizes.casesBytes).toBe(10)
  expect(sizes.journalBytes).toBe(4 + 5)
})

test('sizes counts empty files', async () => {
  // Act
  const sizes = await SignatureStore.sizes(SignatureStoreFixture.filled(), files)

  // Assert
  expect(sizes.emptyFiles).toBe(1)
})

test('sizes of an empty root is all zero', async () => {
  // Assert
  expect(await SignatureStore.sizes(SignatureStoreFixture.fresh(), files)).toEqual({ indexBytes: 0, casesBytes: 0, journalBytes: 0, emptyFiles: 0 })
})

test('erase empties every file under the root including nested journal months', async () => {
  // Arrange
  const fs = SignatureStoreFixture.filled()

  // Act
  await SignatureStore.erase(fs, files, root)

  // Assert
  expect(fs.text(files.index)).toBe('')
  expect(fs.text(files.cases + '/000.jsonl')).toBe('')
  expect(fs.text(files.journal + '/2026-11/s1.jsonl')).toBe('')
  expect(fs.text(files.journal + '/2026-10/s0.jsonl')).toBe('')
})

test('erase returns the number of files it emptied', async () => {
  // Act
  const emptied = (await SignatureStore.erase(SignatureStoreFixture.filled(), files, root)).emptied

  // Assert
  expect(emptied).toBe(6)
})

test('erase never writes outside the root', async () => {
  // Arrange
  const fs = SignatureStoreFixture.filled().seed('/r/other/file.txt', 'keep')

  // Act
  await SignatureStore.erase(fs, files, root)

  // Assert
  expect(fs.writes.every((path) => path.startsWith(root + '/'))).toBe(true)
  expect(fs.text('/r/other/file.txt')).toBe('keep')
})

test('erase skips entries that are not files', async () => {
  // Arrange
  const fs = SignatureStoreFixture.filled().link(files.cases + '/link', 9)

  // Act
  await SignatureStore.erase(fs, files, root)

  // Assert
  expect(fs.writes.includes(files.cases + '/link')).toBe(false)
})

test('erase ends with the settings consent declined', async () => {
  // Arrange
  const fs = SignatureStoreFixture.filled()

  // Act
  await SignatureStore.erase(fs, files, root)

  // Assert
  expect((await SignatureStore.readSettings(fs, files)).value.consent).toBe('declined')
})

test('erase continues past a failing write', async () => {
  // Arrange
  const fs = SignatureStoreFixture.filled().failWrite(files.cases + '/000.jsonl')

  // Act
  const emptied = (await SignatureStore.erase(fs, files, root)).emptied

  // Assert
  expect(emptied).toBe(5)
  expect(fs.text(files.journal + '/2026-11/s1.jsonl')).toBe('')
})

test('erase on an empty root writes only the declined settings', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh()

  // Act
  const emptied = (await SignatureStore.erase(fs, files, root)).emptied

  // Assert
  expect(emptied).toBe(0)
  expect(fs.writes).toEqual([files.settings])
})

test('resolveRoot of an unsafe root is empty', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh()

  // Assert
  expect(await Promise.all(SignatureStoreFixture.badRoots().map((bad) => SignatureStore.resolveRoot(fs, bad)))).toEqual(['', '', ''])
})

test('resolveRoot of an existing root is the root itself', async () => {
  // Assert
  expect(await SignatureStore.resolveRoot(SignatureStoreFixture.fresh(), root)).toBe(root)
})

test('resolveRoot of a missing root resolves through the nearest existing ancestor', async () => {
  // Arrange
  const fs = new MemoryFs().mkdir('/r')

  // Assert
  expect(await SignatureStore.resolveRoot(fs, root)).toBe(root)
})

test('resolveRoot follows an aliased ancestor to its real location', async () => {
  // Arrange
  const fs = new MemoryFs().mkdir('/r').alias('/r', '/mnt/real')

  // Assert
  expect(await SignatureStore.resolveRoot(fs, root)).toBe('/mnt/real/podium')
})

test('resolveRoot of an aliased root returns the alias target', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh().alias(root, '/elsewhere/podium')

  // Assert
  expect(await SignatureStore.resolveRoot(fs, root)).toBe('/elsewhere/podium')
})

test('resolveRoot is empty when nothing can be statted', async () => {
  // Arrange
  const fs = new MemoryFs()
  fs.stat = async () => undefined

  // Assert
  expect(await SignatureStore.resolveRoot(fs, root)).toBe('')
})

test('resolveRoot of a missing root under an existing slash is the root itself', async () => {
  // Assert
  expect(await SignatureStore.resolveRoot(new MemoryFs(), root)).toBe(root)
})

test('a write is refused when the real root is empty', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh()

  // Act
  const isWritten = await SignatureStore.writeSettings(fs, files, SignatureSettings.defaults(), '')

  // Assert
  expect(isWritten).toBe(false)
  expect(fs.writes).toEqual([])
})

test('a journal write is refused when the parent resolves outside the real root', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh().mkdir(root + '/journal/2026-11').alias(root + '/journal/2026-11', '/outside')

  // Act
  const result = await SignatureStore.flushJournal(fs, root, 's1', SignatureStoreFixture.AT, SignatureStoreFixture.signals(1), 0, root)

  // Assert
  expect(result.written).toBe(0)
  expect(fs.writes).toEqual([])
})

test('a write is refused when the target is a link', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh().link(files.settings, 4)

  // Act
  const isWritten = await SignatureStore.writeSettings(fs, files, SignatureSettings.defaults(), root)

  // Assert
  expect(isWritten).toBe(false)
  expect(fs.writes).toEqual([])
})

test('a write is refused when the target is a directory', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh().mkdir(files.settings)

  // Act
  const isWritten = await SignatureStore.writeSettings(fs, files, SignatureSettings.defaults(), root)

  // Assert
  expect(isWritten).toBe(false)
  expect(fs.writes).toEqual([])
})

test('erase is complete when every write succeeds', async () => {
  // Act
  const result = await SignatureStore.erase(SignatureStoreFixture.filled(), files, root)

  // Assert
  expect(result.isComplete).toBe(true)
})

test('erase is not complete when a write fails', async () => {
  // Arrange
  const fs = SignatureStoreFixture.filled().failWrite(files.cases + '/000.jsonl')

  // Act
  const result = await SignatureStore.erase(fs, files, root)

  // Assert
  expect(result.isComplete).toBe(false)
})

test('erase is not complete when a write is refused', async () => {
  // Arrange
  const fs = SignatureStoreFixture.filled().alias(files.journal + '/2026-11', '/outside')

  // Act
  const result = await SignatureStore.erase(fs, files, root)

  // Assert
  expect(result.isComplete).toBe(false)
  expect(fs.text(files.journal + '/2026-11/s1.jsonl')).toBe('éé')
})

test('erase is not complete when the real root is unknown', async () => {
  // Act
  const result = await SignatureStore.erase(SignatureStoreFixture.filled(), files, '')

  // Assert
  expect(result).toEqual({ emptied: 0, isComplete: false, isLocked: false })
})

test('erase is not complete when the depth cap is hit', async () => {
  // Arrange
  const fs = SignatureStoreFixture.filled().seed(root + '/a/b/c/d/e/f.txt', 'deep')

  // Act
  const result = await SignatureStore.erase(fs, files, root)

  // Assert
  expect(result.isComplete).toBe(false)
  expect(fs.text(root + '/a/b/c/d/e/f.txt')).toBe('deep')
})

test('erase of a root that is not safe reports nothing emptied and not complete', async () => {
  // Assert
  expect(await SignatureStore.erase(new MemoryFs(), SignaturePaths.files('/'), '/')).toEqual({ emptied: 0, isComplete: false, isLocked: false })
})

class LockFixture {
  static lock(owner: string, expiresAt: number): string {
    return JSON.stringify({ version: 1, owner, expiresAt }) + '\n'
  }

  static idle(): Promise<void> {
    return Promise.resolve()
  }
}

const NOW = 1_000_000

test('takeLock is taken when there is no lock', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh()

  // Act
  const isTaken = await SignatureStore.takeLock(fs, files, 'me', NOW, root, LockFixture.idle)

  // Assert
  expect(isTaken).toBe(true)
  expect(JSON.parse(fs.text(files.lock) ?? '{}').owner).toBe('me')
})

test('takeLock sets an expiry fifteen minutes ahead', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh()

  // Act
  await SignatureStore.takeLock(fs, files, 'me', NOW, root, LockFixture.idle)

  // Assert
  expect(JSON.parse(fs.text(files.lock) ?? '{}').expiresAt).toBe(NOW + 15 * 60 * 1000)
})

test('takeLock is taken over an expired lock', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh().seed(files.lock, LockFixture.lock('other', NOW - 1))

  // Assert
  expect(await SignatureStore.takeLock(fs, files, 'me', NOW, root, LockFixture.idle)).toBe(true)
})

test('takeLock is taken again by its own owner', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh().seed(files.lock, LockFixture.lock('me', NOW + 5000))

  // Assert
  expect(await SignatureStore.takeLock(fs, files, 'me', NOW, root, LockFixture.idle)).toBe(true)
})

test('takeLock is taken over a corrupt lock file', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh().seed(files.lock, 'garbage')

  // Assert
  expect(await SignatureStore.takeLock(fs, files, 'me', NOW, root, LockFixture.idle)).toBe(true)
})

test('takeLock is refused while another owner holds a live lock', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh().seed(files.lock, LockFixture.lock('other', NOW + 5000))

  // Act
  const isTaken = await SignatureStore.takeLock(fs, files, 'me', NOW, root, LockFixture.idle)

  // Assert
  expect(isTaken).toBe(false)
  expect(fs.writes).toEqual([])
})

test('takeLock is refused when the lock file has a newer version', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh().seed(files.lock, '{"version":2}')

  // Assert
  expect(await SignatureStore.takeLock(fs, files, 'me', NOW, root, LockFixture.idle)).toBe(false)
})

test('takeLock is refused without a real root', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh()

  // Act
  const isTaken = await SignatureStore.takeLock(fs, files, 'me', NOW, '', LockFixture.idle)

  // Assert
  expect(isTaken).toBe(false)
  expect(fs.writes).toEqual([])
})

test('takeLock is refused for an empty owner', async () => {
  // Assert
  expect(await SignatureStore.takeLock(SignatureStoreFixture.fresh(), files, '', NOW, root, LockFixture.idle)).toBe(false)
})

test('takeLock waits 300 ms before it checks the lock again', async () => {
  // Arrange
  const waits: number[] = []

  // Act
  await SignatureStore.takeLock(SignatureStoreFixture.fresh(), files, 'me', NOW, root, async (ms) => {
    waits.push(ms)
  })

  // Assert
  expect(waits).toEqual([300])
})

test('takeLock is lost when a competing owner writes during the wait', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh()

  // Act
  const isTaken = await SignatureStore.takeLock(fs, files, 'me', NOW, root, async () => {
    fs.seed(files.lock, LockFixture.lock('rival', NOW + 5000))
  })

  // Assert
  expect(isTaken).toBe(false)
})

test('releaseLock empties a lock it owns', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh().seed(files.lock, LockFixture.lock('me', NOW + 5000))

  // Act
  await SignatureStore.releaseLock(fs, files, 'me', root)

  // Assert
  expect(fs.text(files.lock)).toBe('')
})

test('releaseLock leaves a lock held by another owner', async () => {
  // Arrange
  const text = LockFixture.lock('other', NOW + 5000)
  const fs = SignatureStoreFixture.fresh().seed(files.lock, text)

  // Act
  await SignatureStore.releaseLock(fs, files, 'me', root)

  // Assert
  expect(fs.text(files.lock)).toBe(text)
})

test('releaseLock writes nothing without a real root', async () => {
  // Arrange
  const text = LockFixture.lock('me', NOW + 5000)
  const fs = SignatureStoreFixture.fresh().seed(files.lock, text)

  // Act
  await SignatureStore.releaseLock(fs, files, 'me', '')

  // Assert
  expect(fs.text(files.lock)).toBe(text)
})

test('readCases of an empty root is empty', async () => {
  // Assert
  expect(await SignatureStore.readCases(SignatureStoreFixture.fresh(), files)).toEqual({ cases: [], archived: [], bad: 0 })
})

test('readCases with a bad root never touches the file system', async () => {
  // Arrange
  const fs = new MemoryFs()

  // Act
  for (const bad of SignatureStoreFixture.badRoots()) await SignatureStore.readCases(fs, SignaturePaths.files(bad))

  // Assert
  expect(fs.calls).toEqual([])
})

test('writeCases then readCases gives back cases over several shards', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh()
  const cases = [1, 2, 300, 600].map((id) => SignatureFixtures.caseOf({ id }))

  // Act
  await SignatureStore.writeCases(fs, files, cases, [], root)
  const read = await SignatureStore.readCases(fs, files)

  // Assert
  expect(read.cases.map((item) => item.id)).toEqual([1, 2, 300, 600])
  expect(fs.writes).toContain(files.cases + '/000.jsonl')
  expect(fs.writes).toContain(files.cases + '/001.jsonl')
  expect(fs.writes).toContain(files.cases + '/002.jsonl')
})

test('writeCases puts archived cases in the archive shards', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh()

  // Act
  await SignatureStore.writeCases(fs, files, [SignatureFixtures.caseOf({ id: 1 })], [SignatureFixtures.caseOf({ id: 5 })], root)
  const read = await SignatureStore.readCases(fs, files)

  // Assert
  expect(read.cases.map((item) => item.id)).toEqual([1])
  expect(read.archived.map((item) => item.id)).toEqual([5])
  expect(fs.text(files.archive + '/000.jsonl')).not.toBe(undefined)
})

test('writeCases keeps an id that is both active and archived only as active', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh()

  // Act
  await SignatureStore.writeCases(fs, files, [SignatureFixtures.caseOf({ id: 1 })], [SignatureFixtures.caseOf({ id: 1 })], root)
  const read = await SignatureStore.readCases(fs, files)

  // Assert
  expect(read.cases.map((item) => item.id)).toEqual([1])
  expect(read.archived).toEqual([])
})

test('readCases keeps the active case when an id is also in the archive', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh()
    .seed(files.cases + '/000.jsonl', SignatureStoreFixture.line(SignatureFixtures.caseOf({ id: 1, choice: 'active choice' })))
    .seed(files.archive + '/000.jsonl', SignatureStoreFixture.line(SignatureFixtures.caseOf({ id: 1, choice: 'archived choice' })))

  // Act
  const read = await SignatureStore.readCases(fs, files)

  // Assert
  expect(read.cases[0]?.choice).toBe('active choice')
  expect(read.archived).toEqual([])
})

test('writeCases empties a shard that no longer holds a case', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh()
  await SignatureStore.writeCases(fs, files, [SignatureFixtures.caseOf({ id: 1 }), SignatureFixtures.caseOf({ id: 300 })], [], root)

  // Act
  await SignatureStore.writeCases(fs, files, [SignatureFixtures.caseOf({ id: 1 })], [], root)
  const read = await SignatureStore.readCases(fs, files)

  // Assert
  expect(fs.text(files.cases + '/001.jsonl')).toBe('')
  expect(read.cases.map((item) => item.id)).toEqual([1])
})

test('writeCases keeps every write under the root', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh()

  // Act
  await SignatureStore.writeCases(fs, files, [SignatureFixtures.caseOf({ id: 1 })], [SignatureFixtures.caseOf({ id: 2 })], root)

  // Assert
  expect(fs.writes.every((path) => path.startsWith(root + '/'))).toBe(true)
})

test('writeCases refuses to write without a real root', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh()

  // Act
  const isDone = await SignatureStore.writeCases(fs, files, [SignatureFixtures.caseOf({ id: 1 })], [], '')

  // Assert
  expect(isDone).toBe(false)
  expect(fs.writes).toEqual([])
})

test('writeCases drops the least recently seen cases above the 6 MiB budget', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh()
  const filler = 'x '.repeat(150)
  const cases = Array.from({ length: 24000 }, (_, id) => SignatureFixtures.caseOf({ id, situation: filler, choice: filler, why: filler, lastSeen: id < 100 ? '2020-01-01' : '2026-01-01' }))

  // Act
  await SignatureStore.writeCases(fs, files, cases, [], root)
  const read = await SignatureStore.readCases(fs, files)
  const ids = new Set(read.cases.map((item) => item.id))

  // Assert
  expect(read.cases.length).toBeLessThan(24000)
  expect(ids.has(0)).toBe(false)
  expect(ids.has(23999)).toBe(true)
})

test('writeIndex writes the index under the root', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh()

  // Act
  const isWritten = await SignatureStore.writeIndex(fs, files, TagIndex.empty(), root)

  // Assert
  expect(isWritten).toBe(true)
  expect(fs.writes).toEqual([files.index])
})

test('writeIndex refuses to overwrite a newer file', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh().seed(files.index, '{"version":2}')

  // Assert
  expect(await SignatureStore.writeIndex(fs, files, TagIndex.empty(), root)).toBe(false)
  expect(fs.text(files.index)).toBe('{"version":2}')
})

test('readProfile of an absent file is the empty profile', async () => {
  // Assert
  expect((await SignatureStore.readProfile(SignatureStoreFixture.fresh(), files)).value).toEqual(Profile.empty())
})

test('readProfile flags a newer version', async () => {
  // Assert
  expect((await SignatureStore.readProfile(SignatureStoreFixture.fresh().seed(files.profile, '{"version":2}'), files)).isNewer).toBe(true)
})

test('writeProfile then readProfile gives back the profile', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh()
  const profile = { ...Profile.empty(), updatedAt: '2026-11-05', changedSince: 3 }

  // Act
  await SignatureStore.writeProfile(fs, files, profile, root)

  // Assert
  expect((await SignatureStore.readProfile(fs, files)).value).toEqual(profile)
})

test('writeProfile refuses to overwrite a newer file', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh().seed(files.profile, '{"version":2}')

  // Assert
  expect(await SignatureStore.writeProfile(fs, files, Profile.empty(), root)).toBe(false)
})

test('readOverlay of an absent file is the empty overlay', async () => {
  // Assert
  expect((await SignatureStore.readOverlay(SignatureStoreFixture.fresh(), files)).value).toEqual(Vocabulary.parseOverlay(''))
})

test('writeOverlay then readOverlay gives back the overlay', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh()
  const overlay = { revision: 3, tags: { 'rate-limit': { facet: 'concept' as const, parent: 'security', aliases: ['throttling'], paths: [] } }, candidates: { idea: 2 } }

  // Act
  await SignatureStore.writeOverlay(fs, files, overlay, root)

  // Assert
  expect((await SignatureStore.readOverlay(fs, files)).value).toEqual(overlay)
})

test('writeOverlay refuses to overwrite a newer file', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh().seed(files.vocabulary, '{"version":2}')

  // Assert
  expect(await SignatureStore.writeOverlay(fs, files, Vocabulary.parseOverlay(''), root)).toBe(false)
})

test('readOverlay flags a newer version', async () => {
  // Assert
  expect((await SignatureStore.readOverlay(SignatureStoreFixture.fresh().seed(files.vocabulary, '{"version":2}'), files)).isNewer).toBe(true)
})

test('readCursor of an absent file is undefined', async () => {
  // Assert
  expect(await SignatureStore.readCursor(SignatureStoreFixture.fresh(), files, 'r1')).toBe(undefined)
})

test('writeCursor then readCursor gives back the cursor in the history folder', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh()
  const cursor = { ...HistoryScanner.emptyCursor('/x/repo', 'repo', 'auto'), head: 'abc1234', done: ['abc1234'] }

  // Act
  await SignatureStore.writeCursor(fs, files, 'r1', cursor, root)

  // Assert
  expect(fs.writes).toEqual([root + '/history/r1.json'])
  expect(await SignatureStore.readCursor(fs, files, 'r1')).toEqual(cursor)
})

test('writeCursor refuses to overwrite a newer file', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh().seed(root + '/history/r1.json', '{"version":2}')

  // Assert
  expect(await SignatureStore.writeCursor(fs, files, 'r1', HistoryScanner.emptyCursor('/x', 'x', 'auto'), root)).toBe(false)
})

test('readCursor of a newer file is undefined', async () => {
  // Assert
  expect(await SignatureStore.readCursor(SignatureStoreFixture.fresh().seed(root + '/history/r1.json', '{"version":2,"root":"/x"}'), files, 'r1')).toBe(undefined)
})

test('writeCursor keeps an unsafe repository id inside the root', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh()

  // Act
  await SignatureStore.writeCursor(fs, files, '../../evil', HistoryScanner.emptyCursor('/x', 'x', 'auto'), root)

  // Assert
  expect(fs.writes.every((path) => path.startsWith(root + '/history/'))).toBe(true)
})

test('journalFiles lists non empty journal files by month and name', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh()
    .seed(files.journal + '/2026-11/s1.jsonl', 'abc')
    .seed(files.journal + '/2026-11/s1.2.jsonl', 'abcd')
    .seed(files.journal + '/2026-10/s0.jsonl', 'a')

  // Act
  const found = await SignatureStore.journalFiles(fs, files)

  // Assert
  expect(found.map((item) => item.key)).toEqual(['2026-10/s0.jsonl', '2026-11/s1.2.jsonl', '2026-11/s1.jsonl'])
  expect(found.map((item) => item.bytes)).toEqual([1, 4, 3])
  expect(found[0]?.path).toBe(files.journal + '/2026-10/s0.jsonl')
})

test('journalFiles skips empty files, odd names and folders that are not months', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh()
    .seed(files.journal + '/2026-11/empty.jsonl', '')
    .seed(files.journal + '/2026-11/notes.txt', 'abc')
    .seed(files.journal + '/2026-11/bad name.jsonl', 'abc')
    .seed(files.journal + '/junk/s.jsonl', 'abc')

  // Assert
  expect(await SignatureStore.journalFiles(fs, files)).toEqual([])
})

test('journalFiles of a bad root never touches the file system', async () => {
  // Arrange
  const fs = new MemoryFs()

  // Act
  for (const bad of SignatureStoreFixture.badRoots()) await SignatureStore.journalFiles(fs, SignaturePaths.files(bad))

  // Assert
  expect(fs.calls).toEqual([])
})

test('emptyFile writes an empty text to a file under the root', async () => {
  // Arrange
  const path = files.journal + '/2026-11/s1.jsonl'
  const fs = SignatureStoreFixture.fresh().seed(path, 'abc')

  // Act
  const isDone = await SignatureStore.emptyFile(fs, files, path, root)

  // Assert
  expect(isDone).toBe(true)
  expect(fs.text(path)).toBe('')
})

test('emptyFile refuses a path outside the root', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh().seed('/r/other/x.jsonl', 'keep')

  // Act
  const isDone = await SignatureStore.emptyFile(fs, files, '/r/other/x.jsonl', root)

  // Assert
  expect(isDone).toBe(false)
  expect(fs.text('/r/other/x.jsonl')).toBe('keep')
})

test('emptyFile refuses without a real root', async () => {
  // Arrange
  const path = files.index
  const fs = SignatureStoreFixture.fresh().seed(path, 'abc')

  // Assert
  expect(await SignatureStore.emptyFile(fs, files, path, '')).toBe(false)
  expect(fs.text(path)).toBe('abc')
})

test('quarantine writes the text to the same name with a corrupt suffix and the time', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh()

  // Act
  const isDone = await SignatureStore.quarantine(fs, files, files.index, 'broken', 1234.9, root)

  // Assert
  expect(isDone).toBe(true)
  expect(fs.text(files.index + '.corrupt-1234')).toBe('broken')
})

test('quarantine refuses a time that is not a number', async () => {
  // Assert
  expect(await SignatureStore.quarantine(SignatureStoreFixture.fresh(), files, files.index, 'x', Number.NaN, root)).toBe(false)
})

test('quarantine refuses a path outside the root', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh()

  // Act
  const isDone = await SignatureStore.quarantine(fs, files, '/r/other/x.json', 'x', 5, root)

  // Assert
  expect(isDone).toBe(false)
  expect(fs.writes).toEqual([])
})

class EraseFixture {
  static lock(owner: string, expiresAt: number): string {
    return JSON.stringify({ version: 1, owner, expiresAt }) + '\n'
  }

  static options(fs: MemoryFs, waits: number[], onWait: (count: number) => void = () => undefined) {
    return {
      owner: 'me',
      now: () => 1_000_000,
      wait: async (ms: number) => {
        waits.push(ms)
        onWait(waits.length)
        void fs
      }
    }
  }
}

test('erase with a lock option takes the lock and erases', async () => {
  // Arrange
  const fs = SignatureStoreFixture.filled()
  const waits: number[] = []

  // Act
  const result = await SignatureStore.erase(fs, files, root, EraseFixture.options(fs, waits))

  // Assert
  expect(result.isLocked).toBe(false)
  expect(result.emptied).toBe(7)
  expect(result.isComplete).toBe(true)
})

test('erase with a lock option gives up after ten tries against a live lock of another owner', async () => {
  // Arrange
  const fs = SignatureStoreFixture.filled().seed(files.lock, EraseFixture.lock('rival', 9_999_999))
  const waits: number[] = []

  // Act
  const result = await SignatureStore.erase(fs, files, root, EraseFixture.options(fs, waits))

  // Assert
  expect(result).toEqual({ emptied: 0, isComplete: false, isLocked: true })
  expect(waits).toEqual(Array.from({ length: 9 }, () => 1000))
  expect(fs.writes).toEqual([])
})

test('erase with a lock option goes ahead once the lock is freed on the third try', async () => {
  // Arrange
  const fs = SignatureStoreFixture.filled().seed(files.lock, EraseFixture.lock('rival', 9_999_999))
  const waits: number[] = []

  // Act
  const result = await SignatureStore.erase(fs, files, root, EraseFixture.options(fs, waits, (count) => {
    if (count === 2) fs.seed(files.lock, '')
  }))

  // Assert
  expect(result.isLocked).toBe(false)
  expect(result.emptied).toBeGreaterThan(0)
  expect(waits.slice(0, 2)).toEqual([1000, 1000])
})

test('erase empties the lock file last', async () => {
  // Arrange
  const fs = SignatureStoreFixture.filled().seed(files.lock, EraseFixture.lock('me', 9_999_999))

  // Act
  await SignatureStore.erase(fs, files, root)

  // Assert
  expect(fs.writes[fs.writes.length - 1]).toBe(files.lock)
  expect(fs.writes.indexOf(files.settings)).toBeLessThan(fs.writes.indexOf(files.lock))
  expect(fs.text(files.lock)).toBe('')
})

test('erase with a lock option releases nothing and leaves the lock emptied at the end', async () => {
  // Arrange
  const fs = SignatureStoreFixture.filled()
  const waits: number[] = []

  // Act
  await SignatureStore.erase(fs, files, root, EraseFixture.options(fs, waits))

  // Assert
  expect(fs.text(files.lock)).toBe('')
  expect(fs.writes[fs.writes.length - 1]).toBe(files.lock)
})

test('listCursors gives the valid cursors sorted by file name', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh()
  await SignatureStore.writeCursor(fs, files, 'r2', HistoryScanner.emptyCursor('/x/two', 'two', 'auto'), root)
  await SignatureStore.writeCursor(fs, files, 'r1', HistoryScanner.emptyCursor('/x/one', 'one', 'manual'), root)

  // Act
  const cursors = await SignatureStore.listCursors(fs, files)

  // Assert
  expect(cursors.map((cursor) => cursor.name)).toEqual(['one', 'two'])
})

test('listCursors skips newer, invalid and empty cursor files', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh()
    .seed(root + '/history/newer.json', '{"version":2,"root":"/x"}')
    .seed(root + '/history/bad.json', 'garbage')
    .seed(root + '/history/empty.json', '')
    .seed(root + '/history/notes.txt', 'x')

  // Assert
  expect(await SignatureStore.listCursors(fs, files)).toEqual([])
})

test('listCursors of a missing history folder is empty', async () => {
  // Assert
  expect(await SignatureStore.listCursors(SignatureStoreFixture.fresh(), files)).toEqual([])
})

test('listCursors with a bad root never touches the file system', async () => {
  // Arrange
  const fs = new MemoryFs()

  // Act
  for (const bad of SignatureStoreFixture.badRoots()) await SignatureStore.listCursors(fs, SignaturePaths.files(bad))

  // Assert
  expect(fs.calls).toEqual([])
})

test('journalFiles gives the modification time of each file', async () => {
  // Arrange
  const path = files.journal + '/2026-11/s1.jsonl'
  const fs = SignatureStoreFixture.fresh().seed(path, 'abc').touch(path, 424242)

  // Act
  const found = await SignatureStore.journalFiles(fs, files)

  // Assert
  expect(found[0]?.mtimeMs).toBe(424242)
})

test('journalFiles falls back to zero when the listing has no modification time', async () => {
  // Arrange
  const fs = SignatureStoreFixture.fresh().seed(files.journal + '/2026-11/s1.jsonl', 'abc')
  const list = fs.list.bind(fs)
  fs.list = async (path: string) => (await list(path)).map((entry) => ({ ...entry, mtimeMs: undefined as never }))

  // Act
  const found = await SignatureStore.journalFiles(fs, files)

  // Assert
  expect(found[0]?.mtimeMs).toBe(0)
})
