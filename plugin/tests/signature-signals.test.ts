import { expect, test } from 'claude-code/testing'
import { SignalExtractor, type QuestionInput } from '../hooks/signature/signals'
import { SignatureStoreFixture } from './fixtures/signature-fs'

class SignalFixture {
  static question(partial: Partial<QuestionInput> = {}, options: unknown[] = [{ label: 'A (Recommended)' }, { label: 'B' }], multi = false): QuestionInput {
    return {
      questions: [{ question: 'Which?', header: 'H', options, multiSelect: multi }],
      answers: { 'Which?': 'A' },
      response: undefined,
      afkTimeoutMs: undefined,
      predicted: {},
      ...partial
    }
  }

  static first(input: QuestionInput): Record<string, unknown> {
    return SignalExtractor.questions(SignatureStoreFixture.context(), input)[0]?.data ?? {}
  }
}

test('language is French for a text full of French words', () => {
  // Assert
  expect(SignalExtractor.language('le chat est dans la maison pour nous')).toBe('fr')
})

test('language is English for a text full of English words', () => {
  // Assert
  expect(SignalExtractor.language('the cat and the dog are in the house')).toBe('en')
})

test('language is other for a text without common words', () => {
  // Assert
  expect(SignalExtractor.language('hello world')).toBe('other')
})

test('language needs three matches to decide', () => {
  // Assert
  expect(SignalExtractor.language('the cat and dog')).toBe('other')
  expect(SignalExtractor.language('the cat and the dog')).toBe('en')
})

test('language of a non-string is other', () => {
  // Assert
  expect(SignalExtractor.language(undefined as never)).toBe('other')
})

test('isCorrection recognises a leading no', () => {
  // Assert
  expect(SignalExtractor.isCorrection('No, do it differently')).toBe(true)
})

test('isCorrection does not take nothing for a no', () => {
  // Assert
  expect(SignalExtractor.isCorrection('nothing to change here')).toBe(false)
})

test('isCorrection does not take a word that starts with ne or stop', () => {
  // Assert
  expect(SignalExtractor.isCorrection('new feature please')).toBe(false)
  expect(SignalExtractor.isCorrection('stopwatch widget')).toBe(false)
})

test('isCorrection recognises a French correction with an accent', () => {
  // Assert
  expect(SignalExtractor.isCorrection('Non, pas ça')).toBe(true)
})

test('isCorrection recognises a curly apostrophe', () => {
  // Assert
  expect(SignalExtractor.isCorrection('Don’t do that')).toBe(true)
})

test('isCorrection recognises a phrase in the middle of the text', () => {
  // Assert
  expect(SignalExtractor.isCorrection('well, not like that')).toBe(true)
})

test('isCorrection needs a word boundary before a phrase', () => {
  // Assert
  expect(SignalExtractor.isCorrection('ai said hello')).toBe(false)
})

test('isCorrection recognises a French phrase', () => {
  // Assert
  expect(SignalExtractor.isCorrection('bien: pas comme ça')).toBe(true)
})

test('isCorrection is false for an ordinary request', () => {
  // Assert
  expect(SignalExtractor.isCorrection('Please add a test for the parser')).toBe(false)
})

test('isCorrection is false for an empty or non-string text', () => {
  // Assert
  expect([SignalExtractor.isCorrection(''), SignalExtractor.isCorrection(undefined as never)]).toEqual([false, false])
})

test('prompt redacts its excerpt and replaces the home directory', () => {
  // Act
  const signal = SignalExtractor.prompt(SignatureStoreFixture.context(), { text: 'edit /Users/j/app/a.ts then mail a@b.co', command: '', args: '', isAfterAbort: false })

  // Assert
  expect(signal.data.excerpt).toBe('edit ~/app/a.ts then mail <email>')
})

test('prompt truncates its excerpt at 400 characters', () => {
  // Act
  const signal = SignalExtractor.prompt(SignatureStoreFixture.context(), { text: 'x '.repeat(500), command: '', args: '', isAfterAbort: false })

  // Assert
  expect((signal.data.excerpt as string).length).toBe(400)
  expect((signal.data.excerpt as string).endsWith('…')).toBe(true)
})

