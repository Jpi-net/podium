import { expect, test } from 'claude-code/testing'
import { Cases } from '../hooks/signature/cases'
import { SignatureFixtures } from './fixtures/signature'

class CasesFixture {
  static reasonOf(overrides: Record<string, unknown>): string | undefined {
    const output = Cases.parseModelOutput(SignatureFixtures.output([SignatureFixtures.raw(overrides)]), SignatureFixtures.vocabulary())
    return output.dropped[0]?.reason
  }

  static line(extra: Record<string, unknown>): string {
    return JSON.stringify({ ...SignatureFixtures.caseOf({ id: 1 }), ...extra })
  }

  static pair(verb: string, target: string, gap: number): string {
    return `${verb}${' '.repeat(gap)}${target}`
  }
}

test('first object ignores the prose around the object', () => {
  // Act
  const found = Cases.firstObject('Here you go: {"a":1} hope it helps')

  // Assert
  expect(found).toBe('{"a":1}')
})

test('first object keeps braces that sit inside strings', () => {
  // Arrange
  const text = 'x {"a":"}{ not a close"} y'

  // Act
  const found = Cases.firstObject(text)

  // Assert
  expect(found).toBe('{"a":"}{ not a close"}')
})

test('first object keeps escaped quotes inside strings', () => {
  // Arrange
  const text = '{"a":"x\\"}y"} tail'

  // Act
  const found = Cases.firstObject(text)

  // Assert
  expect(found).toBe('{"a":"x\\"}y"}')
})

test('first object skips an unbalanced brace and returns the next real object', () => {
  // Act
  const found = Cases.firstObject('oops { {"a":1}')

  // Assert
  expect(found).toBe('{"a":1}')
})

test('first object returns an empty string when there is no object', () => {
  // Act
  const found = Cases.firstObject('no braces here')

  // Assert
  expect(found).toBe('')
})

test('parsing keeps a valid case and normalises its tags', () => {
  // Arrange
  const text = SignatureFixtures.output([SignatureFixtures.raw({ tags: ['Fallback', 'fail-open', 'ZZZ unknown'] })])

  // Act
  const output = Cases.parseModelOutput(text, SignatureFixtures.vocabulary())

  // Assert
  expect(output.dropped).toEqual([])
  expect(output.cases).toHaveLength(1)
  expect(output.cases[0]?.tags).toEqual(['fail-open'])
})

test('parsing finds the object through surrounding prose', () => {
  // Arrange
  const text = `Sure.\n${SignatureFixtures.output([SignatureFixtures.raw()])}\nDone.`

  // Act
  const output = Cases.parseModelOutput(text, SignatureFixtures.vocabulary())

  // Assert
  expect(output.cases).toHaveLength(1)
})

test('parsing drops a case that is not an object', () => {
  // Act
  const output = Cases.parseModelOutput(SignatureFixtures.output([5]), SignatureFixtures.vocabulary())

  // Assert
  expect(output.dropped).toEqual([{ index: 0, reason: 'not-object' }])
})

test('parsing drops a case with a too short situation', () => {
  // Act
  const result = CasesFixture.reasonOf({ situation: 'short' })

  // Assert
  expect(result).toBe('situation')
})

test('parsing drops a case with a too short choice', () => {
  // Act
  const result = CasesFixture.reasonOf({ choice: 'tiny' })

  // Assert
  expect(result).toBe('choice')
})

test('parsing drops a case with more than six options', () => {
  // Act
  const result = CasesFixture.reasonOf({ options: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] })

  // Assert
  expect(result).toBe('options')
})

test('parsing drops a case whose options are not an array', () => {
  // Act
  const result = CasesFixture.reasonOf({ options: 'validate' })

  // Assert
  expect(result).toBe('options')
})

test('parsing drops a case with a why that is too long', () => {
  // Act
  const result = CasesFixture.reasonOf({ why: 'x'.repeat(301) })

  // Assert
  expect(result).toBe('why')
})

test('parsing drops a case with an unknown kind', () => {
  // Act
  const result = CasesFixture.reasonOf({ kind: 'whim' })

  // Assert
  expect(result).toBe('kind')
})

test('parsing drops a case whose tags are not an array', () => {
  // Act
  const result = CasesFixture.reasonOf({ tags: 'fail-open' })

  // Assert
  expect(result).toBe('tags')
})

