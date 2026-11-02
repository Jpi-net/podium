import { expect, test } from 'claude-code/testing'
import { Canvas, type Rgb } from '../hooks/canvas'
import { Motion, Raster, Sprite } from '../hooks/sprite'

class SpriteFixture {
  static readonly RED: Rgb = [255, 0, 0]
  static readonly BLUE: Rgb = [0, 0, 255]

  static colors(raster: Raster): string {
    const canvas = new Canvas(raster.width / 2, raster.height / 2, 'quad')
    canvas.paint(() => [0, 0, 0])
    raster.blit(canvas, -raster.left / 2, -raster.top, 1)
    const encoded = canvas.encode()
    return encoded.kind === 'cells' ? encoded.cells : ''
  }
}

test('mirrors a sprite row by row and pads short rows', () => {
  // Arrange
  const sprite = Sprite.of(['AB.', 'C'])

  // Act
  const mirrored = sprite.mirrored()

  // Assert
  expect(mirrored.rows).toEqual(['.BA', '..C'])
  expect(mirrored.width).toBe(3)
  expect(mirrored.height).toBe(2)
})

test('stamps only the palette characters of a sprite', () => {
  // Arrange
  const raster = new Raster(0, 0, 4, 2)

  // Act
  raster.stamp(Sprite.of(['A.B', '?A.']), { A: SpriteFixture.RED, B: SpriteFixture.BLUE }, 0, 0)

  // Assert
  expect([raster.has(0, 0), raster.has(1, 0), raster.has(2, 0), raster.has(0, 1), raster.has(1, 1)]).toEqual([true, false, true, false, true])
})

test('outlines the silhouette on the empty pixels next to an opaque one only', () => {
  // Arrange
  const raster = new Raster(-2, -2, 5, 5)
  raster.dot(0, 0, SpriteFixture.RED)

  // Act
  raster.outline()

  // Assert
  expect([raster.has(-1, 0), raster.has(1, 0), raster.has(0, -1), raster.has(0, 1)]).toEqual([true, true, true, true])
  expect([raster.has(-1, -1), raster.has(1, 1), raster.has(-2, 0)]).toEqual([false, false, false])
})

test('merges a layer over the raster at the same coordinates', () => {
  // Arrange
  const raster = new Raster(-3, -3, 6, 6)
  const layer = raster.layer()
  layer.dot(-3, 2, SpriteFixture.BLUE)

  // Act
  raster.merge(layer)

  // Assert
  expect(raster.has(-3, 2)).toBe(true)
  expect(raster.has(2, -3)).toBe(false)
})

test('keeps whole pixels from 0.85 up and halves the sprite at scale 0.5', () => {
  // Assert
  expect([Raster.factor(0.9), Raster.factor(1), Raster.factor(1.4), Raster.factor(1.6), Raster.factor(0.5)]).toEqual([1, 1, 1, 2, 0.5])
})

test('blits a pixel art raster without any blended colour', () => {
  // Arrange
  const raster = new Raster(0, 0, 8, 4)
  raster.rect(0, 0, 4, 4, SpriteFixture.RED)
  raster.rect(4, 0, 4, 4, SpriteFixture.BLUE)

  // Act
  const cells = atob(SpriteFixture.colors(raster))
  const words = new Uint32Array(Uint8Array.from(cells, c => c.charCodeAt(0)).buffer)
  const colors = new Set<number>()
  for (let i = 0; i < words.length; i += 3) {
    colors.add(words[i + 1] ?? 0)
    colors.add(words[i + 2] ?? 0)
  }

  // Assert
  expect([...colors].every(c => c === 0xff0000 || c === 0x0000ff)).toBe(true)
})

test('tints a failed raster towards red and a killed one towards grey', () => {
  // Act
  const failed = Raster.tinted(SpriteFixture.BLUE, 'failed')
  const killed = Raster.tinted(SpriteFixture.RED, 'killed')

  // Assert
  expect(failed[0] > 0).toBe(true)
  expect(Math.abs(killed[0] - killed[1]) < 10).toBe(true)
  expect(Raster.tinted(SpriteFixture.RED, 'none')).toEqual(SpriteFixture.RED)
})

test('eases a cue in and out and schedules nothing in the first period', () => {
  // Assert
  expect([Motion.envelope(0), Motion.envelope(1), Motion.envelope(0.5)]).toEqual([0, 0, 1])
  expect(Motion.schedule(10, 100, 20, 0.3, ['a'])).toBe(null)
})

test('ignores a block that falls entirely off the left or top edge of the canvas', () => {
  // Arrange
  const canvas = new Canvas(4, 2, 'quad')
  canvas.paint(() => [0, 0, 0])
  const blank = canvas.encode()

  // Act
  canvas.block(-3, 0, 0.5, 1, SpriteFixture.RED)
  canvas.block(0, -3, 0.5, 1, SpriteFixture.RED)

  // Assert
  expect(canvas.encode()).toEqual(blank)
})
