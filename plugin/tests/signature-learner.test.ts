import { expect, test } from 'claude-code/testing'
import { HistoryScanner, type HistoryCursor } from '../hooks/signature/history'
import { Learner, type LearnPorts, type Progress, type RunInput, type RunReport } from '../hooks/signature/learner'
import { LearningPrompts } from '../hooks/signature/prompts'
import { Profile } from '../hooks/signature/profile'
import { SignatureSettings, type Settings } from '../hooks/signature/settings'
import { SignatureStore, type StoreState } from '../hooks/signature/store'
import { TagIndex } from '../hooks/signature/tag-index'
import { Vocabulary } from '../hooks/signature/vocabulary'
import { SignatureFixtures } from './fixtures/signature'
import { LearnSeed, MemoryFs, ScriptedGit, ScriptedModel, SignatureStoreFixture } from './fixtures/signature-fs'

type LearnEnv = { fs: MemoryFs, git: ScriptedGit, model: ScriptedModel, input: RunInput, progress: Progress[] }

class LearnerFixture {
  static readonly NOW = LearnSeed.NOW
  static readonly HOUR = 60 * 60 * 1000
  static readonly NEW_SHA = 'd'.repeat(40)
  static readonly NEW_HEAD = 'c'.repeat(40)

  static settings(learning: Partial<Settings['learning']> = {}, extra: Partial<Settings> = {}): Settings {
    const defaults = SignatureSettings.defaults()
    return { ...defaults, consent: 'enabled', learning: { ...defaults.learning, ...learning }, ...extra }
  }

  static input(settings: Settings = LearnerFixture.settings(), partial: Partial<RunInput> = {}): RunInput {
    return {
      files: SignatureStoreFixture.files(),
      realRoot: SignatureStoreFixture.ROOT,
      settings,
      owner: 'me',
      home: '/Users/j',
      project: 'podium',
      projectId: 'p1',
      stack: 'node',
      repositories: [],
      isForced: false,
      isRebuild: false,
      liveKeys: [],
      ...partial
    }
  }

  static env(settings: Settings = LearnerFixture.settings(), partial: Partial<RunInput> = {}): LearnEnv {
    const fs = SignatureStoreFixture.fresh()
    fs.seed(SignatureStoreFixture.files().settings, SignatureSettings.serialize(settings))
    fs.seed(SignatureStoreFixture.files().profile, Profile.serialize({ ...Profile.empty(), updatedAt: '2026-11-05', synthesizedAt: LearnerFixture.NOW - 1000, changedSince: 0 }))
    return { fs, git: new ScriptedGit(), model: new ScriptedModel(), input: LearnerFixture.input(settings, partial), progress: [] }
  }

  static ports(env: LearnEnv): LearnPorts {
    return { fs: env.fs, git: env.git.port, model: env.model.port, now: () => LearnerFixture.NOW, wait: async () => undefined }
  }

  static run(env: LearnEnv): Promise<RunReport> {
    return Learner.run(LearnerFixture.ports(env), env.input, (value) => {
      env.progress.push(value)
    })
  }

  static async state(env: LearnEnv): Promise<StoreState> {
    return (await SignatureStore.readState(env.fs, SignatureStoreFixture.files())).value
  }

  static repo(source: 'auto' | 'manual' = 'auto', root = '/repo'): RunInput['repositories'][number] {
    return { root, name: 'repo', id: 'r1', source }
  }

  static historyEnv(extra: Partial<Settings> = {}, source: 'auto' | 'manual' = 'auto', candidates: unknown[] = []): LearnEnv {
    const env = LearnerFixture.env(LearnerFixture.settings({}, { identities: ['a@b.co'], ...extra }), { repositories: [LearnerFixture.repo(source)] })
    env.git.log([LearnSeed.log()]).head(LearnSeed.HEAD)
    env.model.next(ScriptedModel.ok(LearnSeed.answer([LearnSeed.raw({ evidence: [LearnSeed.commitEvidence()] })], candidates)))
    return env
  }

  static sessionEnv(settings: Settings = LearnerFixture.settings(), count = 1, candidates: unknown[] = []): LearnEnv {
    const env = LearnerFixture.env(settings)
    LearnSeed.prompts(env.fs, count)
    env.model.next(ScriptedModel.ok(LearnSeed.answer([LearnSeed.raw()], candidates)))
    return env
  }

  static async cursorEnv(partial: Partial<HistoryCursor> = {}): Promise<LearnEnv> {
    const env = LearnerFixture.env(LearnerFixture.settings({}, { identities: ['a@b.co'] }), { repositories: [LearnerFixture.repo()] })
    const cursor: HistoryCursor = {
      ...HistoryScanner.emptyCursor('/repo', 'repo', 'auto'), identities: ['a@b.co'], head: LearnSeed.HEAD, done: [LearnSeed.SHA], selected: 1, isComplete: true, ...partial
    }
    await SignatureStore.writeCursor(env.fs, SignatureStoreFixture.files(), 'r1', cursor, SignatureStoreFixture.ROOT)
    env.fs.writes.length = 0
    env.git.head(LearnerFixture.NEW_HEAD)
    return env
  }

  static newCommit(numstat: string[] = ['2\t1\tsrc/b.ts']): string {
    return LearnSeed.log(LearnerFixture.NEW_SHA, 'Add other feature', numstat)
  }

  static logCalls(env: LearnEnv): string[][] {
    const subs = env.git.subcommands()
    return env.git.calls.filter((_, index) => subs[index] === 'log')
  }

  static bulk(count: number, from: number): string {
    return Array.from({ length: count }, (_, index) => LearnSeed.log((0x1000000 + from + index).toString(16).padEnd(40, '0'), 'Add feature ' + index)).join('')
  }

  static distinct(): string[] {
    return [
      'Pin dependency versions in a lockfile',
      'Name tests after the behaviour they pin',
      'Keep commits small and focused on one change',
      'Reject unknown keys when parsing user settings',
      'Prefer composition over deep inheritance trees',
      'Cap every list that comes from user input',
      'Log errors without leaking secrets',
      'Write the failing test before the fix',
      'Fall back to a default when a manifest is invalid',
      'Document breaking changes in the changelog'
    ]
  }

  static tenCases(): Record<string, unknown>[] {
    return LearnerFixture.distinct().map((choice, index) => LearnSeed.raw({ situation: `Situation number ${index} about ${choice}`, choice, evidence: [LearnSeed.evidence(index)] }))
  }

  static big(env: LearnEnv, sessions: string[]): void {
    const text = 'x '.repeat(200)
    sessions.forEach((session, index) => {
      LearnSeed.prompts(env.fs, 45, `2026-11/${session}.jsonl`, session, text + index)
    })
  }

  static journalText(env: LearnEnv, key = LearnSeed.KEY): string | undefined {
    return env.fs.text(SignatureStoreFixture.ROOT + '/journal/' + key)
  }
}

const files = SignatureStoreFixture.files()
const root = SignatureStoreFixture.ROOT

test('isDue is false unless the consent is enabled', () => {
  // Arrange
  const settings = { ...LearnerFixture.settings(), consent: 'paused' as const }

  // Assert
  expect(Learner.isDue(SignatureStore.emptyState(), settings, LearnerFixture.NOW, 100, true, true)).toBe(false)
})

test('isDue is false when background learning is off and the run is not forced', () => {
  // Assert
  expect(Learner.isDue(SignatureStore.emptyState(), LearnerFixture.settings({ background: false }), LearnerFixture.NOW, 100, true, false)).toBe(false)
})

