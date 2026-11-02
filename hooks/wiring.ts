import { Canvas, type Point, type Rgb } from './canvas'
import { Theme } from './theme'

export type Side = -1 | 1

export type Plug = { socket: Point; edge: Point }

export type Wire = { cells: Point[]; color: Rgb; seed: number; headEnd: number; tailStart: number; floor?: number }

export type WirePart = 'head' | 'hang' | 'tail'

export type WireLook = {
  light: number
  activity: number
  flash: number
  tint: Rgb
  isIdle: boolean
  reveal: number
  exit: number
  at: number
  returnAge?: number
  returnColor: Rgb
}

export class Wiring {
  private static readonly STEP = 0.5
  private static readonly SHADOW: Rgb = [4, 8, 20]
  private static readonly RETURN_FROM_MS = 350
  private static readonly RETURN_TO_MS = 900
  private static readonly RETURN_CELLS = 3

  static route(from: Plug, to: Plug, floor: number, lane: number, color: Rgb, seed: number): Wire {
    const first = Wiring.leg(from, lane)
    const last = Wiring.leg(to, lane)
    const cells: Point[] = [...first]
    const xa = from.edge.x
    const xb = to.edge.x
    const gap = Math.abs(xb - xa)
    if (gap >= 1) Wiring.run(cells, xa + (xb > xa ? 0.5 : -0.5), xb + (xb > xa ? -0.5 : 0.5), lane)
    else {
      cells.push({ x: xa, y: lane })
      if (xb !== xa) cells.push({ x: xb, y: lane })
    }
    const climb = Math.max(0, lane - 1 - to.edge.y)
    const tailStart = cells.length + climb
    for (let i = last.length - 1; i >= 0; i--) {
      const cell = last[i]
      if (cell) cells.push(cell)
    }
    const isLink = from.socket.y <= floor
    let headEnd = -1
    if (!isLink) for (let i = 0; i < tailStart; i++) if ((cells[i]?.y ?? 0) > floor) headEnd = i
    return { cells, color, seed, headEnd, tailStart: isLink ? 0 : tailStart, floor }
  }

  static draw(canvas: Canvas, wire: Wire, look: WireLook, part: WirePart): void {
    const n = wire.cells.length
    if (n === 0 || look.exit >= 1) return
    const from = part === 'head' ? 0 : part === 'hang' ? wire.headEnd + 1 : wire.tailStart
    const to = part === 'head' ? wire.headEnd + 1 : part === 'hang' ? wire.tailStart : n
    const shown = look.reveal >= 1 ? n : Math.ceil(Math.max(0, look.reveal) * n)
    const isLive = !look.isIdle && look.reveal >= 1 && look.exit <= 0
    const heads = isLive ? Wiring.packets(wire, look) : []
    const back = isLive ? Wiring.returning(wire, look) : -1
    const fade = Math.min(1, (1 - Wiring.progress(look)) * 6)
    const end = Math.min(to, shown)
    if (!look.isIdle && look.exit <= 0) for (let i = from; i < end; i++) Wiring.outline(canvas, wire, i, 0.4 * Math.min(1, look.light + 0.3))
    for (let i = from; i < end; i++) {
      const cell = wire.cells[i]
      if (!cell) continue
      if (look.exit > 0) {
        Wiring.fall(canvas, wire, look, i, cell)
        continue
      }
      let color = Wiring.base(wire, look, i)
      if (look.isIdle) {
        if (i % 2 === 0) Wiring.cell(canvas, cell.x, cell.y, color, 1)
        continue
      }
      if (look.reveal < 1 && i === shown - 1) color = Canvas.mix(color, Theme.WHITE, 0.6)
      let isHot = false
      for (const h of heads) {
        if (i === h) {
          color = Canvas.mix(look.tint, Theme.WHITE, 0.75)
          isHot = true
        } else if (i === h - 1) {
          color = Canvas.mix(look.tint, Theme.WHITE, 0.15)
          isHot = true
        }
      }
      if (back >= 0 && i >= back && i < back + Wiring.RETURN_CELLS) {
        color = Canvas.mix(look.returnColor, Theme.WHITE, i === back ? 0.5 : 0.1)
        Wiring.cell(canvas, cell.x, cell.y, color, fade)
        continue
      }
      Wiring.cell(canvas, cell.x, cell.y, isHot ? color : Canvas.scale(color, look.light), 1)
    }
    if (look.exit > 0) return
    if (part === (wire.headEnd >= 0 ? 'head' : 'tail') && look.reveal > 0) Wiring.light(canvas, wire.cells[0], look)
    if (part === 'tail' && look.reveal >= 1) Wiring.light(canvas, wire.cells[n - 1], look)
  }

  static led(canvas: Canvas, socket: Point, color: Rgb, level: number): void {
    if (level <= 0) return
    Wiring.cell(canvas, socket.x, socket.y, Canvas.mix(color, Theme.WHITE, 0.35), Math.min(1, level))
  }

