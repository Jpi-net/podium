import { Canvas, type Point, type Rgb } from './canvas'
import type { Pane } from './effects'

export type Room = { floorY: number; sillY: number; deskY: number; deskLeft: number; deskRight: number; spare: number }

export class Office {
  static readonly SWITCH_WIDTH = 10
  private static readonly SIDE_MIN = 8.5
  private static readonly LED_OFF: Rgb = [48, 54, 74]
  private static readonly WALL: Rgb = [36, 44, 70]
  private static readonly WALL_LIGHT: Rgb = [48, 58, 90]
  private static readonly WALL_DARK: Rgb = [24, 30, 50]
  private static readonly RAIL: Rgb = [120, 84, 56]
  private static readonly RAIL_LIGHT: Rgb = [164, 118, 78]
  private static readonly SILL: Rgb = [196, 178, 150]
  private static readonly SILL_LIGHT: Rgb = [232, 220, 198]
  private static readonly SILL_SHADOW: Rgb = [18, 22, 38]
  private static readonly PLANK: readonly Rgb[] = [
    [112, 72, 46],
    [124, 82, 52],
    [104, 66, 42],
  ]
  private static readonly PLANK_SEAM: Rgb = [70, 44, 28]
  private static readonly PLANK_SHINE: Rgb = [150, 104, 68]
  private static readonly BASEBOARD: Rgb = [210, 200, 184]
  private static readonly WOOD: Rgb = [104, 64, 40]
  private static readonly WOOD_TOP: Rgb = [156, 104, 64]
  private static readonly WOOD_EDGE: Rgb = [186, 132, 84]
  private static readonly WOOD_DARK: Rgb = [70, 42, 26]
  private static readonly WOOD_DEEP: Rgb = [50, 30, 20]
  private static readonly BRASS: Rgb = [222, 176, 80]
  private static readonly CURTAIN: Rgb = [0, 128, 116]
  private static readonly CURTAIN_LIGHT: Rgb = [40, 172, 154]
  private static readonly CURTAIN_DARK: Rgb = [0, 84, 78]
  private static readonly POT: Rgb = [200, 104, 66]
  private static readonly POT_DARK: Rgb = [150, 72, 44]
  private static readonly LEAF: Rgb = [64, 168, 92]
  private static readonly LEAF_LIGHT: Rgb = [120, 214, 120]
  private static readonly LEAF_DARK: Rgb = [34, 112, 64]
  private static readonly METAL: Rgb = [96, 110, 138]
  private static readonly METAL_LIGHT: Rgb = [140, 154, 184]
  private static readonly METAL_DARK: Rgb = [62, 72, 96]
  private static readonly PAPER: Rgb = [236, 232, 220]
  private static readonly PAPER_SHADE: Rgb = [196, 190, 176]
  private static readonly MUG: Rgb = [240, 240, 246]
  private static readonly MUG_SHADE: Rgb = [190, 196, 214]
  private static readonly ACCENT: Rgb = [0, 187, 167]
  private static readonly SHADE: Rgb = [0, 150, 136]
  private static readonly LAMP_LIGHT: Rgb = [255, 210, 140]
  private static readonly BOOKS: readonly Rgb[] = [
    [220, 84, 96],
    [72, 160, 230],
    [240, 190, 80],
    [150, 110, 220],
    [90, 190, 120],
  ]

  static room(canvas: Canvas, cx: number, bustBottom: number, bustHalfWidth: number): Room {
    const h = canvas.height
    const floorY = Math.round(h - Math.max(5, h * 0.12))
    const deskY = Math.round(Math.min(bustBottom - 1, floorY - 9))
    const sillY = Math.round(Math.min(deskY + 3, floorY - 8))
    const halfDesk = Math.round(Math.min(bustHalfWidth + 7.5, Math.max(bustHalfWidth + 1, canvas.width / 2 - Office.SIDE_MIN)) * 2) / 2
    return { floorY, sillY, deskY, deskLeft: Math.round((cx - halfDesk) * 2) / 2, deskRight: Math.round((cx + halfDesk) * 2) / 2, spare: halfDesk - bustHalfWidth }
  }

