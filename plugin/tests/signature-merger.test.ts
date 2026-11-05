import { expect, test } from 'claude-code/testing'
import { Cases, type Case } from '../hooks/signature/cases'
import { CaseMerger } from '../hooks/signature/merger'
import { SignatureFixtures } from './fixtures/signature'

class MergerFixture {
  static readonly TAGS = ['fail-open', 'hook']
  static readonly OPPOSITE = 'Never validate the config value and fall back to a default'
  static readonly UNRELATED = 'Trust raw values directly everywhere'

  static existing(partial: Partial<Case> = {}): Case {
    return SignatureFixtures.caseOf({
      id: 1,
      tags: MergerFixture.TAGS,
      choice: 'Validate the config value and fall back to a default',
      evidence: ['commit:podium:aaaaaaa'],
      evidenceCount: 1,
      lastSeen: '2026-10-01',
      ...partial
    })
  }

  static incoming(choice = 'Validate the config value and fall back to a default', evidence = ['commit:podium:bbbbbbb']) {
    return SignatureFixtures.extracted({ tags: MergerFixture.TAGS, choice, evidence })
  }

  static merge(existing: Case[], incoming: ReturnType<typeof SignatureFixtures.extracted>[], context = SignatureFixtures.context()) {
    return CaseMerger.merge(existing, incoming, context, SignatureFixtures.vocabulary())
  }

  static ids(prefixes: string): string[] {
    return [...prefixes].map((x) => `commit:podium:${x.repeat(7)}`)
  }

  static find(cases: readonly Case[], id: number): Case {
    const found = cases.find((c) => c.id === id)
    if (!found) throw new Error(`case ${id} missing`)
    return found
  }

  static dated(id: number, status: Case['status'], lastSeen: string, extra: Partial<Case> = {}): Case {
    return SignatureFixtures.caseOf({ id, status, lastSeen, statusAt: lastSeen, ...extra })
  }
}

test('tag similarity counts concept tags double', () => {
  // Act
  const value = CaseMerger.tagSimilarity(SignatureFixtures.vocabulary(), ['fail-open', 'hook'], ['fail-open'])

  // Assert
  expect(SignatureFixtures.isClose(value, 2 / 3)).toBe(true)
})

test('tag similarity counts decision tags double', () => {
  // Act
  const value = CaseMerger.tagSimilarity(SignatureFixtures.vocabulary(), ['strict-vs-lenient', 'hook'], ['strict-vs-lenient'])

  // Assert
  expect(SignatureFixtures.isClose(value, 2 / 3)).toBe(true)
})

test('tag similarity counts other facets once', () => {
  // Act
  const value = CaseMerger.tagSimilarity(SignatureFixtures.vocabulary(), ['hook', 'config'], ['hook'])

  // Assert
  expect(SignatureFixtures.isClose(value, 0.5)).toBe(true)
})

test('tag similarity of identical sets is one', () => {
  // Act
  const value = CaseMerger.tagSimilarity(SignatureFixtures.vocabulary(), ['fail-open', 'hook'], ['hook', 'fail-open'])

  // Assert
  expect(value).toBe(1)
})

test('tag similarity of two empty sets is zero', () => {
  // Act
  const value = CaseMerger.tagSimilarity(SignatureFixtures.vocabulary(), [], [])

  // Assert
  expect(value).toBe(0)
})

test('choice similarity ignores stopwords', () => {
  // Act
  const value = CaseMerger.choiceSimilarity('use the cache', 'cache for that')

  // Assert
  expect(value).toBe(1)
})

test('choice similarity drops words of two letters or fewer', () => {
  // Act
  const value = CaseMerger.choiceSimilarity('go to db', 'do it up')

  // Assert
  expect(value).toBe(0)
})