test('prompt records the raw length of the text', () => {
  // Act
  const signal = SignalExtractor.prompt(SignatureStoreFixture.context(), { text: 'x '.repeat(500), command: '', args: '', isAfterAbort: false })

  // Assert
  expect(signal.data.length).toBe(1000)
})

test('prompt of a slash command keeps the redacted arguments as the excerpt', () => {
  // Act
  const signal = SignalExtractor.prompt(SignatureStoreFixture.context(), { text: '/review src/a.ts at /Users/j/x', command: '/review', args: 'src/a.ts at /Users/j/x', isAfterAbort: false })

  // Assert
  expect(signal.data.command).toBe('/review')
  expect(signal.data.excerpt).toBe('src/a.ts at ~/x')
})

test('prompt flags a correction and an abort before it', () => {
  // Act
  const signal = SignalExtractor.prompt(SignatureStoreFixture.context(), { text: 'no, stop', command: '', args: '', isAfterAbort: true })

  // Assert
  expect(signal.data.isCorrection).toBe(true)
  expect(signal.data.afterAbort).toBe(true)
})

test('prompt carries the context of the session', () => {
  // Act
  const signal = SignalExtractor.prompt(SignatureStoreFixture.context({ at: 42, stack: ['go'] }), { text: 'hi', command: '', args: '', isAfterAbort: false })

  // Assert
  expect([signal.v, signal.at, signal.session, signal.project, signal.projectId, signal.stack, signal.kind]).toEqual([1, 42, 's1', 'podium', 'abcd1234', ['go'], 'prompt'])
})

test('questions of an afk timeout give no signal', () => {
  // Assert
  expect(SignalExtractor.questions(SignatureStoreFixture.context(), SignalFixture.question({ afkTimeoutMs: 5000 }))).toEqual([])
})

test('questions of malformed input give no signal', () => {
  // Assert
  expect(SignalExtractor.questions(SignatureStoreFixture.context(), SignalFixture.question({ questions: 'x' }))).toEqual([])
  expect(SignalExtractor.questions(SignatureStoreFixture.context(), undefined as never)).toEqual([])
})

test('questions skips an item without a question text', () => {
  // Assert
  expect(SignalExtractor.questions(SignatureStoreFixture.context(), SignalFixture.question({ questions: [{ header: 'H' }, 5] }))).toEqual([])
})

test('a question removes the recommended suffix and records its index', () => {
  // Act
  const data = SignalFixture.first(SignalFixture.question())

  // Assert
  expect(data.options).toEqual(['A', 'B'])
  expect(data.recommended).toBe(0)
})

test('a question without a recommended option records minus one', () => {
  // Assert
  expect(SignalFixture.first(SignalFixture.question({}, [{ label: 'A' }, { label: 'B' }])).recommended).toBe(-1)
})

test('a single answer that matches a label is chosen', () => {
  // Act
  const data = SignalFixture.first(SignalFixture.question())

  // Assert
  expect(data.chosen).toEqual(['A'])
  expect(data.isOther).toBe(false)
  expect(data.other).toBe('')
})

test('a single answer that matches no label goes to other', () => {
  // Act
  const data = SignalFixture.first(SignalFixture.question({ answers: { 'Which?': 'Something else' } }))

  // Assert
  expect(data.chosen).toEqual([])
  expect(data.isOther).toBe(true)
  expect(data.other).toBe('Something else')
})

test('a multi select answer is split into matched labels', () => {
  // Act
  const data = SignalFixture.first(SignalFixture.question({ answers: { 'Which?': 'A, C' } }, [{ label: 'A' }, { label: 'B' }, { label: 'C' }], true))

  // Assert
  expect(data.chosen).toEqual(['A', 'C'])
  expect(data.isOther).toBe(false)
  expect(data.isMulti).toBe(true)
})

test('a multi select answer keeps the unmatched part as other', () => {
  // Act
  const data = SignalFixture.first(SignalFixture.question({ answers: { 'Which?': 'A, zzz' } }, [{ label: 'A' }, { label: 'B' }], true))

  // Assert
  expect(data.chosen).toEqual(['A'])
  expect(data.other).toBe('zzz')
  expect(data.isOther).toBe(true)
})