  static pane(canvas: Canvas, room: Room): Pane {
    const reach = Office.curtainWidth(canvas)
    return { left: reach + 0.5, right: canvas.width - reach - 0.5, top: 3, bottom: Math.max(4, room.sillY - 2) }
  }

  static port(room: Room, index: number, count: number): Point {
    const mid = (room.deskLeft + room.deskRight) / 2
    return { x: Math.round((mid - Office.SWITCH_WIDTH / 2 + ((index + 0.5) * Office.SWITCH_WIDTH) / Math.max(1, count)) * 2) / 2, y: room.floorY + 2 }
  }

  static hub(canvas: Canvas, room: Room, light: number, count: number, frame: number): void {
    const tone = (c: Rgb): Rgb => Canvas.scale(c, light)
    const { floorY, deskY } = room
    const mid = (room.deskLeft + room.deskRight) / 2
    const left = Math.round((mid - Office.SWITCH_WIDTH / 2) * 2) / 2
    const top = deskY + 8
    const length = floorY - top
    if (length >= 3) {
      canvas.block(mid - 0.5, top, 1, length, tone(Canvas.scale(Office.ACCENT, 0.45)))
      canvas.block(mid, top, 0.5, length, tone(Office.SHADE), 0.6)
      const spark = top + Math.floor((((frame * 0.35) % length) + length) % length)
      canvas.block(mid - 0.5, spark, 1, 1, tone(Canvas.mix(Office.ACCENT, [255, 255, 255], 0.5)))
    }
    canvas.block(left, floorY + 1, Office.SWITCH_WIDTH, 1, tone(Office.METAL_LIGHT))
    canvas.block(left, floorY + 2, Office.SWITCH_WIDTH, 1, tone(Office.METAL_DARK))
    canvas.block(left, floorY + 2, 0.5, 1, tone(Office.METAL))
    canvas.block(left + Office.SWITCH_WIDTH - 0.5, floorY + 2, 0.5, 1, tone(Office.METAL))
    canvas.block(mid - 0.5, floorY, 1, 1, tone(Canvas.scale(Office.ACCENT, 0.45)))
    for (let i = 0; i < count; i++) {
      const port = Office.port(room, i, count)
      canvas.block(port.x, port.y, 0.5, 1, tone(Office.LED_OFF))
    }
  }

  static back(canvas: Canvas, room: Room, light: number, frame: number, taken: readonly (readonly [number, number])[] = []): void {
    const tone = (c: Rgb): Rgb => Canvas.scale(c, light)
    const w = canvas.width
    const { floorY, sillY } = room
    canvas.block(0, sillY, w, floorY - sillY, tone(Office.WALL))
    for (let x = 6; x < w; x += 14) {
      canvas.block(x, sillY + 4, 10, floorY - sillY - 7, tone(Office.WALL_DARK))
      canvas.block(x + 0.5, sillY + 5, 9, floorY - sillY - 9, tone(Office.WALL_LIGHT))
      canvas.block(x + 1, sillY + 6, 8, floorY - sillY - 11, tone(Office.WALL))
    }
    canvas.block(0, sillY + 2, w, 1, tone(Office.RAIL_LIGHT))
    canvas.block(0, sillY + 3, w, 1, tone(Office.RAIL))
    canvas.block(0, sillY - 1, w, 1, tone(Office.SILL_LIGHT))
    canvas.block(0, sillY, w, 2, tone(Office.SILL))
    canvas.block(0, sillY + 2, w, 0, tone(Office.SILL_SHADOW))
    Office.floor(canvas, room, tone)
    Office.rug(canvas, room, tone)
    Office.frame(canvas, room, tone)
    Office.curtain(canvas, 0, sillY + 1, false, tone, frame)
    Office.curtain(canvas, w, sillY + 1, true, tone, frame)
    canvas.block(0, 0, w, 1, tone(Office.BRASS))
    canvas.block(0, 1, w, 0, tone(Office.WOOD_DARK))
    for (const x of [1, w - 1.5]) canvas.block(x, 0, 0.5, 2, tone(Office.BRASS))
    const isFree = (x0: number, x1: number): boolean => taken.every(([a, b]) => b < x0 || a > x1)
    const plantX = Math.max(7, w * 0.11)
    const cabinetX = Math.min(w - 8, w * 0.89)
    if (isFree(plantX - 5, plantX + 5)) Office.plant(canvas, plantX, floorY, tone, frame)
    if (cabinetX - 4.5 >= 0 && cabinetX + 4.5 <= w && isFree(cabinetX - 5, cabinetX + 5)) Office.cabinet(canvas, cabinetX, floorY, tone)
  }

