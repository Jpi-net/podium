import { expect, test } from 'claude-code/testing'
import { Canvas } from '../hooks/canvas'
import { Colleagues } from '../hooks/colleagues'
import { Robots, type RobotInput } from '../hooks/robots'

class ColleagueFixture {
  static input(type: string, mood: RobotInput['mood'], frame = 10, seed = 0.42): RobotInput {
    return { type, model: 'claude-sonnet-5-5', mood, frame, flash: 0, seed }
  }
}

test('a colleague keeps the same look for the same agent', () => {
  // Arrange
  const seed = 0.37

  // Act
  const first = Colleagues.look('explore', seed)
  const again = Colleagues.look('explore', seed)

  // Assert
  expect(again).toEqual(first)
})

test('a colleague wears the accent colour of its role', () => {
  // Act
  const look = Colleagues.look('architect', 0.5)

  // Assert
  expect(look.outfit).toEqual(Robots.accent('architect'))
  expect(look.headgear).toBe('hardhat')
})

test('a fork of the main thread looks like the orchestrator', () => {
  // Act
  const look = Colleagues.look('fork', 0.9)

  // Assert
  expect(look.isMe).toBe(true)
  expect(look.headgear).toBe('headset')
})

test('a working colleague types: its hands move between frames', () => {
  // Arrange
  const look = Colleagues.look('debugger', 0.2)

  // Act
  const frames = [0, 1, 2, 3, 4, 5].map(f => Colleagues.rows(look, ColleagueFixture.input('debugger', 'working', 20 + f, 0.2)).join('\n'))

  // Assert
  expect(new Set(frames).size).toBeGreaterThan(1)
})

test('a colleague who finished gives a thumbs up instead of its desk item', () => {
  // Arrange
  const look = Colleagues.look('explore', 0.3)

  // Act
  const working = Colleagues.rows(look, ColleagueFixture.input('explore', 'idle', 10, 0.3))
  const done = Colleagues.rows(look, ColleagueFixture.input('explore', 'done', 10, 0.3))

  // Assert
  expect(done).not.toEqual(working)
  expect(done.length).toBe(Colleagues.HEIGHT)
  expect(done.every(r => r.length === Colleagues.WIDTH * 2)).toBe(true)
})

test('a colleague is drawn inside its declared box', () => {
  // Arrange
  const canvas = new Canvas(40, 16, 'hd')
  const blank = atob((canvas.encode() as { rgba: string }).rgba)

  // Act
  Colleagues.draw(canvas, 20, 16, 1, ColleagueFixture.input('plan', 'working'))

  // Assert
  const drawn = atob((canvas.encode() as { rgba: string }).rgba)
  const width = 40 * Canvas.HD_CELL_WIDTH
  const unit = Canvas.HD_CELL_WIDTH
  let changedOutside = 0
  for (let i = 0; i < drawn.length; i += 4) {
    if (drawn.charCodeAt(i) === blank.charCodeAt(i) && drawn.charCodeAt(i + 1) === blank.charCodeAt(i + 1) && drawn.charCodeAt(i + 2) === blank.charCodeAt(i + 2)) continue
    const x = (i / 4) % width / unit
    const y = Math.floor(i / 4 / width) / unit
    if (Math.abs(x - 20) > Colleagues.WIDTH / 2 + 1.5 || Math.abs(y - 16) > Colleagues.HEIGHT / 2 + 1.5) changedOutside++
  }
  expect(changedOutside).toBe(0)
})