test('isDue is true for a forced run even when background learning is off', () => {
  // Assert
  expect(Learner.isDue(SignatureStore.emptyState(), LearnerFixture.settings({ background: false }), LearnerFixture.NOW, 0, false, true)).toBe(true)
})

test('isDue is false once the runs of the day are used', () => {
  // Arrange
  const state = { ...SignatureStore.emptyState(), day: '2026-11-05', runsToday: 2 }

  // Assert
  expect(Learner.isDue(state, LearnerFixture.settings(), LearnerFixture.NOW, 100, true, false)).toBe(false)
})

test('isDue counts the runs from zero on a new day', () => {
  // Arrange
  const state = { ...SignatureStore.emptyState(), day: '2026-11-04', runsToday: 9, tokensToday: 999999 }

  // Assert
  expect(Learner.isDue(state, LearnerFixture.settings(), LearnerFixture.NOW, 100, false, false)).toBe(true)
})

test('isDue is false once the tokens of the day are used, even when forced', () => {
  // Arrange
  const state = { ...SignatureStore.emptyState(), day: '2026-11-05', tokensToday: 300000 }

  // Assert
  expect(Learner.isDue(state, LearnerFixture.settings(), LearnerFixture.NOW, 100, true, true)).toBe(false)
})

test('isDue is false during a back off and a forced run ignores it', () => {
  // Arrange
  const state = { ...SignatureStore.emptyState(), backoffUntil: LearnerFixture.NOW + 1000 }

  // Assert
  expect(Learner.isDue(state, LearnerFixture.settings(), LearnerFixture.NOW, 100, true, false)).toBe(false)
  expect(Learner.isDue(state, LearnerFixture.settings(), LearnerFixture.NOW, 100, true, true)).toBe(true)
})

test('isDue needs 20 pending signals or some history', () => {
  // Assert
  expect(Learner.isDue(SignatureStore.emptyState(), LearnerFixture.settings(), LearnerFixture.NOW, 19, false, false)).toBe(false)
  expect(Learner.isDue(SignatureStore.emptyState(), LearnerFixture.settings(), LearnerFixture.NOW, 20, false, false)).toBe(true)
  expect(Learner.isDue(SignatureStore.emptyState(), LearnerFixture.settings(), LearnerFixture.NOW, 0, true, false)).toBe(true)
})

test('isDue is false for a state that cannot be read', () => {
  // Assert
  expect(Learner.isDue(undefined as never, LearnerFixture.settings(), LearnerFixture.NOW, 100, true, true)).toBe(false)
})

test('pending sums the lines beyond each journal cursor', () => {
  // Arrange
  const state = { ...SignatureStore.emptyState(), journal: { k1: 4, k2: 9 } }
  const list = [{ path: '/a', key: 'k1', bytes: 1 }, { path: '/b', key: 'k2', bytes: 1 }]

  // Assert
  expect(Learner.pending(state, list, new Map([['k1', 10], ['k2', 5]]))).toBe(6)
})

test('pending counts every line of a file that has no cursor', () => {
  // Assert
  expect(Learner.pending(SignatureStore.emptyState(), [{ path: '/a', key: 'k1', bytes: 1 }], new Map([['k1', 7]]))).toBe(7)
})

test('pending adds nothing for a file whose line count is missing', () => {
  // Assert
  expect(Learner.pending(SignatureStore.emptyState(), [{ path: '/a', key: 'k1', bytes: 1 }], new Map())).toBe(0)
})

test('estimate is one token per 3.5 characters rounded up', () => {
  // Assert
  expect([Learner.estimate(''), Learner.estimate('a'.repeat(7)), Learner.estimate('a'.repeat(8))]).toEqual([0, 2, 3])
})

test('run of invalid ports is reported as an invalid input', async () => {
  // Act
  const report = await Learner.run({} as never, LearnerFixture.input(), () => undefined)

  // Assert
  expect(report.note).toBe('invalid-input')
  expect(report.isOk).toBe(false)
})

test('run with a consent that is not enabled does nothing', async () => {
  // Arrange
  const env = LearnerFixture.env({ ...LearnerFixture.settings(), consent: 'paused' })
  LearnSeed.prompts(env.fs, 1)

  // Act
  const report = await LearnerFixture.run(env)

  // Assert
  expect(report.note).toBe('disabled')
  expect(env.model.requests.length).toBe(0)
  expect(env.fs.writes).toEqual([])
})

test('run does nothing while another owner holds a live lock', async () => {
  // Arrange
  const env = LearnerFixture.sessionEnv()
  env.fs.seed(files.lock, JSON.stringify({ version: 1, owner: 'other', expiresAt: LearnerFixture.NOW + 5000 }))

  // Act
  const report = await LearnerFixture.run(env)

  // Assert
  expect(report.note).toBe('locked')
  expect(env.model.requests.length).toBe(0)
  expect(env.fs.writes).toEqual([])
})

test('run takes over an expired lock and releases it afterwards', async () => {
  // Arrange
  const env = LearnerFixture.sessionEnv()
  env.fs.seed(files.lock, JSON.stringify({ version: 1, owner: 'other', expiresAt: LearnerFixture.NOW - 1 }))

  // Act
  const report = await LearnerFixture.run(env)

  // Assert
  expect(report.note).not.toBe('locked')
  expect(env.model.requests.length).toBe(1)
  expect(env.fs.text(files.lock)).toBe('')
})

test('run releases its lock when it is done', async () => {
  // Arrange
  const env = LearnerFixture.sessionEnv()

  // Act
  await LearnerFixture.run(env)

  // Assert
  expect(env.fs.text(files.lock)).toBe('')
})

test('run leaves a newer state file untouched and makes no call', async () => {
  // Arrange
  const env = LearnerFixture.sessionEnv()
  env.fs.seed(files.state, '{"version":2}')

  // Act
  const report = await LearnerFixture.run(env)

  // Assert
  expect(report.note).toBe('newer-format')
  expect(env.fs.text(files.state)).toBe('{"version":2}')
  expect(env.model.requests.length).toBe(0)
})

test('run leaves a newer profile or vocabulary file alone', async () => {
  // Arrange
  const profile = LearnerFixture.sessionEnv()
  profile.fs.seed(files.profile, '{"version":2}')
  const overlay = LearnerFixture.sessionEnv()
  overlay.fs.seed(files.vocabulary, '{"version":2}')

  // Act
  const reports = [await LearnerFixture.run(profile), await LearnerFixture.run(overlay)]

  // Assert
  expect(reports.map((report) => report.note)).toEqual(['newer-format', 'newer-format'])
  expect(profile.fs.text(files.profile)).toBe('{"version":2}')
  expect(overlay.fs.text(files.vocabulary)).toBe('{"version":2}')
})

test('run quarantines a corrupt state file', async () => {
  // Arrange
  const env = LearnerFixture.env()
  env.fs.seed(files.state, 'garbage')

  // Act
  await LearnerFixture.run(env)

  // Assert
  expect(env.fs.text(files.state + '.corrupt-' + LearnerFixture.NOW)).toBe('garbage')
})

test('sessions store the extracted case in the cases file', async () => {
  // Arrange
  const env = LearnerFixture.sessionEnv()

  // Act
  const report = await LearnerFixture.run(env)
  const set = await SignatureStore.readCases(env.fs, files)

  // Assert
  expect(report.isOk).toBe(true)
  expect(report.added).toBe(1)
  expect(set.cases.map((item) => item.choice)).toEqual(['Validate it and fall back to a default'])
  expect(env.fs.text(files.cases + '/000.jsonl')).not.toBe('')
})

test('sessions advance the next case id', async () => {
  // Arrange
  const env = LearnerFixture.sessionEnv()

  // Act
  await LearnerFixture.run(env)

  // Assert
  expect((await LearnerFixture.state(env)).nextCaseId).toBe(1)
})

