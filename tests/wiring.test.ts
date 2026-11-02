import { expect, test } from 'claude-code/testing'
import { Canvas, type Point, type Rgb } from '../hooks/canvas'
import { Colleagues } from '../hooks/colleagues'
import { Wiring, type Plug, type Wire, type WireLook, type WirePart } from '../hooks/wiring'

class WiringFixture {
  static readonly COLUMNS = 60
  static readonly ROWS = 16
  static readonly FLOOR = 16
  static readonly RED: Rgb = [255, 40, 40]
  static readonly GREEN: Rgb = [40, 255, 40]
  static readonly YELLOW: Rgb = [255, 255, 0]

  static port(x: number): Plug {
    const socket = { x, y: WiringFixture.FLOOR + 2 }
    return { socket, edge: { x: socket.x, y: socket.y } }
  }

  static seat(cx: number, side: -1 | 1): Plug {
    return Colleagues.plug(cx, WiringFixture.FLOOR + 0.5 - Colleagues.HEIGHT / 2, 1, side)
  }

  static wire(portX: number, seatX: number, lane: number, seed = 0): Wire {
    const side = seatX < portX ? 1 : -1
    return Wiring.route(WiringFixture.port(portX), WiringFixture.seat(seatX, side), WiringFixture.FLOOR, lane, WiringFixture.RED, seed)
  }

  static look(overrides: Partial<WireLook> = {}): WireLook {
    return { light: 1, activity: 0, flash: 0, tint: WiringFixture.GREEN, isIdle: false, reveal: 1, exit: 0, at: 0, returnColor: WiringFixture.YELLOW, ...overrides }
  }

  static render(wire: Wire, look: WireLook): Uint8Array {
    const canvas = new Canvas(WiringFixture.COLUMNS, WiringFixture.ROWS, 'hd')
    for (const part of ['head', 'hang', 'tail'] as WirePart[]) Wiring.draw(canvas, wire, look, part)
    const encoded = canvas.encode()
    const raw = atob(encoded.kind === 'rgba' ? encoded.rgba : '')
    return Uint8Array.from(raw, ch => ch.charCodeAt(0))
  }

  static pixel(data: Uint8Array, p: number): Rgb {
    return [data[p * 4] ?? 0, data[p * 4 + 1] ?? 0, data[p * 4 + 2] ?? 0]
  }

  static matching(data: Uint8Array, predicate: (c: Rgb) => boolean): Point[] {
    const width = WiringFixture.COLUMNS * Canvas.HD_CELL_WIDTH
    const found: Point[] = []
    for (let p = 0; p < data.length / 4; p++) {
      if (predicate(WiringFixture.pixel(data, p))) found.push({ x: (p % width) / Canvas.HD_CELL_WIDTH, y: Math.floor(p / width) / (Canvas.HD_CELL_HEIGHT / 2) })
    }
    return found
  }

  static lit(data: Uint8Array): number {
    return WiringFixture.matching(data, c => c[0] + c[1] + c[2] > 60).length
  }

  static brightness(data: Uint8Array): number {
    let sum = 0
    for (let i = 0; i < data.length; i += 4) sum += (data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0)
    return sum
  }

  static indexOf(wire: Wire, points: Point[]): number {
    const x = points.reduce((s, p) => s + p.x, 0) / points.length
    const y = points.reduce((s, p) => s + p.y, 0) / points.length
    let best = 0
    let distance = Infinity
    wire.cells.forEach((c, i) => {
      const d = Math.hypot(c.x + 0.25 - x, c.y + 0.5 - y)
      if (d < distance) {
        distance = d
        best = i
      }
    })
    return best
  }

  static hot(c: Rgb): boolean {
    return c[2] > 170 && c[1] > 200
  }

  static returning(c: Rgb): boolean {
    return c[0] > 200 && c[1] > 200 && c[2] < 150
  }

  static color(data: Uint8Array, cell: Point): Rgb {
    const width = WiringFixture.COLUMNS * Canvas.HD_CELL_WIDTH
    const px = Math.floor((cell.x + 0.25) * Canvas.HD_CELL_WIDTH)
    const py = Math.floor((cell.y + 0.5) * (Canvas.HD_CELL_HEIGHT / 2))
    return WiringFixture.pixel(data, py * width + px)
  }

  static probe(data: Uint8Array, cell: Point): number {
    const c = WiringFixture.color(data, cell)
    return c[0] + c[1] + c[2]
  }
}

test('route keeps every cell on the quad grid', () => {
  // Act
  const wire = WiringFixture.wire(40, 12, 19)

  // Assert
  expect(wire.cells.length).toBeGreaterThan(10)
  expect(wire.cells.every(c => c.x * 2 === Math.round(c.x * 2) && c.y === Math.round(c.y))).toBe(true)
})

test('route has no gap between consecutive cells', () => {
  // Act
  const wire = WiringFixture.wire(40, 12, 19)

  // Assert
  for (let i = 1; i < wire.cells.length; i++) {
    const a = wire.cells[i - 1] ?? { x: 0, y: 0 }
    const b = wire.cells[i] ?? { x: 0, y: 0 }
    expect(Math.abs(a.x - b.x)).toBeLessThanOrEqual(0.5)
    expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(1)
  }
})

test('route runs a front-row cable along its floor lane', () => {
  // Arrange
  const lane = 20
  const from = WiringFixture.port(40)
  const to = WiringFixture.seat(12, 1)

  // Act
  const wire = Wiring.route(from, to, WiringFixture.FLOOR, lane, WiringFixture.RED, 0)

  // Assert
  const along = wire.cells.filter(c => c.y === lane)
  const xs = along.map(c => c.x)
  expect(Math.max(...xs)).toBeGreaterThanOrEqual(from.edge.x - 0.5)
  expect(Math.min(...xs)).toBeLessThanOrEqual(to.edge.x + 0.5)
  expect(along.length).toBeGreaterThan((from.edge.x - to.edge.x) * 2 - 4)
  expect(wire.cells.every(c => c.y <= lane)).toBe(true)
})