test('a negated word shared with the other choice scales the similarity by a fifth', () => {
  // Act
  const plain = CaseMerger.choiceSimilarity('validate config values', 'always validate config values')
  const negated = CaseMerger.choiceSimilarity('validate config values', 'never validate config values')

  // Assert
  expect(SignatureFixtures.isClose(plain, 0.75)).toBe(true)
  expect(SignatureFixtures.isClose(negated, 0.2)).toBe(true)
})

test('choice similarity of identical choices is one', () => {
  // Act
  const value = CaseMerger.choiceSimilarity('validate every config value', 'validate every config value')

  // Assert
  expect(value).toBe(1)
})

test('a similar incoming case reinforces the existing one', () => {
  // Arrange
  const existing = [MergerFixture.existing()]

  // Act
  const result = MergerFixture.merge(existing, [MergerFixture.incoming()])

  // Assert
  expect(result.cases).toHaveLength(1)
  expect(result.reinforced).toEqual([1])
  expect(result.added).toEqual([])
  expect(result.cases[0]?.evidenceCount).toBe(2)
})

test('reinforcing puts new evidence first and keeps at most five', () => {
  // Arrange
  const old = ['a', 'b', 'c', 'd', 'e'].map((x) => `commit:podium:${x.repeat(7)}`)
  const existing = [MergerFixture.existing({ evidence: old, evidenceCount: 5 })]
  const incoming = MergerFixture.incoming(undefined, ['commit:podium:fffffff', old[0] ?? ''])

  // Act
  const result = MergerFixture.merge(existing, [incoming])

  // Assert
  expect(result.cases[0]?.evidence).toEqual(['commit:podium:fffffff', ...old.slice(0, 4)])
})

test('reinforcing grows the evidence count only by new ids', () => {
  // Arrange
  const existing = [MergerFixture.existing({ evidence: ['commit:podium:aaaaaaa'], evidenceCount: 4 })]
  const incoming = MergerFixture.incoming(undefined, ['commit:podium:aaaaaaa', 'commit:podium:ccccccc'])

  // Act
  const result = MergerFixture.merge(existing, [incoming])

  // Assert
  expect(result.cases[0]?.evidenceCount).toBe(5)
})

test('reinforcing with only known evidence leaves the count unchanged', () => {
  // Arrange
  const existing = [MergerFixture.existing()]
  const incoming = MergerFixture.incoming(undefined, ['commit:podium:aaaaaaa'])

  // Act
  const result = MergerFixture.merge(existing, [incoming])

  // Assert
  expect(result.cases[0]?.evidenceCount).toBe(1)
})

test('reinforcing sets the last seen date to today', () => {
  // Act
  const result = MergerFixture.merge([MergerFixture.existing()], [MergerFixture.incoming()])

  // Assert
  expect(result.cases[0]?.lastSeen).toBe(SignatureFixtures.TODAY)
})

test('reinforcing unions the projects of the new evidence', () => {
  // Arrange
  const incoming = MergerFixture.incoming(undefined, ['commit:other-repo:ccccccc'])

  // Act
  const result = MergerFixture.merge([MergerFixture.existing()], [incoming])

  // Assert
  expect(result.cases[0]?.projects).toEqual(['podium', 'other-repo'])
})

test('reinforcing recomputes the confidence', () => {
  // Arrange
  const incoming = MergerFixture.incoming(undefined, ['commit:other-repo:ccccccc'])

  // Act
  const result = MergerFixture.merge([MergerFixture.existing()], [incoming])

  // Assert
  expect(SignatureFixtures.isClose(result.cases[0]?.confidence ?? 0, 0.715)).toBe(true)
})

test('an opposite incoming case is kept and counts against the existing one', () => {
  // Arrange
  const existing = [MergerFixture.existing({ evidenceCount: 3 })]

  // Act
  const result = MergerFixture.merge(existing, [MergerFixture.incoming(MergerFixture.OPPOSITE, ['commit:podium:ccccccc'])])

  // Assert
  expect(result.added).toEqual([100])
  expect(result.contradicted).toEqual([1])
  expect(MergerFixture.find(result.cases, 1).counterCount).toBe(1)
  expect(MergerFixture.find(result.cases, 1).status).toBe('observed')
})

