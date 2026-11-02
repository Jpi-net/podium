import { Canvas, type Rgb } from './canvas'
import { Raster, Sprite, type Palette } from './sprite'

export class Hats {
  static readonly UNIT = 0.9408

  private static readonly WHITE: Rgb = [255, 255, 255]
  private static readonly INK: Rgb = [12, 15, 30]
  private static readonly WARN: Rgb = [255, 206, 110]
  private static readonly ACCENT: Rgb = [0, 187, 167]
  private static readonly GOLD: Rgb = [255, 208, 96]
  private static readonly GOLD_DARK: Rgb = [196, 140, 44]
  private static readonly GOLD_LIGHT: Rgb = [255, 240, 186]
  private static readonly SANTA: Rgb = [226, 36, 52]
  private static readonly SANTA_DARK: Rgb = [150, 20, 36]
  private static readonly SNOW: Rgb = [236, 244, 255]
  private static readonly SNOW_SHADE: Rgb = [188, 200, 224]
  private static readonly PUMPKIN: Rgb = [255, 132, 26]
  private static readonly PUMPKIN_DARK: Rgb = [196, 80, 14]
  private static readonly PUMPKIN_LIGHT: Rgb = [255, 170, 70]
  private static readonly CANDLE: Rgb = [255, 236, 120]
  private static readonly STEM: Rgb = [92, 120, 50]
  private static readonly LEAF: Rgb = [72, 168, 72]
  private static readonly WITCH: Rgb = [118, 64, 196]
  private static readonly WITCH_DARK: Rgb = [74, 38, 128]
  private static readonly WITCH_LIGHT: Rgb = [168, 124, 236]
  private static readonly WITCH_BAND: Rgb = [40, 22, 70]
  private static readonly FLAG_BLACK: Rgb = [20, 20, 20]
  private static readonly FLAG_YELLOW: Rgb = [253, 218, 36]
  private static readonly FLAG_RED: Rgb = [239, 51, 64]
  private static readonly HEART: Rgb = [255, 72, 120]
  private static readonly HEART_LIGHT: Rgb = [255, 130, 170]
  private static readonly SPRING: Rgb = [200, 204, 220]
  private static readonly CREAM: Rgb = [246, 240, 226]
  private static readonly CREAM_SHADE: Rgb = [206, 196, 176]
  private static readonly CRUST: Rgb = [226, 152, 72]
  private static readonly CRUST_DARK: Rgb = [170, 100, 40]
  private static readonly CRUST_LIGHT: Rgb = [246, 196, 128]
  private static readonly CHERRY: Rgb = [178, 30, 60]
  private static readonly TIN: Rgb = [196, 202, 218]
  private static readonly TIN_DARK: Rgb = [120, 126, 146]
  private static readonly STEAM: Rgb = [236, 240, 250]
  private static readonly FUR: Rgb = [246, 242, 238]
  private static readonly FUR_SHADE: Rgb = [200, 194, 210]
  private static readonly BUNNY_PINK: Rgb = [255, 166, 190]
  private static readonly HILT: Rgb = [150, 156, 172]
  private static readonly HILT_DARK: Rgb = [40, 42, 54]
  private static readonly HILT_LIGHT: Rgb = [210, 214, 226]
  private static readonly PHONES: Rgb = [46, 48, 64]
  private static readonly PHONES_LIGHT: Rgb = [120, 126, 150]
  private static readonly CAT: Rgb = [30, 26, 42]
  private static readonly CAT_RIM: Rgb = [176, 156, 226]
  private static readonly CAT_EYE: Rgb = [200, 255, 90]
  private static readonly CAT_NOSE: Rgb = [255, 140, 170]
  private static readonly ZED: Rgb = [190, 236, 255]
  private static readonly TAPE: Rgb = [240, 236, 214]
  private static readonly JEWELS: readonly Rgb[] = [
    [226, 36, 52],
    [70, 140, 255],
    [60, 200, 120],
  ]
  private static readonly PAPER: readonly Rgb[] = [
    [255, 92, 120],
    [255, 210, 80],
    [90, 200, 255],
    [120, 236, 140],
    [190, 130, 255],
    [255, 150, 70],
    [110, 255, 232],
  ]
  private static readonly SABERS: readonly Rgb[] = [
    [80, 170, 255],
    [255, 60, 70],
    [90, 255, 120],
    [190, 110, 255],
  ]