  static desk(canvas: Canvas, room: Room, light: number, isLampOn: boolean, frame: number): void {
    const tone = (c: Rgb): Rgb => Canvas.scale(c, Math.max(light, isLampOn ? 0.78 : 0))
    const { deskY, deskLeft, deskRight, floorY } = room
    const width = deskRight - deskLeft
    canvas.block(deskLeft + 1, floorY - 1, width - 2, 1, tone(Office.WOOD_DEEP), 0.55)
    canvas.block(deskLeft + 1.5, deskY + 2, width - 3, floorY - deskY - 3, tone(Office.WOOD_DARK))
    canvas.block(deskLeft + 2, deskY + 2, width - 4, 5, tone(Office.WOOD))
    canvas.block(deskLeft + 2, deskY + 7, width - 4, 1, tone(Office.WOOD_DEEP))
    const pedestal = Math.min(9, width * 0.28)
    for (const x of [deskLeft + 2, deskRight - 2 - pedestal]) {
      canvas.block(x, deskY + 8, pedestal, floorY - deskY - 9, tone(Office.WOOD))
      const drawers = Math.max(1, Math.floor((floorY - deskY - 10) / 4))
      const step = (floorY - deskY - 9) / drawers
      for (let i = 0; i < drawers; i++) {
        const y = Math.round(deskY + 8 + i * step)
        canvas.block(x, y, pedestal, 1, tone(Office.WOOD_DEEP))
        canvas.block(x + pedestal / 2 - 1, y + Math.max(1, Math.round(step / 2)), 2, 1, tone(Office.BRASS))
      }
      canvas.block(x + pedestal - 0.5, deskY + 8, 0.5, floorY - deskY - 9, tone(Office.WOOD_DEEP))
    }
    canvas.block(deskLeft + 2 + pedestal, deskY + 8, width - 4 - 2 * pedestal, floorY - deskY - 9, tone(Office.WOOD_DEEP), 0.85)
    canvas.block(deskLeft, deskY, width, 2, tone(Office.WOOD_TOP))
    canvas.block(deskLeft, deskY, width, 1, tone(Office.WOOD_EDGE))
    canvas.block(deskLeft + 0.5, deskY + 2, width - 1, 0.5, tone(Office.WOOD_DEEP))
    Office.lamp(canvas, deskLeft + 3, deskY, tone, isLampOn)
    if (room.spare >= 10) Office.papers(canvas, deskLeft + 6.5, deskY, tone)
    Office.laptop(canvas, deskRight - 7.5, deskY, tone, frame)
    Office.mug(canvas, deskRight - 1.5, deskY, tone, frame)
    if (isLampOn) {
      canvas.glow(deskLeft + 4.5, deskY - 1, 18, Office.LAMP_LIGHT, 0.12)
      canvas.glow(deskLeft + 4.5, deskY, 7, Office.LAMP_LIGHT, 0.22)
    }
  }

