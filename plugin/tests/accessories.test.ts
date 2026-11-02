import { expect, test } from 'claude-code/testing'
import { Accessories } from '../hooks/accessories'
import { Canvas } from '../hooks/canvas'
import { Robots } from '../hooks/robots'

class AccessoryFixture {
  static avatar(id: string, hatted: boolean): string {
    const canvas = new Canvas(40, 24, 'quad')
    canvas.paint(() => [7, 10, 20])
    Robots.wear(id)
    Robots.drawOrchestrator(canvas, 20, 26, 1, 3, 'idle', undefined, undefined, hatted)
    Robots.wear('')
    const encoded = canvas.encode()
    return encoded.kind === 'cells' ? encoded.cells : ''
  }
}

test('offers at least thirty accessories with unique ids across face, head and body', () => {
  // Act
  const ids = Accessories.ALL.map(a => a.id)
  const slots = new Set(Accessories.ALL.map(a => a.slot))

  // Assert
  expect(ids.length >= 30).toBe(true)
  expect(new Set(ids).size).toBe(ids.length)
  expect([...slots].sort()).toEqual(['body', 'face', 'top'])
})

test('draws every accessory visibly on the avatar', () => {
  // Arrange
  const bare = AccessoryFixture.avatar('', false)

  for (const accessory of Accessories.ALL) {
    // Act
    const worn = AccessoryFixture.avatar(accessory.id, false)

    // Assert
    expect(`${accessory.id}:${worn === bare}`).toBe(`${accessory.id}:false`)
  }
})

test('hides the head accessories under a holiday hat but keeps the others', () => {
  // Arrange
  const bare = AccessoryFixture.avatar('', true)

  for (const accessory of Accessories.ALL) {
    // Act
    const worn = AccessoryFixture.avatar(accessory.id, true)

    // Assert
    expect(`${accessory.id}:${worn === bare}`).toBe(`${accessory.id}:${accessory.slot === 'top'}`)
  }
})

test('never picks one of the accessories worn in the last sessions', () => {
  // Arrange
  const recent = Accessories.ALL.slice(0, 20).map(a => a.id)

  for (let i = 0; i < 50; i++) {
    // Act
    const id = Accessories.pick(recent, i / 50)

    // Assert
    expect(recent.includes(id)).toBe(false)
  }
})

test('still picks a known accessory when every one was worn recently', () => {
  // Arrange
  const recent = Accessories.ALL.map(a => a.id)

  // Act
  const id = Accessories.pick(recent, 0.999)

  // Assert
  expect(Accessories.find(id) === undefined).toBe(false)
})

test('remembers the worn accessory last without duplicates', () => {
  // Act
  const recent = Accessories.remember(['pipe', 'monocle', 'beanie'], 'pipe')

  // Assert
  expect(recent).toEqual(['monocle', 'beanie', 'pipe'])
})