  private static readonly POMPOM = Sprite.of(['.PWPP.', 'PPPPPP', '.PPPP.'])
  private static readonly HEART_SPRITE = Sprite.of(['.HH..HH.', 'HWHHHHHH', 'HHHHHHHH', '.HHHHHH.', '..HHHH..', '...HH...'])
  private static readonly CROWN_POINTS = Sprite.of(['.........LL.........', '.LL..LL..GG..LL..LL.', '.GG..GG..GG..GG..GG.', '.GG..GG.GGGG.GG..GG.', '.GGGGGGGGGGGGGGGGGG.'])
  private static readonly CROWN_BAND = Sprite.of(['GLLLLLLLLLLLLLLLLLLG', 'GGG11GGGG22GGGG33GGG', 'dddddddddddddddddddd'])
  private static readonly ROSETTE = Sprite.of(['..KKKKK..', '.KYYYYYK.', 'KYYRRRYYK', 'KYYRWRYYK', '.KYYYYYK.', '..KKKKK..'])
  private static readonly PUMPKIN_BODY = Sprite.of([
    '....oOOOOooOOOOo....',
    '..oOOOLOOooOOOOOOo..',
    '.oOOOLOOOooOOOOOOOo.',
    'oOOOOOOOOooOOOOOOOOo',
    'oOOOOOOOOooOOOOOOOOo',
    'oOOOOOOOOooOOOOOOOOo',
    '.oOOOOOOOooOOOOOOOo.',
    '..oOOOOOOooOOOOOOo..',
    '....oooooooooooo....',
  ])
  private static readonly MITRE = Sprite.of([
    '.......GG.......',
    '......dRRd......',
    '.....dRRRRd.....',
    '....dRRGGRRd....',
    '...dRRRGGRRRd...',
    '..dRRGGGGGGRRd..',
    '..dRRRRGGRRRRd..',
    '..dRLRRGGRRRRd..',
    '..dRLRRGGRRRRd..',
    '..dRRRRGGRRRRd..',
    '.GGGGGGGGGGGGGG.',
    '.GLLLLLLRRLLLLG.',
    '.dddddddddddddd.',
  ])
  private static readonly FISH = Sprite.of(['....FFFF..', 'T.FFFFFFF.', 'TTFLFLFWKF', 'T.FFFFFFF.', '....FFFF..'])
  private static readonly CAT_BODY = Sprite.of([
    '...e....e...',
    '..eCe..eCe..',
    '..CCCCCCCC..',
    '.CCCCCCCCCC.',
    '.CCCCCCCCCC.',
    '..CCCCCCCC..',
    '...CCCCCC...',
    '..CCCCCCCC..',
    '.CCCCCCCCCC.',
    'CCCCCCCCCCCC',
    'CCCCCCCCCCCC',
  ])
  private static readonly NOTE = Sprite.of(['..XX', '..X.', '..X.', 'XXX.', 'XX..'])
  private static readonly ZEDS: readonly Sprite[] = [
    Sprite.of(['ZZZZ', '.ZZ.', 'ZZZZ']),
    Sprite.of(['ZZZZZZ', '...ZZ.', '.ZZ...', 'ZZZZZZ']),
    Sprite.of(['ZZZZZZZZ', '.....ZZ.', '...ZZ...', '.ZZ.....', 'ZZZZZZZZ']),
  ]