test('a multi select answer given as an array is read like a joined one', () => {
  // Act
  const data = SignalFixture.first(SignalFixture.question({ answers: { 'Which?': ['A', 'B'] } }, [{ label: 'A' }, { label: 'B' }], true))

  // Assert
  expect(data.chosen).toEqual(['A', 'B'])
})

test('a text question puts the answer in other', () => {
  // Act
  const data = SignalFixture.first(SignalFixture.question({ answers: { 'Which?': 'free text' } }, []))

  // Assert
  expect(data.chosen).toEqual([])
  expect(data.other).toBe('free text')
})

test('a number answer is recorded as text in other', () => {
  // Assert
  expect(SignalFixture.first(SignalFixture.question({ answers: { 'Which?': 42 } }, [])).other).toBe('42')
})

test('a free text response is the other answer of an unanswered question', () => {
  // Act
  const data = SignalFixture.first(SignalFixture.question({ answers: {}, response: 'something else entirely' }))

  // Assert
  expect(data.other).toBe('something else entirely')
  expect(data.isOther).toBe(true)
  expect(data.chosen).toEqual([])
})

test('a free text response goes to the first of several unanswered questions only', () => {
  // Arrange
  const questions = [{ question: 'Q1', options: [] }, { question: 'Q2', options: [] }]

  // Act
  const signals = SignalExtractor.questions(SignatureStoreFixture.context(), SignalFixture.question({ questions, answers: {}, response: 'reply' }))

  // Assert
  expect(signals.map((signal) => signal.data.other)).toEqual(['reply', ''])
})

test('a free text response goes to the first unanswered question when some are answered', () => {
  // Arrange
  const questions = [{ question: 'Q1', options: [{ label: 'A' }] }, { question: 'Q2', options: [] }, { question: 'Q3', options: [] }]

  // Act
  const signals = SignalExtractor.questions(SignatureStoreFixture.context(), SignalFixture.question({ questions, answers: { Q1: 'A' }, response: 'reply' }))

  // Assert
  expect(signals.map((signal) => signal.data.other)).toEqual(['', 'reply', ''])
  expect(signals[0]?.data.chosen).toEqual(['A'])
})

test('a response that is not a string is ignored', () => {
  // Act
  const data = SignalFixture.first(SignalFixture.question({ answers: {}, response: { answers: { 'Which?': 'B' } } }))

  // Assert
  expect(data.chosen).toEqual([])
  expect(data.isOther).toBe(false)
})

test('a question records the prediction made for it', () => {
  // Assert
  expect(SignalFixture.first(SignalFixture.question({ predicted: { 'Which?': 'B' } })).predicted).toBe('B')
})

test('a question without a prediction records an empty one', () => {
  // Assert
  expect(SignalFixture.first(SignalFixture.question()).predicted).toBe('')
})

test('a question named __proto__ finds no answer in the prototype', () => {
  // Arrange
  const input = SignalFixture.question({ questions: [{ question: '__proto__', options: [] }], answers: {} })

  // Assert
  expect(SignalFixture.first(input).other).toBe('')
})

test('a question named toString finds no answer in the prototype', () => {
  // Arrange
  const input = SignalFixture.question({ questions: [{ question: 'toString', options: [] }], answers: {} })

  // Assert
  expect(SignalFixture.first(input).chosen).toEqual([])
})

test('a __proto__ key in the answers does not pollute anything', () => {
  // Arrange
  const answers = JSON.parse('{"__proto__": {"polluted": true}, "Which?": "A"}')

  // Act
  SignalFixture.first(SignalFixture.question({ answers }))

  // Assert
  expect(({} as Record<string, unknown>).polluted).toBe(undefined)
})

test('questions keeps at most 8 questions', () => {
  // Arrange
  const questions = Array.from({ length: 10 }, (_, index) => ({ question: `Q${index}`, options: [] }))

  // Act
  const signals = SignalExtractor.questions(SignatureStoreFixture.context(), SignalFixture.question({ questions, answers: {} }))

  // Assert
  expect(signals.length).toBe(8)
})

