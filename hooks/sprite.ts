import { Canvas, type Rgb } from './canvas'

export type Palette = Readonly<Record<string, Rgb>>

export type Tint = 'none' | 'failed' | 'killed'

export type Cue = { kind: string; t: number }

export class Motion {
  static ease(u: number): number {
    const v = Math.max(0, Math.min(1, u))
    return v * v * (3 - 2 * v)
  }

  static envelope(t: number): number {
    if (!(t > 0 && t < 1)) return 0
    return Motion.ease(t / 0.18) * Motion.ease((1 - t) / 0.22)
  }

  static schedule(frame: number, period: number, length: number, seed: number, pool: readonly string[]): Cue | null {
    const slot = Math.floor(frame / period)
    if (slot < 1) return null
    const start = slot * period + Canvas.hash(slot * 1.37 + seed * 7.1, seed * 3.3 + 0.71) * (period / 3)
    const t = (frame - start) / length
    if (!(t > 0 && t < 1)) return null
    const kind = pool[Math.floor(Canvas.hash(slot * 2.71 + seed * 5.3, seed + 0.19) * pool.length)]
    return kind ? { kind, t } : null
  }
}

export class Sprite {
  readonly width: number
  readonly height: number

  private constructor(readonly rows: readonly string[]) {
    this.width = rows.reduce((w, r) => Math.max(w, r.length), 0)
    this.height = rows.length
  }

  static of(rows: readonly string[]): Sprite {
    return new Sprite(rows)
  }

  static symmetric(halves: readonly string[]): Sprite {
    return new Sprite(halves.map(h => h + h.split('').reverse().join('')))
  }

  mirrored(): Sprite {
    return new Sprite(this.rows.map(r => r.padEnd(this.width, '.').split('').reverse().join('')))
  }
}

export class Raster {
  static readonly KO: Rgb = [255, 85, 115]
  private static readonly INK: Rgb = [12, 15, 30]

  private readonly rgb: Float32Array
  private readonly alpha: Float32Array

  constructor(
    readonly left: number,
    readonly top: number,
    readonly width: number,
    readonly height: number,
  ) {
    this.rgb = new Float32Array(width * height * 3)
    this.alpha = new Float32Array(width * height)
  }