  private static floor(canvas: Canvas, room: Room, tone: (c: Rgb) => Rgb): void {
    const w = canvas.width
    const { floorY } = room
    const h = canvas.height
    canvas.block(0, floorY - 1, w, 1, tone(Office.BASEBOARD))
    for (let y = floorY; y < h; y++) {
      const row = y - floorY
      const offset = (row * 7) % 12
      for (let x = -offset; x < w; x += 12) {
        const shade = Office.PLANK[Math.floor(Canvas.hash(x + 40, y) * Office.PLANK.length)] ?? Office.WOOD
        canvas.block(Math.max(0, x), y, Math.min(w, x + 12) - Math.max(0, x), 1, tone(Canvas.scale(shade, 1 - row * 0.04)))
        if (x >= 0) canvas.block(x, y, 0.5, 1, tone(Office.PLANK_SEAM))
      }
      if (row === 0) canvas.block(0, y, w, 1, tone(Office.PLANK_SHINE), 0.35)
    }
  }

  private static curtainWidth(canvas: Canvas): number {
    return Math.max(4, Math.min(7, canvas.width * 0.06))
  }

  private static frame(canvas: Canvas, room: Room, tone: (c: Rgb) => Rgb): void {
    const pane = Office.pane(canvas, room)
    const height = pane.bottom - pane.top
    if (height <= 0 || pane.right <= pane.left) return
    const mid = canvas.width / 2
    canvas.block(pane.left - 0.5, pane.top - 1, pane.right - pane.left + 1, 1, tone(Office.RAIL_LIGHT))
    canvas.block(pane.left - 0.5, pane.bottom, pane.right - pane.left + 1, 1, tone(Office.RAIL))
    canvas.block(pane.left - 0.5, pane.top, 0.5, height, tone(Office.RAIL))
    canvas.block(pane.right, pane.top, 0.5, height, tone(Office.RAIL))
    canvas.block(mid - 0.5, pane.top, 1, height, tone(Office.RAIL))
    canvas.block(mid - 0.5, pane.top, 0.5, height, tone(Office.RAIL_LIGHT))
  }

  private static curtain(canvas: Canvas, edge: number, bottom: number, isRight: boolean, tone: (c: Rgb) => Rgb, frame: number): void {
    const width = Office.curtainWidth(canvas)
    const tie = Math.round(bottom * 0.62)
    for (let y = 0; y < bottom; y++) {
      const pinch = y < tie ? 1 - (y / tie) * 0.45 : 0.55 + ((y - tie) / Math.max(1, bottom - tie)) * 0.45
      const sway = Math.sin(frame * 0.03 + y * 0.18) * 0.25 * (y / bottom)
      const span = Math.max(1.5, width * pinch + sway)
      const x0 = isRight ? edge - span : edge
      canvas.block(x0, y, span, 1, tone(Office.CURTAIN))
      for (let k = 1; k <= 2; k++) {
        const fold = isRight ? edge - span * (k / 3) : edge + span * (k / 3)
        canvas.block(Math.round(fold * 2) / 2, y, 0.5, 1, tone(Office.CURTAIN_DARK))
      }
      const lit = isRight ? x0 : x0 + span - 0.5
      canvas.block(Math.round(lit * 2) / 2, y, 0.5, 1, tone(Office.CURTAIN_LIGHT))
    }
    canvas.block(isRight ? edge - width * 0.55 - 0.5 : edge, tie, width * 0.55 + 0.5, 1, tone(Office.BRASS))
  }