  static partyHat(canvas: Canvas, cx: number, top: number, k: number, frame: number, seed: number, pal: readonly Rgb[]): void {
    const a = Math.floor(seed * 97) % pal.length
    const main = pal[a] ?? Hats.WARN
    const stripe = pal[(a + 2) % pal.length] ?? Hats.WHITE
    const pom = pal[(a + 4) % pal.length] ?? Hats.WHITE
    const lean = -2 + Math.round(Math.sin(frame * 0.2 + seed * 11))
    const bounce = Math.abs(Math.sin(frame * 0.3 + seed * 5)) > 0.55 ? 1 : 0
    const h = 10
    const r = Hats.layer()
    Hats.part(r, l => {
      for (let j = 0; j < h; j++) {
        const y = 3 - h + j
        const half = Math.max(1, Math.round(((j + 1) / h) * 7))
        const shift = Math.round((lean * (h - 1 - j)) / (h - 1))
        for (let x = -half; x < half; x++) {
          const band = (((j * 2 + x) % 9) + 9) % 9 < 3
          l.dot(x + shift, y, band ? stripe : main)
        }
        if (half >= 3) l.dot(-half + 1 + shift, y, Canvas.mix(main, Hats.WHITE, 0.45))
      }
    })
    Hats.part(r, l => l.stamp(Hats.POMPOM, { P: pom, W: Hats.WHITE }, lean - 3, 3 - h - 3 - bounce))
    canvas.glow(cx + lean * 0.5, top + 3 - h - 2, 2 * k, pom, 0.35)
    Hats.show(canvas, r, cx, top, k)
  }

  static crown(canvas: Canvas, cx: number, top: number, k: number, frame: number, seed: number): void {
    const lean = Math.round(Math.sin(frame * 0.1 + seed * 3) * 1.2)
    const r = Hats.layer()
    const palette: Palette = {
      G: Hats.GOLD,
      L: Hats.GOLD_LIGHT,
      d: Hats.GOLD_DARK,
      '1': Hats.JEWELS[0] ?? Hats.SANTA,
      '2': Hats.JEWELS[1] ?? Hats.SANTA,
      '3': Hats.JEWELS[2] ?? Hats.SANTA,
    }
    canvas.glow(cx, top - 2, 5 * k, Hats.GOLD, 0.12)
    Hats.part(r, l => {
      l.stamp(Hats.CROWN_POINTS, palette, -10 + lean, -6)
      l.stamp(Hats.CROWN_BAND, palette, -10, -1)
    })
    const g = (frame * 0.02 + seed) % 1
    const sparkle = Math.sin(Math.PI * g)
    if (sparkle > 0.3) {
      const sx = Math.round(-9 + g * 18)
      r.dot(sx, -1, Hats.WHITE, sparkle)
      r.dot(sx, -2, Hats.WHITE, sparkle * 0.7)
      r.dot(sx - 1, -1, Hats.WHITE, sparkle * 0.7)
      r.dot(sx + 1, -1, Hats.WHITE, sparkle * 0.7)
    }
    Hats.show(canvas, r, cx, top, k)
  }

  static heartBoppers(canvas: Canvas, cx: number, top: number, k: number, frame: number, seed: number): void {
    const r = Hats.layer()
    const pink = Canvas.mix(Hats.HEART, Hats.INK, 0.25)
    Hats.part(r, l => l.rect(-11, 1, 22, 1, pink))
    for (const side of [-1, 1]) {
      const bob = Math.sin(frame * 0.3 + seed * 5 + side)
      const bx = side < 0 ? -5 : 4
      const ex = bx + side * 3 + Math.round(bob)
      const ey = -8 + Math.round(Math.abs(bob))
      Hats.part(r, l => {
        const n = 1 - ey
        for (let i = 0; i <= n; i++) {
          const t = i / n
          const zig = i % 3 === 1 ? side : 0
          l.dot(Math.round(bx + (ex - bx) * t * t) + zig, 1 - i, Hats.SPRING)
        }
      })
      canvas.glow(cx + ex * 0.5, top + ey, 2.6 * k, Hats.HEART, 0.25)
      Hats.part(r, l => l.stamp(Hats.HEART_SPRITE, { H: side < 0 ? Hats.HEART : Hats.HEART_LIGHT, W: Hats.WHITE }, ex - 4, ey - 5))
    }
    Hats.show(canvas, r, cx, top, k)
  }

