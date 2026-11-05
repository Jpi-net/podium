import { expect, test } from 'claude-code/testing'
import { FormatVersion } from '../hooks/signature/format-version'

test('of reads a valid version', () => {
  // Assert
  expect(FormatVersion.of('{"version": 3, "x": 1}')).toBe(3)
})

test('of is zero when the version is missing', () => {
  // Assert
  expect(FormatVersion.of('{}')).toBe(0)
})

test('of is zero for a non-integer version', () => {
  // Assert
  expect(FormatVersion.of('{"version": 1.5}')).toBe(0)
})

test('of is zero for a negative version', () => {
  // Assert
  expect(FormatVersion.of('{"version": -1}')).toBe(0)
})

test('of is zero for a version of zero', () => {
  // Assert
  expect(FormatVersion.of('{"version": 0}')).toBe(0)
})

test('of is zero for a version that is a string', () => {
  // Assert
  expect(FormatVersion.of('{"version": "2"}')).toBe(0)
})

test('of is zero for an array', () => {
  // Assert
  expect(FormatVersion.of('[{"version": 2}]')).toBe(0)
})

test('of is zero for invalid JSON', () => {
  // Assert
  expect(FormatVersion.of('{not json')).toBe(0)
})

test('of is zero for a value that is not a string', () => {
  // Assert
  expect(FormatVersion.of(undefined as never)).toBe(0)
})

test('isNewer is true when the file version is above the known one', () => {
  // Assert
  expect(FormatVersion.isNewer('{"version": 2}', 1)).toBe(true)
})

test('isNewer is false when the file version equals the known one', () => {
  // Assert
  expect(FormatVersion.isNewer('{"version": 1}', 1)).toBe(false)
})

test('isNewer is false when the file version is below the known one', () => {
  // Assert
  expect(FormatVersion.isNewer('{"version": 1}', 2)).toBe(false)
})

test('isNewer is false for an unreadable file', () => {
  // Assert
  expect(FormatVersion.isNewer('garbage', 1)).toBe(false)
})
