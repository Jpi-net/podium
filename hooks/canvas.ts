import { Font } from './font'

export type Rgb = readonly [number, number, number]

export type Point = { x: number; y: number }

export type RenderMode = 'half' | 'quad' | 'hd'

export type Encoded = { kind: 'cells'; cells: string } | { kind: 'rgba'; rgba: string; width: number; height: number }

class Base64 {
  private static readonly ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

  static encode(bytes: Uint8Array): string {
    const native = (bytes as Uint8Array & { toBase64?: () => string }).toBase64
    if (typeof native === 'function') return native.call(bytes)
    const length = bytes.length
    const outLength = Math.ceil(length / 3) * 4
    const out = new Uint8Array(outLength)
    const table = new Uint8Array(64)
    for (let k = 0; k < 64; k++) table[k] = Base64.ALPHABET.charCodeAt(k)
    let o = 0
    let i = 0
    for (; i + 2 < length; i += 3) {
      const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
      out[o++] = table[(n >> 18) & 63] ?? 0
      out[o++] = table[(n >> 12) & 63] ?? 0
      out[o++] = table[(n >> 6) & 63] ?? 0
      out[o++] = table[n & 63] ?? 0
    }
    const rest = length - i
    if (rest > 0) {
      const n = ((bytes[i] ?? 0) << 16) | ((rest === 2 ? (bytes[i + 1] ?? 0) : 0) << 8)
      out[o++] = table[(n >> 18) & 63] ?? 0
      out[o++] = table[(n >> 12) & 63] ?? 0
      out[o++] = rest === 2 ? (table[(n >> 6) & 63] ?? 0) : 61
      out[o++] = 61
    }
    let result = ''
    const chunk = 8192
    for (let s = 0; s < outLength; s += chunk) {
      result += String.fromCharCode.apply(null, Array.from(out.subarray(s, Math.min(outLength, s + chunk))))
    }
    return result
  }
}

export class Canvas {
  static readonly HD_CELL_WIDTH = 6
  static readonly HD_CELL_HEIGHT = 12

  private static readonly CIRCLE = 0
  private static readonly RING = 1
  private static readonly ELLIPSE = 2
  private static readonly ROUND_BOX = 3
  private static readonly ROUND_BOX_OUTLINE = 4
  private static readonly TRIANGLE = 5
  private static readonly ARC = 6
  private static readonly TWO_PI = Math.PI * 2
  private static readonly FAR = 1e9
  private static readonly QUAD_GLYPHS: readonly number[] = [
    0x20, 0x2598, 0x259d, 0x2580, 0x2596, 0x258c, 0x259e, 0x259b, 0x2597, 0x259a, 0x2590, 0x259c, 0x2584, 0x2599, 0x259f, 0x2588,
  ]
  private static readonly UNIFORM_ERROR = 10

  readonly width: number
  readonly height: number

  private readonly pw: number
  private readonly ph: number
  private readonly sx: number
  private readonly sy: number
  private readonly aa: number
  private readonly buf: Float32Array
  private readonly scratch: Float32Array
  private readonly params = new Float64Array(16)
  private readonly sub = new Float64Array(12)
  private readonly textCode: Uint32Array
  private readonly textFg: Uint32Array
  private readonly textBg: Int32Array
  private bx0 = 0
  private by0 = 0
  private bx1 = -1
  private by1 = -1

  constructor(
    readonly columns: number,
    readonly rows: number,
    readonly mode: RenderMode,
  ) {
    this.width = columns
    this.height = rows * 2
    const cellW = mode === 'hd' ? Canvas.HD_CELL_WIDTH : mode === 'quad' ? 2 : 1
    const cellH = mode === 'hd' ? Canvas.HD_CELL_HEIGHT : 2
    this.pw = columns * cellW
    this.ph = rows * cellH
    this.sx = this.pw / this.width
    this.sy = this.ph / this.height
    this.aa = (1 / this.sx + 1 / this.sy) / 2
    this.buf = new Float32Array(this.pw * this.ph * 3)
    this.scratch = new Float32Array(this.pw * this.ph)
    const cells = mode === 'hd' ? 0 : columns * rows
    this.textCode = new Uint32Array(cells)
    this.textFg = new Uint32Array(cells)
    this.textBg = new Int32Array(cells).fill(-1)
  }