  static gilleHat(canvas: Canvas, cx: number, top: number, k: number, frame: number, seed: number): void {
    const sway = Math.sin(frame * 0.1 + seed * 6) * 0.22
    const r = Hats.layer()
    const n = 9
    const order = Array.from({ length: n }, (_, j) => (j / (n - 1)) * 2 - 1).sort((a, b) => Math.abs(b) - Math.abs(a))
    for (const s of order) {
      const a = s * 0.8 + sway * (0.6 + 0.4 * Math.abs(s))
      const length = 10 - Math.abs(s) * 3.5
      const shade = Math.round((s + 1) * 4) % 2 === 0 ? Hats.WHITE : Hats.CREAM
      const bx = Math.round(s * 3.5)
      const ruffle = Math.round(Math.sin(frame * 0.2 + s * 4) * 0.6)
      Hats.part(r, l => {
        for (let q = 0; q <= 1.001; q += 0.125) {
          const x = bx + Math.sin(a) * length * q * 1.6 + (q > 0.7 ? ruffle : 0)
          const y = -4 - Math.cos(a) * length * q + Math.abs(s) * length * 0.3 * q * q
          l.oval(x, y, 1.6 + q * 1.6, 0.6 + q * 0.6, shade)
        }
      })
    }
    Hats.part(r, l => {
      l.rect(-6, -4, 12, 6, Hats.CREAM)
      l.rect(5, -4, 1, 6, Hats.CREAM_SHADE)
      l.rect(-6, -2, 12, 1, Hats.FLAG_BLACK)
      l.rect(-6, -1, 12, 1, Hats.FLAG_YELLOW)
      l.rect(-6, 0, 12, 1, Hats.FLAG_RED)
      l.rect(-5, -4, 1, 2, Hats.WHITE)
    })
    Hats.show(canvas, r, cx, top, k)
  }

  static pieHat(canvas: Canvas, cx: number, top: number, k: number, frame: number, seed: number): void {
    const r = Hats.layer()
    Hats.part(r, l => {
      l.rect(-10, 1, 20, 1, Hats.TIN_DARK)
      l.rect(-11, 0, 22, 1, Hats.TIN)
      l.oval(-0.5, -2, 10.5, 2.4, Hats.CRUST_DARK)
      l.oval(-0.5, -2.2, 9.5, 1.9, Hats.CRUST)
      for (const x of [-6, -1, 4]) l.rect(x, -4, 1, 4, Hats.CRUST_LIGHT)
      l.rect(-8, -2, 16, 1, Hats.CRUST_LIGHT)
      for (const [x, y] of [[-4, -3], [2, -1], [6, -3], [-8, -1], [0, -4]] as const) l.rect(x, y, 2, 1, Hats.CHERRY)
      l.rect(-7, -4, 3, 1, Hats.WHITE, 0.45)
    })
    for (let w = 0; w < 3; w++) {
      const p = (frame * 0.025 + w / 3 + seed) % 1
      const a = 0.45 * Math.sin(Math.PI * p)
      const sx = (w - 1) * 5 + Math.round(Math.sin(p * 6 + w))
      const sy = -6 - Math.round(p * 5)
      r.rect(sx, sy, 2, 1, Hats.STEAM, a)
      r.dot(sx + (p > 0.5 ? 1 : 0), sy - 1, Hats.STEAM, a * 0.7)
    }
    Hats.show(canvas, r, cx, top, k)
  }

  static foolHat(canvas: Canvas, cx: number, top: number, k: number, frame: number, seed: number): void {
    const pal = Hats.PAPER
    const a = Math.floor(seed * 97) % pal.length
    const main = pal[a] ?? Hats.WARN
    const stripe = pal[(a + 2) % pal.length] ?? Hats.WHITE
    const pom = pal[(a + 4) % pal.length] ?? Hats.WHITE
    const fish = pal[(a + 3) % pal.length] ?? Hats.ACCENT
    const tilt = Math.sin(frame * 0.18 + seed * 7) * 0.2
    const h = 9
    const r = Hats.layer()
    Hats.part(r, l => {
      for (let j = 0; j < h; j++) {
        const y = 1 - j
        const half = Math.max(1, Math.round(1 + j * 0.65))
        const shift = Math.round(tilt * j * 2)
        for (let x = -half; x < half; x++) l.dot(x + shift, y, (((j * 2 - x) % 7) + 7) % 7 < 2 ? stripe : main)
      }
      const shift = Math.round(tilt * h * 2)
      l.rect(shift - 7, -h, 14, 1, Canvas.mix(main, Hats.WHITE, 0.35))
      l.rect(shift - 5, -h + 1, 10, 1, Canvas.mix(main, Hats.INK, 0.55))
    })
    Hats.part(r, l => l.stamp(Hats.POMPOM, { P: pom, W: Hats.WHITE }, -3, 1))
    const wag = Math.sin(frame * 0.3 + seed * 4) > 0 ? 1 : 0
    Hats.part(r, l => {
      l.stamp(Hats.FISH, { F: fish, L: Canvas.mix(fish, Hats.WHITE, 0.45), W: Hats.WHITE, K: Hats.INK, T: Canvas.mix(fish, Hats.INK, 0.2) }, -16, 2 + wag)
    })
    r.rect(-11, 2, 2, 5, Hats.TAPE, 0.6)
    Hats.show(canvas, r, cx, top, k)
  }