test('parsing drops a case whose tags are all unknown', () => {
  // Act
  const result = CasesFixture.reasonOf({ tags: ['zzz-unknown'] })

  // Assert
  expect(result).toBe('tags')
})

test('parsing drops a case that has no concept or decision tag', () => {
  // Act
  const result = CasesFixture.reasonOf({ tags: ['hook'] })

  // Assert
  expect(result).toBe('concept')
})

test('parsing drops a case with malformed evidence', () => {
  // Act
  const result = CasesFixture.reasonOf({ evidence: ['not-an-evidence'] })

  // Assert
  expect(result).toBe('evidence')
})

test('parsing drops a case without evidence', () => {
  // Act
  const result = CasesFixture.reasonOf({ evidence: [] })

  // Assert
  expect(result).toBe('evidence')
})

test('parsing drops a case that weakens a safeguard', () => {
  // Act
  const result = CasesFixture.reasonOf({ choice: 'Skip the tests when in a hurry' })

  // Assert
  expect(result).toBe('unsafe')
})

test('parsing keeps only well formed candidate tags', () => {
  // Arrange
  const candidates = [
    { tag: 'rate-limit', facet: 'concept', parent: 'security', aliases: ['Rate Limit', ' '] },
    { tag: 'rate-limit', facet: 'concept', parent: '', aliases: [] },
    { tag: 'security', facet: 'lens', parent: '' },
    { tag: 'Bad Name', facet: 'concept', parent: '' },
    { tag: 'odd-facet', facet: 'mood', parent: '' },
    { tag: 'orphan', facet: 'concept', parent: 'no-such-parent' },
    'nope'
  ]

  // Act
  const output = Cases.parseModelOutput(SignatureFixtures.output([], candidates), SignatureFixtures.vocabulary())

  // Assert
  expect(output.candidateTags).toEqual([{ tag: 'rate-limit', facet: 'concept', parent: 'security', aliases: ['rate limit'] }])
})

test('parsing garbage text gives an empty result', () => {
  // Act
  const output = Cases.parseModelOutput('this is not json {{{', SignatureFixtures.vocabulary())

  // Assert
  expect(output).toEqual({ cases: [], candidateTags: [], dropped: [] })
})

test('a verb three hundred characters from a target is unsafe', () => {
  // Act
  const result = Cases.isUnsafe(CasesFixture.pair('skip', 'tests', 300))

  // Assert
  expect(result).toBe(true)
})

test('a verb three hundred and one characters from a target is safe', () => {
  // Act
  const result = Cases.isUnsafe(CasesFixture.pair('skip', 'tests', 301))

  // Assert
  expect(result).toBe(false)
})

test('a target before a verb three hundred characters apart is unsafe', () => {
  // Act
  const result = Cases.isUnsafe(CasesFixture.pair('tests', 'skip', 300))

  // Assert
  expect(result).toBe(true)
})

test('a target before a verb three hundred and one characters apart is safe', () => {
  // Act
  const result = Cases.isUnsafe(CasesFixture.pair('tests', 'skip', 301))

  // Assert
  expect(result).toBe(false)
})

test('the word latest does not count as the target test', () => {
  // Act
  const result = Cases.isUnsafe('skip the latest')

  // Assert
  expect(result).toBe(false)
})

test('a verb alone is safe', () => {
  // Act
  const result = Cases.isUnsafe('skip the boring part')

  // Assert
  expect(result).toBe(false)
})

test('a no-verify flag next to hooks is unsafe', () => {
  // Act
  const result = Cases.isUnsafe('commit with --no-verify to avoid the hooks')

  // Assert
  expect(result).toBe(true)
})

test('turning off a lint is unsafe', () => {
  // Act
  const result = Cases.isUnsafe('Turn off the lint for this file')

  // Assert
  expect(result).toBe(true)
})

test('confidence of one commit in one project is about 0.554', () => {
  // Act
  const result = SignatureFixtures.isClose(Cases.confidence(1, 0, 1, false), 0.554)

  // Assert
  expect(result).toBe(true)
})

test('confidence of seven evidence in two projects is about 0.862', () => {
  // Act
  const result = SignatureFixtures.isClose(Cases.confidence(7, 0, 2, false), 0.862)

  // Assert
  expect(result).toBe(true)
})

