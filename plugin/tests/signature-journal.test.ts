import { expect, test } from 'claude-code/testing'
import { Journal } from '../hooks/signature/journal'
import { SignatureStoreFixture } from './fixtures/signature-fs'

test('push appends a signal without dropping below the cap', () => {
  // Act
  const result = Journal.push(SignatureStoreFixture.signals(3), SignatureStoreFixture.signal(3))

  // Assert
  expect(result.buffer.length).toBe(4)
  expect(result.dropped).toBe(0)
})

test('push drops the oldest signal at 500 and counts it', () => {
  // Arrange
  const buffer = SignatureStoreFixture.signals(500)

  // Act
  const result = Journal.push(buffer, SignatureStoreFixture.signal(500))

  // Assert
  expect(result.buffer.length).toBe(500)
  expect(result.buffer[0]?.at).toBe(1001)
  expect(result.buffer[499]?.at).toBe(1500)
  expect(result.dropped).toBe(1)
})

test('push keeps a full buffer at exactly 500 without dropping', () => {
  // Act
  const result = Journal.push(SignatureStoreFixture.signals(499), SignatureStoreFixture.signal(499))

  // Assert
  expect(result.dropped).toBe(0)
})

test('push does not change the buffer it was given', () => {
  // Arrange
  const buffer = SignatureStoreFixture.signals(2)

  // Act
  Journal.push(buffer, SignatureStoreFixture.signal(2))

  // Assert
  expect(buffer.length).toBe(2)
})

test('push starts a new buffer when the buffer is not an array', () => {
  // Assert
  expect(Journal.push(undefined as never, SignatureStoreFixture.signal()).buffer.length).toBe(1)
})

test('lines writes one JSON line per signal ending with a newline', () => {
  // Act
  const text = Journal.lines(SignatureStoreFixture.signals(2))

  // Assert
  expect(text.endsWith('\n')).toBe(true)
  expect(text.split('\n').filter((line) => line !== '').length).toBe(2)
})

test('lines of no signals is empty', () => {
  // Assert
  expect(Journal.lines([])).toBe('')
})

test('lines skips a signal that cannot be serialised', () => {
  // Arrange
  const circular = SignatureStoreFixture.signal(0)
  circular.data.self = circular

  // Act
  const text = Journal.lines([circular, SignatureStoreFixture.signal(1)])

  // Assert
  expect(text.split('\n').filter((line) => line !== '').length).toBe(1)
})

test('append to an empty file gives the lines', () => {
  // Assert
  expect(Journal.append('', SignatureStoreFixture.signals(1))).toBe(Journal.lines(SignatureStoreFixture.signals(1)))
})

test('append adds the missing newline after an unterminated last line', () => {
  // Act
  const text = Journal.append('{"old":1}', SignatureStoreFixture.signals(1))

  // Assert
  expect(text.startsWith('{"old":1}\n{')).toBe(true)
})

test('append does not add a blank line after a terminated last line', () => {
  // Act
  const text = Journal.append('{"old":1}\n', SignatureStoreFixture.signals(1))

  // Assert
  expect(text.startsWith('{"old":1}\n{')).toBe(true)
})

test('append of no signals returns the existing text unchanged', () => {
  // Assert
  expect(Journal.append('{"old":1}', [])).toBe('{"old":1}')
})

test('shouldRotate is false when the file ends exactly at 524288 bytes', () => {
  // Assert
  expect(Journal.shouldRotate(524288 - 10, 'a'.repeat(10))).toBe(false)
})

test('shouldRotate is true one byte past 524288', () => {
  // Assert
  expect(Journal.shouldRotate(524288 - 10, 'a'.repeat(11))).toBe(true)
})

test('shouldRotate counts two bytes for an accented character', () => {
  // Assert
  expect(Journal.shouldRotate(524286, 'é')).toBe(false)
  expect(Journal.shouldRotate(524286, 'éé')).toBe(true)
})

test('shouldRotate counts a surrogate pair as four bytes', () => {
  // Assert
  expect(Journal.shouldRotate(524284, '😀')).toBe(false)
  expect(Journal.shouldRotate(524285, '😀')).toBe(true)
})

test('shouldRotate treats an invalid size as empty', () => {
  // Assert
  expect(Journal.shouldRotate(Number.NaN, 'abc')).toBe(false)
})

test('byteLength counts UTF-8 bytes for one, two, three and four byte characters', () => {
  // Assert
  expect([Journal.byteLength('a'), Journal.byteLength('é'), Journal.byteLength('€'), Journal.byteLength('😀')]).toEqual([1, 2, 3, 4])
})

test('byteLength counts a lone surrogate as three bytes', () => {
  // Assert
  expect(Journal.byteLength('\uD800')).toBe(3)
})

test('parse gives back the signals of lines', () => {
  // Arrange
  const signals = SignatureStoreFixture.signals(2)

  // Assert
  expect(Journal.parse(Journal.lines(signals))).toEqual(signals)
})

test('parse skips lines that are not JSON', () => {
  // Arrange
  const text = 'garbage\n' + Journal.lines(SignatureStoreFixture.signals(1)) + '{broken\n'

  // Assert
  expect(Journal.parse(text).length).toBe(1)
})

test('parse skips a line of format version 2', () => {
  // Arrange
  const line = JSON.stringify({ ...SignatureStoreFixture.signal(), v: 2 })

  // Assert
  expect(Journal.parse(line)).toEqual([])
})

test('parse skips a line with an unknown kind', () => {
  // Arrange
  const line = JSON.stringify({ ...SignatureStoreFixture.signal(), kind: 'mystery' })

  // Assert
  expect(Journal.parse(line)).toEqual([])
})

test('parse skips a line without a numeric timestamp', () => {
  // Arrange
  const line = JSON.stringify({ ...SignatureStoreFixture.signal(), at: 'now' })

  // Assert
  expect(Journal.parse(line)).toEqual([])
})

test('parse skips JSON that is an array or a number', () => {
  // Assert
  expect(Journal.parse('[1]\n42\nnull\n')).toEqual([])
})

test('parse fills the optional fields of a minimal line', () => {
  // Act
  const result = Journal.parse('{"v":1,"at":5,"kind":"abort"}')

  // Assert
  expect(result).toEqual([{ v: 1, at: 5, session: '', project: '', projectId: '', stack: [], kind: 'abort', data: {} }])
})

test('parse of a non-string is empty', () => {
  // Assert
  expect(Journal.parse(undefined as never)).toEqual([])
})

test('parse accepts a turn line', () => {
  // Arrange
  const line = JSON.stringify({ ...SignatureStoreFixture.signal(0, 'turn'), data: { text: 'hello' } })

  // Assert
  expect(Journal.parse(line)[0]?.kind).toBe('turn')
})