  static bunnyEars(canvas: Canvas, cx: number, top: number, k: number, frame: number, seed: number): void {
    const flop = Math.sin(frame * 0.15 + seed * 7)
    const r = Hats.layer()
    const left: readonly (readonly [number, number])[] = [
      [-5, 1],
      [-7 + Math.round(flop * 0.5), -12],
    ]
    const right: readonly (readonly [number, number])[] = [
      [4, 1],
      [6, -7],
      [11 + Math.round(flop), -3 + Math.round(flop)],
    ]
    for (const ear of [left, right]) {
      Hats.part(r, l => {
        Hats.path(l, ear, 5, 2, Hats.FUR, 0, 1)
        Hats.path(l, ear, 2, 1, Hats.BUNNY_PINK, 0.15, 0.85)
      })
    }
    Hats.part(r, l => l.rect(-11, 1, 22, 1, Hats.BUNNY_PINK))
    Hats.show(canvas, r, cx, top, k)
  }

  static saberHat(canvas: Canvas, cx: number, top: number, k: number, frame: number, seed: number): void {
    const tilt = 0.14 + Math.sin(frame * 0.1 + seed * 5) * 0.05
    const c = Hats.SABERS[Math.floor(seed * 97) % Hats.SABERS.length] ?? Hats.ACCENT
    const flicker = 0.9 + 0.1 * Math.sin(frame * 1.7 + seed * 13)
    const slope = Math.tan(tilt) * 2
    const at = (i: number): number => 3 + Math.round(i * slope)
    const r = Hats.layer()
    Hats.part(r, l => {
      for (let i = 0; i < 5; i++) l.rect(at(i) - 1, 2 - i, 4, 1, i === 4 ? Hats.HILT_LIGHT : i % 2 === 1 ? Hats.HILT_DARK : Hats.HILT)
    })
    for (let i = 5; i < 14; i++) {
      const x = at(i)
      const y = 2 - i
      r.dot(x - 1, y, c, 0.75 * flicker)
      r.dot(x + 2, y, c, 0.75 * flicker)
      r.rect(x, y, 2, 1, i === 13 ? Canvas.mix(c, Hats.WHITE, 0.5) : Hats.WHITE, 0.95)
    }
    canvas.glow(cx + at(9) * 0.5, top - 7, 4 * k, c, 0.3 * flicker)
    Hats.show(canvas, r, cx, top, k)
  }

