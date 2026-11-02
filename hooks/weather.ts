import type { FlowEvent } from '../types'
import { Canvas, type Point, type Rgb } from './canvas'
import { Raster } from './sprite'

export type Weather = { isRaining: boolean; clearing: number }

export class WeatherFx {
  static readonly CLEAR_MS = 2200
  private static readonly WHITE: Rgb = [255, 255, 255]
  private static readonly TEAL: Rgb = [0, 170, 152]
  private static readonly TEAL_LIGHT: Rgb = [110, 255, 232]
  private static readonly TEAL_DARK: Rgb = [0, 96, 88]
  private static readonly RAIN: Rgb = [150, 200, 255]
  private static readonly WOOD: Rgb = [120, 76, 44]
  private static readonly RAINBOW: readonly Rgb[] = [
    [255, 72, 72],
    [255, 160, 50],
    [255, 230, 70],
    [80, 210, 110],
    [70, 150, 255],
    [150, 100, 240],
  ]

  static weather(events: readonly FlowEvent[], at: number): Weather {
    let last: FlowEvent | undefined
    let previous: FlowEvent | undefined
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i]
      if (!e || e.at > at || e.kind !== 'verif' || WeatherFx.outcome(e) === undefined) continue
      if (!last) last = e
      else {
        previous = e
        break
      }
    }
    if (!last) return { isRaining: false, clearing: -1 }
    if (WeatherFx.outcome(last) === false) return { isRaining: true, clearing: -1 }
    const age = at - last.at
    if (previous && WeatherFx.outcome(previous) === false && age < WeatherFx.CLEAR_MS) return { isRaining: false, clearing: age / WeatherFx.CLEAR_MS }
    return { isRaining: false, clearing: -1 }
  }

  static isAnimated(events: readonly FlowEvent[], at: number): boolean {
    const weather = WeatherFx.weather(events, at)
    return weather.isRaining || weather.clearing >= 0
  }

  static rain(canvas: Canvas, center: Point, half: Point, frame: number, canopy: { left: number; right: number; top: number } | undefined): void {
    const spread = Math.max(half.x * 2.2, 18)
    const drops = Math.round(spread * 1.6)
    const height = canvas.height
    for (let i = 0; i < drops; i++) {
      const x = Math.round((center.x - spread + Canvas.hash(i, 3.1) * spread * 2) * 2) / 2
      const speed = 0.9 + Canvas.hash(i, 7.7) * 0.6
      const y = Math.round(((frame * speed + Canvas.hash(i, 1.3) * height) % (height + 4)) - 4)
      if (canopy && x >= canopy.left && x <= canopy.right && y + 2 >= canopy.top) continue
      canvas.block(x, y, 0.5, 2, WeatherFx.RAIN, 0.75)
    }
    if (!canopy) return
    for (const edge of [canopy.left, canopy.right]) {
      const fall = Math.round((frame * 0.8) % 8)
      canvas.block(Math.round(edge * 2) / 2, canopy.top + 7 + fall, 0.5, 1, WeatherFx.RAIN, 0.8)
    }
  }

  static umbrella(canvas: Canvas, cx: number, top: number, open: number, frame: number): { left: number; right: number; top: number } {
    const r = new Raster(-30, -4, 60, 44)
    const k = Math.max(0, Math.min(1, open))
    const width = Math.round(6 + 46 * k)
    const rows = 5
    for (let j = 0; j < rows; j++) {
      const half = Math.max(1, Math.round((width / 2) * Math.sqrt((j + 1.4) / (rows + 0.4))))
      for (let i = -half; i < half; i++) {
        if (j === rows - 1 && k > 0.6 && ((i + half) % 9 === 7 || (i + half) % 9 === 8)) continue
        const band = Math.floor((i + half) / 7) % 2 === 0
        r.dot(i, j, j === 1 && i > -half + 2 && i < -half + 7 ? WeatherFx.TEAL_LIGHT : band ? WeatherFx.TEAL : WeatherFx.WHITE)
      }
    }
    r.rect(-1, -3, 2, 3, WeatherFx.TEAL_DARK)
    const handle: Point = { x: 13, y: 33 }
    r.line(0, rows, handle.x, handle.y, WeatherFx.WOOD)
    r.line(1, rows, handle.x + 1, handle.y, WeatherFx.WOOD)
    r.dot(handle.x + 2, handle.y + 1, WeatherFx.WOOD)
    r.dot(handle.x + 1, handle.y + 2, WeatherFx.WOOD)
    r.dot(handle.x, handle.y + 1, WeatherFx.WOOD)
    r.outline()
    const sway = k >= 1 ? Math.round(Math.sin(frame * 0.08)) * 0.5 : 0
    const y = top - 12
    r.blit(canvas, cx + 2 + sway, y, 1)
    const span = (width / 2) * 0.5
    return { left: cx + 2 + sway - span, right: cx + 2 + sway + span, top: y }
  }

  static rainbow(canvas: Canvas, cx: number, top: number, t: number): void {
    const fade = Math.sin(Math.PI * Math.max(0, Math.min(1, t)))
    if (fade <= 0.02) return
    WeatherFx.RAINBOW.forEach((c, k) => {
      const rx = 18 - k * 0.5
      const ry = 9 - k
      for (let a = 0; a <= 60; a++) {
        const ang = Math.PI * (a / 60)
        canvas.block(Math.round((cx + Math.cos(ang) * rx) * 2) / 2, Math.round(top + 2 - Math.sin(ang) * ry), 0.5, 1, c, 0.7 * fade)
      }
    })
  }

  private static outcome(e: FlowEvent): boolean | undefined {
    if (/fail/i.test(e.label)) return false
    if (/\bOK\b|completed|done/.test(e.label)) return true
    return undefined
  }
}
