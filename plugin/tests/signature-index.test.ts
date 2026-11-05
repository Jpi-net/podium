import { expect, test } from 'claude-code/testing'
import { TagIndex } from '../hooks/signature/tag-index'
import { SignatureFixtures } from './fixtures/signature'

class IndexFixture {
  static parsed(change: (index: any) => void): ReturnType<typeof TagIndex.parse> {
    const index = JSON.parse(TagIndex.serialize(TagIndex.build(IndexFixture.cases())))
    change(index)
    return TagIndex.parse(JSON.stringify(index))
  }

  static cases() {
    return [
      SignatureFixtures.caseOf({ id: 3, tags: ['hook', 'fail-open'] }),
      SignatureFixtures.caseOf({ id: 1, tags: ['fail-open', 'config'] }),
      SignatureFixtures.caseOf({ id: 2, tags: ['config'] })
    ]
  }
}

test('building an index equals folding add over the same cases', () => {
  // Arrange
  const cases = IndexFixture.cases()

  // Act
  const built = TagIndex.build(cases)
  const folded = SignatureFixtures.foldAdd(cases)

  // Assert
  expect(built).toEqual(folded)
})

test('building an index keeps postings sorted by id', () => {
  // Act
  const index = TagIndex.build(IndexFixture.cases())

  // Assert
  expect(TagIndex.postingsOf(index, 'fail-open')).toEqual([1, 3])
  expect(index.df['fail-open']).toBe(2)
})

test('adding an existing id with other tags leaves no stale posting', () => {
  // Arrange
  const before = TagIndex.build(IndexFixture.cases())
  const changed = SignatureFixtures.caseOf({ id: 3, tags: ['hook'] })

  // Act
  const after = TagIndex.add(before, changed)

  // Assert
  expect(TagIndex.postingsOf(after, 'fail-open')).toEqual([1])
  expect(after.df['fail-open']).toBe(1)
  expect(TagIndex.postingsOf(after, 'hook')).toEqual([3])
  expect(after.n).toBe(3)
})

test('removing the last posting of a tag deletes it from df and postings', () => {
  // Arrange
  const before = TagIndex.build(IndexFixture.cases())

  // Act
  const after = TagIndex.remove(before, 3, ['hook', 'fail-open'])

  // Assert
  expect('hook' in after.df).toBe(false)
  expect('hook' in after.postings).toBe(false)
  expect(TagIndex.postingsOf(after, 'fail-open')).toEqual([1])
  expect(TagIndex.metaFor(after, 3)).toBeUndefined()
})

test('the case count follows the meta entries', () => {
  // Arrange
  const built = TagIndex.build(IndexFixture.cases())

  // Act
  const removed = TagIndex.remove(built, 1, ['fail-open', 'config'])

  // Assert
  expect(built.n).toBe(3)
  expect(removed.n).toBe(2)
})

test('meta encodes scope, status and last seen date', () => {
  // Arrange
  const value = SignatureFixtures.caseOf({ scope: 'project', status: 'confirmed', confidence: 0.9, stack: 'node', projectId: 'r9f3a1c2', lastSeen: '2026-10-28' })

  // Act
  const meta = TagIndex.metaOf(value)

  // Assert
  expect(meta).toEqual([0.9, 20261028, 2, 2, 'node', 'r9f3a1c2'])
})

test('meta encodes a global observed case as zero and one', () => {
  // Act
  const meta = TagIndex.metaOf(SignatureFixtures.caseOf({ scope: 'global', status: 'observed' }))

  // Assert
  expect(meta[2]).toBe(0)
  expect(meta[3]).toBe(1)
})

test('an invalid date encodes as zero', () => {
  // Act
  const value = TagIndex.dateNumber('yesterday')

  // Assert
  expect(value).toBe(0)
})

test('parsing rejects an index with another version', () => {
  // Arrange
  const text = JSON.stringify({ ...TagIndex.empty(), version: 2 })

  // Act
  const parsed = TagIndex.parse(text)

  // Assert
  expect(parsed).toBeUndefined()
})