  private static plant(canvas: Canvas, x: number, floorY: number, tone: (c: Rgb) => Rgb, frame: number): void {
    canvas.block(x - 3, floorY - 5, 6, 1, tone(Office.POT_DARK))
    canvas.block(x - 2.5, floorY - 4, 5, 4, tone(Office.POT))
    canvas.block(x + 1.5, floorY - 4, 1, 4, tone(Office.POT_DARK))
    canvas.block(x - 2.5, floorY - 4, 0.5, 4, tone(Canvas.mix(Office.POT, [255, 220, 190], 0.35)))
    const leaves: readonly [number, number, number][] = [
      [-4.5, -12, -1],
      [-3, -15, -1],
      [-0.5, -17, 0],
      [2, -15, 1],
      [4, -12, 1],
      [-2, -10, -1],
      [2.5, -9, 1],
    ]
    leaves.forEach(([dx, dy, side], i) => {
      const sway = Math.sin(frame * 0.04 + i * 1.7) * 0.5
      const tipX = x + dx + sway
      const tipY = floorY + dy
      const steps = Math.max(3, Math.round(-dy - 5))
      for (let s = 0; s <= steps; s++) {
        const t = s / steps
        const px = Math.round((x + (tipX - x) * t) * 2) / 2
        const py = Math.round(floorY - 5 + (tipY - (floorY - 5)) * t)
        canvas.block(px, py, 0.5, 1, tone(Office.LEAF_DARK))
      }
      const base = Math.round(tipX * 2) / 2
      const dir = side < 0 ? -1 : 1
      const out = (n: number): number => (dir < 0 ? base - n : base)
      canvas.block(out(3), tipY, 3, 1, tone(Office.LEAF))
      canvas.block(out(2.5) + (dir < 0 ? 0 : 0.5), tipY - 1, 2, 1, tone(Office.LEAF_LIGHT))
      canvas.block(out(2.5), tipY + 1, 2.5, 1, tone(Office.LEAF_DARK))
      canvas.block(dir < 0 ? base - 3.5 : base + 3, tipY, 0.5, 1, tone(Office.LEAF_LIGHT))
    })
  }

  private static cabinet(canvas: Canvas, x: number, floorY: number, tone: (c: Rgb) => Rgb): void {
    const w = 9
    const h = 11
    const left = Math.round((x - w / 2) * 2) / 2
    const top = floorY - h
    canvas.block(left, top, w, h, tone(Office.WOOD))
    canvas.block(left, top, w, 1, tone(Office.WOOD_EDGE))
    canvas.block(left + w - 0.5, top + 1, 0.5, h - 1, tone(Office.WOOD_DARK))
    canvas.block(left + 0.5, top + 5, w - 1, 1, tone(Office.WOOD_DARK))
    let bx = left + 1
    Office.BOOKS.forEach((c, i) => {
      const bh = 3 + (i % 2)
      canvas.block(bx, top + 5 - bh, 1, bh, tone(c))
      canvas.block(bx, top + 5 - bh, 0.5, bh, tone(Canvas.mix(c, [255, 255, 255], 0.3)))
      bx += 1.5
    })
    canvas.block(bx + 0.5, top + 2, 0.5, 3, tone(Office.BOOKS[0] ?? Office.METAL))
    canvas.block(left + 0.5, top + 6, w - 1, h - 6, tone(Office.METAL))
    canvas.block(left + 0.5, top + 6, w - 1, 1, tone(Office.METAL_LIGHT))
    canvas.block(left + 0.5, top + 8 + Math.floor((h - 8) / 2), w - 1, 0.5, tone(Office.METAL_DARK))
    canvas.block(left + w / 2 - 1, top + 7.5, 2, 0.5, tone(Office.METAL_LIGHT))
    canvas.block(left + w / 2 - 1, floorY - 2, 2, 0.5, tone(Office.METAL_LIGHT))
    canvas.block(left + 1, top - 1, 2, 1, tone(Office.ACCENT))
    canvas.block(left + 1.5, top - 2, 1, 1, tone(Office.LEAF))
  }