test('sessions empty a fully learned journal file and drop its cursor key', async () => {
  // Arrange
  const env = LearnerFixture.sessionEnv()

  // Act
  await LearnerFixture.run(env)

  // Assert
  expect(LearnerFixture.journalText(env)).toBe('')
  expect((await LearnerFixture.state(env)).journal[LearnSeed.KEY]).toBe(undefined)
})

test('sessions send one request with a cached system block and the limits', async () => {
  // Arrange
  const env = LearnerFixture.sessionEnv()

  // Act
  await LearnerFixture.run(env)
  const request = env.model.requests[0]

  // Assert
  expect(env.model.requests.length).toBe(1)
  expect(request?.system.length).toBe(1)
  expect(request?.system[0]?.cache).toBe(true)
  expect(request?.system[0]?.text).toBe(LearningPrompts.extraction(Vocabulary.base()))
  expect(request?.maxTokens).toBe(4000)
  expect(request?.timeoutMs).toBe(120000)
})

test('sessions put the episode in the prompt', async () => {
  // Arrange
  const env = LearnerFixture.sessionEnv()

  // Act
  await LearnerFixture.run(env)

  // Assert
  expect(env.model.requests[0]?.prompt).toContain('always validate the input before use')
  expect(env.model.requests[0]?.prompt).toContain(LearnSeed.evidence(0))
})

test('sessions use the model named in the settings', async () => {
  // Arrange
  const env = LearnerFixture.sessionEnv(LearnerFixture.settings({ model: 'opus' }))

  // Act
  await LearnerFixture.run(env)

  // Assert
  expect(env.model.requests[0]?.model).toBe('opus')
})

test('sessions record the run, the tokens and the day', async () => {
  // Arrange
  const env = LearnerFixture.sessionEnv()

  // Act
  const report = await LearnerFixture.run(env)
  const state = await LearnerFixture.state(env)

  // Assert
  expect(state.tokensToday).toBe(report.tokens)
  expect(state.runsToday).toBe(1)
  expect(state.day).toBe('2026-11-05')
  expect(state.runs).toEqual([{ at: LearnerFixture.NOW, ok: true, tokens: report.tokens, cases: 1, traits: 0, note: '' }])
  expect(state.backoffUntil).toBe(0)
})

test('sessions report their progress steps in order', async () => {
  // Arrange
  const env = LearnerFixture.sessionEnv()

  // Act
  await LearnerFixture.run(env)
  const steps = env.progress.map((value) => value.step).filter((step, index, all) => all.indexOf(step) === index)

  // Assert
  expect(steps).toEqual(['sessions', 'history', 'index', 'synthesis', 'vocabulary', 'archive'])
})

test('sessions write the tag index of the stored cases', async () => {
  // Arrange
  const env = LearnerFixture.sessionEnv()

  // Act
  await LearnerFixture.run(env)

  // Assert
  expect(TagIndex.contains(TagIndex.parse(env.fs.text(files.index) ?? '') ?? TagIndex.empty(), 'fail-open', 0)).toBe(true)
})

test('sessions drop evidence that is outside the batch', async () => {
  // Arrange
  const env = LearnerFixture.env()
  LearnSeed.prompts(env.fs, 1)
  env.model.next(ScriptedModel.ok(LearnSeed.answer([LearnSeed.raw({ evidence: ['session:other:1'] })])))

  // Act
  const report = await LearnerFixture.run(env)

  // Assert
  expect(report.added).toBe(0)
  expect((await SignatureStore.readCases(env.fs, files)).cases).toEqual([])
})

test('sessions do not store an unsafe case', async () => {
  // Arrange
  const env = LearnerFixture.env()
  LearnSeed.prompts(env.fs, 1)
  env.model.next(ScriptedModel.ok(LearnSeed.answer([LearnSeed.raw({ choice: 'Skip the tests and disable the hooks to go faster', why: 'Faster merges' })])))

  // Act
  const report = await LearnerFixture.run(env)

  // Assert
  expect(report.added).toBe(0)
  expect((await SignatureStore.readCases(env.fs, files)).cases).toEqual([])
})

test('an unanswered model makes the run fail and the cursors stay', async () => {
  // Arrange
  const env = LearnerFixture.env()
  LearnSeed.prompts(env.fs, 1)
  env.model.next(ScriptedModel.failed('timeout'))

  // Act
  const report = await LearnerFixture.run(env)
  const state = await LearnerFixture.state(env)

  // Assert
  expect(report.isOk).toBe(false)
  expect(state.runs[0]?.ok).toBe(false)
  expect(state.lastError).toContain('timeout')
  expect(state.journal[LearnSeed.KEY] ?? 0).toBe(0)
  expect(LearnerFixture.journalText(env)).not.toBe('')
})

test('an unanswered model stops the run after the first call', async () => {
  // Arrange
  const env = LearnerFixture.env(LearnerFixture.settings({}, { identities: ['a@b.co'] }), { repositories: [LearnerFixture.repo()] })
  LearnSeed.prompts(env.fs, 1)
  env.model.next(ScriptedModel.failed('timeout'))
  env.git.log([LearnSeed.log()])

  // Act
  await LearnerFixture.run(env)

  // Assert
  expect(env.model.requests.length).toBe(1)
  expect(env.git.calls).toEqual([])
})

test('the first failure backs off for one hour', async () => {
  // Arrange
  const env = LearnerFixture.env()
  LearnSeed.prompts(env.fs, 1)
  env.model.next(ScriptedModel.failed('timeout'))

  // Act
  await LearnerFixture.run(env)

  // Assert
  expect((await LearnerFixture.state(env)).backoffUntil).toBe(LearnerFixture.NOW + LearnerFixture.HOUR)
})

test('the second consecutive failure backs off for four hours', async () => {
  // Arrange
  const env = LearnerFixture.env()
  LearnSeed.prompts(env.fs, 1)
  LearnSeed.state(env.fs, { runs: LearnSeed.failures(1) })
  env.model.next(ScriptedModel.failed('timeout'))

  // Act
  await LearnerFixture.run(env)

  // Assert
  expect((await LearnerFixture.state(env)).backoffUntil).toBe(LearnerFixture.NOW + 4 * LearnerFixture.HOUR)
})

test('the third and later consecutive failures back off for 24 hours', async () => {
  // Arrange
  const third = LearnerFixture.env()
  LearnSeed.prompts(third.fs, 1)
  LearnSeed.state(third.fs, { runs: LearnSeed.failures(2) })
  third.model.next(ScriptedModel.failed('timeout'))
  const fifth = LearnerFixture.env()
  LearnSeed.prompts(fifth.fs, 1)
  LearnSeed.state(fifth.fs, { runs: LearnSeed.failures(4) })
  fifth.model.next(ScriptedModel.failed('timeout'))

  // Act
  await LearnerFixture.run(third)
  await LearnerFixture.run(fifth)

  // Assert
  expect((await LearnerFixture.state(third)).backoffUntil).toBe(LearnerFixture.NOW + 24 * LearnerFixture.HOUR)
  expect((await LearnerFixture.state(fifth)).backoffUntil).toBe(LearnerFixture.NOW + 24 * LearnerFixture.HOUR)
})

test('a good run clears the back off', async () => {
  // Arrange
  const env = LearnerFixture.sessionEnv()
  LearnSeed.state(env.fs, { backoffUntil: LearnerFixture.NOW - 1, runs: LearnSeed.failures(2) })

  // Act
  await LearnerFixture.run(env)

  // Assert
  expect((await LearnerFixture.state(env)).backoffUntil).toBe(0)
})

