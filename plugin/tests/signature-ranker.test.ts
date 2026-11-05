import { expect, test } from 'claude-code/testing'
import type { Case } from '../hooks/signature/cases'
import { CaseRanker } from '../hooks/signature/ranker'
import { TagIndex, type TagIndexData } from '../hooks/signature/tag-index'
import { SignatureFixtures } from './fixtures/signature'

class RankerFixture {
  static readonly WORKED_TAGS = ['config', 'hook', 'node', 'typescript', 'untrusted-input', 'fail-open', 'strict-vs-lenient']
  static readonly WORKED_DF: Record<string, number> = {
    'config': 120,
    'hook': 35,
    'node': 200,
    'typescript': 180,
    'untrusted-input': 3,
    'fail-open': 9,
    'strict-vs-lenient': 14
  }
  static readonly WORKED_WEIGHT: Record<string, number> = {
    'config': 2,
    'hook': 2,
    'node': 1,
    'typescript': 1,
    'untrusted-input': 3,
    'fail-open': 3,
    'strict-vs-lenient': 2.5
  }

  static score(cases: readonly Case[], tags: string[], id: number, extra: Parameters<typeof SignatureFixtures.query>[0] = {}): number {
    const index = TagIndex.build(cases)
    return CaseRanker.score(index, SignatureFixtures.vocabulary(), SignatureFixtures.query({ tags, ...extra }), id)
  }

  static top(cases: readonly Case[], tags: string[], k = 10, minScore = 0, extra: Parameters<typeof SignatureFixtures.query>[0] = {}) {
    const index = TagIndex.build(cases)
    return CaseRanker.top(index, SignatureFixtures.vocabulary(), SignatureFixtures.query({ tags, ...extra }), k, minScore)
  }

  static worked(): { index: TagIndexData, expected: number } {
    const target = SignatureFixtures.caseOf({ id: 142, tags: RankerFixture.WORKED_TAGS, confidence: 0.9, status: 'confirmed' })
    const others = [
      SignatureFixtures.caseOf({ id: 31, tags: ['hook', 'config'], confidence: 0.9, status: 'confirmed' }),
      SignatureFixtures.caseOf({ id: 207, tags: ['untrusted-input', 'node'], confidence: 0.9, status: 'confirmed' }),
      SignatureFixtures.caseOf({ id: 88, tags: ['hook'], confidence: 0.9, status: 'confirmed' })
    ]
    const index = TagIndex.build([target, ...others])
    index.n = 412
    for (const tag of RankerFixture.WORKED_TAGS) index.df[tag] = RankerFixture.WORKED_DF[tag] ?? 1
    let raw = 0
    for (const tag of RankerFixture.WORKED_TAGS) {
      raw += (RankerFixture.WORKED_WEIGHT[tag] ?? 0) * Math.log(1 + 412 / (RankerFixture.WORKED_DF[tag] ?? 1))
    }
    return { index, expected: raw * 0.9 }
  }
}

test('idf follows ln of one plus n over df', () => {
  // Arrange
  const index = SignatureFixtures.rawIndex(10, { hook: 2 })

  // Act
  const value = CaseRanker.idf(index, 'hook')

  // Assert
  expect(SignatureFixtures.isCloseRelative(value, Math.log(6))).toBe(true)
})

test('idf of an unknown tag uses a document frequency of one', () => {
  // Arrange
  const index = SignatureFixtures.rawIndex(10, {})

  // Act
  const value = CaseRanker.idf(index, 'hook')

  // Assert
  expect(SignatureFixtures.isCloseRelative(value, Math.log(11))).toBe(true)
})

test('recency of a case without a date is one', () => {
  // Act
  const value = CaseRanker.recency(0, SignatureFixtures.NOW, 12)

  // Assert
  expect(value).toBe(1)
})

test('recency halves after one half-life', () => {
  // Arrange
  const lastSeen = 20260101
  const now = TagIndex.dateMs(lastSeen) + Math.round(12 * 30.4375 * SignatureFixtures.DAY)

  // Act
  const value = CaseRanker.recency(lastSeen, now, 12)

  // Assert
  expect(SignatureFixtures.isClose(value, 0.5)).toBe(true)
})

test('recency of a date in the future is one', () => {
  // Act
  const value = CaseRanker.recency(20270101, SignatureFixtures.NOW, 12)

  // Assert
  expect(value).toBe(1)
})

test('a query of stack and phase tags only is not situational', () => {
  // Act
  const isSituational = CaseRanker.isSituational(SignatureFixtures.vocabulary(), ['node', 'plan'])

  // Assert
  expect(isSituational).toBe(false)
})