test('parsing rejects an index with a wrong shape', () => {
  // Arrange
  const text = '{"version":1,"n":1,"df":{},"postings":{},"meta":{"1":[0.5]}}'

  // Act
  const parsed = TagIndex.parse(text)

  // Assert
  expect(parsed).toBeUndefined()
})

test('parsing rejects text that is not JSON', () => {
  // Act
  const parsed = TagIndex.parse('{oops')

  // Assert
  expect(parsed).toBeUndefined()
})

test('parsing accepts what serialize wrote', () => {
  // Arrange
  const index = TagIndex.build(IndexFixture.cases())

  // Act
  const parsed = TagIndex.parse(TagIndex.serialize(index))

  // Assert
  expect(parsed).toEqual(index)
})

test('adding a case does not mutate the input index', () => {
  // Arrange
  const before = TagIndex.build(IndexFixture.cases())
  const snapshot = SignatureFixtures.snapshot(before)

  // Act
  TagIndex.add(before, SignatureFixtures.caseOf({ id: 3, tags: ['hook', 'ci'] }))
  TagIndex.add(before, SignatureFixtures.caseOf({ id: 9, tags: ['config'] }))

  // Assert
  expect(SignatureFixtures.snapshot(before)).toBe(snapshot)
})

test('removing a case does not mutate the input index', () => {
  // Arrange
  const before = TagIndex.build(IndexFixture.cases())
  const snapshot = SignatureFixtures.snapshot(before)

  // Act
  TagIndex.remove(before, 1, ['fail-open', 'config'])

  // Assert
  expect(SignatureFixtures.snapshot(before)).toBe(snapshot)
})

test('parsing rejects postings that are not sorted', () => {
  // Act
  const parsed = IndexFixture.parsed((index) => { index.postings['fail-open'] = [3, 1] })

  // Assert
  expect(parsed).toBeUndefined()
})

test('parsing rejects postings with a duplicate id', () => {
  // Act
  const parsed = IndexFixture.parsed((index) => { index.postings['fail-open'] = [1, 1] })

  // Assert
  expect(parsed).toBeUndefined()
})

test('parsing rejects a df that does not match its postings', () => {
  // Act
  const parsed = IndexFixture.parsed((index) => { index.df['fail-open'] = 5 })

  // Assert
  expect(parsed).toBeUndefined()
})

test('parsing rejects a posting whose case has no meta', () => {
  // Act
  const parsed = IndexFixture.parsed((index) => {
    delete index.meta['3']
    index.n = 2
  })

  // Assert
  expect(parsed).toBeUndefined()
})

test('parsing rejects an n that differs from the meta count', () => {
  // Act
  const parsed = IndexFixture.parsed((index) => { index.n = 7 })

  // Assert
  expect(parsed).toBeUndefined()
})

test('parsing rejects a posting under an invalid tag name', () => {
  // Act
  const parsed = IndexFixture.parsed((index) => {
    index.postings['Bad Name'] = [1]
    index.df['Bad Name'] = 1
  })

  // Assert
  expect(parsed).toBeUndefined()
})

test('removing with wrong tags still clears every posting holding the id', () => {
  // Arrange
  const cases = IndexFixture.cases()
  const built = TagIndex.build(cases)

  // Act
  const after = TagIndex.remove(built, 3, ['zzz'])

  // Assert
  expect(after).toEqual(TagIndex.build(cases.filter((c) => c.id !== 3)))
})

test('contains tells whether a tag lists a case', () => {
  // Arrange
  const index = TagIndex.build(IndexFixture.cases())

  // Assert
  expect(TagIndex.contains(index, 'fail-open', 1)).toBe(true)
  expect(TagIndex.contains(index, 'fail-open', 2)).toBe(false)
  expect(TagIndex.contains(index, 'unknown-tag', 1)).toBe(false)
})

test('building an index from a case with an invalid tag name gives an index that parses', () => {
  // Arrange
  const index = TagIndex.build([SignatureFixtures.caseOf({ id: 1, tags: ['fail-open', 'Bad Name', '__proto__'] })])

  // Act
  const parsed = TagIndex.parse(TagIndex.serialize(index))

  // Assert
  expect(parsed).toBeDefined()
  expect(TagIndex.postingsOf(index, 'fail-open')).toEqual([1])
})