test('a token budget too small for one batch makes no call', async () => {
  // Arrange
  const env = LearnerFixture.sessionEnv(LearnerFixture.settings({ tokensPerDay: 1000 }))

  // Act
  const report = await LearnerFixture.run(env)

  // Assert
  expect(env.model.requests.length).toBe(0)
  expect(report.note).toContain('budget')
})

test('session batches may use only half of the allowance', async () => {
  // Arrange
  const reference = LearnerFixture.sessionEnv()
  await LearnerFixture.run(reference)
  const request = reference.model.requests[0]
  const need = Learner.estimate(request?.system[0]?.text ?? '') + Learner.estimate(request?.prompt ?? '') + 4000
  const tight = LearnerFixture.sessionEnv(LearnerFixture.settings({ tokensPerDay: Math.floor(need * 1.5) }))
  const roomy = LearnerFixture.sessionEnv(LearnerFixture.settings({ tokensPerDay: need * 2 + 10 }))

  // Act
  await LearnerFixture.run(tight)
  await LearnerFixture.run(roomy)

  // Assert
  expect(tight.model.requests.length).toBe(0)
  expect(roomy.model.requests.length).toBe(1)
})

test('tokens already used today reduce the allowance', async () => {
  // Arrange
  const env = LearnerFixture.sessionEnv()
  LearnSeed.state(env.fs, { day: '2026-11-05', tokensToday: 299000 })

  // Act
  await LearnerFixture.run(env)

  // Assert
  expect(env.model.requests.length).toBe(0)
})

test('a refused write of the cases stops the run after the first batch and keeps the cursors', async () => {
  // Arrange
  const env = LearnerFixture.env()
  LearnerFixture.big(env, ['s1', 's2'])
  env.fs.failWrite(files.cases + '/000.jsonl')
  env.model.always(ScriptedModel.ok(LearnSeed.answer([LearnSeed.raw({ evidence: [LearnSeed.evidence(0, 's1'), LearnSeed.evidence(0, 's2')] })])))

  // Act
  const report = await LearnerFixture.run(env)
  const state = await LearnerFixture.state(env)

  // Assert
  expect(env.model.requests.length).toBe(1)
  expect(report.isOk).toBe(false)
  expect(report.note).toContain('partial-write')
  expect(state.journal['2026-11/s1.jsonl'] ?? 0).toBe(0)
  expect(LearnerFixture.journalText(env, '2026-11/s1.jsonl')).not.toBe('')
})

test('a root where nothing can be written is reported as not writable after the first batch', async () => {
  // Arrange
  const env = LearnerFixture.env()
  LearnerFixture.big(env, ['s1', 's2'])
  env.fs.refuseWritesExcept(files.lock)
  env.model.always(ScriptedModel.ok(LearnSeed.answer([LearnSeed.raw({ evidence: [LearnSeed.evidence(0, 's1'), LearnSeed.evidence(0, 's2')] })])))

  // Act
  const report = await LearnerFixture.run(env)

  // Assert
  expect(env.model.requests.length).toBe(1)
  expect(report.isOk).toBe(false)
  expect(report.note).toContain('not-writable')
})

test('history sends the exact log command with the author', async () => {
  // Arrange
  const env = LearnerFixture.historyEnv()

  // Act
  await LearnerFixture.run(env)

  // Assert
  expect(env.git.calls[0]).toEqual(['git', '--no-optional-locks', '-C', '/repo', ...HistoryScanner.logArgs(['a@b.co'], 0, 500)])
  expect(env.git.calls[0]).toContain('--author=a@b.co')
  expect(env.git.cwds[0]).toBe('/repo')
})

test('history asks for the diff of the commit with the show arguments', async () => {
  // Arrange
  const env = LearnerFixture.historyEnv()

  // Act
  await LearnerFixture.run(env)

  // Assert
  expect(env.git.calls).toContainEqual(['git', '--no-optional-locks', '-C', '/repo', ...HistoryScanner.showArgs(LearnSeed.SHA, ['src/a.ts'])])
})

test('history puts the commit excerpt and diff in the prompt', async () => {
  // Arrange
  const env = LearnerFixture.historyEnv()
  env.git.show(LearnSeed.SHA, '+validate(input)')

  // Act
  await LearnerFixture.run(env)

  // Assert
  expect(env.model.requests[0]?.prompt).toContain(LearnSeed.commitEvidence())
  expect(env.model.requests[0]?.prompt).toContain('+validate(input)')
})

test('history stores the case with the commit evidence', async () => {
  // Arrange
  const env = LearnerFixture.historyEnv()

  // Act
  const report = await LearnerFixture.run(env)
  const set = await SignatureStore.readCases(env.fs, files)

  // Assert
  expect(report.added).toBe(1)
  expect(set.cases[0]?.evidence).toEqual([LearnSeed.commitEvidence()])
})

test('history remembers the commit and the head in the cursor', async () => {
  // Arrange
  const env = LearnerFixture.historyEnv()

  // Act
  await LearnerFixture.run(env)
  const cursor = await SignatureStore.readCursor(env.fs, files, 'r1')

  // Assert
  expect(cursor?.done).toEqual([LearnSeed.SHA])
  expect(cursor?.head).toBe(LearnSeed.HEAD)
  expect(cursor?.selected).toBe(1)
  expect(cursor?.isComplete).toBe(true)
  expect(cursor?.identities).toEqual(['a@b.co'])
})

test('history writes the cases, then the cursor, then the state', async () => {
  // Arrange
  const env = LearnerFixture.historyEnv()

  // Act
  await LearnerFixture.run(env)
  const cases = env.fs.writes.indexOf(files.cases + '/000.jsonl')
  const cursor = env.fs.writes.indexOf(root + '/history/r1.json')
  const state = env.fs.writes.indexOf(files.state)

  // Assert
  expect(cases).toBeGreaterThanOrEqual(0)
  expect(cursor).toBeGreaterThan(cases)
  expect(state).toBeGreaterThan(cursor)
})

test('history takes the identity of the repository when the settings have none', async () => {
  // Arrange
  const env = LearnerFixture.historyEnv({ identities: [] })
  env.git.email('me@x.io')

  // Act
  await LearnerFixture.run(env)

  // Assert
  expect(env.git.calls.some((argv) => argv.includes('--author=me@x.io'))).toBe(true)
  expect(env.git.subcommands()[0]).toBe('config')
})

test('history without any identity is skipped with a note', async () => {
  // Arrange
  const env = LearnerFixture.historyEnv({ identities: [] })

  // Act
  const report = await LearnerFixture.run(env)

  // Assert
  expect(report.note).toContain('no-identity:repo')
  expect(env.model.requests.length).toBe(0)
  expect(env.git.subcommands().includes('log')).toBe(false)
})

test('a failing git log is noted and nothing is learned', async () => {
  // Arrange
  const env = LearnerFixture.historyEnv()
  env.git.fail('log')

  // Act
  const report = await LearnerFixture.run(env)

  // Assert
  expect(report.note).toContain('git-failed:repo')
  expect(env.model.requests.length).toBe(0)
})

test('a relative repository root is rejected before any git call', async () => {
  // Arrange
  const env = LearnerFixture.historyEnv()
  env.input.repositories = [LearnerFixture.repo('auto', 'relative/repo')]

  // Act
  const report = await LearnerFixture.run(env)

  // Assert
  expect(report.note).toContain('bad-root:repo')
  expect(env.git.calls).toEqual([])
})

