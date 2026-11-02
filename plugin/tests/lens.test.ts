import { expect, test } from 'claude-code/testing'
import { Canvas } from '../hooks/canvas'
import type { Rgb } from '../hooks/canvas'
import { Lens } from '../hooks/lens'

class LensFixture {
  static readonly RED: Rgb = [255, 0, 0]
  static readonly GREEN: Rgb = [0, 255, 0]
  static readonly BLUE: Rgb = [0, 0, 255]

  static canvas(): Canvas {
    return new Canvas(16, 8, 'quad')
  }

  static cells(canvas: Canvas): string {
    return JSON.stringify(canvas.encode())
  }
}

test('an offset lens draws what the canvas draws at shifted coordinates', () => {
  // Arrange
  const direct = LensFixture.canvas()
  const lensed = LensFixture.canvas()

  // Act
  direct.fillRect(7, 5, 6, 4, LensFixture.RED)
  Lens.offset(lensed, 7, 5, 8, 8).fillRect(0, 0, 6, 4, LensFixture.RED)

  // Assert
  expect(LensFixture.cells(lensed)).toBe(LensFixture.cells(direct))
})

test('an offset lens draws nothing at the unshifted coordinates', () => {
  // Arrange
  const blank = LensFixture.canvas()
  const lensed = LensFixture.canvas()

  // Act
  Lens.offset(lensed, 7, 5, 8, 8).fillRect(0, 0, 6, 4, LensFixture.RED)

  // Assert
  expect(LensFixture.cells(lensed)).not.toBe(LensFixture.cells(blank))
})

test('a toned lens equals drawing with the toned colour', () => {
  // Arrange
  const direct = LensFixture.canvas()
  const lensed = LensFixture.canvas()

  // Act
  direct.fillRect(2, 2, 8, 6, LensFixture.GREEN)
  Lens.toned(lensed, () => LensFixture.GREEN).fillRect(2, 2, 8, 6, LensFixture.RED)

  // Assert
  expect(LensFixture.cells(lensed)).toBe(LensFixture.cells(direct))
})

test('an offset lens reports the given width and height', () => {
  // Act
  const lens = Lens.offset(LensFixture.canvas(), 3, 4, 11, 7)

  // Assert
  expect(lens.width).toBe(11)
  expect(lens.height).toBe(7)
})

test('a toned lens keeps the width and height of its target', () => {
  // Arrange
  const canvas = LensFixture.canvas()

  // Act
  const lens = Lens.toned(canvas, c => c)

  // Assert
  expect(lens.width).toBe(canvas.width)
  expect(lens.height).toBe(canvas.height)
})

test('paint passes through an offset lens unchanged', () => {
  // Arrange
  const direct = LensFixture.canvas()
  const lensed = LensFixture.canvas()

  // Act
  direct.paint(() => LensFixture.RED)
  Lens.offset(lensed, 5, 5, 8, 8).paint(() => LensFixture.RED)

  // Assert
  expect(LensFixture.cells(lensed)).toBe(LensFixture.cells(direct))
})

test('text passes through an offset lens unchanged', () => {
  // Arrange
  const direct = LensFixture.canvas()
  const lensed = LensFixture.canvas()

  // Act
  const expected = direct.text(1, 1, 'hi', LensFixture.RED)
  const actual = Lens.offset(lensed, 5, 5, 8, 8).text(1, 1, 'hi', LensFixture.RED)

  // Assert
  expect(actual).toBe(expected)
  expect(LensFixture.cells(lensed)).toBe(LensFixture.cells(direct))
})

test('an offset lens shifts both ends of a line', () => {
  // Arrange
  const direct = LensFixture.canvas()
  const lensed = LensFixture.canvas()

  // Act
  direct.line({ x: 7, y: 5 }, { x: 13, y: 9 }, 1, LensFixture.RED)
  Lens.offset(lensed, 7, 5, 8, 8).line({ x: 0, y: 0 }, { x: 6, y: 4 }, 1, LensFixture.RED)

  // Assert
  expect(LensFixture.cells(lensed)).toBe(LensFixture.cells(direct))
})

test('a toned lens tones the background of text', () => {
  // Arrange
  const direct = LensFixture.canvas()
  const lensed = LensFixture.canvas()

  // Act
  direct.text(1, 1, 'hi', LensFixture.BLUE, LensFixture.GREEN)
  Lens.toned(lensed, c => (c === LensFixture.RED ? LensFixture.BLUE : LensFixture.GREEN)).text(1, 1, 'hi', LensFixture.RED, LensFixture.BLUE)

  // Assert
  expect(LensFixture.cells(lensed)).toBe(LensFixture.cells(direct))
})