test('a contradiction lowers the confidence of the existing case', () => {
  // Arrange
  const existing = [MergerFixture.existing({ evidenceCount: 3, confidence: 0.8 })]

  // Act
  const result = MergerFixture.merge(existing, [MergerFixture.incoming(MergerFixture.OPPOSITE)])

  // Assert
  expect(MergerFixture.find(result.cases, 1).confidence).toBeLessThan(0.8)
})

test('the existing case becomes stale when counter evidence passes its evidence', () => {
  // Arrange
  const existing = [MergerFixture.existing({ evidenceCount: 1, counterCount: 1 })]

  // Act
  const result = MergerFixture.merge(existing, [MergerFixture.incoming(MergerFixture.OPPOSITE)])

  // Assert
  expect(MergerFixture.find(result.cases, 1).counterCount).toBe(2)
  expect(MergerFixture.find(result.cases, 1).status).toBe('stale')
})

test('a new case takes the next free id and advances the counter', () => {
  // Arrange
  const incoming = [MergerFixture.incoming('First distinct choice'), SignatureFixtures.extracted({ tags: ['caching', 'hook'], choice: 'Other unrelated decision' })]

  // Act
  const result = MergerFixture.merge([], incoming, SignatureFixtures.context({ nextId: 40 }))

  // Assert
  expect(result.added).toEqual([40, 41])
  expect(result.nextId).toBe(42)
})

test('a new case starts observed with the initial confidence', () => {
  // Act
  const result = MergerFixture.merge([], [MergerFixture.incoming()])

  // Assert
  const created = MergerFixture.find(result.cases, 100)
  expect(created.status).toBe('observed')
  expect(created.isConfirmedByUser).toBe(false)
  expect(created.counterCount).toBe(0)
  expect(created.evidenceCount).toBe(1)
  expect(created.firstSeen).toBe(SignatureFixtures.TODAY)
  expect(created.lastSeen).toBe(SignatureFixtures.TODAY)
  expect(SignatureFixtures.isClose(created.confidence, 0.554)).toBe(true)
})

test('a new case takes its project from the commit evidence', () => {
  // Act
  const result = MergerFixture.merge([], [MergerFixture.incoming(undefined, ['commit:other-repo:ccccccc'])])

  // Assert
  expect(MergerFixture.find(result.cases, 100).projects).toEqual(['other-repo'])
})

test('a new case from session evidence takes the context project', () => {
  // Act
  const result = MergerFixture.merge([], [MergerFixture.incoming(undefined, ['session:s1:3'])])

  // Assert
  expect(MergerFixture.find(result.cases, 100).projects).toEqual(['podium'])
})

test('a new case from a project batch with one source is project scoped', () => {
  // Act
  const result = MergerFixture.merge([], [MergerFixture.incoming()], SignatureFixtures.context({ isProjectBatch: true }))

  // Assert
  expect(MergerFixture.find(result.cases, 100).scope).toBe('project')
})

test('a new case from a project batch with two repositories is not project scoped', () => {
  // Arrange
  const incoming = MergerFixture.incoming(undefined, ['commit:podium:aaaaaaa', 'commit:other-repo:ccccccc'])

  // Act
  const result = MergerFixture.merge([], [incoming], SignatureFixtures.context({ isProjectBatch: true }))

  // Assert
  expect(MergerFixture.find(result.cases, 100).scope).toBe('global')
})

test('a new case with a stack tag outside a project batch is stack scoped', () => {
  // Arrange
  const incoming = SignatureFixtures.extracted({ tags: ['fail-open', 'typescript'] })

  // Act
  const result = MergerFixture.merge([], [incoming])

  // Assert
  expect(MergerFixture.find(result.cases, 100).scope).toBe('stack')
})