  static headphones(canvas: Canvas, cx: number, top: number, k: number, frame: number, seed: number): void {
    const accent = Hats.PAPER[Math.floor(seed * 97) % Hats.PAPER.length] ?? Hats.ACCENT
    const beat = 0.5 + 0.5 * Math.sin(frame * 0.5 + seed * 9)
    const r = Hats.layer()
    Hats.part(r, l => {
      for (let i = 0; i <= 40; i++) {
        const ang = Math.PI + (i / 40) * Math.PI
        const x = Math.round(-0.5 + Math.cos(ang) * 14.5)
        const y = Math.round(9 + Math.sin(ang) * 10)
        l.rect(x, y, 2, 1, Hats.PHONES)
        if (i > 8 && i < 20) l.dot(x, y, Hats.PHONES_LIGHT)
      }
    })
    for (const side of [-1, 1]) {
      const x = side < 0 ? -18 : 14
      canvas.glow(cx + (x + 2) * 0.5, top + 10, 2.4 * k, accent, 0.15 + 0.2 * beat)
      Hats.part(r, l => {
        l.rect(x, 7, 4, 6, Hats.PHONES)
        l.rect(x + 1, 8, 2, 4, accent)
        l.dot(x + 1, 8, Hats.WHITE, 0.6)
      })
    }
    const p = (frame * 0.03 + seed) % 1
    const alpha = Math.sin(Math.PI * p)
    if (alpha > 0.05) {
      const note = r.layer()
      note.stamp(Hats.NOTE, { X: accent }, 17 + Math.round(Math.sin(p * 7)), 2 - Math.round(p * 7))
      note.outline()
      Hats.show(canvas, note, cx, top, k, alpha)
    }
    Hats.show(canvas, r, cx, top, k)
  }

  static cockade(canvas: Canvas, cx: number, top: number, k: number, frame: number, seed: number): void {
    const pulse = Math.sin(frame * 0.2 + seed * 7)
    const tail = Math.round(pulse)
    const r = Hats.layer()
    Hats.part(r, l => Hats.path(l, [[3, 1], [1 - tail, 5]], 2, 1, Hats.FLAG_RED, 0, 1))
    Hats.part(r, l => Hats.path(l, [[7, 1], [9 + tail, 5]], 2, 1, Hats.FLAG_YELLOW, 0, 1))
    canvas.glow(cx + 2.5, top - 1, 2.4 * k, Hats.FLAG_YELLOW, 0.22)
    Hats.part(r, l => l.stamp(Hats.ROSETTE, { K: Hats.FLAG_BLACK, Y: Hats.FLAG_YELLOW, R: Hats.FLAG_RED, W: Canvas.mix(Hats.FLAG_RED, Hats.WHITE, 0.55) }, 1, -4))
    Hats.show(canvas, r, cx, top, k)
  }

  static pumpkinHat(canvas: Canvas, cx: number, top: number, k: number, frame: number, seed: number): void {
    const flicker = 0.75 + 0.25 * Math.sin(frame * 0.9 + seed * 20) * Math.sin(frame * 0.37)
    const face = Canvas.mix(Hats.CANDLE, Hats.WHITE, 0.2 * flicker)
    const r = Hats.layer()
    canvas.glow(cx, top - 3, 7 * k, Hats.PUMPKIN, 0.18 * flicker)
    Hats.part(r, l => {
      l.rect(-1, -10, 2, 3, Hats.STEM)
      l.oval(3, -9, 2.5, 0.6, Hats.LEAF)
    })
    Hats.part(r, l => {
      l.stamp(Hats.PUMPKIN_BODY, { O: Hats.PUMPKIN, o: Hats.PUMPKIN_DARK, L: Hats.PUMPKIN_LIGHT }, -10, -7)
      for (const x0 of [-7, 2]) {
        l.rect(x0 + 1, -4, 2, 1, face)
        l.rect(x0, -3, 4, 1, face)
      }
      l.rect(-6, -1, 12, 1, face)
      l.rect(-4, 0, 8, 1, face)
      l.rect(-1, -1, 2, 1, Hats.PUMPKIN)
    })
    canvas.glow(cx, top - 1.5, 2.6 * k, Hats.CANDLE, 0.35 * flicker)
    Hats.show(canvas, r, cx, top, k)
  }