  static mix(a: Rgb, b: Rgb, t: number): Rgb {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
  }

  static scale(c: Rgb, k: number): Rgb {
    return [c[0] * k, c[1] * k, c[2] * k]
  }

  static hex(c: Rgb): string {
    const part = (v: number): string =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, '0')
    return `#${part(c[0])}${part(c[1])}${part(c[2])}`
  }

  static hash(x: number, y: number): number {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
    return s - Math.floor(s)
  }

  static bezier(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
    const u = 1 - t
    const a = u * u * u
    const b = 3 * u * u * t
    const c = 3 * u * t * t
    const d = t * t * t
    return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y }
  }

  private static byte(v: number): number {
    return v <= 0 ? 0 : v >= 255 ? 255 : (v + 0.5) | 0
  }

  private static pack(r: number, g: number, b: number): number {
    return ((Canvas.byte(r) << 16) | (Canvas.byte(g) << 8) | Canvas.byte(b)) >>> 0
  }

  private static segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const vx = bx - ax
    const vy = by - ay
    const wx = px - ax
    const wy = py - ay
    const len2 = vx * vx + vy * vy
    let t = len2 > 0 ? (wx * vx + wy * vy) / len2 : 0
    t = t < 0 ? 0 : t > 1 ? 1 : t
    const dx = wx - vx * t
    const dy = wy - vy * t
    return Math.sqrt(dx * dx + dy * dy)
  }

  paint(shader: (x: number, y: number) => Rgb): void {
    const { pw, ph, sx, sy, buf } = this
    let k = 0
    for (let j = 0; j < ph; j++) {
      const y = (j + 0.5) / sy
      for (let i = 0; i < pw; i++) {
        const c = shader((i + 0.5) / sx, y)
        buf[k++] = c[0]
        buf[k++] = c[1]
        buf[k++] = c[2]
      }
    }
  }

  plot(x: number, y: number, c: Rgb, alpha: number): void {
    if (this.sx > 2 || this.sy > 2) {
      this.glow(x, y, 0.55, c, alpha)
      return
    }
    const { pw, ph, buf } = this
    const fx = x * this.sx - 0.5
    const fy = y * this.sy - 0.5
    const ix = Math.floor(fx)
    const iy = Math.floor(fy)
    const tx = fx - ix
    const ty = fy - iy
    for (let dj = 0; dj < 2; dj++) {
      const j = iy + dj
      if (j < 0 || j >= ph) continue
      for (let di = 0; di < 2; di++) {
        const i = ix + di
        if (i < 0 || i >= pw) continue
        const w = (di === 0 ? 1 - tx : tx) * (dj === 0 ? 1 - ty : ty) * alpha
        const k = (j * pw + i) * 3
        buf[k] = (buf[k] ?? 0) + c[0] * w
        buf[k + 1] = (buf[k + 1] ?? 0) + c[1] * w
        buf[k + 2] = (buf[k + 2] ?? 0) + c[2] * w
      }
    }
  }

  glow(cx: number, cy: number, radius: number, c: Rgb, alpha: number): void {
    if (radius <= 0) return
    const { pw, ph, sx, sy, buf } = this
    const i0 = Math.max(0, Math.floor((cx - radius) * sx))
    const i1 = Math.min(pw - 1, Math.ceil((cx + radius) * sx))
    const j0 = Math.max(0, Math.floor((cy - radius) * sy))
    const j1 = Math.min(ph - 1, Math.ceil((cy + radius) * sy))
    const r2 = radius * radius
    for (let j = j0; j <= j1; j++) {
      const dy = (j + 0.5) / sy - cy
      for (let i = i0; i <= i1; i++) {
        const dx = (i + 0.5) / sx - cx
        const d2 = dx * dx + dy * dy
        if (d2 >= r2) continue
        const t = 1 - Math.sqrt(d2) / radius
        const w = t * t * alpha
        const k = (j * pw + i) * 3
        buf[k] = (buf[k] ?? 0) + c[0] * w
        buf[k + 1] = (buf[k + 1] ?? 0) + c[1] * w
        buf[k + 2] = (buf[k + 2] ?? 0) + c[2] * w
      }
    }
  }

  fillCircle(cx: number, cy: number, r: number, c: Rgb, alpha = 1): void {
    const p = this.params
    p[0] = cx
    p[1] = cy
    p[2] = r
    this.raster(Canvas.CIRCLE, cx - r, cy - r, cx + r, cy + r, c, alpha)
  }

  strokeCircle(cx: number, cy: number, r: number, width: number, c: Rgb, alpha = 1): void {
    const p = this.params
    p[0] = cx
    p[1] = cy
    p[2] = r
    p[3] = width / 2
    const e = r + width / 2
    this.raster(Canvas.RING, cx - e, cy - e, cx + e, cy + e, c, alpha)
  }

  fillEllipse(cx: number, cy: number, rx: number, ry: number, c: Rgb, alpha = 1): void {
    if (rx <= 0 || ry <= 0) return
    const p = this.params
    p[0] = cx
    p[1] = cy
    p[2] = rx
    p[3] = ry
    this.raster(Canvas.ELLIPSE, cx - rx, cy - ry, cx + rx, cy + ry, c, alpha)
  }

  fillRect(x: number, y: number, w: number, h: number, c: Rgb, alpha = 1): void {
    this.fillRoundRect(x, y, w, h, 0, c, alpha)
  }

  block(x: number, y: number, w: number, h: number, c: Rgb, alpha = 1): void {
    const { pw, ph, sx, sy, buf } = this
    const u0 = Math.round(x * sx)
    const v0 = Math.round(y * sy)
    const i0 = Math.max(0, u0)
    const i1 = Math.min(pw, Math.max(u0 + 1, Math.round((x + w) * sx)))
    const j0 = Math.max(0, v0)
    const j1 = Math.min(ph, Math.max(v0 + 1, Math.round((y + h) * sy)))
    const a = alpha >= 1 ? 1 : alpha <= 0 ? 0 : alpha
    if (a === 0 || i1 <= i0 || j1 <= j0) return
    const keep = 1 - a
    for (let j = j0; j < j1; j++) {
      for (let i = i0; i < i1; i++) {
        const k = (j * pw + i) * 3
        buf[k] = (buf[k] ?? 0) * keep + c[0] * a
        buf[k + 1] = (buf[k + 1] ?? 0) * keep + c[1] * a
        buf[k + 2] = (buf[k + 2] ?? 0) * keep + c[2] * a
      }
    }
  }

  fillRoundRect(x: number, y: number, w: number, h: number, radius: number, c: Rgb, alpha = 1): void {
    this.setBox(x, y, w, h, radius)
    this.raster(Canvas.ROUND_BOX, x, y, x + w, y + h, c, alpha)
  }

  strokeRoundRect(x: number, y: number, w: number, h: number, radius: number, width: number, c: Rgb, alpha = 1): void {
    this.setBox(x, y, w, h, radius)
    this.params[5] = width / 2
    const e = width / 2
    this.raster(Canvas.ROUND_BOX_OUTLINE, x - e, y - e, x + w + e, y + h + e, c, alpha)
  }

  fillTriangle(a: Point, b: Point, d: Point, c: Rgb, alpha = 1): void {
    const p = this.params
    p[0] = a.x
    p[1] = a.y
    p[2] = b.x
    p[3] = b.y
    p[4] = d.x
    p[5] = d.y
    this.raster(Canvas.TRIANGLE, Math.min(a.x, b.x, d.x), Math.min(a.y, b.y, d.y), Math.max(a.x, b.x, d.x), Math.max(a.y, b.y, d.y), c, alpha)
  }

  line(a: Point, b: Point, width: number, c: Rgb, alpha = 1): void {
    this.resetScratchBounds()
    this.segment(a.x, a.y, b.x, b.y, width / 2)
    this.flushScratch(c, alpha)
  }

  arc(cx: number, cy: number, r: number, from: number, to: number, width: number, c: Rgb, alpha = 1): void {
    const span = to - from
    const full = span >= Canvas.TWO_PI || span <= -Canvas.TWO_PI
    let sweep = span - Math.floor(span / Canvas.TWO_PI) * Canvas.TWO_PI
    if (full) sweep = Canvas.TWO_PI
    const normalizedFrom = from - Math.floor(from / Canvas.TWO_PI) * Canvas.TWO_PI
    const p = this.params
    p[0] = cx
    p[1] = cy
    p[2] = r
    p[3] = width / 2
    p[4] = normalizedFrom
    p[5] = sweep
    p[6] = cx + Math.cos(normalizedFrom) * r
    p[7] = cy + Math.sin(normalizedFrom) * r
    p[8] = cx + Math.cos(normalizedFrom + sweep) * r
    p[9] = cy + Math.sin(normalizedFrom + sweep) * r
    const e = r + width / 2
    this.raster(Canvas.ARC, cx - e, cy - e, cx + e, cy + e, c, alpha)
  }

  curve(p0: Point, p1: Point, p2: Point, p3: Point, width: number, c: Rgb, alpha = 1): void {
    const polyline =
      Math.hypot(p1.x - p0.x, p1.y - p0.y) + Math.hypot(p2.x - p1.x, p2.y - p1.y) + Math.hypot(p3.x - p2.x, p3.y - p2.y)
    const steps = Math.max(24, Math.min(48, Math.ceil(polyline / 1.5)))
    this.resetScratchBounds()
    let previous = p0
    for (let s = 1; s <= steps; s++) {
      const next = Canvas.bezier(p0, p1, p2, p3, s / steps)
      this.segment(previous.x, previous.y, next.x, next.y, width / 2)
      previous = next
    }
    this.flushScratch(c, alpha)
  }

  text(column: number, row: number, value: string, color: Rgb, background?: Rgb): number {
    let col = Math.floor(column)
    const r = Math.floor(row)
    for (const symbol of Array.from(value)) {
      const code = Font.sanitize(symbol.codePointAt(0) ?? 0x3f)
      if (r >= 0 && r < this.rows && col >= 0 && col < this.columns) {
        if (this.mode === 'hd') this.textCellHd(col, r, code, color, background)
        else {
          const cell = r * this.columns + col
          this.textCode[cell] = code
          this.textFg[cell] = Canvas.pack(color[0], color[1], color[2])
          this.textBg[cell] = background === undefined ? -1 : Canvas.pack(background[0], background[1], background[2])
        }
      }
      col++
    }
    return col
  }

  encode(): Encoded {
    if (this.mode === 'hd') return this.encodeRgba()
    const cells = new Uint32Array(this.columns * this.rows * 3)
    if (this.mode === 'half') this.encodeHalf(cells)
    else this.encodeQuad(cells)
    return { kind: 'cells', cells: Base64.encode(new Uint8Array(cells.buffer)) }
  }

  private setBox(x: number, y: number, w: number, h: number, radius: number): void {
    const p = this.params
    const hx = w / 2
    const hy = h / 2
    p[0] = x + hx
    p[1] = y + hy
    p[2] = hx
    p[3] = hy
    p[4] = Math.max(0, Math.min(radius, hx, hy))
  }

  private distance(kind: number, px: number, py: number): number {
    const p = this.params
    switch (kind) {
      case Canvas.CIRCLE: {
        const dx = px - (p[0] ?? 0)
        const dy = py - (p[1] ?? 0)
        return Math.sqrt(dx * dx + dy * dy) - (p[2] ?? 0)
      }
      case Canvas.RING: {
        const dx = px - (p[0] ?? 0)
        const dy = py - (p[1] ?? 0)
        return Math.abs(Math.sqrt(dx * dx + dy * dy) - (p[2] ?? 0)) - (p[3] ?? 0)
      }
      case Canvas.ELLIPSE: {
        const dx = px - (p[0] ?? 0)
        const dy = py - (p[1] ?? 0)
        const rx = p[2] ?? 1
        const ry = p[3] ?? 1
        const k0 = Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry))
        const k1 = Math.sqrt((dx * dx) / (rx * rx * rx * rx) + (dy * dy) / (ry * ry * ry * ry))
        return k1 < 1e-9 ? -Math.min(rx, ry) : (k0 * (k0 - 1)) / k1
      }
      case Canvas.ROUND_BOX:
      case Canvas.ROUND_BOX_OUTLINE: {
        const radius = p[4] ?? 0
        const qx = Math.abs(px - (p[0] ?? 0)) - (p[2] ?? 0) + radius
        const qy = Math.abs(py - (p[1] ?? 0)) - (p[3] ?? 0) + radius
        const ox = qx > 0 ? qx : 0
        const oy = qy > 0 ? qy : 0
        const inner = qx > qy ? qx : qy
        const d = Math.sqrt(ox * ox + oy * oy) + (inner < 0 ? inner : 0) - radius
        return kind === Canvas.ROUND_BOX ? d : Math.abs(d) - (p[5] ?? 0)
      }
      case Canvas.TRIANGLE: {
        const ax = p[0] ?? 0
        const ay = p[1] ?? 0
        const bx = p[2] ?? 0
        const by = p[3] ?? 0
        const cx = p[4] ?? 0
        const cy = p[5] ?? 0
        const c1 = (bx - ax) * (py - ay) - (by - ay) * (px - ax)
        const c2 = (cx - bx) * (py - by) - (cy - by) * (px - bx)
        const c3 = (ax - cx) * (py - cy) - (ay - cy) * (px - cx)
        const inside = (c1 >= 0 && c2 >= 0 && c3 >= 0) || (c1 <= 0 && c2 <= 0 && c3 <= 0)
        const d = Math.min(
          Canvas.segmentDistance(px, py, ax, ay, bx, by),
          Canvas.segmentDistance(px, py, bx, by, cx, cy),
          Canvas.segmentDistance(px, py, cx, cy, ax, ay),
        )
        return inside ? -d : d
      }
      default: {
        const dx = px - (p[0] ?? 0)
        const dy = py - (p[1] ?? 0)
        const len = Math.sqrt(dx * dx + dy * dy)
        const hw = p[3] ?? 0
        const radial = Math.abs(len - (p[2] ?? 0)) - hw
        if (radial > this.aa) return Canvas.FAR
        const sweep = p[5] ?? 0
        if (sweep >= Canvas.TWO_PI) return radial
        let rel = Math.atan2(dy, dx) - (p[4] ?? 0)
        rel -= Math.floor(rel / Canvas.TWO_PI) * Canvas.TWO_PI
        if (rel <= sweep) return radial
        const e1x = px - (p[6] ?? 0)
        const e1y = py - (p[7] ?? 0)
        const e2x = px - (p[8] ?? 0)
        const e2y = py - (p[9] ?? 0)
        return Math.sqrt(Math.min(e1x * e1x + e1y * e1y, e2x * e2x + e2y * e2y)) - hw
      }
    }
  }

  private coverage(d: number, nx: number, ny: number): number {
    const footprint = Math.abs(nx) / this.sx + Math.abs(ny) / this.sy
    const c = 0.5 - d / (footprint > 1e-6 ? footprint : this.aa)
    return c < 0 ? 0 : c > 1 ? 1 : c
  }

  private raster(kind: number, x0: number, y0: number, x1: number, y1: number, c: Rgb, alpha: number): void {
    const { pw, ph, sx, sy, buf } = this
    const i0 = Math.max(0, Math.floor(x0 * sx) - 1)
    const i1 = Math.min(pw - 1, Math.ceil(x1 * sx) + 1)
    const j0 = Math.max(0, Math.floor(y0 * sy) - 1)
    const j1 = Math.min(ph - 1, Math.ceil(y1 * sy) + 1)
    const cr = c[0]
    const cg = c[1]
    const cb = c[2]
    const limit = Math.max(1 / sx, 1 / sy) * 0.5
    const stepX = 0.05 / sx
    const stepY = 0.05 / sy
    for (let j = j0; j <= j1; j++) {
      const py = (j + 0.5) / sy
      for (let i = i0; i <= i1; i++) {
        const px = (i + 0.5) / sx
        const d = this.distance(kind, px, py)
        if (d >= limit) continue
        let cov = 1
        if (d > -limit) {
          const gx = this.distance(kind, px + stepX, py) - d
          const gy = this.distance(kind, px, py + stepY) - d
          const gl = Math.sqrt((gx / stepX) * (gx / stepX) + (gy / stepY) * (gy / stepY))
          cov = gl > 1e-6 ? this.coverage(d, gx / stepX / gl, gy / stepY / gl) : this.coverage(d, 0, 0)
        }
        const a = cov * alpha
        const k = (j * pw + i) * 3
        const keep = 1 - a
        buf[k] = (buf[k] ?? 0) * keep + cr * a
        buf[k + 1] = (buf[k + 1] ?? 0) * keep + cg * a
        buf[k + 2] = (buf[k + 2] ?? 0) * keep + cb * a
      }
    }
  }

  private resetScratchBounds(): void {
    this.bx0 = this.pw
    this.by0 = this.ph
    this.bx1 = -1
    this.by1 = -1
  }

  private segment(ax: number, ay: number, bx: number, by: number, hw: number): void {
    const { pw, ph, sx, sy, scratch } = this
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - hw) * sx) - 1)
    const i1 = Math.min(pw - 1, Math.ceil((Math.max(ax, bx) + hw) * sx) + 1)
    const j0 = Math.max(0, Math.floor((Math.min(ay, by) - hw) * sy) - 1)
    const j1 = Math.min(ph - 1, Math.ceil((Math.max(ay, by) + hw) * sy) + 1)
    if (i1 < i0 || j1 < j0) return
    if (i0 < this.bx0) this.bx0 = i0
    if (j0 < this.by0) this.by0 = j0
    if (i1 > this.bx1) this.bx1 = i1
    if (j1 > this.by1) this.by1 = j1
    const limit = Math.max(1 / sx, 1 / sy) * 0.5
    const vx = bx - ax
    const vy = by - ay
    const len2 = vx * vx + vy * vy
    for (let j = j0; j <= j1; j++) {
      const py = (j + 0.5) / sy
      for (let i = i0; i <= i1; i++) {
        const px = (i + 0.5) / sx
        const wx = px - ax
        const wy = py - ay
        let t = len2 > 0 ? (wx * vx + wy * vy) / len2 : 0
        t = t < 0 ? 0 : t > 1 ? 1 : t
        const dx = wx - vx * t
        const dy = wy - vy * t
        const dist = Math.sqrt(dx * dx + dy * dy)
        const d = dist - hw
        if (d >= limit) continue
        let cov = 1
        if (d > -limit) cov = dist > 1e-9 ? this.coverage(d, dx / dist, dy / dist) : this.coverage(d, 0, 0)
        const k = j * pw + i
        if (cov > (scratch[k] ?? 0)) scratch[k] = cov
      }
    }
  }

  private flushScratch(c: Rgb, alpha: number): void {
    const { pw, buf, scratch } = this
    for (let j = this.by0; j <= this.by1; j++) {
      for (let i = this.bx0; i <= this.bx1; i++) {
        const s = j * pw + i
        const cov = scratch[s] ?? 0
        if (cov === 0) continue
        scratch[s] = 0
        const a = cov * alpha
        const k = s * 3
        const keep = 1 - a
        buf[k] = (buf[k] ?? 0) * keep + c[0] * a
        buf[k + 1] = (buf[k + 1] ?? 0) * keep + c[1] * a
        buf[k + 2] = (buf[k + 2] ?? 0) * keep + c[2] * a
      }
    }
  }

  private textCellHd(col: number, row: number, code: number, color: Rgb, background?: Rgb): void {
    const { pw, buf } = this
    const x0 = col * Canvas.HD_CELL_WIDTH
    const y0 = row * Canvas.HD_CELL_HEIGHT
    let br = 0
    let bg = 0
    let bb = 0
    if (background !== undefined) {
      br = background[0]
      bg = background[1]
      bb = background[2]
    } else {
      for (let j = 0; j < Canvas.HD_CELL_HEIGHT; j++) {
        for (let i = 0; i < Canvas.HD_CELL_WIDTH; i++) {
          const k = ((y0 + j) * pw + x0 + i) * 3
          br += buf[k] ?? 0
          bg += buf[k + 1] ?? 0
          bb += buf[k + 2] ?? 0
        }
      }
      const norm = 0.55 / (Canvas.HD_CELL_WIDTH * Canvas.HD_CELL_HEIGHT)
      br *= norm
      bg *= norm
      bb *= norm
    }
    const glyph = Font.cell(code)
    for (let j = 0; j < Canvas.HD_CELL_HEIGHT; j++) {
      const bits = glyph[j] ?? 0
      for (let i = 0; i < Canvas.HD_CELL_WIDTH; i++) {
        const on = ((bits >> (Canvas.HD_CELL_WIDTH - 1 - i)) & 1) === 1
        const k = ((y0 + j) * pw + x0 + i) * 3
        buf[k] = on ? color[0] : br
        buf[k + 1] = on ? color[1] : bg
        buf[k + 2] = on ? color[2] : bb
      }
    }
  }

  private encodeRgba(): Encoded {
    const { buf } = this
    const out = new Uint8Array(this.pw * this.ph * 4)
    let o = 0
    for (let k = 0; k < buf.length; k += 3) {
      out[o++] = Canvas.byte(buf[k] ?? 0)
      out[o++] = Canvas.byte(buf[k + 1] ?? 0)
      out[o++] = Canvas.byte(buf[k + 2] ?? 0)
      out[o++] = 255
    }
    return { kind: 'rgba', rgba: Base64.encode(out), width: this.pw, height: this.ph }
  }

  private encodeHalf(cells: Uint32Array): void {
    const { buf, pw, columns, rows } = this
    let o = 0
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        const top = (r * 2 * pw + c) * 3
        const bottom = top + pw * 3
        const text = this.textCode[r * columns + c] ?? 0
        if (text !== 0) {
          o = this.writeTextCell(cells, o, r * columns + c, top, bottom, -1, -1)
          continue
        }
        cells[o++] = 0x2580
        cells[o++] = Canvas.pack(buf[top] ?? 0, buf[top + 1] ?? 0, buf[top + 2] ?? 0)
        cells[o++] = Canvas.pack(buf[bottom] ?? 0, buf[bottom + 1] ?? 0, buf[bottom + 2] ?? 0)
      }
    }
  }

  private writeTextCell(cells: Uint32Array, o: number, cell: number, a: number, b: number, c: number, d: number): number {
    const { buf } = this
    let out = o
    cells[out++] = this.textCode[cell] ?? 0x20
    cells[out++] = this.textFg[cell] ?? 0
    const background = this.textBg[cell] ?? -1
    if (background >= 0) cells[out++] = background
    else {
      let r = 0
      let g = 0
      let bl = 0
      let n = 0
      for (const index of [a, b, c, d]) {
        if (index < 0) continue
        r += buf[index] ?? 0
        g += buf[index + 1] ?? 0
        bl += buf[index + 2] ?? 0
        n++
      }
      const k = n > 0 ? 0.55 / n : 0
      cells[out++] = Canvas.pack(r * k, g * k, bl * k)
    }
    return out
  }

  private encodeQuad(cells: Uint32Array): void {
    const { buf, pw, columns, rows, sub } = this
    let o = 0
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        const tl = (r * 2 * pw + c * 2) * 3
        const bl = tl + pw * 3
        if ((this.textCode[r * columns + c] ?? 0) !== 0) {
          o = this.writeTextCell(cells, o, r * columns + c, tl, tl + 3, bl, bl + 3)
          continue
        }
        const sources = [tl, tl + 3, bl, bl + 3]
        let totalR = 0
        let totalG = 0
        let totalB = 0
        let totalSq = 0
        for (let k = 0; k < 4; k++) {
          const s = sources[k] ?? 0
          const pr = buf[s] ?? 0
          const pg = buf[s + 1] ?? 0
          const pb = buf[s + 2] ?? 0
          sub[k * 3] = pr
          sub[k * 3 + 1] = pg
          sub[k * 3 + 2] = pb
          totalR += pr
          totalG += pg
          totalB += pb
          totalSq += pr * pr + pg * pg + pb * pb
        }
        const uniformError = totalSq - (totalR * totalR + totalG * totalG + totalB * totalB) / 4
        if (uniformError < Canvas.UNIFORM_ERROR) {
          const mean = Canvas.pack(totalR / 4, totalG / 4, totalB / 4)
          cells[o++] = 0x20
          cells[o++] = mean
          cells[o++] = mean
          continue
        }
        let bestMask = 1
        let bestError = Infinity
        for (let mask = 1; mask < 8; mask++) {
          let ar = 0
          let ag = 0
          let ab = 0
          let asq = 0
          let an = 0
          for (let k = 0; k < 4; k++) {
            if (((mask >> k) & 1) === 0) continue
            const pr = sub[k * 3] ?? 0
            const pg = sub[k * 3 + 1] ?? 0
            const pb = sub[k * 3 + 2] ?? 0
            ar += pr
            ag += pg
            ab += pb
            asq += pr * pr + pg * pg + pb * pb
            an++
          }
          const bn = 4 - an
          const br = totalR - ar
          const bg = totalG - ag
          const bb = totalB - ab
          const bsq = totalSq - asq
          const error = asq - (ar * ar + ag * ag + ab * ab) / an + bsq - (br * br + bg * bg + bb * bb) / bn
          if (error < bestError) {
            bestError = error
            bestMask = mask
          }
        }
        let ar = 0
        let ag = 0
        let ab = 0
        let an = 0
        for (let k = 0; k < 4; k++) {
          if (((bestMask >> k) & 1) === 0) continue
          ar += sub[k * 3] ?? 0
          ag += sub[k * 3 + 1] ?? 0
          ab += sub[k * 3 + 2] ?? 0
          an++
        }
        const bn = 4 - an
        cells[o++] = Canvas.QUAD_GLYPHS[bestMask] ?? 0x20
        cells[o++] = Canvas.pack(ar / an, ag / an, ab / an)
        cells[o++] = Canvas.pack((totalR - ar) / bn, (totalG - ag) / bn, (totalB - ab) / bn)
      }
    }
  }
}