test('a new case without a stack tag outside a project batch is global', () => {
  // Act
  const result = MergerFixture.merge([], [MergerFixture.incoming()])

  // Assert
  expect(MergerFixture.find(result.cases, 100).scope).toBe('global')
})

test('a rejected case never absorbs and the incoming case is dropped', () => {
  // Arrange
  const existing = [MergerFixture.existing({ status: 'rejected' })]

  // Act
  const result = MergerFixture.merge(existing, [MergerFixture.incoming()])

  // Assert
  expect(result.dropped).toBe(1)
  expect(result.added).toEqual([])
  expect(result.cases).toHaveLength(1)
  expect(result.cases[0]?.evidenceCount).toBe(1)
})

test('a stale case returns to observed when its evidence passes the counter', () => {
  // Arrange
  const existing = [MergerFixture.existing({ status: 'stale', evidenceCount: 2, counterCount: 3, evidence: ['commit:podium:aaaaaaa', 'commit:podium:1111111'] })]
  const incoming = MergerFixture.incoming(undefined, ['commit:podium:2222222', 'commit:podium:3333333'])

  // Act
  const result = MergerFixture.merge(existing, [incoming])

  // Assert
  expect(result.cases[0]?.evidenceCount).toBe(4)
  expect(result.cases[0]?.status).toBe('observed')
})

test('a stale case stays stale while the counter still leads', () => {
  // Arrange
  const existing = [MergerFixture.existing({ status: 'stale', evidenceCount: 2, counterCount: 5 })]

  // Act
  const result = MergerFixture.merge(existing, [MergerFixture.incoming()])

  // Assert
  expect(result.cases[0]?.status).toBe('stale')
})

test('two incoming cases reinforce each other inside one batch', () => {
  // Arrange
  const incoming = [MergerFixture.incoming(undefined, ['commit:podium:bbbbbbb']), MergerFixture.incoming(undefined, ['commit:podium:ccccccc'])]

  // Act
  const result = MergerFixture.merge([], incoming)

  // Assert
  expect(result.cases).toHaveLength(1)
  expect(result.added).toEqual([100])
  expect(result.reinforced).toEqual([])
  expect(result.cases[0]?.evidenceCount).toBe(2)
})

test('merging does not mutate the existing array or its cases', () => {
  // Arrange
  const existing = [MergerFixture.existing({ id: 5 }), MergerFixture.existing({ id: 2, tags: ['caching'], choice: 'Cache it' })]
  const snapshot = SignatureFixtures.snapshot(existing)

  // Act
  MergerFixture.merge(existing, [MergerFixture.incoming(), MergerFixture.incoming(MergerFixture.OPPOSITE)])

  // Assert
  expect(SignatureFixtures.snapshot(existing)).toBe(snapshot)
})

test('merging returns the cases sorted by id', () => {
  // Arrange
  const existing = [MergerFixture.existing({ id: 5 }), MergerFixture.existing({ id: 2, tags: ['caching'], choice: 'Cache it' })]

  // Act
  const result = MergerFixture.merge(existing, [SignatureFixtures.extracted({ tags: ['migration'], choice: 'Migrate in steps' })])

  // Assert
  expect(result.cases.map((c) => c.id)).toEqual([2, 5, 100])
})

test('value is confidence times recency times one plus hits', () => {
  // Arrange
  const value = SignatureFixtures.caseOf({ confidence: 0.5, hits: 1, lastSeen: SignatureFixtures.TODAY })

  // Act
  const result = CaseMerger.value(value, SignatureFixtures.TODAY, 12)

  // Assert
  expect(SignatureFixtures.isClose(result, 1)).toBe(true)
})

test('value falls as the case ages', () => {
  // Arrange
  const fresh = SignatureFixtures.caseOf({ lastSeen: SignatureFixtures.TODAY })
  const old = SignatureFixtures.caseOf({ lastSeen: '2025-11-05' })

  // Act
  const freshValue = CaseMerger.value(fresh, SignatureFixtures.TODAY, 12)
  const oldValue = CaseMerger.value(old, SignatureFixtures.TODAY, 12)

  // Assert
  expect(oldValue).toBeLessThan(freshValue)
})