  static witchHat(canvas: Canvas, cx: number, top: number, k: number, frame: number, seed: number): void {
    const sway = Math.sin(frame * 0.12 + seed * 9)
    const r = Hats.layer()
    Hats.part(r, l => {
      const rows = 9
      for (let j = 0; j < rows; j++) {
        const u = j / (rows - 1)
        const half = Math.max(1, Math.round(6 - j * 0.6))
        const shift = Math.round(u * u * 3 + sway * u)
        l.rect(shift - half, -1 - j, 2 * half, 1, Hats.WITCH)
        l.dot(shift - half + 1, -1 - j, Hats.WITCH_LIGHT)
      }
      const knee = Math.round(3 + sway)
      Hats.path(l, [[knee, -9], [knee + 3, -11], [Math.round(8 + sway * 1.5), -11]], 2, 1, Hats.WITCH, 0, 1)
      l.rect(-6, -3, 12, 2, Hats.WITCH_BAND)
      l.oval(-0.5, 0.5, 13, 1.2, Hats.WITCH_DARK)
      l.rect(-12, 0, 24, 1, Hats.WITCH)
    })
    const buckle = r.layer()
    buckle.rect(-2, -3, 4, 1, Hats.GOLD)
    buckle.rect(-2, -2, 1, 1, Hats.GOLD)
    buckle.rect(1, -2, 1, 1, Hats.GOLD)
    r.merge(buckle)
    canvas.glow(cx, top - 2.5, 1.6 * k, Hats.GOLD, 0.25 + 0.15 * Math.sin(frame * 0.3))
    Hats.show(canvas, r, cx, top, k)
  }

  static mitre(canvas: Canvas, cx: number, top: number, k: number, frame: number, seed: number): void {
    const swing = Math.round(Math.sin(frame * 0.12 + seed * 5))
    const r = Hats.layer()
    for (const side of [-1, 1]) {
      const x = side < 0 ? -6 : 5
      Hats.part(r, l => {
        Hats.path(l, [[x, 1], [x + side + swing, 6]], 2, 1, Hats.SANTA, 0, 1)
        l.rect(x + side + swing, 7, 2, 1, Hats.GOLD)
      })
    }
    Hats.part(r, l => l.stamp(Hats.MITRE, { R: Hats.SANTA, d: Hats.SANTA_DARK, G: Hats.GOLD, L: Hats.GOLD_LIGHT }, -8, -11))
    canvas.glow(cx - 0.25, top - 6, 2 * k, Hats.GOLD, 0.18 + 0.1 * Math.sin(frame * 0.25 + seed * 3))
    Hats.show(canvas, r, cx, top, k)
  }

  static santaHat(canvas: Canvas, cx: number, top: number, k: number, frame: number, seed: number): void {
    const flop = Math.sin(frame * 0.25 + seed * 7)
    const tip: readonly [number, number] = [Math.round(12 + flop), Math.round(-4 + Math.abs(flop))]
    const r = Hats.layer()
    Hats.part(r, l => {
      const rows = 8
      for (let j = 0; j < rows; j++) {
        const half = Math.max(1, Math.round(11 * (1 - j / rows)))
        const shift = Math.round(j * 0.4)
        l.rect(shift - half, -1 - j, 2 * half, 1, Hats.SANTA)
        if (half > 3) l.dot(shift + half - 1, -1 - j, Hats.SANTA_DARK)
      }
      Hats.path(l, [[3, -8], [8, -8], tip], 3, 2, Hats.SANTA, 0, 1)
      l.rect(-7, -5, 2, 1, Canvas.mix(Hats.SANTA, Hats.WHITE, 0.4))
      l.rect(-6, -6, 2, 1, Canvas.mix(Hats.SANTA, Hats.WHITE, 0.4))
    })
    Hats.part(r, l => {
      l.rect(-13, -1, 26, 3, Hats.SNOW)
      l.rect(-13, 1, 26, 1, Hats.SNOW_SHADE)
    })
    canvas.glow(cx + tip[0] * 0.5, top + tip[1], 2 * k, Hats.SNOW, 0.3)
    Hats.part(r, l => {
      l.oval(tip[0], tip[1] + 1, 3, 1.5, Hats.SNOW)
      l.rect(tip[0] - 1, tip[1] + 2, 3, 1, Hats.SNOW_SHADE)
    })
    Hats.show(canvas, r, cx, top, k)
  }

