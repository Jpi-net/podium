import { expect, test } from 'claude-code/testing'
import { Canvas } from '../hooks/canvas'
import { Office } from '../hooks/office'

class OfficeFixture {
  static brightness(canvas: Canvas): number {
    const encoded = canvas.encode()
    const raw = atob(encoded.kind === 'rgba' ? encoded.rgba : '')
    let sum = 0
    for (let i = 0; i < raw.length; i += 4) sum += raw.charCodeAt(i) + raw.charCodeAt(i + 1) + raw.charCodeAt(i + 2)
    return sum
  }

  static pixel(canvas: Canvas, x: number, y: number): [number, number, number] {
    const encoded = canvas.encode()
    const raw = atob(encoded.kind === 'rgba' ? encoded.rgba : '')
    const i = (Math.floor(y * (Canvas.HD_CELL_HEIGHT / 2)) * canvas.columns * Canvas.HD_CELL_WIDTH + Math.floor(x * Canvas.HD_CELL_WIDTH)) * 4
    return [raw.charCodeAt(i), raw.charCodeAt(i + 1), raw.charCodeAt(i + 2)]
  }
}

test('room puts the desk under the bust, the sill at the desk and the floor at the bottom', () => {
  // Arrange
  const canvas = new Canvas(84, 36, 'quad')

  // Act
  const room = Office.room(canvas, 42, 45, 11)

  // Assert
  expect(room.deskY).toBeLessThan(45)
  expect(room.sillY).toBeGreaterThanOrEqual(room.deskY)
  expect(room.floorY).toBeGreaterThan(room.sillY)
  expect(room.floorY).toBeLessThan(canvas.height)
  expect(Math.abs(42 - room.deskLeft - (room.deskRight - 42))).toBeLessThanOrEqual(0.5)
  expect(room.deskRight - room.deskLeft).toBeGreaterThan(22)
})

test('room keeps the desk above the floor on a short canvas', () => {
  // Arrange
  const canvas = new Canvas(40, 22, 'quad')

  // Act
  const room = Office.room(canvas, 20, 40, 9)

  // Assert
  expect(room.deskY).toBeLessThanOrEqual(room.floorY - 9)
})

test('pane lies between the curtains, below the rod and above the sill', () => {
  // Arrange
  const canvas = new Canvas(84, 36, 'hd')
  const room = Office.room(canvas, 42, 45, 11)

  // Act
  const pane = Office.pane(canvas, room)

  // Assert
  expect(pane.left).toBeGreaterThan(0)
  expect(pane.right).toBeLessThan(canvas.width)
  expect(Math.abs(pane.left - (canvas.width - pane.right))).toBeLessThanOrEqual(0.5)
  expect(pane.right - pane.left).toBeGreaterThan(canvas.width / 2)
  expect(pane.top).toBeGreaterThanOrEqual(2)
  expect(pane.bottom).toBeLessThan(room.sillY)
  expect(pane.bottom).toBeGreaterThan(pane.top)
})

test('the desk lamp lights the room when it is on', () => {
  // Arrange
  const off = new Canvas(84, 36, 'hd')
  const on = new Canvas(84, 36, 'hd')
  const room = Office.room(off, 42, 45, 11)

  // Act
  Office.back(off, room, 0.45, 0)
  Office.desk(off, room, 0.45, false, 0)
  Office.back(on, room, 0.45, 0)
  Office.desk(on, room, 0.45, true, 0)

  // Assert
  expect(OfficeFixture.brightness(on)).toBeGreaterThan(OfficeFixture.brightness(off))
})

test('the office is dimmer at night than at midday', () => {
  // Arrange
  const day = new Canvas(84, 36, 'hd')
  const night = new Canvas(84, 36, 'hd')
  const room = Office.room(day, 42, 45, 11)

  // Act
  Office.back(day, room, 1, 0)
  Office.back(night, room, 0.45, 0)

  // Assert
  expect(OfficeFixture.brightness(night)).toBeLessThan(OfficeFixture.brightness(day))
})

test('ports are distinct, inside the switch and ordered left to right', () => {
  // Arrange
  const canvas = new Canvas(84, 36, 'quad')
  const room = Office.room(canvas, 42, 45, 11)
  const mid = (room.deskLeft + room.deskRight) / 2

  // Act
  const ports = [0, 1, 2, 3].map(i => Office.port(room, i, 4))

  // Assert
  expect(new Set(ports.map(p => p.x)).size).toBe(4)
  expect(ports.every(p => Math.abs(p.x - mid) <= 5 && p.y > room.floorY)).toBe(true)
  expect(ports.map(p => p.x)).toEqual(ports.map(p => p.x).sort((a, b) => a - b))
})

test('the hub draws on the rug under the desk', () => {
  // Arrange
  const canvas = new Canvas(84, 36, 'hd')
  const room = Office.room(canvas, 42, 45, 11)
  const mid = (room.deskLeft + room.deskRight) / 2
  const port = Office.port(room, 0, 1)
  const blank = OfficeFixture.pixel(canvas, mid, room.floorY + 1.5)

  // Act
  Office.hub(canvas, room, 1, 1, 0)

  // Assert
  expect(OfficeFixture.pixel(canvas, mid, room.floorY + 1.5)).not.toEqual(blank)
  expect(OfficeFixture.pixel(canvas, port.x + 0.25, port.y + 0.5)).not.toEqual(blank)
  expect(OfficeFixture.pixel(canvas, mid, room.deskY + 8 + 0.5)).not.toEqual(OfficeFixture.pixel(canvas, mid - 6, room.deskY + 8 + 0.5))
})