test('archiving picks a rejected case older than thirty days', () => {
  // Arrange
  const cases = [MergerFixture.dated(1, 'rejected', '2026-09-01'), MergerFixture.dated(2, 'rejected', '2026-10-20')]

  // Act
  const picked = CaseMerger.selectForArchive(cases, SignatureFixtures.TODAY, 100, 12)

  // Assert
  expect(picked).toEqual([1])
})

test('archiving picks a stale case older than one hundred eighty days', () => {
  // Arrange
  const cases = [MergerFixture.dated(1, 'stale', '2026-03-01'), MergerFixture.dated(2, 'stale', '2026-09-01')]

  // Act
  const picked = CaseMerger.selectForArchive(cases, SignatureFixtures.TODAY, 100, 12)

  // Assert
  expect(picked).toEqual([1])
})

test('archiving over the cap picks the lowest value cases in ascending order', () => {
  // Arrange
  const cases = [
    MergerFixture.dated(4, 'observed', SignatureFixtures.TODAY, { confidence: 0.9 }),
    MergerFixture.dated(3, 'observed', SignatureFixtures.TODAY, { confidence: 0.2 }),
    MergerFixture.dated(2, 'observed', SignatureFixtures.TODAY, { confidence: 0.4 }),
    MergerFixture.dated(1, 'observed', SignatureFixtures.TODAY, { confidence: 0.7 })
  ]

  // Act
  const picked = CaseMerger.selectForArchive(cases, SignatureFixtures.TODAY, 2, 12)

  // Assert
  expect(picked).toEqual([2, 3])
})

test('archiving leaves everything when the cap is not exceeded', () => {
  // Arrange
  const cases = [MergerFixture.dated(1, 'observed', SignatureFixtures.TODAY), MergerFixture.dated(2, 'confirmed', SignatureFixtures.TODAY)]

  // Act
  const picked = CaseMerger.selectForArchive(cases, SignatureFixtures.TODAY, 2, 12)

  // Assert
  expect(picked).toEqual([])
})

test('archiving breaks a value tie by older last seen first', () => {
  // Arrange
  const cases = [MergerFixture.dated(1, 'observed', '2027-02-01'), MergerFixture.dated(2, 'observed', '2027-01-01')]

  // Act
  const picked = CaseMerger.selectForArchive(cases, SignatureFixtures.TODAY, 1, 12)

  // Assert
  expect(picked).toEqual([2])
})

test('archiving breaks a full tie by lower id first', () => {
  // Arrange
  const cases = [9, 3, 5].map((id) => MergerFixture.dated(id, 'observed', SignatureFixtures.TODAY))

  // Act
  const picked = CaseMerger.selectForArchive(cases, SignatureFixtures.TODAY, 1, 12)

  // Assert
  expect(picked).toEqual([3, 5])
})

test('archiving with a negative cap picks every case', () => {
  // Arrange
  const cases = [MergerFixture.dated(1, 'observed', SignatureFixtures.TODAY), MergerFixture.dated(2, 'confirmed', SignatureFixtures.TODAY)]

  // Act
  const picked = CaseMerger.selectForArchive(cases, SignatureFixtures.TODAY, -3, 12)

  // Assert
  expect(picked).toEqual([1, 2])
})

test('a negated pair is not the same decision', () => {
  // Act
  const value = CaseMerger.choiceSimilarity('validate the config and fall back', 'do not validate the config and fall back')

  // Assert
  expect(value).toBeLessThan(0.5)
})

test('adding a dependency and adding none are not the same decision', () => {
  // Act
  const value = CaseMerger.choiceSimilarity('add a runtime dependency', 'no runtime dependency added')

  // Assert
  expect(value).toBeLessThan(0.5)
})

