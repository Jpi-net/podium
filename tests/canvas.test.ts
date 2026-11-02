import { expect, test } from 'claude-code/testing'
import { Canvas } from '../hooks/canvas'
import type { Encoded, Rgb } from '../hooks/canvas'

class Decoder {
  static bytes(b64: string): Uint8Array {
    const binary = atob(b64)
    const out = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
    return out
  }

  static cells(encoded: Encoded): Uint32Array {
    if (encoded.kind !== 'cells') throw new Error('expected cells')
    const bytes = Decoder.bytes(encoded.cells)
    return new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4)
  }

  static rgba(encoded: Encoded): { bytes: Uint8Array; width: number } {
    if (encoded.kind !== 'rgba') throw new Error('expected rgba')
    return { bytes: Decoder.bytes(encoded.rgba), width: encoded.width }
  }

  static red(image: { bytes: Uint8Array; width: number }, x: number, y: number): number {
    return image.bytes[(Math.floor(y * 6) * image.width + Math.floor(x * 6)) * 4] ?? 0
  }
}

class Fixtures {
  static readonly RED: Rgb = [255, 0, 0]
  static readonly BLUE: Rgb = [0, 0, 255]
  static readonly WHITE: Rgb = [255, 255, 255]
}

test('quad encode of a fully filled cell yields a blank glyph with the same colour', async () => {
  const canvas = new Canvas(4, 2, 'quad')
  canvas.fillRect(0, 0, 4, 4, Fixtures.RED)
  const cells = Decoder.cells(canvas.encode())
  expect(cells[0]).toBe(0x20)
  expect(cells[1]).toBe(0xff0000)
  expect(cells[2]).toBe(0xff0000)
})

test('quad encode of a half filled cell picks the matching quadrant glyph', async () => {
  const canvas = new Canvas(1, 1, 'quad')
  canvas.fillRect(0, 0, 1, 1, Fixtures.RED)
  canvas.fillRect(0, 1, 1, 1, Fixtures.BLUE)
  const cells = Decoder.cells(canvas.encode())
  const glyph = cells[0]
  expect(glyph === 0x2580 || glyph === 0x2584).toBeTruthy()
  const top = glyph === 0x2580 ? cells[1] : cells[2]
  expect(top).toBe(0xff0000)
})

test('half and quad cells outputs have columns*rows*12 bytes', async () => {
  for (const mode of ['half', 'quad'] as const) {
    const canvas = new Canvas(10, 5, mode)
    const encoded = canvas.encode()
    expect(encoded.kind).toBe('cells')
    expect(Decoder.cells(encoded).length * 4).toBe(10 * 5 * 12)
  }
})

test('hd rgba has width*height*4 bytes and 6 pixels per column', async () => {
  const canvas = new Canvas(7, 3, 'hd')
  const encoded = canvas.encode()
  expect(encoded.kind).toBe('rgba')
  if (encoded.kind === 'rgba') {
    expect(encoded.width).toBe(7 * Canvas.HD_CELL_WIDTH)
    expect(encoded.height).toBe(3 * Canvas.HD_CELL_HEIGHT)
    expect(Decoder.bytes(encoded.rgba).length).toBe(encoded.width * encoded.height * 4)
  }
})

test('fillCircle changes the centre pixel and not a far pixel', async () => {
  const canvas = new Canvas(20, 10, 'hd')
  canvas.fillCircle(10, 10, 4, Fixtures.RED)
  const image = Decoder.rgba(canvas.encode())
  expect(Decoder.red(image, 10, 10)).toBe(255)
  expect(Decoder.red(image, 1, 1)).toBe(0)
})

test('fillCircle looks round in quad mode', async () => {
  const canvas = new Canvas(20, 10, 'quad')
  canvas.fillCircle(10, 10, 4, Fixtures.WHITE)
  const cells = Decoder.cells(canvas.encode())
  const cellAt = (col: number, row: number): number => cells[(row * 20 + col) * 3 + 2] ?? 0
  expect(cellAt(10, 5)).toBe(0xffffff)
  expect(cellAt(10, 2)).toBe(0)
  expect(cellAt(14, 5)).toBe(0)
  expect(cellAt(10, 8)).toBe(0)
})

test('text sanitizes an emoji to ? in cells mode', async () => {
  const canvas = new Canvas(6, 1, 'half')
  const next = canvas.text(0, 0, 'a\u{1F600}b', Fixtures.WHITE)
  expect(next).toBe(3)
  const cells = Decoder.cells(canvas.encode())
  expect(cells[0]).toBe(0x61)
  expect(cells[3]).toBe(0x3f)
  expect(cells[6]).toBe(0x62)
  expect(cells[4]).toBe(0xffffff)
})

test('text draws pixels in hd mode', async () => {
  const canvas = new Canvas(3, 1, 'hd')
  canvas.text(0, 0, 'E', Fixtures.WHITE, [0, 0, 0])
  const image = Decoder.rgba(canvas.encode())
  let lit = 0
  for (let y = 0; y < 12; y++) for (let x = 0; x < 6; x++) if ((image.bytes[(y * image.width + x) * 4] ?? 0) === 255) lit++
  expect(lit).toBeGreaterThan(10)
})

test('arc draws across the wrap-around angle', async () => {
  const canvas = new Canvas(20, 10, 'hd')
  canvas.arc(10, 10, 6, 5.5, 0.8, 2, Fixtures.WHITE)
  const image = Decoder.rgba(canvas.encode())
  expect(Decoder.red(image, 16, 10.1)).toBeGreaterThan(200)
  expect(Decoder.red(image, 4, 10.1)).toBe(0)
  expect(Decoder.red(image, 10, 16)).toBe(0)
})

test('line and curve draw a smooth stroke', async () => {
  const canvas = new Canvas(30, 10, 'hd')
  canvas.curve({ x: 2, y: 2 }, { x: 10, y: 2 }, { x: 20, y: 18 }, { x: 28, y: 18 }, 2, Fixtures.WHITE)
  canvas.line({ x: 2, y: 10 }, { x: 28, y: 10 }, 1, Fixtures.RED)
  const image = Decoder.rgba(canvas.encode())
  expect(Decoder.red(image, 15, 10)).toBe(255)
  expect(Decoder.red(image, 2, 2)).toBeGreaterThan(200)
})

test('glow is additive', async () => {
  const canvas = new Canvas(10, 5, 'half')
  canvas.glow(5, 5, 4, [100, 100, 100], 1)
  canvas.glow(5, 5, 4, [100, 100, 100], 1)
  const cells = Decoder.cells(canvas.encode())
  const centre = cells[(2 * 10 + 5) * 3 + 1] ?? 0
  expect((centre >> 16) & 255).toBeGreaterThan(100)
})