test('a query with a concept tag is situational', () => {
  // Act
  const isSituational = CaseRanker.isSituational(SignatureFixtures.vocabulary(), ['node', 'fail-open'])

  // Assert
  expect(isSituational).toBe(true)
})

test('a rejected case scores zero', () => {
  // Arrange
  const cases = [SignatureFixtures.caseOf({ id: 1, tags: ['hook'], status: 'rejected' })]

  // Act
  const score = RankerFixture.score(cases, ['hook'], 1)

  // Assert
  expect(score).toBe(0)
})

test('top with a zero minimum score never returns a rejected case', () => {
  // Arrange
  const cases = [SignatureFixtures.caseOf({ id: 1, tags: ['hook'], status: 'rejected' }), SignatureFixtures.caseOf({ id: 2, tags: ['hook'] })]

  // Act
  const ranked = RankerFixture.top(cases, ['fail-open', 'hook'])

  // Assert
  expect(ranked.map((r) => r.id)).toEqual([2])
})

test('an observed case scores below the same confirmed case', () => {
  // Arrange
  const cases = [SignatureFixtures.caseOf({ id: 1, status: 'confirmed' }), SignatureFixtures.caseOf({ id: 2, status: 'observed' })]

  // Act
  const confirmed = RankerFixture.score(cases, ['fail-open'], 1)
  const observed = RankerFixture.score(cases, ['fail-open'], 2)

  // Assert
  expect(SignatureFixtures.isCloseRelative(observed / confirmed, 0.7, 1e-6)).toBe(true)
})

test('a direct match ranks above a case holding only a child of the query tag', () => {
  // Arrange
  const cases = [SignatureFixtures.caseOf({ id: 1, tags: ['robustness'] }), SignatureFixtures.caseOf({ id: 2, tags: ['fail-open'] })]

  // Act
  const direct = RankerFixture.score(cases, ['robustness'], 1)
  const viaChild = RankerFixture.score(cases, ['robustness'], 2)

  // Assert
  expect(viaChild).toBeGreaterThan(0)
  expect(direct).toBeGreaterThan(viaChild)
})

test('a direct match ranks above a case holding only the parent of the query tag', () => {
  // Arrange
  const cases = [SignatureFixtures.caseOf({ id: 1, tags: ['fail-open'] }), SignatureFixtures.caseOf({ id: 2, tags: ['robustness'] })]

  // Act
  const direct = RankerFixture.score(cases, ['fail-open'], 1)
  const viaParent = RankerFixture.score(cases, ['fail-open'], 2)

  // Assert
  expect(viaParent).toBeGreaterThan(0)
  expect(direct).toBeGreaterThan(viaParent)
})

test('a project case of another project ranks below the same case in this project', () => {
  // Arrange
  const cases = [
    SignatureFixtures.caseOf({ id: 1, scope: 'project', projectId: 'p1' }),
    SignatureFixtures.caseOf({ id: 2, scope: 'project', projectId: 'p2' })
  ]

  // Act
  const here = RankerFixture.score(cases, ['fail-open'], 1, { projectId: 'p1' })
  const elsewhere = RankerFixture.score(cases, ['fail-open'], 2, { projectId: 'p1' })

  // Assert
  expect(elsewhere).toBeGreaterThan(0)
  expect(here).toBeGreaterThan(elsewhere)
  expect(SignatureFixtures.isCloseRelative(here / elsewhere, 2.6, 1e-6)).toBe(true)
})

test('a stack case sharing the stack scores one point fifteen of a global case', () => {
  // Arrange
  const cases = [SignatureFixtures.caseOf({ id: 1, scope: 'global' }), SignatureFixtures.caseOf({ id: 2, scope: 'stack', stack: 'node' })]

  // Act
  const global = RankerFixture.score(cases, ['fail-open'], 1, { stack: ['node'] })
  const shared = RankerFixture.score(cases, ['fail-open'], 2, { stack: ['node'] })

  // Assert
  expect(SignatureFixtures.isCloseRelative(shared / global, 1.15, 1e-6)).toBe(true)
})

test('a stack case without a shared stack scores six tenths of a global case', () => {
  // Arrange
  const cases = [SignatureFixtures.caseOf({ id: 1, scope: 'global' }), SignatureFixtures.caseOf({ id: 2, scope: 'stack', stack: 'node' })]

  // Act
  const global = RankerFixture.score(cases, ['fail-open'], 1, { stack: ['python'] })
  const other = RankerFixture.score(cases, ['fail-open'], 2, { stack: ['python'] })

  // Assert
  expect(SignatureFixtures.isCloseRelative(other / global, 0.6, 1e-6)).toBe(true)
})