test('a repository root that looks like an option is rejected', async () => {
  // Arrange
  const env = LearnerFixture.historyEnv()
  env.input.repositories = [LearnerFixture.repo('auto', '--upload-pack=x')]

  // Act
  await LearnerFixture.run(env)

  // Assert
  expect(env.git.calls).toEqual([])
})

test('history of the current repository is skipped when history capture is off', async () => {
  // Arrange
  const env = LearnerFixture.historyEnv({ capture: { sessions: true, history: false, pastSessions: false } })

  // Act
  await LearnerFixture.run(env)

  // Assert
  expect(env.git.calls).toEqual([])
  expect(env.model.requests.length).toBe(0)
})

test('history of a manual repository runs even when history capture is off', async () => {
  // Arrange
  const env = LearnerFixture.historyEnv({ capture: { sessions: true, history: false, pastSessions: false } }, 'manual')

  // Act
  await LearnerFixture.run(env)

  // Assert
  expect(env.model.requests.length).toBe(1)
})

test('a second run with every commit done makes no model call but counts as a run', async () => {
  // Arrange
  const env = LearnerFixture.historyEnv()
  await LearnerFixture.run(env)
  env.git.log([LearnSeed.log()])

  // Act
  await LearnerFixture.run(env)
  const state = await LearnerFixture.state(env)

  // Assert
  expect(env.model.requests.length).toBe(1)
  expect(state.runsToday).toBe(2)
  expect(state.runs.length).toBe(2)
})

test('the run after a complete history asks only for the commits since the head', async () => {
  // Arrange
  const env = await LearnerFixture.cursorEnv()
  env.git.log([LearnerFixture.newCommit()])
  env.model.next(ScriptedModel.ok(LearnSeed.answer([])))

  // Act
  await LearnerFixture.run(env)
  const first = LearnerFixture.logCalls(env)[0] ?? []

  // Assert
  expect(first[first.length - 1]).toBe(LearnSeed.HEAD + '..HEAD')
})

test('a repository that reached its backlog asks only for the commits since the head', async () => {
  // Arrange
  const env = await LearnerFixture.cursorEnv({ selected: 600, isComplete: false, done: [] })
  env.git.log([LearnerFixture.newCommit()])
  env.model.next(ScriptedModel.ok(LearnSeed.answer([])))

  // Act
  await LearnerFixture.run(env)
  const first = LearnerFixture.logCalls(env)[0] ?? []

  // Assert
  expect(first[first.length - 1]).toBe(LearnSeed.HEAD + '..HEAD')
})

test('an incomplete history below the backlog does not use a range', async () => {
  // Arrange
  const env = await LearnerFixture.cursorEnv({ selected: 5, isComplete: false })
  env.git.log([LearnerFixture.newCommit()])
  env.model.next(ScriptedModel.ok(LearnSeed.answer([])))

  // Act
  await LearnerFixture.run(env)

  // Assert
  expect((LearnerFixture.logCalls(env)[0] ?? []).some((arg) => arg.includes('..HEAD'))).toBe(false)
})

test('the head moves to the current HEAD when the since run finishes', async () => {
  // Arrange
  const env = await LearnerFixture.cursorEnv()
  env.git.log([LearnerFixture.newCommit()])
  env.model.next(ScriptedModel.ok(LearnSeed.answer([LearnSeed.raw({ evidence: ['commit:repo:ddddddd'] })])))

  // Act
  await LearnerFixture.run(env)
  const cursor = await SignatureStore.readCursor(env.fs, files, 'r1')

  // Assert
  expect(cursor?.head).toBe(LearnerFixture.NEW_HEAD)
  expect(cursor?.done).toEqual([LearnSeed.SHA, LearnerFixture.NEW_SHA])
})

test('the head stays when the since run is stopped by the model', async () => {
  // Arrange
  const env = await LearnerFixture.cursorEnv()
  env.git.log([LearnerFixture.newCommit()])
  env.model.next(ScriptedModel.failed('timeout'))

  // Act
  await LearnerFixture.run(env)
  const cursor = await SignatureStore.readCursor(env.fs, files, 'r1')

  // Assert
  expect(cursor?.head).toBe(LearnSeed.HEAD)
  expect(cursor?.done).toEqual([LearnSeed.SHA])
})

test('new commits that are only noise still move the head and make no model call', async () => {
  // Arrange
  const env = await LearnerFixture.cursorEnv()
  env.git.log([LearnerFixture.newCommit(['5\t5\tpackage-lock.json'])])

  // Act
  await LearnerFixture.run(env)
  const cursor = await SignatureStore.readCursor(env.fs, files, 'r1')

  // Assert
  expect(env.model.requests.length).toBe(0)
  expect(cursor?.head).toBe(LearnerFixture.NEW_HEAD)
})

test('a since run with no new commit leaves the head alone', async () => {
  // Arrange
  const env = await LearnerFixture.cursorEnv()
  env.git.log([''])

  // Act
  await LearnerFixture.run(env)

  // Assert
  expect((await SignatureStore.readCursor(env.fs, files, 'r1'))?.head).toBe(LearnSeed.HEAD)
})

test('a failing range retries the first page once without the range', async () => {
  // Arrange
  const env = await LearnerFixture.cursorEnv()
  env.git.failOnce('log').log([LearnerFixture.newCommit()])
  env.model.next(ScriptedModel.ok(LearnSeed.answer([])))

  // Act
  await LearnerFixture.run(env)
  const logs = LearnerFixture.logCalls(env)

  // Assert
  expect(logs.length).toBe(2)
  expect(logs[0]?.[logs[0].length - 1]).toBe(LearnSeed.HEAD + '..HEAD')
  expect(logs[1]?.some((arg) => arg.includes('..HEAD'))).toBe(false)
  expect(logs[1]).toContain('--skip=0')
})

test('a rewritten history adds its note once', async () => {
  // Arrange
  const env = await LearnerFixture.cursorEnv()
  env.git.failOnce('log').log([LearnerFixture.newCommit()])
  env.model.next(ScriptedModel.ok(LearnSeed.answer([])))

  // Act
  const report = await LearnerFixture.run(env)

  // Assert
  expect(report.note.split('history-rewritten:repo').length - 1).toBe(1)
})

test('a rewritten history keeps paging from the second page', async () => {
  // Arrange
  const env = await LearnerFixture.cursorEnv({ done: [] })
  env.git.failOnce('log').log([LearnerFixture.bulk(500, 1), LearnerFixture.bulk(500, 600), LearnerFixture.bulk(500, 1200), LearnerFixture.bulk(3, 2000)])
  env.model.always(ScriptedModel.ok(LearnSeed.answer([])))

  // Act
  await LearnerFixture.run(env)
  const skips = LearnerFixture.logCalls(env).map((argv) => argv.find((arg) => arg.startsWith('--skip=')))

  // Assert
  expect(skips).toEqual(['--skip=0', '--skip=0', '--skip=500', '--skip=1000', '--skip=1500'])
})

test('a rewritten history never sends a commit that is already done', async () => {
  // Arrange
  const env = await LearnerFixture.cursorEnv()
  env.git.failOnce('log').log([LearnSeed.log() + LearnerFixture.newCommit()])
  env.model.next(ScriptedModel.ok(LearnSeed.answer([])))

  // Act
  await LearnerFixture.run(env)
  const prompt = env.model.requests[0]?.prompt ?? ''

  // Assert
  expect(prompt).toContain('commit:repo:ddddddd')
  expect(prompt).not.toContain(LearnSeed.commitEvidence())
})

test('a rewritten history resets the head to the current HEAD on a clean finish', async () => {
  // Arrange
  const env = await LearnerFixture.cursorEnv()
  env.git.failOnce('log').log([LearnerFixture.newCommit()])
  env.model.next(ScriptedModel.ok(LearnSeed.answer([])))

  // Act
  await LearnerFixture.run(env)

  // Assert
  expect((await SignatureStore.readCursor(env.fs, files, 'r1'))?.head).toBe(LearnerFixture.NEW_HEAD)
})