test('confidence is clamped at one with the confirmed bonus', () => {
  // Act
  const result = Cases.confidence(50, 0, 5, true)

  // Assert
  expect(result).toBe(1)
})

test('confidence with no evidence and no project is the base value', () => {
  // Act
  const result = SignatureFixtures.isClose(Cases.confidence(0, 0, 0, false), 0.35)

  // Assert
  expect(result).toBe(true)
})

test('confidence drops when counter evidence appears', () => {
  // Act
  const result = Cases.confidence(3, 3, 1, false)

  // Assert
  expect(result).toBeLessThan(Cases.confidence(3, 0, 1, false))
})

test('repository of a commit evidence is its repository name', () => {
  // Act
  const result = Cases.repositoryOf('commit:podium:abc1234')

  // Assert
  expect(result).toBe('podium')
})

test('repository of a session evidence is empty', () => {
  // Act
  const result = Cases.repositoryOf('session:abc-1:4')

  // Assert
  expect(result).toBe('')
})

test('repository of garbage is empty', () => {
  // Act
  const result = Cases.repositoryOf('whatever')

  // Assert
  expect(result).toBe('')
})

test('reading lines accepts CRLF endings and blank lines', () => {
  // Arrange
  const text = [Cases.toLine(SignatureFixtures.caseOf({ id: 1 })), '', '   ', Cases.toLine(SignatureFixtures.caseOf({ id: 2 }))].join('\r\n')

  // Act
  const result = Cases.fromLines(text)

  // Assert
  expect(result.cases.map((c) => c.id)).toEqual([1, 2])
  expect(result.bad).toBe(0)
})

test('reading lines counts a line that is not JSON as bad', () => {
  // Arrange
  const text = `{not json\n${Cases.toLine(SignatureFixtures.caseOf())}`

  // Act
  const result = Cases.fromLines(text)

  // Assert
  expect(result.bad).toBe(1)
  expect(result.cases).toHaveLength(1)
})

test('reading lines counts a negative id as bad', () => {
  // Act
  const result = Cases.fromLines(Cases.toLine(SignatureFixtures.caseOf({ id: -1 }))).bad

  // Assert
  expect(result).toBe(1)
})

test('reading lines counts a non-integer id as bad', () => {
  // Act
  const result = Cases.fromLines(Cases.toLine(SignatureFixtures.caseOf({ id: 1.5 }))).bad

  // Assert
  expect(result).toBe(1)
})

test('reading lines counts a case without tags as bad', () => {
  // Act
  const result = Cases.fromLines('{"id":3,"situation":"s","choice":"c"}').bad

  // Assert
  expect(result).toBe(1)
})

test('reading lines lets the later line win and counts the superseded one', () => {
  // Arrange
  const text = [Cases.toLine(SignatureFixtures.caseOf({ id: 1, choice: 'first choice here' })), Cases.toLine(SignatureFixtures.caseOf({ id: 1, choice: 'second choice here' }))].join('\n')

  // Act
  const result = Cases.fromLines(text)

  // Assert
  expect(result.cases).toHaveLength(1)
  expect(result.cases[0]?.choice).toBe('second choice here')
  expect(result.superseded).toBe(1)
})

test('reading lines removes a case at its tombstone', () => {
  // Arrange
  const text = [Cases.toLine(SignatureFixtures.caseOf({ id: 1 })), Cases.toLine(SignatureFixtures.caseOf({ id: 2 })), Cases.tombstone(1)].join('\n')

  // Act
  const result = Cases.fromLines(text)

  // Assert
  expect(result.cases.map((c) => c.id)).toEqual([2])
})

test('reading lines restores a case added again after its tombstone', () => {
  // Arrange
  const text = [Cases.toLine(SignatureFixtures.caseOf({ id: 1 })), Cases.tombstone(1), Cases.toLine(SignatureFixtures.caseOf({ id: 1, choice: 'back again with news' }))].join('\n')

  // Act
  const result = Cases.fromLines(text)

  // Assert
  expect(result.cases.map((c) => c.choice)).toEqual(['back again with news'])
})