  static tinted(c: Rgb, tint: Tint): Rgb {
    if (tint === 'killed') {
      const l = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]
      return [30 + l * 0.34, 34 + l * 0.34, 48 + l * 0.36]
    }
    if (tint === 'failed') return Canvas.mix(c, Raster.KO, 0.32)
    return c
  }

  static paint(canvas: Canvas, sprite: Sprite, palette: Palette, cx: number, cy: number, scale = 1, alpha = 1, outlined = true): void {
    const x0 = -Math.floor(sprite.width / 2)
    const y0 = -Math.floor(sprite.height / 2)
    const r = new Raster(x0 - 1, y0 - 1, sprite.width + 2, sprite.height + 2)
    r.stamp(sprite, palette, x0, y0)
    if (outlined) r.outline()
    r.blit(canvas, cx, cy, scale, 'none', alpha)
  }

  static factor(scale: number): number {
    return scale < 0.85 ? scale : Math.max(1, Math.round(scale))
  }

  dot(x: number, y: number, c: Rgb, a = 1): void {
    const i = Math.round(x) - this.left
    const j = Math.round(y) - this.top
    if (a <= 0 || i < 0 || j < 0 || i >= this.width || j >= this.height) return
    const k = j * this.width + i
    const v = Math.min(1, a)
    const keep = 1 - v
    this.rgb[k * 3] = (this.rgb[k * 3] ?? 0) * keep + c[0] * v
    this.rgb[k * 3 + 1] = (this.rgb[k * 3 + 1] ?? 0) * keep + c[1] * v
    this.rgb[k * 3 + 2] = (this.rgb[k * 3 + 2] ?? 0) * keep + c[2] * v
    this.alpha[k] = (this.alpha[k] ?? 0) * keep + v
  }

  rect(x: number, y: number, w: number, h: number, c: Rgb, a = 1): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.dot(x + i, y + j, c, a)
  }

  line(x0: number, y0: number, x1: number, y1: number, c: Rgb, a = 1): void {
    const n = Math.max(Math.abs(Math.round(x1) - Math.round(x0)), Math.abs(Math.round(y1) - Math.round(y0)), 1)
    for (let i = 0; i <= n; i++) this.dot(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c, a)
  }

  oval(cx: number, cy: number, rx: number, ry: number, c: Rgb, a = 1): void {
    for (let j = Math.floor(cy - ry); j <= Math.ceil(cy + ry); j++) {
      const d = (j - cy) / Math.max(0.5, ry)
      if (Math.abs(d) > 1) continue
      const half = rx * Math.sqrt(1 - d * d)
      for (let i = Math.round(cx - half); i <= Math.round(cx + half); i++) this.dot(i, j, c, a)
    }
  }

  stamp(sprite: Sprite, palette: Palette, x: number, y: number, a = 1): void {
    const ox = Math.round(x)
    const oy = Math.round(y)
    sprite.rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const c = palette[row[i] ?? '.']
        if (c) this.dot(ox + i, oy + j, c, a)
      }
    })
  }

  has(x: number, y: number): boolean {
    const i = x - this.left
    const j = y - this.top
    if (i < 0 || j < 0 || i >= this.width || j >= this.height) return false
    return (this.alpha[j * this.width + i] ?? 0) > 0.5
  }

  layer(): Raster {
    return new Raster(this.left, this.top, this.width, this.height)
  }

  merge(other: Raster): void {
    for (let j = 0; j < other.height; j++) {
      for (let i = 0; i < other.width; i++) {
        const k = j * other.width + i
        const a = other.alpha[k] ?? 0
        if (a <= 0.02) continue
        this.dot(i + other.left, j + other.top, [(other.rgb[k * 3] ?? 0) / a, (other.rgb[k * 3 + 1] ?? 0) / a, (other.rgb[k * 3 + 2] ?? 0) / a], a)
      }
    }
  }

  outline(strength = 0.78): void {
    const marks: [number, number, Rgb][] = []
    for (let j = 0; j < this.height; j++) {
      for (let i = 0; i < this.width; i++) {
        if ((this.alpha[j * this.width + i] ?? 0) > 0.5) continue
        const x = i + this.left
        const y = j + this.top
        const near = [
          [x - 1, y],
          [x + 1, y],
          [x, y - 1],
          [x, y + 1],
        ].find(([u, v]) => this.has(u ?? 0, v ?? 0))
        if (!near) continue
        const k = ((near[1] ?? 0) - this.top) * this.width + ((near[0] ?? 0) - this.left)
        const c: Rgb = [this.rgb[k * 3] ?? 0, this.rgb[k * 3 + 1] ?? 0, this.rgb[k * 3 + 2] ?? 0]
        marks.push([x, y, Canvas.mix(c, Raster.INK, strength)])
      }
    }
    for (const [x, y, c] of marks) this.dot(x, y, c)
  }

  blit(canvas: Canvas, cx: number, cy: number, scale: number, tint: Tint = 'none', alpha = 1): void {
    const f = Raster.factor(scale)
    const ox = Math.round(cx * 2) / 2
    const oy = Math.round(cy)
    const i0 = Math.floor(this.left * f)
    const i1 = Math.ceil((this.left + this.width) * f)
    const j0 = Math.floor(this.top * f)
    const j1 = Math.ceil((this.top + this.height) * f)
    for (let dj = j0; dj < j1; dj++) {
      for (let di = i0; di < i1; di++) {
        const k = f < 1 ? this.salient(di, dj, f) : this.index(Math.floor(di / f), Math.floor(dj / f))
        if (k < 0) continue
        const a = this.alpha[k] ?? 0
        if (a <= 0.02) continue
        const c: Rgb = [(this.rgb[k * 3] ?? 0) / a, (this.rgb[k * 3 + 1] ?? 0) / a, (this.rgb[k * 3 + 2] ?? 0) / a]
        canvas.block(ox + di * 0.5, oy + dj, 0.5, 1, Raster.tinted(c, tint), Math.min(1, a) * alpha)
      }
    }
  }

  private index(x: number, y: number): number {
    const i = x - this.left
    const j = y - this.top
    if (i < 0 || j < 0 || i >= this.width || j >= this.height) return -1
    return j * this.width + i
  }

  private salient(di: number, dj: number, f: number): number {
    const x0 = Math.floor(di / f)
    const x1 = Math.max(x0 + 1, Math.floor((di + 1) / f))
    const y0 = Math.floor(dj / f)
    const y1 = Math.max(y0 + 1, Math.floor((dj + 1) / f))
    const picks: number[] = []
    let r = 0
    let g = 0
    let b = 0
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const k = this.index(x, y)
        if (k < 0 || (this.alpha[k] ?? 0) <= 0.5) continue
        picks.push(k)
        r += this.rgb[k * 3] ?? 0
        g += this.rgb[k * 3 + 1] ?? 0
        b += this.rgb[k * 3 + 2] ?? 0
      }
    }
    if (picks.length * 2 < (x1 - x0) * (y1 - y0)) return -1
    r /= picks.length
    g /= picks.length
    b /= picks.length
    let best = picks[0] ?? -1
    let far = 0
    for (const k of picks) {
      const d = Math.abs((this.rgb[k * 3] ?? 0) - r) + Math.abs((this.rgb[k * 3 + 1] ?? 0) - g) + Math.abs((this.rgb[k * 3 + 2] ?? 0) - b)
      if (d > far) {
        far = d
        best = k
      }
    }
    return far > 60 ? best : (picks[Math.floor(picks.length / 2)] ?? -1)
  }
}