  private static lamp(canvas: Canvas, x: number, deskY: number, tone: (c: Rgb) => Rgb, isOn: boolean): void {
    canvas.block(x - 1.5, deskY - 1, 3, 1, tone(Office.BRASS))
    canvas.block(x - 0.5, deskY - 5, 0.5, 4, tone(Office.BRASS))
    canvas.block(x, deskY - 6, 0.5, 1, tone(Office.BRASS))
    canvas.block(x + 0.5, deskY - 7, 0.5, 1, tone(Office.BRASS))
    canvas.block(x + 0.5, deskY - 8, 3, 1, tone(Office.SHADE))
    canvas.block(x, deskY - 7, 4.5, 1, tone(Office.SHADE))
    canvas.block(x + 0.5, deskY - 8, 1, 1, tone(Canvas.mix(Office.SHADE, [255, 255, 255], 0.35)))
    canvas.block(x + 1, deskY - 6, 2.5, 1, isOn ? Office.LAMP_LIGHT : tone(Office.WOOD_DARK))
  }

  private static laptop(canvas: Canvas, x: number, deskY: number, tone: (c: Rgb) => Rgb, frame: number): void {
    canvas.block(x, deskY - 5, 5, 4, tone(Office.METAL_DARK))
    canvas.block(x, deskY - 5, 5, 1, tone(Office.METAL))
    canvas.block(x + 4.5, deskY - 4, 0.5, 3, tone(Canvas.scale(Office.METAL_DARK, 0.75)))
    canvas.block(x - 0.5, deskY - 1, 6, 1, tone(Office.METAL_LIGHT))
    const pulse = 0.65 + 0.35 * Math.sin(frame * 0.06)
    canvas.block(x + 2, deskY - 3.5, 1, 1, Office.ACCENT, pulse)
  }

  private static rug(canvas: Canvas, room: Room, tone: (c: Rgb) => Rgb): void {
    const { deskLeft, deskRight, floorY } = room
    const left = deskLeft - 2
    const width = deskRight - deskLeft + 4
    const top = floorY + 1
    const rows = Math.max(2, Math.min(4, canvas.height - top - 1))
    canvas.block(left, top, width, rows, tone(Office.CURTAIN_DARK))
    canvas.block(left + 1, top, width - 2, 1, tone(Office.CURTAIN))
    for (let x = left + 2; x < left + width - 2; x += 2) canvas.block(x, top + 1, 1, Math.max(1, rows - 2), tone(Office.CURTAIN), 0.55)
    for (let x = left; x < left + width; x += 1) canvas.block(x, top + rows, 0.5, 1, tone(Office.SILL), 0.8)
  }

  private static papers(canvas: Canvas, x: number, deskY: number, tone: (c: Rgb) => Rgb): void {
    canvas.block(x, deskY - 1, 4, 1, tone(Office.PAPER_SHADE))
    canvas.block(x + 0.5, deskY - 2, 4, 1, tone(Office.PAPER))
    canvas.block(x + 1, deskY - 2, 2, 0.5, tone(Office.PAPER_SHADE))
  }

  private static mug(canvas: Canvas, x: number, deskY: number, tone: (c: Rgb) => Rgb, frame: number): void {
    canvas.block(x - 1, deskY - 3, 2.5, 3, tone(Office.MUG))
    canvas.block(x + 1, deskY - 3, 0.5, 3, tone(Office.MUG_SHADE))
    canvas.block(x - 1, deskY - 2, 2.5, 1, tone(Office.ACCENT))
    canvas.block(x + 1.5, deskY - 2.5, 0.5, 2, tone(Office.MUG_SHADE))
    for (let i = 0; i < 2; i++) {
      const t = ((frame * 0.03 + i * 0.5) % 1 + 1) % 1
      const sx = x - 0.5 + i + Math.sin(frame * 0.08 + i * 2) * 0.5
      canvas.block(Math.round(sx * 2) / 2, Math.round(deskY - 4 - t * 4), 0.5, 1, Office.MUG, 0.45 * (1 - t))
    }
  }
}