test('reading lines returns cases in ascending id order', () => {
  // Arrange
  const text = [3, 1, 2].map((id) => Cases.toLine(SignatureFixtures.caseOf({ id }))).join('\n')

  // Act
  const result = Cases.fromLines(text)

  // Assert
  expect(result.cases.map((c) => c.id)).toEqual([1, 2, 3])
})

test('a case survives a round trip through a line', () => {
  // Arrange
  const original = SignatureFixtures.caseOf({ id: 9, options: ['a', 'b'], tags: ['fail-open', 'hook'], statusAt: '2026-10-01', confidence: 0.75, evidenceCount: 3, hits: 2, status: 'confirmed' })

  // Act
  const result = Cases.fromLines(`${Cases.toLine(original)}\n`)

  // Assert
  expect(result.cases).toEqual([original])
})

test('a tombstone line carries the id and the deleted flag', () => {
  // Act
  const result = Cases.tombstone(7)

  // Assert
  expect(result).toBe('{"id":7,"deleted":true}')
})

test('skipping the tests before a release is unsafe', () => {
  // Act
  const result = Cases.isUnsafe('Skipping the tests before a release')

  // Assert
  expect(result).toBe(true)
})

test('disabling the pre-commit hook is unsafe', () => {
  // Act
  const result = Cases.isUnsafe('Disables the pre-commit hook when in a hurry')

  // Assert
  expect(result).toBe(true)
})

test('bypassing code review is unsafe', () => {
  // Act
  const result = Cases.isUnsafe('Bypassed code review for hotfixes')

  // Assert
  expect(result).toBe(true)
})

test('ignoring linter warnings is unsafe', () => {
  // Act
  const result = Cases.isUnsafe('Ignores linter warnings')

  // Assert
  expect(result).toBe(true)
})

test('deleting flaky tests is unsafe', () => {
  // Act
  const result = Cases.isUnsafe('Deletes flaky tests')

  // Assert
  expect(result).toBe(true)
})

test('commenting out failing tests is unsafe', () => {
  // Act
  const result = Cases.isUnsafe('Comments out failing tests')

  // Assert
  expect(result).toBe(true)
})

test('a git commit with the short no-verify flag is unsafe', () => {
  // Act
  const result = Cases.isUnsafe('git commit -n')

  // Assert
  expect(result).toBe(true)
})

test('setting HUSKY to zero is unsafe', () => {
  // Act
  const result = Cases.isUnsafe('HUSKY=0 git push')

  // Assert
  expect(result).toBe(true)
})

test('a skip ci marker is unsafe', () => {
  // Act
  const result = Cases.isUnsafe('Commit message [skip ci]')

  // Assert
  expect(result).toBe(true)
})

test('a French phrase disabling the tests is unsafe', () => {
  // Act
  const result = Cases.isUnsafe('Désactive les tests')

  // Assert
  expect(result).toBe(true)
})

test('a zero-width character inside a verb does not hide it', () => {
  // Act
  const result = Cases.isUnsafe('Dis\u200bable the tests')

  // Assert
  expect(result).toBe(true)
})

test('a skipped test call is unsafe', () => {
  // Act
  const result = Cases.isUnsafe('describe.skip(')

  // Assert
  expect(result).toBe(true)
})

test('a negated skip of the tests is safe', () => {
  // Act
  const result = Cases.isUnsafe('Never skip the tests before a release')

  // Assert
  expect(result).toBe(false)
})

test('a refusal to bypass review is safe', () => {
  // Act
  const result = Cases.isUnsafe('Refuses to bypass code review')

  // Assert
  expect(result).toBe(false)
})

test('circumvent without a target is safe', () => {
  // Act
  const result = Cases.isUnsafe('circumvent the rate limits of the vendor')

  // Assert
  expect(result).toBe(false)
})

test('validation drops a case with an unsafe option', () => {
  // Act
  const verdict = Cases.validate(SignatureFixtures.raw({ options: ['Validate it', 'Skip the tests'] }), SignatureFixtures.vocabulary())

  // Assert
  expect(verdict.reason).toBe('unsafe')
})

test('validation drops a refusal whose choice mentions tests', () => {
  // Act
  const verdict = Cases.validate(SignatureFixtures.raw({ kind: 'refusal', choice: 'Always run the tests first' }), SignatureFixtures.vocabulary())

  // Assert
  expect(verdict.reason).toBe('unsafe')
})