test('two identical choices made only of stopwords score one', () => {
  // Act
  const value = CaseMerger.choiceSimilarity('use the', 'use the')

  // Assert
  expect(value).toBe(1)
})

test('a second opposite extraction in a later merge makes an evidence-one case stale', () => {
  // Arrange
  const existing = [MergerFixture.existing({ evidenceCount: 1 })]
  const first = MergerFixture.merge(existing, [MergerFixture.incoming(MergerFixture.OPPOSITE, ['commit:podium:ccccccc'])])

  // Act
  const second = MergerFixture.merge(first.cases, [MergerFixture.incoming(MergerFixture.OPPOSITE, ['commit:podium:ddddddd'])], SignatureFixtures.context({ nextId: first.nextId }))

  // Assert
  expect(MergerFixture.find(first.cases, 1).status).toBe('observed')
  expect(second.added).toEqual([])
  expect(MergerFixture.find(second.cases, 1).counterCount).toBe(2)
  expect(MergerFixture.find(second.cases, 1).status).toBe('stale')
})

test('reinforcing with session evidence adds the context project', () => {
  // Arrange
  const existing = [MergerFixture.existing({ projects: ['other-repo'] })]

  // Act
  const result = MergerFixture.merge(existing, [MergerFixture.incoming(undefined, ['session:s1:3'])])

  // Assert
  expect(result.cases[0]?.projects).toEqual(['other-repo', 'podium'])
})

test('a new case records the status date as today', () => {
  // Act
  const result = MergerFixture.merge([], [MergerFixture.incoming()])

  // Assert
  expect(MergerFixture.find(result.cases, 100).statusAt).toBe(SignatureFixtures.TODAY)
})

test('a case turned stale records the status date as today', () => {
  // Arrange
  const existing = [MergerFixture.existing({ evidenceCount: 1, counterCount: 1, statusAt: '2026-01-01' })]

  // Act
  const result = MergerFixture.merge(existing, [MergerFixture.incoming(MergerFixture.OPPOSITE)])

  // Assert
  expect(MergerFixture.find(result.cases, 1).statusAt).toBe(SignatureFixtures.TODAY)
})

test('a stale case restored to observed records the status date as today', () => {
  // Arrange
  const existing = [MergerFixture.existing({ status: 'stale', evidenceCount: 2, counterCount: 2, statusAt: '2026-01-01' })]
  const incoming = MergerFixture.incoming(undefined, ['commit:podium:2222222'])

  // Act
  const result = MergerFixture.merge(existing, [incoming])

  // Assert
  expect(result.cases[0]?.status).toBe('observed')
  expect(result.cases[0]?.statusAt).toBe(SignatureFixtures.TODAY)
})

test('reinforcing without a status change keeps the status date', () => {
  // Arrange
  const existing = [MergerFixture.existing({ statusAt: '2026-01-01' })]

  // Act
  const result = MergerFixture.merge(existing, [MergerFixture.incoming()])

  // Assert
  expect(result.cases[0]?.statusAt).toBe('2026-01-01')
})

test('archiving ages a rejected case by its status date', () => {
  // Arrange
  const cases = [MergerFixture.dated(1, 'rejected', '2025-11-05', { statusAt: SignatureFixtures.TODAY })]

  // Act
  const picked = CaseMerger.selectForArchive(cases, SignatureFixtures.TODAY, 100, 12)

  // Assert
  expect(picked).toEqual([])
})

test('archiving picks a case rejected long ago even if seen recently', () => {
  // Arrange
  const cases = [MergerFixture.dated(1, 'rejected', SignatureFixtures.TODAY, { statusAt: '2026-09-01' })]

  // Act
  const picked = CaseMerger.selectForArchive(cases, SignatureFixtures.TODAY, 100, 12)

  // Assert
  expect(picked).toEqual([1])
})