  static catHat(canvas: Canvas, cx: number, top: number, k: number, frame: number, seed: number): void {
    const sway = Math.round(Math.sin(frame * 0.12 + seed * 5) * 1.4)
    const blink = (frame + seed * 70) % 70 < 3
    const r = Hats.layer()
    const cat = r.layer()
    Hats.path(cat, [[5, 0], [9, -1], [10 + sway, -5], [8 + sway, -8]], 2, 1, Hats.CAT, 0, 1)
    cat.stamp(Hats.CAT_BODY, { C: Hats.CAT, e: Hats.CAT }, -6, -10)
    Hats.rim(cat, Hats.CAT_RIM, 0.75)
    r.merge(cat)
    for (const ex of [-4, 2]) {
      canvas.glow(cx + (ex + 1) * 0.5, top - 6, 1.1 * k, Hats.CAT_EYE, 0.35)
      if (blink) r.rect(ex, -6, 2, 1, Hats.CAT_EYE)
      else {
        r.rect(ex, -7, 2, 2, Hats.CAT_EYE)
        r.dot(ex, -7, Hats.WHITE, 0.8)
      }
    }
    r.rect(-1, -5, 2, 1, Hats.CAT_NOSE)
    Hats.show(canvas, r, cx, top, k)
  }

  static sleeping(canvas: Canvas, x: number, y: number, frame: number): void {
    const period = 25
    for (let i = 0; i < 3; i++) {
      const p = (frame / period + i / 3) % 1
      const size = 2.2 + p * 2
      const alpha = Math.sin(Math.PI * Math.min(1, p * 1.15)) * 0.95
      if (alpha <= 0.02) continue
      const zx = x + p * 7 + Math.sin(p * 6 + i) * 0.5
      const zy = y - p * 10
      Hats.zed(canvas, zx, zy, size, Canvas.mix(Hats.ZED, Hats.WHITE, 1 - p), alpha)
    }
  }

  static zed(canvas: Canvas, x: number, y: number, size: number, c: Rgb, alpha: number): void {
    const sprite = (size < 2.9 ? Hats.ZEDS[0] : size < 3.6 ? Hats.ZEDS[1] : Hats.ZEDS[2]) ?? Hats.ZEDS[0]
    if (!sprite) return
    const w = sprite.width * 0.5
    const h = sprite.height
    canvas.glow(x + w / 2, y + h / 2, size * 1.1, c, 0.15 * alpha)
    Raster.paint(canvas, sprite, { Z: c }, x + w / 2, y + h / 2, 1, alpha, false)
  }

  private static layer(): Raster {
    return new Raster(-24, -22, 48, 40)
  }

  private static part(r: Raster, paint: (layer: Raster) => void): void {
    const layer = r.layer()
    paint(layer)
    layer.outline()
    r.merge(layer)
  }

  private static show(canvas: Canvas, r: Raster, cx: number, top: number, k: number, alpha = 1): void {
    r.blit(canvas, cx, top, k / Hats.UNIT, 'none', alpha)
  }

  private static path(r: Raster, points: readonly (readonly [number, number])[], w: number, h: number, c: Rgb, from: number, to: number): void {
    const segments: [number, number, number, number, number][] = []
    let total = 0
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1] ?? [0, 0]
      const b = points[i] ?? a
      const len = Math.max(Math.abs(b[0] - a[0]) / 2, Math.abs(b[1] - a[1]), 1)
      segments.push([a[0], a[1], b[0], b[1], len])
      total += len
    }
    let done = 0
    for (const [x0, y0, x1, y1, len] of segments) {
      const n = Math.ceil(len * 2)
      for (let i = 0; i <= n; i++) {
        const u = (done + (len * i) / n) / total
        if (u < from || u > to) continue
        const x = Math.round(x0 + ((x1 - x0) * i) / n)
        const y = Math.round(y0 + ((y1 - y0) * i) / n)
        r.rect(x - Math.floor(w / 2), y - Math.floor((h - 1) / 2), w, h, c)
      }
      done += len
    }
  }

  private static rim(r: Raster, c: Rgb, a: number): void {
    const marks: [number, number][] = []
    for (let y = r.top; y < r.top + r.height; y++) {
      for (let x = r.left; x < r.left + r.width; x++) {
        if (r.has(x, y)) continue
        if (r.has(x - 1, y) || r.has(x + 1, y) || r.has(x, y - 1) || r.has(x, y + 1)) marks.push([x, y])
      }
    }
    for (const [x, y] of marks) r.dot(x, y, c, a)
  }
}