test('validation keeps a plain choice that mentions tests', () => {
  // Act
  const verdict = Cases.validate(SignatureFixtures.raw({ kind: 'choice', choice: 'Always run the tests first' }), SignatureFixtures.vocabulary())

  // Assert
  expect(verdict.value).toBeDefined()
})

test('a very long input is checked quickly', () => {
  // Arrange
  const text = 'skip the quick brown fox '.repeat(1200)
  const started = Date.now()

  // Act
  const result = Cases.isUnsafe(text)

  // Assert
  expect(text.length).toBeGreaterThan(20000)
  expect(typeof result).toBe('boolean')
  expect(Date.now() - started).toBeLessThan(500)
})

test('parsing skips a placeholder in braces before the real object', () => {
  // Arrange
  const text = `I replaced {placeholder}: ${SignatureFixtures.output([SignatureFixtures.raw()])}`

  // Act
  const output = Cases.parseModelOutput(text, SignatureFixtures.vocabulary())

  // Assert
  expect(output.cases).toHaveLength(1)
})

test('parsing accepts a null why and null options', () => {
  // Arrange
  const text = SignatureFixtures.output([SignatureFixtures.raw({ why: null, options: null })])

  // Act
  const output = Cases.parseModelOutput(text, SignatureFixtures.vocabulary())

  // Assert
  expect(output.cases).toHaveLength(1)
  expect(output.cases[0]?.why).toBe('')
  expect(output.cases[0]?.options).toEqual([])
})

test('parsing keeps an object found before a very long tail', () => {
  // Arrange
  const text = SignatureFixtures.output([SignatureFixtures.raw()]) + 'x'.repeat(70000)

  // Act
  const output = Cases.parseModelOutput(text, SignatureFixtures.vocabulary())

  // Assert
  expect(output.cases).toHaveLength(1)
})

test('parsing ignores an object that starts after sixty four kibibytes', () => {
  // Arrange
  const text = 'x'.repeat(70000) + SignatureFixtures.output([SignatureFixtures.raw()])

  // Act
  const output = Cases.parseModelOutput(text, SignatureFixtures.vocabulary())

  // Assert
  expect(output.cases).toEqual([])
})

test('parsing forty thousand opening braces completes quickly with nothing found', () => {
  // Arrange
  const started = Date.now()

  // Act
  const output = Cases.parseModelOutput('{'.repeat(40000), SignatureFixtures.vocabulary())

  // Assert
  expect(output.cases).toEqual([])
  expect(Date.now() - started).toBeLessThan(500)
})

test('reading lines turns an invalid status into observed', () => {
  // Act
  const result = Cases.fromLines(CasesFixture.line({ status: 'bogus' }))

  // Assert
  expect(result.cases[0]?.status).toBe('observed')
})

test('reading lines gives missing numbers their defaults', () => {
  // Act
  const result = Cases.fromLines('{"id":1,"situation":"s","choice":"c","tags":["fail-open"]}')

  // Assert
  expect(result.bad).toBe(0)
  expect(result.cases[0]?.confidence).toBe(0)
  expect(result.cases[0]?.evidenceCount).toBe(0)
  expect(result.cases[0]?.hits).toBe(0)
  expect(result.cases[0]?.statusAt).toBe('')
})

test('reading lines keeps only tags that are valid names', () => {
  // Act
  const result = Cases.fromLines(CasesFixture.line({ tags: ['__proto__', 'fail-open', 'Bad Name'] }))

  // Assert
  expect(result.cases[0]?.tags).toEqual(['fail-open'])
})

test('reading lines counts a line with an empty tag list as bad', () => {
  // Act
  const result = Cases.fromLines(CasesFixture.line({ tags: [] }))

  // Assert
  expect(result.bad).toBe(1)
  expect(result.cases).toEqual([])
})

test('reading lines counts a tombstone of an unknown id as superseded', () => {
  // Act
  const result = Cases.fromLines(Cases.tombstone(5))

  // Assert
  expect(result.superseded).toBe(1)
  expect(result.bad).toBe(0)
})

test('reading lines counts both the case and its tombstone as superseded', () => {
  // Arrange
  const text = [Cases.toLine(SignatureFixtures.caseOf({ id: 5 })), Cases.tombstone(5)].join('\n')

  // Act
  const result = Cases.fromLines(text)

  // Assert
  expect(result.superseded).toBe(2)
  expect(result.cases).toEqual([])
})