test('a similar tag set with a middling choice makes a new case without a counter', () => {
  // Arrange
  const existing = [MergerFixture.existing({ choice: 'validate config value early' })]

  // Act
  const result = MergerFixture.merge(existing, [MergerFixture.incoming('validate config always')])

  // Assert
  expect(result.added).toEqual([100])
  expect(result.reinforced).toEqual([])
  expect(result.contradicted).toEqual([])
  expect(MergerFixture.find(result.cases, 1).counterCount).toBe(0)
})

test('an opposite choice on a different tag set adds no counter', () => {
  // Arrange
  const existing = [MergerFixture.existing()]
  const incoming = SignatureFixtures.extracted({ tags: ['fail-open', 'hook', 'config', 'ci'], choice: MergerFixture.OPPOSITE })

  // Act
  const result = MergerFixture.merge(existing, [incoming])

  // Assert
  expect(result.added).toEqual([100])
  expect(result.contradicted).toEqual([])
  expect(MergerFixture.find(result.cases, 1).counterCount).toBe(0)
})

test('adding a negated clause about another word keeps the choices alike', () => {
  // Act
  const value = CaseMerger.choiceSimilarity('Keep tests next to the source', 'Keep tests next to the source, never in a separate folder')

  // Assert
  expect(value).toBeGreaterThanOrEqual(0.5)
})

test('adding a negated extra word keeps the choices alike', () => {
  // Act
  const value = CaseMerger.choiceSimilarity('Use Zod for validation', 'Use Zod for validation, no extra dependency')

  // Assert
  expect(value).toBeGreaterThanOrEqual(0.5)
})

test('swapping which word is negated makes the choices opposite', () => {
  // Act
  const value = CaseMerger.choiceSimilarity('Prefer tabs, not spaces', 'Prefer spaces, not tabs')

  // Assert
  expect(value).toBeLessThanOrEqual(0.2 + 1e-9)
})

test('a restatement with an added negated clause reinforces instead of contradicting', () => {
  // Arrange
  const existing = [MergerFixture.existing({ choice: 'Keep tests next to the source' })]
  const incoming = MergerFixture.incoming('Keep tests next to the source, never in a separate folder')

  // Act
  const result = MergerFixture.merge(existing, [incoming])

  // Assert
  expect(result.reinforced).toEqual([1])
  expect(result.contradicted).toEqual([])
  expect(result.added).toEqual([])
  expect(MergerFixture.find(result.cases, 1).counterCount).toBe(0)
})

test('a new case from mixed commit and session evidence includes the context project', () => {
  // Arrange
  const incoming = MergerFixture.incoming(undefined, ['commit:other-repo:ccccccc', 'session:s1:3'])

  // Act
  const result = MergerFixture.merge([], [incoming])

  // Assert
  expect(MergerFixture.find(result.cases, 100).projects).toEqual(['other-repo', 'podium'])
})

test('the same case sent four times with eight ids counts eight pieces of evidence', () => {
  // Arrange
  const raws = ['01', '23', '45', '67'].map((pair) => SignatureFixtures.raw({ evidence: MergerFixture.ids(pair) }))
  const parsed = Cases.parseModelOutput(SignatureFixtures.output(raws), SignatureFixtures.vocabulary())

  // Act
  const result = MergerFixture.merge([], parsed.cases)

  // Assert
  expect(result.cases).toHaveLength(1)
  expect(result.cases[0]?.evidenceCount).toBe(8)
})

test('the same eight ids merged four times in one call count eight', () => {
  // Arrange
  const incoming = [1, 2, 3, 4].map(() => MergerFixture.incoming(undefined, MergerFixture.ids('01234567')))

  // Act
  const result = MergerFixture.merge([], incoming)

  // Assert
  expect(result.cases[0]?.evidenceCount).toBe(8)
})

