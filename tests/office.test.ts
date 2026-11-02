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