  private static run(cells: Point[], x0: number, x1: number, y: number): void {
    const steps = Math.round(Math.abs(x1 - x0) / Wiring.STEP)
    const dir = x1 >= x0 ? 1 : -1
    for (let i = 0; i <= steps; i++) Wiring.push(cells, x0 + dir * i * Wiring.STEP, y)
  }

  private static leg(plug: Plug, lane: number): Point[] {
    const { socket, edge } = plug
    const cells: Point[] = [{ x: socket.x, y: socket.y }]
    if (edge.y !== socket.y) cells.push({ x: socket.x, y: edge.y })
    const dx = edge.x - socket.x
    if (Math.abs(dx) >= 1) Wiring.run(cells, socket.x + (dx > 0 ? 0.5 : -0.5), edge.x + (dx > 0 ? -0.5 : 0.5), edge.y)
    for (let y = edge.y + 1; y <= lane - 1; y++) cells.push({ x: edge.x, y })
    return cells
  }

  private static push(cells: Point[], x: number, y: number): void {
    const px = Math.round(x * 2) / 2
    const prev = cells[cells.length - 1]
    if (prev && prev.x === px && prev.y === y) return
    if (prev) {
      const gap = Math.abs(y - prev.y)
      if (gap > 1) {
        const dir = y > prev.y ? 1 : -1
        const half = Math.floor(gap / 2)
        for (let r = 1; r < gap; r++) cells.push({ x: r <= half ? prev.x : px, y: prev.y + dir * r })
      }
    }
    cells.push({ x: px, y })
  }

  private static base(wire: Wire, look: WireLook, i: number): Rgb {
    if (look.isIdle) return Canvas.scale(Canvas.mix(Theme.FAINT, Theme.WHITE, 0.4), look.light)
    const jacket = Canvas.scale(wire.color, 0.72)
    const tone = i % 3 === 0 ? Canvas.mix(wire.color, Theme.WHITE, 0.35) : jacket
    return Canvas.mix(tone, Theme.WHITE, Math.min(1, look.flash) * 0.6)
  }

  private static packets(wire: Wire, look: WireLook): number[] {
    const n = wire.cells.length
    const count = 1 + (look.activity > 0.35 ? 1 : 0) + (look.activity > 0.7 ? 1 : 0)
    const speed = 8 + 24 * look.activity + 16 * look.flash
    const heads: number[] = []
    for (let k = 0; k < count; k++) {
      const u = (look.at / 1000) * speed + wire.seed * n + (k * n) / count
      heads.push(Math.floor(((u % n) + n) % n))
    }
    return heads
  }

  private static progress(look: WireLook): number {
    const age = look.returnAge ?? 0
    return Math.max(0, Math.min(1, (age - Wiring.RETURN_FROM_MS) / (Wiring.RETURN_TO_MS - Wiring.RETURN_FROM_MS)))
  }

  private static returning(wire: Wire, look: WireLook): number {
    const age = look.returnAge
    if (age === undefined || age < Wiring.RETURN_FROM_MS || age >= Wiring.RETURN_TO_MS) return -1
    const r = Wiring.progress(look)
    const t = 1 - (r < 0.5 ? 2 * r * r : 1 - 2 * (1 - r) * (1 - r))
    return Math.round(t * (wire.cells.length - 1)) - 1
  }

  private static fall(canvas: Canvas, wire: Wire, look: WireLook, i: number, cell: Point): void {
    const n = wire.cells.length
    const start = ((n - 1 - i) / n) * 0.6
    const u = Math.max(0, Math.min(1, (look.exit - start) / 0.4))
    if (u >= 1) return
    const drop = 1 + Math.floor(Canvas.hash(i + 1, wire.seed * 331 + 7) * 3)
    const color = Canvas.mix(Wiring.base(wire, look, i), Theme.WHITE, 0.25 * u)
    Wiring.cell(canvas, cell.x, cell.y + Math.round(u * drop), Canvas.scale(color, look.light), 1 - u)
  }

  private static outline(canvas: Canvas, wire: Wire, i: number, alpha: number): void {
    const cell = wire.cells[i]
    if (!cell) return
    const prev = wire.cells[i - 1]
    const next = wire.cells[i + 1]
    const isVertical = (prev?.x === cell.x && prev.y !== cell.y) || (next?.x === cell.x && next.y !== cell.y)
    if (isVertical) canvas.block(cell.x + Wiring.STEP, cell.y, Wiring.STEP, 1, Wiring.SHADOW, alpha)
    else if (wire.floor !== undefined && cell.y > wire.floor) canvas.block(cell.x, cell.y + 1, Wiring.STEP, 1, Wiring.SHADOW, alpha)
  }

  private static light(canvas: Canvas, socket: Point | undefined, look: WireLook): void {
    if (!socket || look.isIdle && look.flash <= 0) return
    Wiring.led(canvas, socket, look.tint, look.flash > 0 ? 1 : 0.55)
  }

  private static cell(canvas: Canvas, x: number, y: number, color: Rgb, alpha: number): void {
    canvas.block(x, y, Wiring.STEP, 1, color, alpha)
  }
}