test('the same new ids merged twice in one call grow the count once', () => {
  // Arrange
  const existing = [MergerFixture.existing()]
  const ids = MergerFixture.ids('bc')

  // Act
  const result = MergerFixture.merge(existing, [MergerFixture.incoming(undefined, ids), MergerFixture.incoming(undefined, ids)])

  // Assert
  expect(result.cases[0]?.evidenceCount).toBe(3)
})

test('parsing unites duplicate cases of one output', () => {
  // Arrange
  const text = SignatureFixtures.output([SignatureFixtures.raw({ evidence: MergerFixture.ids('01') }), SignatureFixtures.raw({ evidence: MergerFixture.ids('12') })])

  // Act
  const output = Cases.parseModelOutput(text, SignatureFixtures.vocabulary())

  // Assert
  expect(output.cases).toHaveLength(1)
  expect(output.cases[0]?.evidence).toEqual(MergerFixture.ids('012'))
})

test('an unrelated choice on the same tags makes a new case without a counter', () => {
  // Arrange
  const existing = [MergerFixture.existing()]

  // Act
  const result = MergerFixture.merge(existing, [MergerFixture.incoming(MergerFixture.UNRELATED)])

  // Assert
  expect(result.added).toEqual([100])
  expect(result.contradicted).toEqual([])
  expect(MergerFixture.find(result.cases, 1).counterCount).toBe(0)
})

test('five opposite copies in one output counter an existing case once', () => {
  // Arrange
  const existing = [MergerFixture.existing({ evidenceCount: 5 })]
  const incoming = ['1', '2', '3', '4', '5'].map((x) => MergerFixture.incoming(MergerFixture.OPPOSITE, MergerFixture.ids(x)))

  // Act
  const result = MergerFixture.merge(existing, incoming)

  // Assert
  expect(MergerFixture.find(result.cases, 1).counterCount).toBe(1)
  expect(result.added).toEqual([100])
})

test('a user-confirmed case is never made stale by contradictions', () => {
  // Arrange
  const existing = [MergerFixture.existing({ status: 'confirmed', isConfirmedByUser: true, evidenceCount: 1, counterCount: 3 })]

  // Act
  const result = MergerFixture.merge(existing, [MergerFixture.incoming(MergerFixture.OPPOSITE)])

  // Assert
  expect(MergerFixture.find(result.cases, 1).counterCount).toBe(4)
  expect(MergerFixture.find(result.cases, 1).status).toBe('confirmed')
})

test('a stale user-confirmed case is restored to confirmed', () => {
  // Arrange
  const existing = [MergerFixture.existing({ status: 'stale', isConfirmedByUser: true, evidenceCount: 2, counterCount: 2 })]

  // Act
  const result = MergerFixture.merge(existing, [MergerFixture.incoming(undefined, MergerFixture.ids('12'))])

  // Assert
  expect(result.cases[0]?.status).toBe('confirmed')
})

test('allowed evidence filters the ids it does not know', () => {
  // Arrange
  const context = SignatureFixtures.context({ allowedEvidence: MergerFixture.ids('b') })

  // Act
  const result = MergerFixture.merge([], [MergerFixture.incoming(undefined, MergerFixture.ids('bc'))], context)

  // Assert
  expect(result.cases[0]?.evidence).toEqual(MergerFixture.ids('b'))
})

test('allowed evidence drops a case left with no evidence', () => {
  // Arrange
  const context = SignatureFixtures.context({ allowedEvidence: MergerFixture.ids('b') })

  // Act
  const result = MergerFixture.merge([], [MergerFixture.incoming(undefined, MergerFixture.ids('c'))], context)

  // Assert
  expect(result.cases).toEqual([])
  expect(result.dropped).toBe(1)
})

test('an empty allowed evidence list means no restriction', () => {
  // Arrange
  const context = SignatureFixtures.context({ allowedEvidence: [] })

  // Act
  const result = MergerFixture.merge([], [MergerFixture.incoming(undefined, MergerFixture.ids('c'))], context)

  // Assert
  expect(result.cases[0]?.evidence).toEqual(MergerFixture.ids('c'))
})