test('the next run after a rewritten history uses the range again', async () => {
  // Arrange
  const env = await LearnerFixture.cursorEnv()
  env.git.failOnce('log').log([LearnerFixture.newCommit()])
  env.model.next(ScriptedModel.ok(LearnSeed.answer([])))
  await LearnerFixture.run(env)
  env.git.log([''])

  // Act
  await LearnerFixture.run(env)
  const logs = LearnerFixture.logCalls(env)
  const last = logs[logs.length - 1] ?? []

  // Assert
  expect(last[last.length - 1]).toBe(LearnerFixture.NEW_HEAD + '..HEAD')
})

test('a failing retry is noted as a git failure and makes no model call', async () => {
  // Arrange
  const env = await LearnerFixture.cursorEnv()
  env.git.fail('log')

  // Act
  const report = await LearnerFixture.run(env)

  // Assert
  expect(report.note).toContain('git-failed:repo')
  expect(env.model.requests.length).toBe(0)
})

test('synthesis runs when ten cases changed', async () => {
  // Arrange
  const env = LearnerFixture.env()
  LearnSeed.prompts(env.fs, 10)
  env.model.next(ScriptedModel.ok(LearnSeed.answer(LearnerFixture.tenCases())), ScriptedModel.ok(JSON.stringify({ traits: [] })))

  // Act
  const report = await LearnerFixture.run(env)

  // Assert
  expect(report.added).toBe(10)
  expect(env.model.requests.length).toBe(2)
  expect(env.model.requests[1]?.system[0]?.text).toBe(LearningPrompts.synthesis())
})

test('synthesis records its time and resets the change counter', async () => {
  // Arrange
  const env = LearnerFixture.env()
  LearnSeed.prompts(env.fs, 10)
  env.model.next(ScriptedModel.ok(LearnSeed.answer(LearnerFixture.tenCases())), ScriptedModel.ok(JSON.stringify({ traits: [] })))

  // Act
  await LearnerFixture.run(env)
  const profile = (await SignatureStore.readProfile(env.fs, files)).value

  // Assert
  expect(profile.synthesizedAt).toBe(LearnerFixture.NOW)
  expect(profile.changedSince).toBe(0)
})

test('synthesis does not run for a single change on a fresh profile', async () => {
  // Arrange
  const env = LearnerFixture.sessionEnv()

  // Act
  await LearnerFixture.run(env)

  // Assert
  expect(env.model.requests.length).toBe(1)
})

test('synthesis runs when changes are old enough', async () => {
  // Arrange
  const env = LearnerFixture.env()
  LearnSeed.cases(env.fs, [SignatureFixtures.caseOf({ id: 1 })])
  env.fs.seed(files.profile, Profile.serialize({ ...Profile.empty(), synthesizedAt: LearnerFixture.NOW - 8 * 24 * LearnerFixture.HOUR, changedSince: 1 }))
  env.model.next(ScriptedModel.ok(JSON.stringify({ traits: [] })))

  // Act
  await LearnerFixture.run(env)

  // Assert
  expect(env.model.requests.length).toBe(1)
  expect(env.model.requests[0]?.system[0]?.text).toBe(LearningPrompts.synthesis())
})

test('a rebuild runs only the synthesis and makes no extraction call', async () => {
  // Arrange
  const env = LearnerFixture.historyEnv()
  LearnSeed.prompts(env.fs, 1)
  LearnSeed.cases(env.fs, [SignatureFixtures.caseOf({ id: 1 })])
  env.input.isRebuild = true
  env.model.always(ScriptedModel.ok(JSON.stringify({ traits: [] })))

  // Act
  await LearnerFixture.run(env)

  // Assert
  expect(env.model.requests.length).toBeGreaterThan(0)
  expect(env.model.requests.every((request) => request.system[0]?.text === LearningPrompts.synthesis())).toBe(true)
  expect(env.git.calls).toEqual([])
  expect(env.progress.some((value) => value.step === 'sessions' || value.step === 'history')).toBe(false)
})

test('a candidate tag seen three times is added to the vocabulary with a new revision', async () => {
  // Arrange
  const env = LearnerFixture.sessionEnv(LearnerFixture.settings(), 1, [LearnSeed.candidate()])
  env.fs.seed(files.vocabulary, Vocabulary.serializeOverlay({ revision: 4, tags: {}, candidates: { 'rate-limit': 2 } }))

  // Act
  const report = await LearnerFixture.run(env)
  const overlay = (await SignatureStore.readOverlay(env.fs, files)).value

  // Assert
  expect(report.newTags).toBe(1)
  expect(overlay.tags['rate-limit']?.parent).toBe('security')
  expect(overlay.revision).toBe(5)
  expect(overlay.candidates['rate-limit']).toBe(undefined)
})

test('a candidate tag seen fewer than three times stays a candidate', async () => {
  // Arrange
  const env = LearnerFixture.sessionEnv(LearnerFixture.settings(), 1, [LearnSeed.candidate()])

  // Act
  await LearnerFixture.run(env)
  const overlay = (await SignatureStore.readOverlay(env.fs, files)).value

  // Assert
  expect(overlay.candidates['rate-limit']).toBe(1)
  expect(overlay.tags['rate-limit']).toBe(undefined)
  expect(overlay.revision).toBe(0)
})

test('a candidate tag with an unknown parent is refused', async () => {
  // Arrange
  const env = LearnerFixture.sessionEnv(LearnerFixture.settings(), 1, [LearnSeed.candidate('rate-limit', 'no-such-parent')])
  env.fs.seed(files.vocabulary, Vocabulary.serializeOverlay({ revision: 4, tags: {}, candidates: { 'rate-limit': 2 } }))

  // Act
  await LearnerFixture.run(env)
  const overlay = (await SignatureStore.readOverlay(env.fs, files)).value

  // Assert
  expect(overlay.tags['rate-limit']).toBe(undefined)
  expect(overlay.revision).toBe(4)
})

test('candidate tags of a manual repository are ignored', async () => {
  // Arrange
  const env = LearnerFixture.historyEnv({}, 'manual', [LearnSeed.candidate()])
  env.fs.seed(files.vocabulary, Vocabulary.serializeOverlay({ revision: 4, tags: {}, candidates: { 'rate-limit': 2 } }))

  // Act
  await LearnerFixture.run(env)
  const overlay = (await SignatureStore.readOverlay(env.fs, files)).value

  // Assert
  expect(overlay.tags['rate-limit']).toBe(undefined)
  expect(overlay.candidates['rate-limit']).toBe(2)
})

test('candidate tags are not counted when every case of the batch was dropped', async () => {
  // Arrange
  const env = LearnerFixture.env()
  LearnSeed.prompts(env.fs, 1)
  env.fs.seed(files.vocabulary, Vocabulary.serializeOverlay({ revision: 4, tags: {}, candidates: { 'rate-limit': 2 } }))
  env.model.next(ScriptedModel.ok(LearnSeed.answer([LearnSeed.raw({ evidence: ['session:other:1'] })], [LearnSeed.candidate()])))

  // Act
  await LearnerFixture.run(env)
  const overlay = (await SignatureStore.readOverlay(env.fs, files)).value

  // Assert
  expect(overlay.tags['rate-limit']).toBe(undefined)
  expect(overlay.candidates['rate-limit']).toBe(2)
})

