import { Canvas, type Point, type Rgb, type Surface } from './canvas'
import { Raster, Sprite, type Palette } from './sprite'

export class Festive {
  private static readonly WHITE: Rgb = [255, 255, 255]
  private static readonly INK: Rgb = [12, 15, 30]
  private static readonly ACCENT: Rgb = [0, 187, 167]
  private static readonly WARN: Rgb = [255, 206, 110]
  private static readonly GOLD: Rgb = [255, 208, 96]
  private static readonly LEAF: Rgb = [72, 168, 72]
  private static readonly PUMPKIN: Rgb = [255, 132, 26]
  private static readonly SHELL: Rgb = [232, 36, 40]
  private static readonly PETAL: Rgb = [255, 172, 202]
  private static readonly FIREFLY: Rgb = [206, 255, 120]
  private static readonly HEART: Rgb = [255, 72, 120]
  private static readonly ORANGE: Rgb = [250, 140, 24]
  private static readonly FLAG_BLACK: Rgb = [20, 20, 20]
  private static readonly FLAG_YELLOW: Rgb = [253, 218, 36]
  private static readonly FLAG_RED: Rgb = [239, 51, 64]
  private static readonly CELEBRATION_MS = 4000
  private static readonly AUTUMN: readonly Rgb[] = [
    [232, 112, 34],
    [200, 52, 38],
    [164, 98, 44],
    [240, 170, 48],
  ]
  private static readonly HEARTS: readonly Rgb[] = [
    [255, 72, 120],
    [255, 140, 176],
    [230, 40, 84],
    [255, 186, 210],
  ]
  private static readonly PI_COLORS: readonly Rgb[] = [
    [255, 208, 96],
    [110, 255, 232],
    [200, 160, 255],
  ]
  private static readonly EGGS: readonly Rgb[] = [
    [255, 120, 160],
    [120, 200, 255],
    [255, 214, 80],
    [150, 230, 130],
    [200, 150, 255],
    [255, 160, 90],
  ]
  private static readonly SABERS: readonly Rgb[] = [
    [80, 170, 255],
    [255, 60, 70],
    [90, 255, 120],
    [190, 110, 255],
  ]
  private static readonly WINGS: readonly Rgb[] = [
    [255, 170, 60],
    [120, 200, 255],
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

  private static readonly LADYBUG: readonly Sprite[] = [
    Sprite.of(['.....RRRRRR...a.a', '...RRWRRkkRRR.KK.', '..RkkRRRRRRkkKKWK', '..RRRRkkRRRRRKKKK', '...kkkkkkkkkkkKK.', '...l.l...l.l.....']),
    Sprite.of(['.....RRRRRR...a.a', '...RRWRRkkRRR.KK.', '..RkkRRRRRRkkKKWK', '..RRRRkkRRRRRKKKK', '...kkkkkkkkkkkKK.', '....l.l...l.l....']),
  ]

  private static readonly BUTTERFLY: readonly Sprite[] = [
    Sprite.of(['UUU.b.UUU', '.UUUbUUU.', '.uu.b.uu.']),
    Sprite.of(['.UU.b.UU.', '..UUbUU..', '..u.b.u..']),
    Sprite.of(['...UbU...', '...UbU...', '....b....']),
  ]

  private static readonly HEART_SPRITES: readonly Sprite[] = [
    Sprite.of(['HH.HH', '.HHH.']),
    Sprite.of(['.HHH.HHH.', 'HWHHHHHHH', '.HHHHHHH.', '...HHH...']),
    Sprite.of(['.HHHH...HHHH.', 'HHWHHH.HHHHHH', 'HHHHHHHHHHHHH', '.HHHHHHHHHHH.', '...HHHHHHH...', '.....HHH.....']),
  ]

  private static readonly PETAL_SPRITES: readonly Sprite[] = [
    Sprite.of(['PPp']),
    Sprite.of(['.PP.', 'PWPp']),
    Sprite.of(['.PPP..', 'PWPPPp', '..ppp.']),
  ]

  private static readonly PI_SPRITES: readonly Sprite[] = [
    Sprite.of(['PPPPPPP', '.P...P.', 'P....PP']),
    Sprite.of(['PPPPPPPPP', '..P...P..', '.P....P..', 'P.....PPP']),
  ]

  private static readonly FISH: readonly Sprite[] = [
    Sprite.of(['T...FFFFFF..', 'TTTFFLFFLFWk', 'T...FFFFFF..']),
    Sprite.of(['TT..FFFFFF..', '.TTFFLFFLFWk', '....FFFFFF..']),
    Sprite.of(['....FFFFFF..', '.TTFFLFFLFWk', 'TT..FFFFFF..']),
  ]

  private static readonly EGG_SPRITES: readonly Sprite[] = [
    Sprite.of(['..EEE..', '.WEEEE.', 'DEDEDED', '.EDEDE.']),
    Sprite.of(['..EEE..', '.WEDEE.', 'EDEEEDE', '.EEDEE.']),
    Sprite.of(['..EEE..', '.WEEEE.', 'DDDDDDD', '.SSSSS.']),
  ]


  private static readonly BELL = Sprite.of(['BBW', 'B.B'])

  private static readonly CHIPS: readonly Sprite[] = [Sprite.of(['XXX']), Sprite.of(['XX..', '..XX']), Sprite.of(['X', 'X']), Sprite.of(['..XX', 'XX..'])]

  private static readonly CHIPS_LONG: readonly Sprite[] = [
    Sprite.of(['XXXXX']),
    Sprite.of(['XX....', '..XX..', '....XX']),
    Sprite.of(['XX', 'XX', 'XX']),
    Sprite.of(['....XX', '..XX..', 'XX....']),
  ]

  private static readonly NOTE = Sprite.of(['...XX.', '...X.X', '...X..', 'XXXX..', '.XX...'])

  private static readonly BEAMED = Sprite.of(['...XXXXXX', '...X....X', '...X....X', 'XXXX.XXXX', '.XX...XX.'])

  static ladybug(canvas: Surface, frame: number, lift = 0): void {
    const span = canvas.width + 12
    const x = ((frame * 0.3) % span) - 6
    const y = canvas.height - 3.2 - lift
    canvas.glow(x, y, 4.4, Festive.SHELL, 0.12)
    const step = Math.sin(frame * 1.4) > 0 ? 0 : 1
    const sprite = Festive.LADYBUG[step] ?? Festive.LADYBUG[0]
    if (!sprite) return
    Festive.place(canvas, sprite, { R: Festive.SHELL, k: [30, 26, 38], K: [30, 26, 38], W: Festive.WHITE, a: [92, 84, 108], l: [92, 84, 108] }, x, y, 8, 3)
  }

  static butterflies(canvas: Surface, frame: number): void {
    for (let i = 0; i < 3; i++) {
      const span = canvas.width + 10
      const x = ((frame * 0.11 + i * span * 0.34) % span) - 5
      const y = canvas.height * (0.5 + i * 0.13) + Math.sin(frame * 0.04 + i * 3) * 5 + Math.sin(frame * 0.13 + i) * 1.2
      const flap = 0.25 + 0.75 * Math.abs(Math.sin(frame * 0.45 + i))
      const c = Festive.WINGS[i % Festive.WINGS.length] ?? Festive.WARN
      const sprite = Festive.BUTTERFLY[flap > 0.7 ? 0 : flap > 0.45 ? 1 : 2] ?? Festive.BUTTERFLY[0]
      if (sprite) Festive.place(canvas, sprite, { U: c, u: Canvas.mix(c, Festive.WHITE, 0.35), b: [60, 40, 50] }, x, y, 4, 1)
    }
  }

  static leaves(canvas: Surface, frame: number, count: number, salt: number, size: number): void {
    const h = canvas.height + 8
    for (let i = 0; i < count; i++) {
      const id = i + salt + 700
      const fall = (0.08 + Canvas.hash(id, 2) * 0.1) * size
      const y = ((Canvas.hash(id, 3) * h + frame * fall) % h) - 4
      const x = Canvas.hash(id, 1) * canvas.width + Math.sin(frame * 0.035 + id * 1.9) * 2.6 * size
      const spin = frame * (0.04 + Canvas.hash(id, 4) * 0.05) * (id % 2 === 0 ? 1 : -1) + id
      const flip = 0.25 + 0.75 * Math.abs(Math.cos(spin * 1.4))
      const c = Festive.AUTUMN[id % Festive.AUTUMN.length] ?? Festive.PUMPKIN
      Festive.leaf(canvas, x, y, 0.85 * size * (0.8 + Canvas.hash(id, 5) * 0.4), spin + Math.sin(frame * 0.05 + id) * 0.6, flip, c)
    }
  }

  static leaf(canvas: Surface, x: number, y: number, s: number, angle: number, flip: number, c: Rgb): void {
    const steps = Math.round(angle / (Math.PI / 8))
    const a = (steps * Math.PI) / 8
    const cos = Math.cos(a)
    const sin = Math.sin(a)
    const reach = Math.ceil(2.2 * s) + 1
    const r = new Raster(-reach * 2, -reach, reach * 4 + 1, reach * 2 + 1)
    const half = Math.max(0.45, 0.85 * s * flip)
    const dark = Canvas.mix(c, Festive.INK, 0.4)
    const shade = Canvas.mix(c, Festive.INK, 0.15)
    for (let j = -reach; j <= reach; j++) {
      for (let i = -reach * 2; i <= reach * 2; i++) {
        const px = i * 0.5 + 0.25
        const py = j + 0.5
        const u = px * cos + py * sin
        const v = -px * sin + py * cos
        if (u >= -1.3 * s && u <= 1.7 * s) {
          const t = (u - 0.2 * s) / (1.5 * s)
          const w = half * (1 - t * t)
          if (Math.abs(v) <= w) {
            r.dot(i, j, Math.abs(v) < 0.32 && u < 1.3 * s ? dark : v > 0 ? shade : c)
            continue
          }
        }
        if (u < -1.3 * s && u >= -2 * s && Math.abs(v) < 0.3) r.dot(i, j, dark)
      }
    }
    r.outline(0.7)
    r.blit(canvas, x, y, 1)
  }

  static petals(canvas: Surface, frame: number, count: number, salt: number, size: number): void {
    const w = canvas.width + 10
    const h = canvas.height + 6
    for (let i = 0; i < count; i++) {
      const id = i + salt + 600
      const fall = (0.06 + Canvas.hash(id, 2) * 0.07) * size
      const wind = (0.09 + Canvas.hash(id, 6) * 0.08) * size
      const y = ((Canvas.hash(id, 3) * h + frame * fall) % h) - 3
      const x = ((Canvas.hash(id, 1) * w + frame * wind) % w) - 5 + Math.sin(frame * 0.05 + id) * 1.5
      const spin = frame * (0.05 + Canvas.hash(id, 4) * 0.07) + id
      const flip = Math.abs(Math.cos(spin))
      const c = Canvas.mix(Festive.PETAL, [255, 230, 240], Canvas.hash(id, 5) * 0.7)
      const s = size * (0.85 + Canvas.hash(id, 7) * 0.3)
      const index = flip < 0.45 ? 0 : s > 1.4 ? 2 : 1
      const sprite = Festive.PETAL_SPRITES[index] ?? Festive.PETAL_SPRITES[0]
      if (sprite) Festive.place(canvas, sprite, { P: c, p: Canvas.mix(c, [180, 80, 120], 0.35), W: Canvas.mix(c, Festive.WHITE, 0.6) }, x, y, 1, 1, 0.92)
    }
  }

  static fireflies(canvas: Surface, frame: number): void {
    for (let i = 0; i < 14; i++) {
      const h = Canvas.hash(i, 541)
      const x = Canvas.hash(i, 542) * canvas.width + Math.sin(frame * 0.02 * (1 + h) + i) * 6
      const y = canvas.height * (0.35 + Canvas.hash(i, 543) * 0.6) + Math.cos(frame * 0.025 + i * 1.3) * 3
      const pulse = Math.max(0, Math.sin(frame * 0.08 * (0.7 + h) + i * 2.3))
      const blink = pulse * pulse
      canvas.glow(x, y, 3.2, Festive.FIREFLY, 0.7 * blink + 0.1)
      const a = 0.4 + 0.6 * blink
      Festive.dot(canvas, x, y, [244, 255, 190], a)
      Festive.dot(canvas, x + 0.5, y, [244, 255, 190], a)
      if (blink > 0.6) {
        Festive.dot(canvas, x - 0.5, y, Festive.FIREFLY, a * 0.6)
        Festive.dot(canvas, x + 1, y, Festive.FIREFLY, a * 0.6)
      }
    }
  }

  static hearts(canvas: Surface, frame: number, count: number, salt: number, size: number): void {
    const h = canvas.height + 10
    for (let i = 0; i < count; i++) {
      const id = i + salt + 610
      const rise = (0.07 + Canvas.hash(id, 2) * 0.07) * size
      const y = canvas.height + 5 - ((Canvas.hash(id, 3) * h + frame * rise) % h)
      const x = Canvas.hash(id, 1) * canvas.width + Math.sin(frame * 0.04 + id) * 2.5
      const beat = 1 + 0.1 * Math.max(0, Math.sin(frame * 0.35 + id * 1.3))
      const fade = Math.max(0, Math.min(1, (y + 2) / (canvas.height * 0.35)))
      const s = (0.75 + Canvas.hash(id, 4) * 0.6) * size * beat * (0.4 + 0.6 * fade)
      const c = Festive.HEARTS[id % Festive.HEARTS.length] ?? Festive.HEART
      canvas.glow(x, y, 2.6 * s, c, 0.22 * fade)
      Festive.heart(canvas, x, y, s, c)
    }
  }

  static heart(canvas: Surface, x: number, y: number, s: number, c: Rgb): void {
    const sprite = Festive.HEART_SPRITES[s < 0.85 ? 0 : s < 1.5 ? 1 : 2] ?? Festive.HEART_SPRITES[0]
    if (!sprite) return
    Festive.place(canvas, sprite, { H: c, W: Canvas.mix(c, Festive.WHITE, 0.6) }, x, y, Math.floor(sprite.width / 2), Math.floor(sprite.height / 2))
  }

  static oranges(canvas: Surface, frame: number): void {
    const period = 70
    for (let i = 0; i < 4; i++) {
      const shifted = frame + i * 17.5
      const cycle = Math.floor(shifted / period)
      const t = (shifted - cycle * period) / period
      const id = cycle * 4 + i
      const x0 = canvas.width * (0.1 + Canvas.hash(id, 551) * 0.8)
      const vx = (Canvas.hash(id, 552) - 0.5) * 34
      const x = x0 + vx * t
      const y = canvas.height + 2 - 4 * t * (1 - t) * canvas.height * (0.45 + Canvas.hash(id, 553) * 0.25)
      const spin = t * 9 + id
      canvas.glow(x, y, 2.6, Festive.ORANGE, 0.22)
      const r = new Raster(-5, -3, 11, 7)
      r.oval(0, 0, 2.6, 1.45, Festive.ORANGE)
      r.dot(-1, -1, [255, 210, 130])
      r.dot(1, 1, Canvas.mix(Festive.ORANGE, Festive.INK, 0.2))
      r.dot(2, 0, Canvas.mix(Festive.ORANGE, Festive.INK, 0.2))
      r.dot(Math.cos(spin) * 2.6, Math.sin(spin) * 1.6, Festive.LEAF)
      r.outline()
      r.blit(canvas, x, y, 1)
    }
  }

  static pis(canvas: Surface, frame: number): void {
    const h = canvas.height + 8
    for (let i = 0; i < 9; i++) {
      const id = i + 560
      const s = 0.85 + Canvas.hash(id, 4) * 0.55
      const y = canvas.height + 4 - ((Canvas.hash(id, 3) * h + frame * (0.04 + Canvas.hash(id, 2) * 0.05)) % h)
      const x = Canvas.hash(id, 1) * canvas.width + Math.sin(frame * 0.03 + id) * 3
      const fade = Math.max(0, Math.min(1, (y + 2) / (canvas.height * 0.3)))
      const c = Festive.PI_COLORS[i % Festive.PI_COLORS.length] ?? Festive.GOLD
      Festive.pi(canvas, x, y, s, Math.sin(frame * 0.04 + id * 1.7) * 0.3, c, 0.9 * fade)
    }
  }

  static pi(canvas: Surface, x: number, y: number, s: number, angle: number, c: Rgb, alpha: number): void {
    if (alpha <= 0.02) return
    canvas.glow(x, y, 3 * s, c, 0.16 * alpha)
    const sprite = Festive.PI_SPRITES[s < 1.1 ? 0 : 1] ?? Festive.PI_SPRITES[0]
    if (!sprite) return
    const lean = angle > 0.12 ? 1 : angle < -0.12 ? -1 : 0
    const r = new Raster(-sprite.width, -sprite.height, sprite.width * 2, sprite.height * 2)
    const x0 = -Math.floor(sprite.width / 2)
    const y0 = -Math.floor(sprite.height / 2)
    sprite.rows.forEach((row, j) => {
      const shift = Math.round(lean * (j - sprite.height / 2) * -0.5)
      r.stamp(Sprite.of([row]), { P: c }, x0 + shift, y0 + j)
    })
    r.outline()
    r.blit(canvas, x, y, 1, 'none', alpha)
  }

  static fishes(canvas: Surface, frame: number): void {
    const span = canvas.width + 16
    for (let i = 0; i < 5; i++) {
      const dir = i % 2 === 0 ? 1 : -1
      const travel = (frame * (0.12 + Canvas.hash(i, 561) * 0.1) + Canvas.hash(i, 562) * span) % span
      const x = dir > 0 ? travel - 8 : canvas.width + 8 - travel
      const y = canvas.height * (0.14 + 0.15 * i) + Math.sin(frame * 0.06 + i) * 1.5
      const c = Festive.PAPER[(i * 3) % Festive.PAPER.length] ?? Festive.WARN
      Festive.paperFish(canvas, x, y, 0.9 + Canvas.hash(i, 563) * 0.4, dir, c, Math.sin(frame * 0.4 + i))
    }
  }

  static paperFish(canvas: Surface, x: number, y: number, s: number, dir: number, c: Rgb, wag: number): void {
    const base = Festive.FISH[wag > 0.4 ? 1 : wag < -0.4 ? 2 : 0] ?? Festive.FISH[0]
    if (!base) return
    const sprite = dir < 0 ? base.mirrored() : base
    const palette: Palette = { F: c, T: Canvas.mix(c, Festive.INK, 0.3), L: Canvas.mix(c, Festive.WHITE, 0.45), W: Festive.WHITE, k: Festive.INK }
    Festive.place(canvas, sprite, palette, x, y, 6, 1, 1)
    if (s > 1.15) Festive.dot(canvas, x + dir * 3, y - 2, Canvas.mix(c, Festive.WHITE, 0.6), 0.8)
  }

  static egg(canvas: Surface, x: number, y: number, s: number, variant: number): void {
    const base = Festive.EGGS[variant % Festive.EGGS.length] ?? Festive.WARN
    const deco = Canvas.mix(Festive.EGGS[(variant + 3) % Festive.EGGS.length] ?? Festive.WHITE, Festive.WHITE, 0.35)
    const sprite = Festive.EGG_SPRITES[variant % 3] ?? Festive.EGG_SPRITES[0]
    if (!sprite) return
    Festive.place(canvas, sprite, { E: base, D: deco, S: Festive.WHITE, W: Canvas.mix(base, Festive.WHITE, 0.6) }, x, y + (s > 1.15 ? 0 : 0.5), 3, 2)
  }

  static eggsOn(canvas: Surface, frame: number, left: number, right: number, top: number, bottom: number): void {
    const count = Math.max(3, Math.round((right - left) / 9))
    const rows = Math.max(1, Math.floor(bottom - top))
    for (let i = 0; i < count; i++) {
      const x = left + ((i + 0.5) / count) * (right - left) + (Canvas.hash(i, 571) - 0.5) * 4
      const ground = top + Math.floor(Canvas.hash(i, 575) * rows)
      const s = 0.95 + Canvas.hash(i, 572) * 0.35
      const rock = Math.max(0, Math.sin(frame * 0.05 + i * 1.9) - 0.8) * 2.5 * Math.sin(frame * 0.6 + i)
      canvas.block(Math.round((x - 1.5) * 2) / 2, ground, 3, 1, Festive.INK, 0.28)
      Festive.egg(canvas, x + rock * 0.3, ground - 1.45 * s, s, i)
    }
  }

  static vase(canvas: Surface, frame: number, x: number, deskY: number): void {
    const glass: Rgb = [196, 230, 244]
    const water: Rgb = [112, 178, 218]
    const stem: Rgb = [92, 166, 84]
    const leaf: Rgb = [48, 146, 70]
    const vein: Rgb = [120, 200, 120]
    const bell: Rgb = [250, 252, 240]
    const sway = Math.round(Math.sin(frame * 0.05) * 0.6)
    const r = new Raster(-10, -14, 20, 15)
    r.rect(-5, -5, 3, 1, leaf)
    r.rect(-4, -6, 2, 1, leaf)
    r.rect(-3, -4, 2, 1, vein)
    r.rect(2, -5, 3, 1, leaf)
    r.rect(2, -6, 2, 1, leaf)
    r.rect(2, -4, 2, 1, vein)
    const stems: readonly (readonly [Point, Point, Point, Point, readonly number[]])[] = [
      [{ x: -1, y: -3 }, { x: -1, y: -8 }, { x: 0, y: -11 }, { x: 4 + sway, y: -9 }, [0.58, 0.76, 0.94]],
      [{ x: 1, y: -3 }, { x: -2, y: -7 }, { x: -4, y: -10 }, { x: -7 + sway, y: -7 }, [0.66, 0.9]],
    ]
    const bells: Point[] = []
    for (const [p0, p1, p2, p3, at] of stems) {
      let prev = p0
      for (let k = 1; k <= 14; k++) {
        const q = Canvas.bezier(p0, p1, p2, p3, k / 14)
        r.line(prev.x, prev.y, q.x, q.y, stem)
        prev = q
      }
      for (const t of at) bells.push(Canvas.bezier(p0, p1, p2, p3, t))
    }
    r.rect(-3, -3, 6, 3, glass, 0.9)
    r.rect(-3, -2, 6, 2, water)
    r.rect(-3, -3, 1, 3, Festive.WHITE, 0.7)
    r.outline(0.7)
    for (const q of bells) {
      r.rect(Math.round(q.x) - 1, Math.round(q.y) + 1, 2, 2, bell)
      r.dot(Math.round(q.x) - 1, Math.round(q.y) + 2, [206, 224, 200])
    }
    r.blit(canvas, x, deskY, 1)
  }

  static deskFlag(canvas: Surface, frame: number, x: number, deskY: number): void {
    const w = 6
    const h = 4
    const colors: readonly Rgb[] = [Festive.FLAG_BLACK, Festive.FLAG_YELLOW, Festive.FLAG_RED]
    const pole: Rgb = [170, 176, 190]
    const r = new Raster(-2, -10, w * 2 + 4, 12)
    for (let j = -9; j <= -1; j++) r.dot(0, j, j % 3 === 0 ? Canvas.mix(pole, Festive.WHITE, 0.4) : pole)
    r.dot(0, -10, Festive.GOLD)
    for (let i = 0; i < w * 2; i++) {
      const phase = frame * 0.18 - i * 0.5
      const wave = Math.round(Math.sin(phase) * (0.1 + i * 0.04))
      const lit = Math.cos(phase)
      const third = Math.min(2, Math.floor((i / (w * 2)) * 3))
      const base = colors[third] ?? Festive.FLAG_YELLOW
      const c = lit > 0.55 ? Canvas.mix(base, Festive.WHITE, 0.2) : lit < -0.55 ? Canvas.mix(base, Festive.INK, 0.3) : base
      r.rect(i + 1, -9 + wave, 1, h, c)
    }
    r.outline(0.6)
    r.blit(canvas, x, deskY, 1)
  }

  static sprig(canvas: Surface, x: number, base: number, s: number, sway: number, withLeaves: boolean): void {
    const leaf: Rgb = [48, 146, 70]
    const vein: Rgb = [120, 200, 120]
    const stem: Rgb = [110, 176, 92]
    const reach = Math.ceil(8 * s) + 2
    const r = new Raster(-reach * 2, -reach, reach * 4, reach + 2)
    const toPx = (p: Point): Point => ({ x: Math.round((p.x - x) * 2), y: Math.round(p.y - base) })
    const blade = (a: Point, b: Point, w: number, c: Rgb, vein: Rgb | null): void => {
      const pa = toPx(a)
      const pb = toPx(b)
      const rows = Math.max(1, pa.y - pb.y)
      for (let j = 0; j <= rows; j++) {
        const t = j / rows
        const cx = pa.x + (pb.x - pa.x) * t
        const hw = Math.max(0.5, w * 2 * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.85)))
        for (let i = Math.round(cx - hw); i <= Math.round(cx + hw); i++) r.dot(i, pa.y - j, vein && i === Math.round(cx) && t > 0.15 && t < 0.85 ? vein : c)
      }
    }
    if (withLeaves) {
      blade({ x: x - 0.3 * s, y: base }, { x: x - 1.5 * s + sway * 0.4, y: base - 5.4 * s }, 0.8 * s, leaf, vein)
      blade({ x: x + 0.3 * s, y: base }, { x: x + 1.2 * s + sway * 0.4, y: base - 3.6 * s }, 0.7 * s, Canvas.mix(leaf, vein, 0.25), null)
    } else blade({ x: x - 0.4 * s, y: base }, { x: x - 1.6 * s + sway * 0.4, y: base - 3.6 * s }, 0.6 * s, leaf, null)
    const p0: Point = { x, y: base }
    const p1: Point = { x: x + 0.2 * s, y: base - 4.2 * s }
    const p2: Point = { x: x + 1.3 * s + sway, y: base - 7.2 * s }
    const p3: Point = { x: x + 3.4 * s + sway, y: base - 5.8 * s }
    let prev = toPx(p0)
    for (let k = 1; k <= 16; k++) {
      const q = toPx(Canvas.bezier(p0, p1, p2, p3, k / 16))
      r.line(prev.x, prev.y, q.x, q.y, stem)
      prev = q
    }
    const bells: Point[] = []
    for (let b = 0; b < 5; b++) {
      const q = toPx(Canvas.bezier(p0, p1, p2, p3, 0.5 + b * 0.12))
      r.dot(q.x, q.y + 1, stem)
      bells.push({ x: q.x, y: q.y + 2 })
    }
    r.outline(0.7)
    for (const bell of bells) r.stamp(Festive.BELL, { B: [250, 252, 240], W: Festive.WHITE }, bell.x - 1, bell.y)
    canvas.glow(x + 2.2 * s, base - 5 * s, 3.4 * s, Festive.WHITE, 0.1)
    r.blit(canvas, x, base, 1)
  }

  static notes(canvas: Surface, frame: number): void {
    const h = canvas.height + 8
    for (let i = 0; i < 12; i++) {
      const id = i + 620
      const y = canvas.height + 5 - ((Canvas.hash(id, 3) * h + frame * (0.06 + Canvas.hash(id, 2) * 0.06)) % h)
      const x = Canvas.hash(id, 1) * canvas.width + Math.sin(frame * 0.05 + id * 1.7) * 3
      const fade = Math.max(0, Math.min(1, (y + 3) / (canvas.height * 0.3)))
      const c = Festive.PAPER[id % Festive.PAPER.length] ?? Festive.WARN
      Festive.note(canvas, x, y, 0.8 + Canvas.hash(id, 4) * 0.4, c, 0.9 * fade, id % 3 === 0)
    }
  }

  static note(canvas: Surface, x: number, y: number, s: number, c: Rgb, alpha: number, beamed: boolean): void {
    if (alpha <= 0.02) return
    canvas.glow(x + 0.8 * s, y - 1.2 * s, 2.8 * s, c, 0.18 * alpha)
    Festive.place(canvas, beamed ? Festive.BEAMED : Festive.NOTE, { X: c }, x, y, 1, 3, alpha)
  }

  static sabers(canvas: Surface, frame: number): void {
    const period = 120
    for (let i = 0; i < 2; i++) {
      const shifted = frame + i * 60
      const cycle = Math.floor(shifted / period)
      const t = (shifted - cycle * period) / period
      const c = Festive.SABERS[(cycle + i * 2) % Festive.SABERS.length] ?? Festive.ACCENT
      const dir = i === 0 ? 1 : -1
      const lane = canvas.height * (0.25 + Canvas.hash(cycle, 595 + i) * 0.4)
      for (let g = 2; g >= 0; g--) {
        const tg = t - g * 0.012
        const x = dir > 0 ? -12 + tg * (canvas.width + 24) : canvas.width + 12 - tg * (canvas.width + 24)
        const y = lane + Math.sin(tg * Math.PI) * -6
        const angle = Math.round((dir * tg * Math.PI * 1.6 + i) / (Math.PI / 12)) * (Math.PI / 12)
        const half = 6.5
        const a: Point = { x: x - Math.cos(angle) * half, y: y - Math.sin(angle) * half }
        const b: Point = { x: x + Math.cos(angle) * half, y: y + Math.sin(angle) * half }
        const fade = g === 0 ? 1 : 0.35 / g
        canvas.line(a, b, 2.8, c, 0.14 * fade)
        Festive.ray(canvas, a, b, c, 0.75 * fade, 1)
        Festive.ray(canvas, a, b, Canvas.mix(c, Festive.WHITE, 0.75), 0.95 * fade, 0)
        if (g === 0) Festive.ray(canvas, a, { x: a.x - Math.cos(angle) * 2, y: a.y - Math.sin(angle) * 2 }, [170, 176, 192], 1, 1)
      }
    }
  }

  static confetti(canvas: Surface, s: number, seed: number, frame: number): void {
    const fade = Math.min(1, (Festive.CELEBRATION_MS / 1000 - s) / 0.8)
    for (let i = 0; i < 60; i++) {
      const delay = Canvas.hash(i, seed + 1) * 0.4
      const ts = s - delay
      if (ts < 0) continue
      const x0 = Canvas.hash(i, seed + 2) * canvas.width
      const vy = 10 + Canvas.hash(i, seed + 3) * 6
      const y = -3 - Canvas.hash(i, seed + 8) * 24 + vy * ts + 3.5 * ts * ts
      if (y > canvas.height + 2) continue
      const sway = Math.sin(ts * (2.2 + Canvas.hash(i, seed + 4) * 2) + i) * (1.5 + Canvas.hash(i, seed + 5) * 2)
      const x = x0 + sway
      const spin = ts * (5 + Canvas.hash(i, seed + 6) * 7) + i
      const c = Festive.PAPER[i % Festive.PAPER.length] ?? Festive.WHITE
      const flip = Math.abs(Math.cos(spin * 1.3))
      const shade = Canvas.mix(c, Festive.INK, 0.35 * (1 - flip))
      const pose = ((Math.round(spin / (Math.PI / 4)) % 4) + 4) % 4
      const long = Canvas.hash(i, seed + 7) > 0.5
      Festive.chip(canvas, x, y, pose, long, flip > 0.5, shade, fade)
      if (flip > 0.92 && (i + Math.floor(frame)) % 4 === 0) canvas.glow(x, y, 1.4, c, 0.4 * fade)
    }
  }

  static sparkle(canvas: Surface, x: number, y: number, r: number, c: Rgb, alpha: number): void {
    if (alpha <= 0.01 || r <= 0) return
    canvas.glow(x, y, r * 1.6, c, 0.35 * alpha)
    const arm = Math.max(1, Math.round(r * 1.6))
    const tall = Math.max(1, Math.round(r * 0.8))
    const light = Canvas.mix(c, Festive.WHITE, 0.5)
    for (let k = 1; k <= arm; k++) {
      const a = alpha * (k === arm && arm > 1 ? 0.55 : 1)
      Festive.dot(canvas, x - k * 0.5 - 0.25, y, light, a)
      Festive.dot(canvas, x + k * 0.5 + 0.25, y, light, a)
    }
    for (let k = 1; k <= tall; k++) {
      const a = alpha * (k === tall && tall > 1 ? 0.55 : 1)
      Festive.dot(canvas, x - 0.25, y - k, light, a)
      Festive.dot(canvas, x - 0.25, y + k, light, a)
    }
    Festive.dot(canvas, x - 0.25, y, Festive.WHITE, alpha)
    Festive.dot(canvas, x + 0.25, y, Festive.WHITE, alpha)
  }

  private static dot(canvas: Surface, x: number, y: number, c: Rgb, a = 1): void {
    canvas.block(Math.round(x * 2) / 2, Math.round(y), 0.5, 1, c, a)
  }

  private static place(canvas: Surface, sprite: Sprite, palette: Palette, x: number, y: number, ax: number, ay: number, alpha = 1, outlined = true): void {
    const r = new Raster(-ax - 1, -ay - 1, sprite.width + 2, sprite.height + 2)
    r.stamp(sprite, palette, -ax, -ay)
    if (outlined) r.outline()
    r.blit(canvas, x, y, 1, 'none', alpha)
  }

  private static blade(canvas: Surface, x0: number, y0: number, x1: number, y1: number, c: Rgb, alpha: number): void {
    const ax = Math.round(x0 * 2)
    const ay = Math.round(y0)
    const bx = Math.round(x1 * 2)
    const by = Math.round(y1)
    const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay), 1)
    for (let k = 0; k <= n; k++) {
      const px = Math.round(ax + ((bx - ax) * k) / n)
      const py = Math.round(ay + ((by - ay) * k) / n)
      canvas.block(px / 2, py, 0.5, 1, k === n ? Canvas.mix(c, Festive.WHITE, 0.25) : c, alpha)
    }
  }

  private static ray(canvas: Surface, a: Point, b: Point, c: Rgb, alpha: number, spread: number): void {
    const ax = Math.round(a.x * 2)
    const ay = Math.round(a.y)
    const bx = Math.round(b.x * 2)
    const by = Math.round(b.y)
    const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay), 1)
    const steep = Math.abs(by - ay) * 2 > Math.abs(bx - ax)
    for (let k = 0; k <= n; k++) {
      const px = Math.round(ax + ((bx - ax) * k) / n)
      const py = Math.round(ay + ((by - ay) * k) / n)
      for (let d = -spread; d <= spread; d++) canvas.block((px + (steep ? d : 0)) / 2, py + (steep ? 0 : d), 0.5, 1, c, alpha)
    }
  }

  private static chip(canvas: Surface, x: number, y: number, pose: number, long: boolean, wide: boolean, c: Rgb, alpha: number): void {
    const set = long ? Festive.CHIPS_LONG : Festive.CHIPS
    const sprite = set[pose] ?? set[0]
    if (!sprite) return
    const ox = x - sprite.width * 0.25
    const oy = y - Math.floor(sprite.height / 2)
    sprite.rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) if (row[i] === 'X') Festive.dot(canvas, ox + i * 0.5, oy + j, wide ? c : Canvas.mix(c, Festive.INK, 0.15), alpha)
    })
  }
}