test('two lanes never share a floor cell', () => {
  // Arrange
  const key = (c: Point): string => `${c.x},${c.y}`

  // Act
  const near = WiringFixture.wire(40, 24, 19)
  const far = WiringFixture.wire(44, 8, 21)

  // Assert
  const nearFloor = new Set(near.cells.filter(c => c.y > WiringFixture.FLOOR).map(key))
  const shared = far.cells.filter(c => c.y > WiringFixture.FLOOR && nearFloor.has(key(c)))
  expect(nearFloor.size).toBeGreaterThan(0)
  expect(shared).toHaveLength(0)
})

test('an idle wire lights about half its cells in grey', () => {
  // Arrange
  const wire = WiringFixture.wire(40, 12, 19)

  // Act
  const data = WiringFixture.render(wire, WiringFixture.look({ isIdle: true }))

  // Assert
  const cellPixels = 3 * 6
  const lit = WiringFixture.matching(data, c => c[0] + c[1] + c[2] > 60)
  expect(lit.length).toBeGreaterThan(wire.cells.length * cellPixels * 0.35)
  expect(lit.length).toBeLessThan(wire.cells.length * cellPixels * 0.65)
  expect(WiringFixture.matching(data, c => c[0] - c[1] > 40)).toHaveLength(0)
})

test('an active wire is brighter than an idle one and takes the role accent', () => {
  // Arrange
  const wire = WiringFixture.wire(40, 12, 19)

  // Act
  const idle = WiringFixture.render(wire, WiringFixture.look({ isIdle: true }))
  const active = WiringFixture.render(wire, WiringFixture.look({ activity: 0.5 }))

  // Assert
  expect(WiringFixture.brightness(active)).toBeGreaterThan(WiringFixture.brightness(idle))
  expect(WiringFixture.matching(active, c => c[0] - c[1] > 60).length).toBeGreaterThan(0)
})

test('a flash brightens the wire', () => {
  // Arrange
  const wire = WiringFixture.wire(40, 12, 19)

  // Act
  const calm = WiringFixture.render(wire, WiringFixture.look())
  const flashed = WiringFixture.render(wire, WiringFixture.look({ flash: 1 }))

  // Assert
  expect(WiringFixture.brightness(flashed)).toBeGreaterThan(WiringFixture.brightness(calm))
})

test('packets move from the switch end to the colleague end over time', () => {
  // Arrange
  const wire = WiringFixture.wire(40, 12, 19)
  const headAt = (at: number): number => WiringFixture.indexOf(wire, WiringFixture.matching(WiringFixture.render(wire, WiringFixture.look({ at })), WiringFixture.hot))

  // Act
  const early = headAt(500)
  const later = headAt(2000)

  // Assert
  expect(later).toBeGreaterThan(early)
})

test('the return packet travels back between 0.35 s and 0.9 s and draws nothing outside that window', () => {
  // Arrange
  const wire = WiringFixture.wire(40, 12, 19)
  const draw = (returnAge: number): Point[] => WiringFixture.matching(WiringFixture.render(wire, WiringFixture.look({ returnAge })), WiringFixture.returning)

  // Act
  const early = draw(100)
  const leaving = draw(450)
  const arriving = draw(820)
  const gone = draw(950)

  // Assert
  expect(early).toHaveLength(0)
  expect(gone).toHaveLength(0)
  expect(WiringFixture.indexOf(wire, leaving)).toBeGreaterThan(wire.cells.length / 2)
  expect(WiringFixture.indexOf(wire, arriving)).toBeLessThan(wire.cells.length / 2)
})

test('exit removes cells from the colleague end first', () => {
  // Arrange
  const wire = WiringFixture.wire(40, 12, 19)
  const first = wire.cells[0] ?? { x: 0, y: 0 }
  const last = wire.cells[wire.cells.length - 1] ?? { x: 0, y: 0 }

  // Act
  const data = WiringFixture.render(wire, WiringFixture.look({ exit: 0.45 }))

  // Assert
  expect(WiringFixture.probe(data, first)).toBeGreaterThan(60)
  expect(WiringFixture.probe(data, last)).toBeLessThanOrEqual(60)
})

test('exit leaves nothing at 1', () => {
  // Arrange
  const wire = WiringFixture.wire(40, 12, 19)

  // Act
  const data = WiringFixture.render(wire, WiringFixture.look({ exit: 1 }))

  // Assert
  expect(WiringFixture.lit(data)).toBe(0)
})

test('reveal unrolls the cable from the switch end and lights the socket LED only when fully unrolled', () => {
  // Arrange
  const wire = WiringFixture.wire(40, 12, 19)
  const first = wire.cells[0] ?? { x: 0, y: 0 }
  const last = wire.cells[wire.cells.length - 1] ?? { x: 0, y: 0 }

  // Act
  const half = WiringFixture.render(wire, WiringFixture.look({ reveal: 0.5 }))
  const full = WiringFixture.render(wire, WiringFixture.look({ reveal: 1 }))

  // Assert
  expect(WiringFixture.probe(half, first)).toBeGreaterThan(60)
  expect(WiringFixture.probe(half, last)).toBeLessThanOrEqual(60)
  expect(WiringFixture.probe(full, last)).toBeGreaterThan(60)
  const led = WiringFixture.color(full, last)
  expect(led[1]).toBeGreaterThan(led[0])
})