test('unsafe: no time, so skip the tests', () => {
  // Act
  const result = Cases.isUnsafe('No time, so skip the tests')

  // Assert
  expect(result).toBe(true)
})

test('unsafe: if the build isnt green, skip the tests', () => {
  // Act
  const result = Cases.isUnsafe('If the build isn\'t green, skip the tests')

  // Assert
  expect(result).toBe(true)
})

test('unsafe: no tests needed, skip them', () => {
  // Act
  const result = Cases.isUnsafe('no tests needed, skip them')

  // Assert
  expect(result).toBe(true)
})

test('unsafe: no review: bypass the guard', () => {
  // Act
  const result = Cases.isUnsafe('No review: bypass the guard')

  // Assert
  expect(result).toBe(true)
})

test('unsafe: dont hesitate to skip the tests', () => {
  // Act
  const result = Cases.isUnsafe('Don\'t hesitate to skip the tests')

  // Assert
  expect(result).toBe(true)
})

test('unsafe: never hesitate to bypass the code review', () => {
  // Act
  const result = Cases.isUnsafe('Never hesitate to bypass the code review')

  // Assert
  expect(result).toBe(true)
})

test('unsafe: no problem to disable the pre-commit hook', () => {
  // Act
  const result = Cases.isUnsafe('No problem to disable the pre-commit hook')

  // Assert
  expect(result).toBe(true)
})

test('unsafe: merges without review', () => {
  // Act
  const result = Cases.isUnsafe('Merges without review')

  // Assert
  expect(result).toBe(true)
})

test('unsafe: ships without tests', () => {
  // Act
  const result = Cases.isUnsafe('Ships without tests')

  // Assert
  expect(result).toBe(true)
})

test('unsafe: pushes without running tests', () => {
  // Act
  const result = Cases.isUnsafe('Pushes without running tests')

  // Assert
  expect(result).toBe(true)
})

test('unsafe: never runs the test suite', () => {
  // Act
  const result = Cases.isUnsafe('Never runs the test suite')

  // Assert
  expect(result).toBe(true)
})

test('unsafe: deactivates the pre-commit hook', () => {
  // Act
  const result = Cases.isUnsafe('Deactivates the pre-commit hook')

  // Assert
  expect(result).toBe(true)
})

test('unsafe: turns the hook off', () => {
  // Act
  const result = Cases.isUnsafe('Turns the hook off')

  // Assert
  expect(result).toBe(true)
})

test('unsafe: mutes the linter', () => {
  // Act
  const result = Cases.isUnsafe('Mutes the linter')

  // Assert
  expect(result).toBe(true)
})

test('unsafe: overrides the guard', () => {
  // Act
  const result = Cases.isUnsafe('Overrides the guard')

  // Assert
  expect(result).toBe(true)
})

test('unsafe: git push -f origin main', () => {
  // Act
  const result = Cases.isUnsafe('git push -f origin main')

  // Assert
  expect(result).toBe(true)
})

test('unsafe: runs in bypasspermissions mode', () => {
  // Act
  const result = Cases.isUnsafe('Runs in bypassPermissions mode')

  // Assert
  expect(result).toBe(true)
})

test('unsafe: sk (variation selector)ip the tests', () => {
  // Act
  const result = Cases.isUnsafe('sk\ufe0fip the tests')

  // Assert
  expect(result).toBe(true)
})

test('unsafe: cyrillic skip the tests', () => {
  // Act
  const result = Cases.isUnsafe('\u0455kip the tests')

  // Assert
  expect(result).toBe(true)
})

test('safe: do not disable the hooks', () => {
  // Act
  const result = Cases.isUnsafe('Do not disable the hooks')

  // Assert
  expect(result).toBe(false)
})

test('safe: writes tests without mocks', () => {
  // Act
  const result = Cases.isUnsafe('Writes tests without mocks')

  // Assert
  expect(result).toBe(false)
})

test('safe: uses a mutex around the cache', () => {
  // Act
  const result = Cases.isUnsafe('Uses a mutex around the cache')

  // Assert
  expect(result).toBe(false)
})