test('archival moves an old stale case to the archive and rewrites the index', async () => {
  // Arrange
  const env = LearnerFixture.env()
  LearnSeed.cases(env.fs, [
    SignatureFixtures.caseOf({ id: 7, status: 'stale', statusAt: '2025-01-01', lastSeen: '2025-01-01' }),
    SignatureFixtures.caseOf({ id: 8 })
  ])

  // Act
  await LearnerFixture.run(env)
  const set = await SignatureStore.readCases(env.fs, files)
  const index = TagIndex.parse(env.fs.text(files.index) ?? '') ?? TagIndex.empty()

  // Assert
  expect(set.cases.map((item) => item.id)).toEqual([8])
  expect(set.archived.map((item) => item.id)).toEqual([7])
  expect(TagIndex.contains(index, 'fail-open', 7)).toBe(false)
  expect(TagIndex.contains(index, 'fail-open', 8)).toBe(true)
})

test('a throwing model never makes the run throw', async () => {
  // Arrange
  const env = LearnerFixture.env()
  LearnSeed.prompts(env.fs, 1)
  env.model.crash()

  // Act
  const report = await LearnerFixture.run(env)

  // Assert
  expect(report.isOk).toBe(false)
  expect(env.fs.text(files.lock)).toBe('')
})

test('a throwing git never makes the run throw', async () => {
  // Arrange
  const env = LearnerFixture.historyEnv()
  env.git.crash()

  // Act
  const report = await LearnerFixture.run(env)

  // Assert
  expect(typeof report.isOk).toBe('boolean')
  expect(env.model.requests.length).toBe(0)
})

test('a throwing file system never makes the run throw', async () => {
  // Arrange
  const env = LearnerFixture.sessionEnv()
  env.fs.list = async () => {
    throw new Error('list failed')
  }

  // Act
  const report = await LearnerFixture.run(env)

  // Assert
  expect(typeof report.isOk).toBe('boolean')
})

test('a throwing progress callback never makes the run throw', async () => {
  // Arrange
  const env = LearnerFixture.sessionEnv()

  // Act
  const report = await Learner.run(LearnerFixture.ports(env), env.input, () => {
    throw new Error('progress failed')
  })

  // Assert
  expect(report.isOk).toBe(true)
  expect(report.added).toBe(1)
})

test('every model request asks for a low effort', async () => {
  // Arrange
  const env = LearnerFixture.sessionEnv()

  // Act
  await LearnerFixture.run(env)

  // Assert
  expect(env.model.requests[0]?.effort).toBe('low')
})

test('the synthesis request allows 8000 output tokens', async () => {
  // Arrange
  const env = LearnerFixture.env()
  LearnSeed.cases(env.fs, [SignatureFixtures.caseOf({ id: 1 })])
  env.fs.seed(files.profile, Profile.serialize({ ...Profile.empty(), synthesizedAt: 0, changedSince: 1 }))
  env.model.next(ScriptedModel.ok(JSON.stringify({ traits: [] })))

  // Act
  await LearnerFixture.run(env)

  // Assert
  expect(env.model.requests[0]?.maxTokens).toBe(8000)
  expect(env.model.requests[0]?.effort).toBe('low')
})

test('a call is charged at least the estimate of its system, prompt and answer', async () => {
  // Arrange
  const env = LearnerFixture.sessionEnv()

  // Act
  const report = await LearnerFixture.run(env)
  const request = env.model.requests[0]
  const text = LearnSeed.answer([LearnSeed.raw()])
  const expected = Learner.estimate(request?.system[0]?.text ?? '') + Learner.estimate(request?.prompt ?? '') + Learner.estimate(text)

  // Assert
  expect(expected).toBeGreaterThan(150)
  expect(report.tokens).toBe(expected)
})

test('a call is charged the reported tokens when they are higher', async () => {
  // Arrange
  const env = LearnerFixture.env(LearnerFixture.settings({ tokensPerDay: 5000000 }))
  LearnSeed.prompts(env.fs, 1)
  env.model.next(ScriptedModel.ok(LearnSeed.answer([LearnSeed.raw()]), 500000, 1))

  // Act
  const report = await LearnerFixture.run(env)

  // Assert
  expect(report.tokens).toBe(500001)
  expect((await LearnerFixture.state(env)).tokensToday).toBe(500001)
})

test('estimate counts one token per non ASCII character', () => {
  // Assert
  expect([Learner.estimate('é'.repeat(5)), Learner.estimate('aé'), Learner.estimate('😀')]).toEqual([5, 2, 1])
})

test('a non forced run counts as a run even without a model call', async () => {
  // Arrange
  const env = LearnerFixture.env()

  // Act
  await LearnerFixture.run(env)

  // Assert
  expect((await LearnerFixture.state(env)).runsToday).toBe(1)
})

test('a forced run without a model call does not count as a run', async () => {
  // Arrange
  const env = LearnerFixture.env(LearnerFixture.settings(), { isForced: true })

  // Act
  await LearnerFixture.run(env)

  // Assert
  expect((await LearnerFixture.state(env)).runsToday).toBe(0)
})

test('two idle runs with git failing count two runs and then stop being due', async () => {
  // Arrange
  const env = LearnerFixture.historyEnv()
  env.git.fail('log')

  // Act
  await LearnerFixture.run(env)
  await LearnerFixture.run(env)
  const state = await LearnerFixture.state(env)

  // Assert
  expect(state.runsToday).toBe(2)
  expect(Learner.isDue(state, env.input.settings, LearnerFixture.NOW, 100, true, false)).toBe(false)
})

test('a run re-reads the settings from the disk', async () => {
  // Arrange
  const env = LearnerFixture.sessionEnv()
  env.fs.seed(files.settings, SignatureSettings.serialize(LearnerFixture.settings({ model: 'haiku' })))

  // Act
  await LearnerFixture.run(env)

  // Assert
  expect(env.model.requests[0]?.model).toBe('haiku')
})

test('a run does nothing when the settings on disk are not enabled', async () => {
  // Arrange
  const env = LearnerFixture.sessionEnv()
  env.fs.seed(files.settings, SignatureSettings.serialize({ ...LearnerFixture.settings(), consent: 'declined' }))

  // Act
  const report = await LearnerFixture.run(env)

  // Assert
  expect(report.note).toBe('disabled')
  expect(env.model.requests.length).toBe(0)
})

test('a consent turned off during a call stops the run without a failure', async () => {
  // Arrange
  const env = LearnerFixture.sessionEnv()
  env.model.during(() => {
    env.fs.seed(files.settings, SignatureSettings.serialize({ ...LearnerFixture.settings(), consent: 'declined' }))
  })

  // Act
  const report = await LearnerFixture.run(env)
  const state = await LearnerFixture.state(env)

  // Assert
  expect(report.note).toContain('stopped')
  expect(report.isOk).toBe(true)
  expect(state.backoffUntil).toBe(0)
  expect(state.runs.length).toBe(1)
  expect((await SignatureStore.readCases(env.fs, files)).cases).toEqual([])
})

test('a stopped run leaves the journal untouched', async () => {
  // Arrange
  const env = LearnerFixture.sessionEnv()
  env.model.during(() => {
    env.fs.seed(files.settings, SignatureSettings.serialize({ ...LearnerFixture.settings(), consent: 'declined' }))
  })

  // Act
  await LearnerFixture.run(env)

  // Assert
  expect(LearnerFixture.journalText(env)).not.toBe('')
})