test('a question keeps at most 12 options', () => {
  // Arrange
  const options = Array.from({ length: 15 }, (_, index) => ({ label: `O${index}` }))

  // Assert
  expect((SignalFixture.first(SignalFixture.question({}, options)).options as string[]).length).toBe(12)
})

test('a refused plan records its outcome', () => {
  // Act
  const signal = SignalExtractor.plan(SignatureStoreFixture.context(), { plan: 'p', isRefused: true, feedback: 'no', isEdited: false })

  // Assert
  expect(signal.data.outcome).toBe('refused')
})

test('an accepted plan records its outcome and edit flag', () => {
  // Act
  const signal = SignalExtractor.plan(SignatureStoreFixture.context(), { plan: 'p', isRefused: false, feedback: '', isEdited: true })

  // Assert
  expect(signal.data.outcome).toBe('accepted')
  expect(signal.data.isEdited).toBe(true)
})

test('a plan excerpt is truncated at 1500 characters', () => {
  // Act
  const signal = SignalExtractor.plan(SignatureStoreFixture.context(), { plan: 'word '.repeat(1000), isRefused: false, feedback: '', isEdited: false })

  // Assert
  expect((signal.data.excerpt as string).length).toBe(1500)
})

test('plan feedback is truncated at 600 characters', () => {
  // Act
  const signal = SignalExtractor.plan(SignatureStoreFixture.context(), { plan: 'p', isRefused: true, feedback: 'word '.repeat(500), isEdited: false })

  // Assert
  expect((signal.data.feedback as string).length).toBe(600)
})

test('a plan that is not a string has an empty excerpt', () => {
  // Assert
  expect(SignalExtractor.plan(SignatureStoreFixture.context(), { plan: undefined, isRefused: false, feedback: '', isEdited: false }).data.excerpt).toBe('')
})

test('an abort records its turn id', () => {
  // Assert
  expect(SignalExtractor.abort(SignatureStoreFixture.context(), 'turn-1').data).toEqual({ turnId: 'turn-1' })
})

test('an agent signal records its type and model', () => {
  // Assert
  expect(SignalExtractor.agent(SignatureStoreFixture.context(), 'explore', 'sonnet').data).toEqual({ type: 'explore', model: 'sonnet' })
})

test('a use signal keeps only non-negative integer case ids', () => {
  // Assert
  expect(SignalExtractor.use(SignatureStoreFixture.context(), [1, 2.5, -1, '3' as never, 4]).data.caseIds).toEqual([1, 4])
})

test('a use signal keeps at most 50 case ids', () => {
  // Arrange
  const ids = Array.from({ length: 60 }, (_, index) => index)

  // Assert
  expect((SignalExtractor.use(SignatureStoreFixture.context(), ids).data.caseIds as number[]).length).toBe(50)
})

test('a use signal of something that is not an array has no ids', () => {
  // Assert
  expect(SignalExtractor.use(SignatureStoreFixture.context(), undefined as never).data.caseIds).toEqual([])
})

test('normalizeRemote reads an scp style remote', () => {
  // Assert
  expect(SignalExtractor.normalizeRemote('git@github.com:Org/Repo.git')).toBe('github.com/Org/Repo')
})

test('normalizeRemote drops the port and user of an ssh remote', () => {
  // Assert
  expect(SignalExtractor.normalizeRemote('ssh://git@Host.com:2222/Org/Repo.git')).toBe('host.com/Org/Repo')
})

test('normalizeRemote drops the credentials and trailing slash of an https remote', () => {
  // Assert
  expect(SignalExtractor.normalizeRemote('https://user:pw@GitHub.com/Org/Repo/')).toBe('github.com/Org/Repo')
})

test('normalizeRemote drops the .git suffix', () => {
  // Assert
  expect(SignalExtractor.normalizeRemote('https://github.com/Org/Repo.git')).toBe('github.com/Org/Repo')
})

test('normalizeRemote lower-cases the host and keeps the case of the path', () => {
  // Assert
  expect(SignalExtractor.normalizeRemote('https://GITHUB.com/MyOrg/MyRepo')).toBe('github.com/MyOrg/MyRepo')
})

