import type { FlowEvent } from '../types'
import { Canvas, type Rgb } from './canvas'
import type { Pane } from './effects'

export type Weather = { isRaining: boolean; clearing: number }

export class WeatherFx {
  static readonly CLEAR_MS = 2200
  private static readonly WHITE: Rgb = [255, 255, 255]
  private static readonly RAIN: Rgb = [150, 200, 255]
  private static readonly STORM: Rgb = [92, 104, 124]
  private static readonly GLASS_DROP: Rgb = [214, 232, 252]
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

  static glass(canvas: Canvas, pane: Pane, frame: number, weather: Weather): void {
    const wet = weather.isRaining ? 1 : weather.clearing >= 0 ? 1 - weather.clearing : 0
    if (wet <= 0.02) return
    const left = Math.round(pane.left * 2) / 2
    const top = Math.round(pane.top)
    const width = Math.round((pane.right - left) * 2) / 2
    const height = Math.round(pane.bottom) - top
    if (width <= 0 || height <= 0) return
    canvas.block(left, top, width, height, WeatherFx.STORM, 0.42 * wet)
    canvas.block(left, top, width, Math.max(1, Math.round(height * 0.4)), WeatherFx.STORM, 0.2 * wet)
    const columns = Math.max(3, Math.round(width * 0.6))
    for (let i = 0; i < columns; i++) {
      const x = left + Math.floor(Canvas.hash(i, 3.1) * width * 2) / 2
      const speed = 0.35 + Canvas.hash(i, 7.7) * 0.5
      const cycle = height + 8
      const head = Math.floor((frame * speed + Canvas.hash(i, 1.3) * cycle) % cycle) - 4
      const length = 2 + Math.floor(Canvas.hash(i, 5.5) * 3)
      for (let k = 0; k < length; k++) {
        const y = top + head - k
        if (y < top || y >= top + height) continue
        canvas.block(x, y, 0.5, 1, k === 0 ? WeatherFx.GLASS_DROP : WeatherFx.RAIN, (k === 0 ? 0.9 : 0.5 - k * 0.1) * wet)
      }
    }
    const beads = Math.max(4, Math.round(width * height * 0.04))
    for (let i = 0; i < beads; i++) {
      const x = left + Math.floor(Canvas.hash(i, 9.3) * width * 2) / 2
      const y = top + Math.floor(Canvas.hash(i, 4.7) * height)
      const blink = Math.sin(frame * 0.04 + i * 2.7) > 0.8
      canvas.block(x, y, 0.5, 1, blink ? WeatherFx.WHITE : WeatherFx.GLASS_DROP, (blink ? 0.7 : 0.45) * wet)
      if (Canvas.hash(i, 6.1) > 0.6) canvas.block(x, y + 1, 0.5, 1, WeatherFx.RAIN, 0.3 * wet)
    }
  }

  static rainbow(canvas: Canvas, cx: number, top: number, t: number, pane?: Pane): void {
    const fade = Math.sin(Math.PI * Math.max(0, Math.min(1, t)))
    if (fade <= 0.02) return
    const mid = pane ? (pane.left + pane.right) / 2 : cx
    const base = pane ? pane.bottom - 1 : top + 2
    const rx0 = pane ? Math.max(4, (pane.right - pane.left) / 2 - 1.5) : 18
    const ry0 = pane ? Math.max(3, Math.min(pane.bottom - pane.top - 2, rx0 * 0.5)) : 9
    const steps = pane ? Math.round(rx0 * 5) : 60
    WeatherFx.RAINBOW.forEach((c, k) => {
      const rx = rx0 - k * 0.5
      const ry = ry0 - k
      for (let a = 0; a <= steps; a++) {
        const ang = Math.PI * (a / steps)
        const y = Math.round(base - Math.sin(ang) * ry)
        if (pane && (y < pane.top || y >= pane.bottom)) continue
        canvas.block(Math.round((mid + Math.cos(ang) * rx) * 2) / 2, y, 0.5, 1, c, 0.7 * fade)
      }
    })
  }

  private static outcome(e: FlowEvent): boolean | undefined {
    if (/fail/i.test(e.label)) return false
    if (/\bOK\b|completed|done/.test(e.label)) return true
    return undefined
  }
}
