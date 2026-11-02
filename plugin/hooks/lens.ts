import type { ClipRect, Point, Rgb, Surface } from './canvas'

export type Tone = (c: Rgb) => Rgb

export class Lens implements Surface {
  private static readonly IDENTITY: Tone = c => c

  private constructor(
    private readonly target: Surface,
    readonly width: number,
    readonly height: number,
    private readonly dx: number,
    private readonly dy: number,
    private readonly tone: Tone,
  ) {}

  static offset(target: Surface, dx: number, dy: number, width: number, height: number): Lens {
    return new Lens(target, width, height, dx, dy, Lens.IDENTITY)
  }

  static toned(target: Surface, tone: Tone): Lens {
    return new Lens(target, target.width, target.height, 0, 0, tone)
  }

  private at(p: Point): Point {
    return { x: p.x + this.dx, y: p.y + this.dy }
  }

  clip(rect?: ClipRect): void {
    this.target.clip(rect)
  }

  paint(shader: (x: number, y: number) => Rgb): void {
    this.target.paint(shader)
  }

  glow(cx: number, cy: number, radius: number, c: Rgb, alpha: number): void {
    this.target.glow(cx + this.dx, cy + this.dy, radius, this.tone(c), alpha)
  }

  fillCircle(cx: number, cy: number, r: number, c: Rgb, alpha?: number): void {
    this.target.fillCircle(cx + this.dx, cy + this.dy, r, this.tone(c), alpha)
  }

  strokeCircle(cx: number, cy: number, r: number, width: number, c: Rgb, alpha?: number): void {
    this.target.strokeCircle(cx + this.dx, cy + this.dy, r, width, this.tone(c), alpha)
  }

  fillEllipse(cx: number, cy: number, rx: number, ry: number, c: Rgb, alpha?: number): void {
    this.target.fillEllipse(cx + this.dx, cy + this.dy, rx, ry, this.tone(c), alpha)
  }

  fillRect(x: number, y: number, w: number, h: number, c: Rgb, alpha?: number): void {
    this.target.fillRect(x + this.dx, y + this.dy, w, h, this.tone(c), alpha)
  }

  block(x: number, y: number, w: number, h: number, c: Rgb, alpha?: number): void {
    this.target.block(x + this.dx, y + this.dy, w, h, this.tone(c), alpha)
  }

  fillRoundRect(x: number, y: number, w: number, h: number, radius: number, c: Rgb, alpha?: number): void {
    this.target.fillRoundRect(x + this.dx, y + this.dy, w, h, radius, this.tone(c), alpha)
  }

  strokeRoundRect(x: number, y: number, w: number, h: number, radius: number, width: number, c: Rgb, alpha?: number): void {
    this.target.strokeRoundRect(x + this.dx, y + this.dy, w, h, radius, width, this.tone(c), alpha)
  }

  fillTriangle(a: Point, b: Point, d: Point, c: Rgb, alpha?: number): void {
    this.target.fillTriangle(this.at(a), this.at(b), this.at(d), this.tone(c), alpha)
  }

  line(a: Point, b: Point, width: number, c: Rgb, alpha?: number): void {
    this.target.line(this.at(a), this.at(b), width, this.tone(c), alpha)
  }

  arc(cx: number, cy: number, r: number, from: number, to: number, width: number, c: Rgb, alpha?: number): void {
    this.target.arc(cx + this.dx, cy + this.dy, r, from, to, width, this.tone(c), alpha)
  }

  curve(p0: Point, p1: Point, p2: Point, p3: Point, width: number, c: Rgb, alpha?: number): void {
    this.target.curve(this.at(p0), this.at(p1), this.at(p2), this.at(p3), width, this.tone(c), alpha)
  }

  text(column: number, row: number, value: string, color: Rgb, background?: Rgb): number {
    return this.target.text(column, row, value, this.tone(color), background === undefined ? undefined : this.tone(background))
  }
}