test('validation drops a case whose option completes an unsafe situation', () => {
  // Act
  const verdict = Cases.validate(SignatureFixtures.raw({ situation: 'When the test suite is slow', options: ['skip them', 'Run them'] }), SignatureFixtures.vocabulary())

  // Assert
  expect(verdict.reason).toBe('unsafe')
})

test('first object returns the cases object after a placeholder in braces', () => {
  // Act
  const found = Cases.firstObject('I replaced {placeholder}: {"cases":[]}')

  // Assert
  expect(found).toBe('{"cases":[]}')
})

test('first object returns nothing when the only braces are not an object', () => {
  // Act
  const found = Cases.firstObject('see {x} only')

  // Assert
  expect(found).toBe('')
})

test('validation treats a null kind as a choice', () => {
  // Act
  const verdict = Cases.validate(SignatureFixtures.raw({ kind: null }), SignatureFixtures.vocabulary())

  // Assert
  expect(verdict.value?.kind).toBe('choice')
})

test('unsafe: never refuses to skip the tests', () => {
  // Act
  const result = Cases.isUnsafe('Never refuses to skip the tests')

  // Assert
  expect(result).toBe(true)
})

test('unsafe: rarely does not skip the tests', () => {
  // Act
  const result = Cases.isUnsafe('Rarely does not skip the tests')

  // Assert
  expect(result).toBe(true)
})

test('unsafe: seldom refuses to disable the hook', () => {
  // Act
  const result = Cases.isUnsafe('Seldom refuses to disable the hook')

  // Assert
  expect(result).toBe(true)
})

test('unsafe: almost never does not bypass review', () => {
  // Act
  const result = Cases.isUnsafe('Almost never does not bypass review')

  // Assert
  expect(result).toBe(true)
})

test('unsafe: disables eslint', () => {
  // Act
  const result = Cases.isUnsafe('Disables eslint')

  // Assert
  expect(result).toBe(true)
})

test('unsafe: skips the jest suite', () => {
  // Act
  const result = Cases.isUnsafe('Skips the jest suite')

  // Assert
  expect(result).toBe(true)
})

test('unsafe: turns husky off', () => {
  // Act
  const result = Cases.isUnsafe('Turns husky off')

  // Assert
  expect(result).toBe(true)
})

test('safe: be specific about it', () => {
  // Act
  const result = Cases.isUnsafe('Be specific about it')

  // Assert
  expect(result).toBe(false)
})

test('unsafe: sk (braille blank)ip the tests', () => {
  // Act
  const result = Cases.isUnsafe('sk\u2800ip the tests')

  // Assert
  expect(result).toBe(true)
})

test('validation drops a case whose fields only break the floor together', () => {
  // Arrange
  const situation = `When the tests are slow ${'x'.repeat(280)}`.slice(0, 300)

  // Act
  const verdict = Cases.validate(SignatureFixtures.raw({ situation, choice: 'Ships right away and skips it' }), SignatureFixtures.vocabulary())

  // Assert
  expect(Cases.isUnsafe(situation)).toBe(false)
  expect(Cases.isUnsafe('Ships right away and skips it')).toBe(false)
  expect(verdict.reason).toBe('unsafe')
})

test('validation drops a case with a Cyrillic letter for the script reason', () => {
  // Act
  const verdict = Cases.validate(SignatureFixtures.raw({ choice: 'Validate it and fall back to a d\u0435fault' }), SignatureFixtures.vocabulary())

  // Assert
  expect(verdict.reason).toBe('script')
})

test('validation keeps accented Latin letters', () => {
  // Act
  const verdict = Cases.validate(SignatureFixtures.raw({ choice: 'Valider les entrées et prévoir un défaut' }), SignatureFixtures.vocabulary())

  // Assert
  expect(verdict.value).toBeDefined()
})

test('parsing keeps forty cases and drops the forty-first for the cap reason', () => {
  // Arrange
  const raws = Array.from({ length: 41 }, (_, i) => SignatureFixtures.raw({ situation: `Situation number ${i} about a config`, choice: `Choice number ${i} is to validate` }))

  // Act
  const output = Cases.parseModelOutput(SignatureFixtures.output(raws), SignatureFixtures.vocabulary())

  // Assert
  expect(output.cases).toHaveLength(40)
  expect(output.dropped).toEqual([{ index: 40, reason: 'cap' }])
})