test('normalizeRemote leaves a plain path unchanged', () => {
  // Assert
  expect(SignalExtractor.normalizeRemote('/home/j/repo')).toBe('/home/j/repo')
})

test('normalizeRemote leaves a Windows path unchanged', () => {
  // Assert
  expect(SignalExtractor.normalizeRemote('C:\\work\\repo')).toBe('C:\\work\\repo')
})

test('projectId is eight hexadecimal characters', () => {
  // Assert
  expect(SignalExtractor.projectId('git@github.com:Org/Repo.git')).toMatch(/^[0-9a-f]{8}$/)
})

test('projectId is equal for equivalent remotes', () => {
  // Assert
  expect(SignalExtractor.projectId('git@github.com:Org/Repo.git')).toBe(SignalExtractor.projectId('https://github.com/Org/Repo'))
})

test('projectId differs for different remotes', () => {
  // Assert
  expect(SignalExtractor.projectId('git@github.com:Org/Repo.git')).not.toBe(SignalExtractor.projectId('git@github.com:Org/Repo2.git'))
})

test('projectId differs when only the case of the path differs', () => {
  // Assert
  expect(SignalExtractor.projectId('github.com/org/repo')).not.toBe(SignalExtractor.projectId('https://github.com/Org/Repo'))
})

test('projectId of a plain root path is eight hexadecimal characters', () => {
  // Assert
  expect(SignalExtractor.projectId('/home/j/repo')).toMatch(/^[0-9a-f]{8}$/)
})

test('a turn signal keeps its text redacted', () => {
  // Act
  const signal = SignalExtractor.turn(SignatureStoreFixture.context(), 'edited /Users/j/app and mailed a@b.co')

  // Assert
  expect(signal.kind).toBe('turn')
  expect(signal.data.text).toBe('edited ~/app and mailed <email>')
})

test('a turn signal truncates its text at 600 characters', () => {
  // Act
  const signal = SignalExtractor.turn(SignatureStoreFixture.context(), 'word '.repeat(300))

  // Assert
  expect((signal.data.text as string).length).toBe(600)
})

test('a turn signal of a non-string has an empty text', () => {
  // Assert
  expect(SignalExtractor.turn(SignatureStoreFixture.context(), undefined as never).data.text).toBe('')
})

test('isRejection recognises the plan rejection message', () => {
  // Assert
  expect(SignalExtractor.isRejection('The agent proposed a plan that was rejected by the user. To tell you how to proceed, the user said:\nuse tabs')).toBe(true)
})

test('isRejection recognises the tool rejection message', () => {
  // Assert
  expect(SignalExtractor.isRejection("The user doesn't want to proceed with this tool use. The tool use was rejected")).toBe(true)
})

test('isRejection ignores leading whitespace', () => {
  // Assert
  expect(SignalExtractor.isRejection("  \nThe user doesn't want to proceed with this tool use.")).toBe(true)
})

test('isRejection is false when the sentence is in the middle of the text', () => {
  // Assert
  expect(SignalExtractor.isRejection("Result: The user doesn't want to proceed with this tool use.")).toBe(false)
})

test('isRejection is case sensitive', () => {
  // Assert
  expect(SignalExtractor.isRejection("the user doesn't want to proceed with this tool use.")).toBe(false)
})

test('isRejection is false for a permission denied message', () => {
  // Assert
  expect(SignalExtractor.isRejection('Permission to use Bash has been denied.')).toBe(false)
})

test('isRejection of a non-string is false', () => {
  // Assert
  expect(SignalExtractor.isRejection(undefined as never)).toBe(false)
})

test('rejectionFeedback is the text after the user said marker', () => {
  // Assert
  expect(SignalExtractor.rejectionFeedback('The agent proposed a plan that was rejected by the user. To tell you how to proceed, the user said:\nuse tabs  ')).toBe('use tabs')
})

test('rejectionFeedback is empty when there is no user said marker', () => {
  // Assert
  expect(SignalExtractor.rejectionFeedback("The user doesn't want to proceed with this tool use.")).toBe('')
})

test('rejectionFeedback is empty for a text that is not a rejection', () => {
  // Assert
  expect(SignalExtractor.rejectionFeedback('Something else. the user said: hello')).toBe('')
})