test('a lock taken by another owner during a call writes only the unsaved tokens', async () => {
  // Arrange
  const env = LearnerFixture.sessionEnv()
  let count = 0
  env.model.during(() => {
    env.fs.seed(files.lock, JSON.stringify({ version: 1, owner: 'rival', expiresAt: LearnerFixture.NOW + 99999 }))
    count = env.fs.writes.length
  })

  // Act
  const report = await LearnerFixture.run(env)
  const state = await LearnerFixture.state(env)

  // Assert
  expect(report.note).toContain('lock-lost')
  expect(report.isOk).toBe(false)
  expect(env.fs.writes.slice(count)).toEqual([files.state])
  expect(state.tokensToday).toBe(report.tokens)
  expect(state.runs).toEqual([])
  expect(state.backoffUntil).toBe(0)
  expect(state.journal[LearnSeed.KEY] ?? 0).toBe(0)
  expect((await SignatureStore.readCases(env.fs, files)).cases).toEqual([])
})

test('a lock lost after the tokens were saved writes nothing more', async () => {
  // Arrange
  const env = LearnerFixture.sessionEnv()
  let count = -1
  env.fs.onWrite((path) => {
    if (path !== files.state || count >= 0) return
    env.fs.seed(files.lock, JSON.stringify({ version: 1, owner: 'rival', expiresAt: LearnerFixture.NOW + 99999 }))
    count = env.fs.writes.length
  })

  // Act
  const report = await LearnerFixture.run(env)

  // Assert
  expect(report.note).toContain('lock-lost')
  expect(count).toBeGreaterThan(0)
  expect(env.fs.writes.length).toBe(count)
})

test('an answer with the reason stopped ends the run without a failure', async () => {
  // Arrange
  const env = LearnerFixture.env()
  LearnSeed.prompts(env.fs, 1)
  env.model.next(ScriptedModel.failed('stopped'))

  // Act
  const report = await LearnerFixture.run(env)
  const state = await LearnerFixture.state(env)

  // Assert
  expect(report.note).toContain('stopped')
  expect(report.isOk).toBe(true)
  expect(state.backoffUntil).toBe(0)
  expect(env.model.requests.length).toBe(1)
})

test('an unparsed synthesis keeps the change counter and the synthesis time', async () => {
  // Arrange
  const env = LearnerFixture.env()
  LearnSeed.cases(env.fs, [SignatureFixtures.caseOf({ id: 1 })])
  env.fs.seed(files.profile, Profile.serialize({ ...Profile.empty(), synthesizedAt: 12345, changedSince: 5 }))
  env.model.next(ScriptedModel.ok('this is not json'))

  // Act
  const report = await LearnerFixture.run(env)
  const profile = (await SignatureStore.readProfile(env.fs, files)).value

  // Assert
  expect(profile.changedSince).toBe(5)
  expect(profile.synthesizedAt).toBe(12345)
  expect(report.note).toContain('unparsed:1')
})

test('a journal file in use by a live session keeps its content and its cursor', async () => {
  // Arrange
  const env = LearnerFixture.sessionEnv()
  env.input.liveKeys = [LearnSeed.KEY]

  // Act
  await LearnerFixture.run(env)
  const state = await LearnerFixture.state(env)

  // Assert
  expect(LearnerFixture.journalText(env)).not.toBe('')
  expect(state.journal[LearnSeed.KEY]).toBe(1)
})

test('a binary file of a commit is never passed to git show', async () => {
  // Arrange
  const env = LearnerFixture.historyEnv()
  env.git.log([LearnSeed.log(LearnSeed.SHA, 'Add feature', ['-\t-\timg.dat', '3\t1\tsrc/a.ts'])])

  // Act
  await LearnerFixture.run(env)
  const show = env.git.calls.find((argv) => argv.includes('show')) ?? []

  // Assert
  expect(show).toContain(':(literal)src/a.ts')
  expect(show.some((arg) => arg.includes('img.dat'))).toBe(false)
})

test('the head stays while selectable commits remain after the run', async () => {
  // Arrange
  const env = await LearnerFixture.cursorEnv()
  env.git.log([LearnerFixture.bulk(70, 1)])
  env.model.always(ScriptedModel.ok(LearnSeed.answer([])))

  // Act
  await LearnerFixture.run(env)
  const cursor = await SignatureStore.readCursor(env.fs, files, 'r1')

  // Assert
  expect(cursor?.head).toBe(LearnSeed.HEAD)
  expect(cursor?.done.length).toBe(61)
})

test('one batch with three accepted cases counts a candidate tag once', async () => {
  // Arrange
  const env = LearnerFixture.env()
  LearnSeed.prompts(env.fs, 3)
  const cases = LearnerFixture.tenCases().slice(0, 3)
  env.model.next(ScriptedModel.ok(LearnSeed.answer(cases, [LearnSeed.candidate()])))

  // Act
  const report = await LearnerFixture.run(env)
  const overlay = (await SignatureStore.readOverlay(env.fs, files)).value

  // Assert
  expect(report.added).toBe(3)
  expect(overlay.candidates['rate-limit']).toBe(1)
  expect(overlay.tags['rate-limit']).toBe(undefined)
})

test('a candidate tag seen in three batches is promoted', async () => {
  // Arrange
  const env = LearnerFixture.env()
  LearnerFixture.big(env, ['s1', 's2', 's3'])
  const choices = LearnerFixture.distinct()
  const answer = (index: number) => ScriptedModel.ok(LearnSeed.answer([
    LearnSeed.raw({ situation: `Situation number ${index} about ${choices[index]}`, choice: choices[index], evidence: [LearnSeed.evidence(0, `s${index + 1}`)] })
  ], [LearnSeed.candidate()]))
  env.model.next(answer(0), answer(1), answer(2))

  // Act
  const report = await LearnerFixture.run(env)
  const overlay = (await SignatureStore.readOverlay(env.fs, files)).value

  // Assert
  expect(env.model.requests.length).toBe(3)
  expect(report.newTags).toBe(1)
  expect(overlay.tags['rate-limit']?.parent).toBe('security')
})

test('a journal file modified within the idle time keeps its content and its cursor', async () => {
  // Arrange
  const env = LearnerFixture.sessionEnv()
  env.fs.touch(root + '/journal/' + LearnSeed.KEY, LearnerFixture.NOW - 1000)

  // Act
  await LearnerFixture.run(env)

  // Assert
  expect(LearnerFixture.journalText(env)).not.toBe('')
  expect((await LearnerFixture.state(env)).journal[LearnSeed.KEY]).toBe(1)
})

test('a journal file idle for longer than the idle time is emptied', async () => {
  // Arrange
  const env = LearnerFixture.sessionEnv()
  env.fs.touch(root + '/journal/' + LearnSeed.KEY, LearnerFixture.NOW - 11 * 60 * 1000)

  // Act
  await LearnerFixture.run(env)

  // Assert
  expect(LearnerFixture.journalText(env)).toBe('')
})

test('a journal file idle for exactly the idle time is emptied', async () => {
  // Arrange
  const env = LearnerFixture.sessionEnv()
  env.fs.touch(root + '/journal/' + LearnSeed.KEY, LearnerFixture.NOW - 10 * 60 * 1000)

  // Act
  await LearnerFixture.run(env)

  // Assert
  expect(LearnerFixture.journalText(env)).toBe('')
})

test('an episode render drops forged header lines even with a sign or spaces in front', () => {
  // Arrange
  const episode = { session: 's', project: 'p', stack: ['node'], at: LearnSeed.BASE, lines: ['session:s:1 prompt: "x"', '+[commit x]', '-[episode x]', '  [commit x]', 'keep'], evidence: [] }

  // Act
  const lines = LearningPrompts.render(episode).split('\n')

  // Assert
  expect(lines.filter((line) => /^[+-]?\s*\[(commit|episode) /.test(line))).toEqual([lines[0]])
  expect(lines).toContain('keep')
})