test('an unknown query tag is ignored', () => {
  // Arrange
  const cases = [SignatureFixtures.caseOf({ id: 1, tags: ['hook'] })]

  // Act
  const plain = RankerFixture.score(cases, ['hook'], 1)
  const padded = RankerFixture.score(cases, ['hook', 'zzz-unknown'], 1)

  // Assert
  expect(padded).toBe(plain)
})

test('top returns nothing for a query of stack and phase tags only', () => {
  // Arrange
  const cases = [SignatureFixtures.caseOf({ id: 1, tags: ['fail-open', 'node', 'plan'] })]

  // Act
  const ranked = RankerFixture.top(cases, ['node', 'plan'])

  // Assert
  expect(ranked).toEqual([])
})

test('top returns nothing when k is zero', () => {
  // Arrange
  const cases = [SignatureFixtures.caseOf({ id: 1 })]

  // Act
  const ranked = RankerFixture.top(cases, ['fail-open'], 0)

  // Assert
  expect(ranked).toEqual([])
})

test('equal scores order by higher confidence first', () => {
  // Arrange
  const cases = [
    SignatureFixtures.caseOf({ id: 1, confidence: 0.5, scope: 'global' }),
    SignatureFixtures.caseOf({ id: 2, confidence: 1, scope: 'project', projectId: 'other' })
  ]

  // Act
  const ranked = RankerFixture.top(cases, ['fail-open'])

  // Assert
  expect(ranked[0]?.score).toBe(ranked[1]?.score)
  expect(ranked.map((r) => r.id)).toEqual([2, 1])
})

test('equal scores and confidence order by newer last seen first', () => {
  // Arrange
  const earlier = SignatureFixtures.NOW - 400 * SignatureFixtures.DAY
  const cases = [SignatureFixtures.caseOf({ id: 1, lastSeen: '2027-01-01' }), SignatureFixtures.caseOf({ id: 2, lastSeen: '2027-02-01' })]

  // Act
  const ranked = RankerFixture.top(cases, ['fail-open'], 10, 0, { now: earlier })

  // Assert
  expect(ranked[0]?.score).toBe(ranked[1]?.score)
  expect(ranked.map((r) => r.id)).toEqual([2, 1])
})

test('equal scores, confidence and last seen order by lower id first', () => {
  // Arrange
  const cases = [SignatureFixtures.caseOf({ id: 5 }), SignatureFixtures.caseOf({ id: 2 })]

  // Act
  const ranked = RankerFixture.top(cases, ['fail-open'])

  // Assert
  expect(ranked.map((r) => r.id)).toEqual([2, 5])
})

test('top returns at most k cases', () => {
  // Arrange
  const cases = [1, 2, 3].map((id) => SignatureFixtures.caseOf({ id, confidence: id / 10 }))

  // Act
  const ranked = RankerFixture.top(cases, ['fail-open'], 2)

  // Assert
  expect(ranked.map((r) => r.id)).toEqual([3, 2])
})

test('top drops cases below the minimum score', () => {
  // Arrange
  const cases = [1, 2, 3].map((id) => SignatureFixtures.caseOf({ id, confidence: id / 10 }))
  const middle = RankerFixture.score(cases, ['fail-open'], 2)
  const lowest = RankerFixture.score(cases, ['fail-open'], 1)

  // Act
  const ranked = RankerFixture.top(cases, ['fail-open'], 10, (middle + lowest) / 2)

  // Assert
  expect(ranked.map((r) => r.id)).toEqual([3, 2])
})

test('the worked example ranks case 142 first with the hand computed score', () => {
  // Arrange
  const { index, expected } = RankerFixture.worked()
  const query = SignatureFixtures.query({ tags: RankerFixture.WORKED_TAGS, stack: ['node', 'typescript'] })

  // Act
  const ranked = CaseRanker.top(index, SignatureFixtures.vocabulary(), query, 3, 0)

  // Assert
  expect(ranked[0]?.id).toBe(142)
  expect(SignatureFixtures.isCloseRelative(ranked[0]?.score ?? 0, expected, 1e-6)).toBe(true)
})

test('two consecutive queries on the same index give equal results', () => {
  // Arrange
  const index = TagIndex.build([SignatureFixtures.caseOf({ id: 1, tags: ['robustness'] }), SignatureFixtures.caseOf({ id: 2, tags: ['fail-open'] })])
  const query = SignatureFixtures.query({ tags: ['robustness'] })

  // Act
  const first = CaseRanker.top(index, SignatureFixtures.vocabulary(), query, 10, 0)
  const second = CaseRanker.top(index, SignatureFixtures.vocabulary(), query, 10, 0)

  // Assert
  expect(first).toHaveLength(2)
  expect(second).toEqual(first)
})
