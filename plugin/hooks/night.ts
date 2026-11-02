import { Canvas, type Point, type Rgb, type Surface } from './canvas'
import type { Ambience, Spot, TimeOfDay } from './effects'
import { Raster, Sprite, type Palette } from './sprite'

export class Night {
  static readonly COMET_PERIOD = 3000
  static readonly COMET_FRAMES = 190

  private static readonly COMET_CHANCE = 0.55
  private static readonly WHITE: Rgb = [255, 255, 255]
  private static readonly INK: Rgb = [12, 15, 30]
  private static readonly ACCENT_BRIGHT: Rgb = [110, 255, 232]
  private static readonly KO: Rgb = [255, 85, 115]
  private static readonly WARN: Rgb = [255, 206, 110]
  private static readonly SMOKE: Rgb = [120, 126, 146]
  private static readonly MOON: Rgb = [255, 220, 160]
  private static readonly MOON_PALE: Rgb = [214, 226, 255]
  private static readonly CANDLE: Rgb = [255, 236, 120]
  private static readonly GOLD: Rgb = [255, 208, 96]
  private static readonly SANTA: Rgb = [226, 36, 52]
  private static readonly SNOW: Rgb = [236, 244, 255]
  private static readonly BAT: Rgb = [70, 48, 100]
  private static readonly BAT_RIM: Rgb = [128, 96, 168]
  private static readonly BAT_EYE: Rgb = [255, 200, 90]
  private static readonly SUN: Rgb = [255, 238, 170]
  private static readonly SUN_LOW: Rgb = [255, 128, 64]
  private static readonly CAT: Rgb = [30, 26, 42]
  private static readonly CAT_RIM: Rgb = [176, 156, 226]
  private static readonly CAT_EYE: Rgb = [200, 255, 90]
  private static readonly CLOUD: Rgb = [214, 224, 240]
  private static readonly CLOUD_WARM: Rgb = [255, 176, 150]
  private static readonly LIGHT: Partial<Record<TimeOfDay, number>> = { night: 0.45, evening: 0.65, dawn: 0.75, sunset: 0.85 }
  private static readonly PAPER: readonly Rgb[] = [
    [255, 92, 120],
    [255, 210, 80],
    [90, 200, 255],
    [120, 236, 140],
    [190, 130, 255],
    [255, 150, 70],
    [110, 255, 232],
  ]
  private static readonly DISCO: readonly Rgb[] = [
    [255, 70, 180],
    [70, 200, 255],
    [255, 220, 70],
    [130, 255, 140],
    [180, 110, 255],
  ]
  private static readonly CRATERS: readonly (readonly [number, number, number])[] = [
    [-0.35, -0.2, 0.22],
    [0.3, 0.25, 0.17],
    [0.05, 0.5, 0.12],
    [0.42, -0.35, 0.1],
    [-0.2, 0.42, 0.09],
  ]
  private static readonly CLOUD_LAYERS: readonly (readonly [number, number, number, number, number])[] = [
    [3, 0.009, 0.16, 0.75, 0.07],
    [3, 0.02, 0.3, 1.15, 0.1],
  ]
  private static readonly PUFFS: readonly (readonly [number, number, number, number])[] = [
    [-1.6, 0.35, 1.5, 0.75],
    [-0.5, -0.2, 1.9, 1.05],
    [0.8, 0.05, 2.1, 0.95],
    [2.0, 0.4, 1.4, 0.65],
  ]

  private static readonly BAT_FRAMES: readonly Sprite[] = [
    Sprite.of(['B.....b...b.....B', 'BB....BBBBB....BB', '.BBB..BEBEB..BBB.', '..BBBBBBBBBBBBB..', '......BBBBB......']),
    Sprite.of(['......b...b......', '......BBBBB......', 'BBBBBBBEBEBBBBBBB', '.BBBBBBBBBBBBBBB.', '..B..B.BBB.B..B..']),
    Sprite.of(['......b...b......', '......BBBBB......', '...BBBBEBEBBBB...', '.BBBBBBBBBBBBBBB.', 'BBB.B..BBB..B.BBB', 'B...............B']),
  ]

  private static readonly FLAKES: readonly Sprite[] = [Sprite.of(['X.X.X', '.XWX.', 'X.X.X']), Sprite.of(['..X..', 'XXWXX', '..X..'])]

  private static readonly COOKIES: readonly Sprite[] = [
    Sprite.of(['.eeeeeeeeee.', 'eddhhhhhhdde', 'edddhhhhddde', 'eddddhhdddde', '.eeeeeeeeee.']),
    Sprite.of(['....eeeeeee.', '..eddhhhdde.', '.eddhhhhde..', 'eddhhhdde...', 'eeeeeee.....']),
    Sprite.of(['.eeeeee.', 'eddhhdde', 'eddhhdde', 'edhhhhde', 'eddhhdde', 'eddhhdde', '.eeeeee.']),
    Sprite.of(['.eeeeeee....', '.eddhhhdde..', '..edhhhhdde.', '...eddhhhdde', '.....eeeeeee']),
  ]

  private static readonly ROCKETS: readonly Sprite[] = [
    Sprite.of(['.....ff.........', 'FF..fhhhhhhhRR..', 'FCCfhhhhWWhhhRRR', 'FF..fhhhhhhhRR..', '.....ff.........']),
    Sprite.of(['..........RR', '........hhRR', '......hWWh..', '..f.hhhhh...', '..fhhhh.....', 'FCfff.......', 'FF..........']),
    Sprite.of(['...RR...', '..RRRR..', '..hhhh..', '..hWWh..', '..hhhh..', '.fhhhhf.', 'ff.hh.ff', '...CC...', '...FF...']),
  ]

  private static readonly SPARKLES: readonly Sprite[] = [
    Sprite.of(['XWX']),
    Sprite.of(['.X.', 'XWX', '.X.']),
    Sprite.of(['...X...', 'XXXWXXX', '...X...']),
    Sprite.of(['.....X.....', '.....X.....', 'XXXXXWXXXXX', '.....X.....', '.....X.....']),
  ]

  private static readonly BELL_FRAMES: readonly Sprite[] = [
    Sprite.of([
      '.www.......RR.RR.......www.',
      'wwwww......RRrRR......wwwww',
      '.wwwwwf.....GGG.....fwwwww.',
      '...wwwwwf.GGGgGGG.fwwwww...',
      '.......wwGGgGGGGGGww.......',
      '........GGgGGGGGGGG........',
      '.......DDDDDDDDDDDDD.......',
    ]),
    Sprite.of([
      '...........RR.RR...........',
      '...........RRrRR...........',
      '............GGG............',
      '..........GGGgGGG..........',
      '..wwwwwwfGGgGGGGGGfwwwwww..',
      'wwwwwwwfGGgGGGGGGGGfwwwwwww',
      '.www..fDDDDDDDDDDDDDf..www.',
    ]),
  ]

  private static readonly STAR: Sprite = Sprite.of([
    '......Y......',
    '......Y......',
    '.....YGY.....',
    'YYYGGGWGGGYYY',
    '.....YGY.....',
    '......Y......',
    '......Y......',
  ])

  private static readonly STAR_BIG: Sprite = Sprite.of([
    '.......Y.......',
    '..X....Y....X..',
    '...X..YGY..X...',
    '......YGY......',
    'YYYYGGGWGGGYYYY',
    '......YGY......',
    '...X..YGY..X...',
    '..X....Y....X..',
    '.......Y.......',
  ])

  private static readonly CAT_BODY: Sprite = Sprite.of([
    '..............C...C.',
    '..............CCCCC.',
    '..............CCCECC',
    '...CCCCCCCCCCCCCCCC.',
    '..CCCCCCCCCCCCCCCC..',
    '...CCCCCCCCCCCCCC...',
  ])

  static clouds(canvas: Surface, frame: number, ambience: Ambience): void {
    if (ambience.timeOfDay === 'evening' || ambience.timeOfDay === 'night') return
    const light = Night.LIGHT[ambience.timeOfDay] ?? 1
    const warm = ambience.timeOfDay === 'dawn' || ambience.timeOfDay === 'sunset' ? 0.45 : ambience.timeOfDay === 'afternoon' ? 0.15 : 0
    const base = Canvas.scale(Canvas.mix(Night.CLOUD, Night.CLOUD_WARM, warm), light)
    Night.CLOUD_LAYERS.forEach(([count, speed, top, size, alpha], layer) => {
      const s = size * Math.max(1, canvas.height / 40)
      const span = canvas.width + 16 * s
      for (let i = 0; i < count; i++) {
        const salt = layer * 10 + i
        const x = ((((Canvas.hash(salt, 51) * span + frame * speed * (0.8 + Canvas.hash(salt, 53) * 0.4)) % span) + span) % span) - 8 * s
        const y = canvas.height * (0.05 + top * Canvas.hash(salt, 57)) + Math.sin(frame * 0.004 + salt) * 0.4
        const k = s * (0.8 + Canvas.hash(salt, 59) * 0.5)
        const c = Canvas.mix(base, Night.WHITE, layer * 0.1)
        Night.cloud(canvas, x, y, k, c, alpha)
      }
    })
  }

  static comet(canvas: Surface, frame: number, stars: number): void {
    const window = Math.floor(frame / Night.COMET_PERIOD)
    if (Canvas.hash(window, 61) <= 1 - Night.COMET_CHANCE) return
    const local = frame - window * Night.COMET_PERIOD
    if (local < 0 || local >= Night.COMET_FRAMES) return
    const p = local / Night.COMET_FRAMES
    const dir = Canvas.hash(window, 63) > 0.5 ? 1 : -1
    const w = canvas.width
    const sx = dir > 0 ? -0.05 * w : 1.05 * w
    const sy = canvas.height * (0.1 + Canvas.hash(window, 67) * 0.2)
    const hx = sx + dir * w * 1.1 * p
    const hy = sy + Math.sin(p * Math.PI) * canvas.height * -0.05 + p * canvas.height * 0.08
    const fade = Math.min(1, Math.sin(Math.PI * p) * 2.2) * Math.min(1, stars * 1.2)
    if (fade <= 0) return
    const tail = 18
    const ty = 0.2 + 0.04 * Math.sin(frame * 0.05)
    for (let k = 8; k >= 1; k--) {
      const a = k / 8
      const x = hx - dir * tail * a
      const y = hy - tail * ty * a + Math.sin(frame * 0.09 + k) * 0.15 * a
      canvas.glow(x, y, 1.2 + a * 2.4, Canvas.mix([210, 240, 255], [120, 160, 255], a), 0.3 * (1 - a * 0.75) * fade)
    }
    canvas.line({ x: hx, y: hy }, { x: hx - dir * tail * 0.75, y: hy - tail * ty * 0.75 }, 0.45, [220, 240, 255], 0.45 * fade)
    canvas.line({ x: hx, y: hy }, { x: hx - dir * tail * 0.4, y: hy - tail * ty * 0.4 }, 0.7, Night.WHITE, 0.3 * fade)
    canvas.glow(hx, hy, 3, [200, 230, 255], 0.75 * fade)
    Night.sparkle(canvas, hx, hy, 1.6, [200, 236, 255], fade)
  }

  static harvestMoon(canvas: Surface, frame: number, spot: Spot): void {
    const { x: cx, y: cy, r } = spot
    canvas.glow(cx, cy, r * 3, [255, 150, 60], 0.14 + 0.02 * Math.sin(frame * 0.05))
    canvas.glow(cx, cy, r * 1.7, Night.MOON, 0.25)
    const tones: readonly Rgb[] = [[196, 128, 64], [226, 166, 96], Night.MOON, [255, 238, 200]]
    const ras = Night.disc(r)
    Night.sphere(ras, r, tones)
    for (const [ox, oy, cr] of Night.CRATERS) {
      ras.oval(ox * r * 2, oy * r, cr * r * 2, Math.max(0.5, cr * r), [196, 134, 72])
      ras.dot(Math.round(ox * r * 2) - 1, Math.round(oy * r), [236, 192, 128])
    }
    ras.rect(Math.round(-r * 0.9), Math.round(-r * 0.6), 2, 1, Night.WHITE, 0.55)
    ras.blit(canvas, cx, cy, 1)
  }

  static paleMoon(canvas: Surface, carve: Rgb, spot: Spot): void {
    const { x: cx, y: cy, r } = spot
    const ras = Night.disc(r)
    const rx = r * 2
    const ox = r * 0.42 * 2
    const oy = -r * 0.18
    const cr = r * 0.86
    for (let j = Math.floor(-r) - 1; j <= Math.ceil(r) + 1; j++) {
      for (let i = Math.floor(-rx) - 1; i <= Math.ceil(rx) + 1; i++) {
        const u = (i + 0.5) / rx
        const v = (j + 0.5) / r
        if (u * u + v * v > 1) continue
        const cu = (i + 0.5 - ox) / (cr * 2)
        const cv = (j + 0.5 - oy) / cr
        if (cu * cu + cv * cv <= 1) continue
        const inner = cu * cu + cv * cv < 1.35
        const outer = u * u + v * v > 0.8
        ras.dot(i, j, inner ? Canvas.mix(Night.MOON_PALE, carve, 0.3) : outer ? Canvas.mix(Night.MOON_PALE, Night.WHITE, 0.5) : Night.MOON_PALE)
      }
    }
    ras.blit(canvas, cx, cy, 1)
    canvas.glow(cx, cy, r * 3.2, Night.MOON_PALE, 0.12)
  }

  static sun(canvas: Surface, frame: number, spot: Spot, isSummer: boolean, alpha: number): void {
    const { x, y, r, lift } = spot
    const core = Canvas.mix(Night.SUN, Night.SUN_LOW, Math.pow(1 - lift, 1.5))
    const boost = isSummer ? 1.7 : 1
    canvas.glow(x, y, r * (isSummer ? 10 : 5.5), core, 0.1 * boost * alpha)
    canvas.glow(x, y, r * 2.4, core, 0.28 * boost * alpha)
    const ras = new Raster(Math.floor(-r * 4.4) - 2, Math.floor(-r * 2.2) - 2, Math.ceil(r * 8.8) + 4, Math.ceil(r * 4.4) + 4)
    const spin = frame * 0.006
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + spin
      const reach = r * (1.45 + 0.3 * Math.sin(frame * 0.05 + i * 1.7) + (i % 2) * 0.25)
      ras.line(Math.cos(a) * r * 1.3 * 2, Math.sin(a) * r * 1.3, Math.cos(a) * reach * 2, Math.sin(a) * reach, core, 0.55)
    }
    Night.sphere(ras, r, [Canvas.mix(core, Night.INK, 0.12), Canvas.mix(core, Night.WHITE, 0.2), Canvas.mix(core, Night.WHITE, 0.45), Canvas.mix(core, Night.WHITE, 0.7)])
    ras.blit(canvas, x, y, 1, 'none', alpha)
  }

  static bats(canvas: Surface, frame: number): void {
    for (let i = 0; i < 3; i++) {
      const speed = 0.22 + i * 0.07
      const span = canvas.width + 16
      const x = ((frame * speed + Canvas.hash(i, 3) * span) % span) - 8
      const y = canvas.height * (0.12 + i * 0.1) + Math.sin(frame * 0.07 + i * 2) * 3
      Night.bat(canvas, x, y, 1.3 - i * 0.15, frame + i * 3)
    }
  }

  static bat(canvas: Surface, x: number, y: number, k: number, frame: number): void {
    const flap = Math.sin(frame * 0.9)
    const sprite = flap > 0.35 ? Night.BAT_FRAMES[0] : flap < -0.35 ? Night.BAT_FRAMES[2] : Night.BAT_FRAMES[1]
    if (!sprite) return
    for (const side of [-1, 1]) canvas.glow(x + side * 0.5, y - 0.6, 0.9 * k, [255, 90, 40], 0.45)
    Raster.paint(canvas, sprite, { B: Night.BAT, b: Night.BAT_RIM, E: Night.BAT_EYE }, x, y, 1, 1, true)
  }

  static snow(canvas: Surface, frame: number, count: number, salt: number, size: number): void {
    const h = canvas.height + 6
    for (let i = 0; i < count; i++) {
      const id = i + salt
      const speed = (0.12 + Canvas.hash(id, 2) * 0.16) * size
      const y = ((Canvas.hash(id, 3) * h + frame * speed) % h) - 3
      const x0 = Canvas.hash(id, 1) * canvas.width
      const x = x0 + Math.sin(frame * 0.05 + id * 1.7) * 2
      const r = (0.3 + Canvas.hash(id, 4) * 0.35) * size
      const a = 0.55 + Canvas.hash(id, 5) * 0.4
      if (r > 0.75) {
        const spin = frame * 0.05 + id
        const sprite = Night.FLAKES[Math.floor(spin / (Math.PI / 4)) % 2 === 0 ? 0 : 1]
        canvas.glow(x, y, r * 2.2, Night.SNOW, 0.2 * a)
        if (sprite) Raster.paint(canvas, sprite, { X: Night.SNOW, W: Night.WHITE }, x, y, 1, a, false)
      } else {
        canvas.glow(x, y, r * 2.4, Night.SNOW, 0.25 * a)
        canvas.block(Math.round(x * 2) / 2, Math.round(y), r > 0.5 ? 1 : 0.5, 1, Night.SNOW, a)
      }
    }
  }

  static speculoos(canvas: Surface, frame: number): void {
    const h = canvas.height + 8
    const dough: Rgb = [150, 92, 44]
    const edge: Rgb = [100, 58, 26]
    const emboss: Rgb = [206, 146, 86]
    for (let i = 0; i < 12; i++) {
      const id = i + 300
      const speed = 0.1 + Canvas.hash(id, 2) * 0.12
      const y = ((Canvas.hash(id, 3) * h + frame * speed) % h) - 4
      const x = Canvas.hash(id, 1) * canvas.width + Math.sin(frame * 0.04 + id * 2.3) * 2.5
      const size = 1.1 + Canvas.hash(id, 4) * 0.5
      const angle = frame * (0.03 + Canvas.hash(id, 5) * 0.03) * (id % 2 === 0 ? 1 : -1) + id
      const turn = ((Math.round(angle / (Math.PI / 4)) % 4) + 4) % 4
      const sprite = Night.COOKIES[turn]
      if (sprite) Raster.paint(canvas, sprite, { e: edge, d: dough, h: emboss }, x, y, 1, 1, true)
    }
    for (let i = 0; i < 5; i++) {
      const x = 6 + Canvas.hash(i, 310) * (canvas.width - 12)
      const y = 3 + Canvas.hash(i, 311) * canvas.height * 0.5
      const twinkle = 0.5 + 0.5 * Math.sin(frame * 0.12 + i * 2.1)
      Night.sparkle(canvas, x, y, 1.1 + twinkle * 0.9, Night.GOLD, 0.45 + 0.5 * twinkle)
    }
  }

  static bellAt(canvas: Surface, frame: number, i: number): Point {
    const span = canvas.width + 24
    const x = canvas.width + 12 - ((frame * 0.15 + i * span * 0.5) % span)
    const y = canvas.height * (0.16 + i * 0.16) + Math.sin(frame * 0.05 + i * 2) * 2.5
    return { x, y }
  }

  static bell(canvas: Surface, x: number, y: number, s: number, swing: number, frame: number): void {
    const flap = Math.sin(frame * 0.45)
    const sprite = Night.BELL_FRAMES[flap > 0 ? 0 : 1]
    if (!sprite) return
    canvas.glow(x, y, 4 * s, Night.GOLD, 0.12)
    const gold = Night.GOLD
    const palette: Palette = {
      w: [240, 244, 255],
      f: [196, 204, 226],
      R: Night.SANTA,
      r: Canvas.mix(Night.SANTA, Night.WHITE, 0.3),
      G: gold,
      g: Canvas.mix(gold, Night.WHITE, 0.6),
      D: Canvas.mix(gold, Night.INK, 0.4),
    }
    const lean = -swing * 0.6
    const x0 = -Math.floor(sprite.width / 2)
    const y0 = -4
    const ras = new Raster(x0 - 6, y0 - 2, sprite.width + 12, sprite.height + 6)
    sprite.rows.forEach((row, j) => {
      const shift = Math.round(lean * (j - 2))
      for (let i = 0; i < row.length; i++) {
        const c = palette[row[i] ?? '.']
        if (c) ras.dot(x0 + i + shift, y0 + j, c)
      }
    })
    const tail = Math.round(Math.sin(frame * 0.2))
    ras.rect(4 + Math.round(lean * -3), y0 + 1 + tail, 3, 1, Night.SANTA)
    ras.rect(-1 + Math.round(-swing * 1.5 + lean * 5), y0 + 7, 2, 1, palette.D ?? gold)
    ras.outline()
    ras.blit(canvas, x, y, 1)
  }

  static guidingStar(canvas: Surface, frame: number): void {
    const x = canvas.width * 0.8 + Math.sin(frame * 0.02) * 1.5
    const y = canvas.height * 0.14 + Math.cos(frame * 0.025) * 0.8
    const tail: Point = { x: -24, y: 10 }
    for (let k = 0; k < 8; k++) {
      const a = k / 8
      const b = (k + 1) / 8
      canvas.line({ x: x + tail.x * a, y: y + tail.y * a }, { x: x + tail.x * b, y: y + tail.y * b }, 2.4 * (1 - a) + 0.3, Canvas.mix(Night.WHITE, Night.GOLD, a), 0.3 * (1 - a))
    }
    for (let j = 0; j < 9; j++) {
      const p = (frame * 0.008 + j / 9) % 1
      const px = x + tail.x * p + Math.sin(frame * 0.07 + j * 2) * 0.8
      const py = y + tail.y * p + (Canvas.hash(j, 481) - 0.5) * 3 * p
      Night.sparkle(canvas, px, py, 0.5 + 0.5 * (1 - p), Night.GOLD, 0.8 * (1 - p))
    }
    const pulse = 0.85 + 0.15 * Math.sin(frame * 0.15)
    canvas.glow(x, y, 8, Night.GOLD, 0.3)
    const sprite = pulse > 0.93 ? Night.STAR_BIG : Night.STAR
    Raster.paint(canvas, sprite, { Y: Canvas.mix(Night.GOLD, Night.WHITE, 0.35), G: Night.GOLD, W: Night.WHITE, X: Canvas.mix(Night.WHITE, Night.GOLD, 0.3) }, x, y, 1, 1, true)
  }

  static walkingCat(canvas: Surface, frame: number, baseline: number = canvas.height, left = 0, right: number = canvas.width): void {
    const s = 1.25
    const lo = left + 5
    const span = Math.max(1, right - 5 - lo)
    const x = lo + ((frame * 0.16) % span)
    const fade = Math.max(0, Math.min(1, (x - lo) / 3, (lo + span - x) / 3))
    const y = baseline - 3.1 * s
    const step = frame * 0.45
    const sway = Math.round(Math.sin(frame * 0.09) * 1.2)
    const ras = new Raster(-14, -10, 28, 16)
    const blink = (frame + 13) % 55 < 2.5
    ras.stamp(Night.CAT_BODY, { C: Night.CAT, E: blink ? Night.CAT : Night.CAT_EYE }, -10, -5)
    const tail: readonly (readonly [number, number])[] = [
      [-8, -2],
      [-9, -3],
      [-10, -4],
      [-10, -5],
      [-10, -6],
      [-9, -7],
    ]
    tail.forEach(([tx, ty], j) => ras.rect(tx + (j >= 3 ? sway : 0), ty, 2, 1, Night.CAT))
    const ground = Math.round(baseline - 0.4 - y)
    const legs = [-5, -3, 3, 5] as const
    legs.forEach((lx, j) => {
      const swing = Math.round(Math.sin(step + (j % 2) * Math.PI + (j > 1 ? 0.6 : 0)) * 1.2)
      for (let row = 1; row < ground; row++) ras.dot(lx + (row === ground - 1 ? swing : row === ground - 2 ? Math.round(swing / 2) : 0), row, Night.CAT)
    })
    Night.rim(ras, Night.CAT_RIM, 0.7)
    canvas.glow(x + 4, y - 3, 1.6 * s, Night.CAT_EYE, 0.45 * fade)
    ras.blit(canvas, x, y, 1, 'none', fade)
  }

  static brokenMirror(canvas: Surface, frame: number, at?: Point, scale = 1): void {
    const cx = at?.x ?? canvas.width * 0.88
    const cy = at?.y ?? canvas.height * 0.2
    const rx = 3.2
    const ry = 4.3
    canvas.glow(cx, cy, 7 * scale, [180, 196, 230], 0.1)
    const ras = new Raster(-10, -7, 20, 14)
    ras.oval(0, 0, (rx + 0.8) * 2, ry + 0.8, [120, 86, 40])
    ras.oval(0, 0, (rx + 0.4) * 2, ry + 0.4, Canvas.mix(Night.GOLD, Night.INK, 0.25))
    ras.oval(0, 0, rx * 2, ry, [92, 108, 140])
    ras.line(-rx * 1.4, ry * 0.2, -rx * 0.2, -ry * 0.75, [150, 166, 200])
    const hit: Point = { x: 1, y: -1 }
    const mids: Point[] = []
    for (let j = 0; j < 7; j++) {
      const a = (j / 7) * Math.PI * 2 + 0.3
      const bend = a + (Canvas.hash(j, 601) - 0.5) * 0.7
      const mid: Point = { x: hit.x + Math.cos(a) * 2.8, y: hit.y + Math.sin(a) * 1.6 }
      const reach = 0.95 / Math.sqrt(Math.pow(Math.cos(bend) / rx, 2) + Math.pow(Math.sin(bend) / ry, 2))
      ras.line(hit.x, hit.y, mid.x, mid.y, [230, 240, 255], 0.9)
      ras.line(mid.x, mid.y, Math.cos(bend) * reach * 2, Math.sin(bend) * reach, [210, 224, 250], 0.75)
      mids.push(mid)
    }
    ras.dot(hit.x, hit.y, Night.WHITE)
    ras.outline()
    ras.blit(canvas, cx, cy, scale)
    mids.forEach((mid, j) => {
      const tw = Math.sin(frame * 0.12 + j * 2.3)
      if (tw > 0.6) Night.sparkle(canvas, cx + mid.x * 0.5 * scale, cy + mid.y * scale, 0.6 + (tw - 0.6) * 2.5, [200, 220, 255], (tw - 0.6) * 2.5)
    })
  }

  static mirrorBall(canvas: Surface, frame: number): void {
    const cx = canvas.width / 2
    const r = Math.max(3, Math.min(4.5, canvas.height * 0.07))
    const cy = r + 1.5
    canvas.glow(cx, cy, r * 2.6, [200, 210, 255], 0.18)
    const ras = Night.disc(r, Math.ceil(cy))
    for (let j = -Math.ceil(cy); j < -Math.round(r); j++) ras.dot(0, j, [150, 160, 190])
    const spin = frame * 0.12
    const rx = r * 2
    for (let j = Math.floor(-r) - 1; j <= Math.ceil(r) + 1; j++) {
      for (let i = Math.floor(-rx) - 1; i <= Math.ceil(rx) + 1; i++) {
        const u = (i + 0.5) / rx
        const v = (j + 0.5) / r
        const d = u * u + v * v
        if (d > 1) continue
        const lat = Math.asin(Math.max(-1, Math.min(1, v)))
        const ring = Math.cos(lat)
        const lon = Math.asin(Math.max(-1, Math.min(1, ring > 0.01 ? u / ring : 0)))
        const ti = Math.floor(((lon + spin) / (Math.PI * 2)) * 10 * 2)
        const tj = Math.floor(((lat + Math.PI / 2) / Math.PI) * 5)
        const grout = ((lon + spin) / (Math.PI * 2)) * 20 - ti < 0.18
        const light = 0.35 + 0.65 * Canvas.hash(ti * 7 + tj, Math.floor((spin + ti) / 2.1))
        const facing = Math.sqrt(1 - d)
        const c = grout ? [70, 76, 100] as Rgb : Canvas.mix([90, 98, 128], [236, 242, 255], light * (0.4 + 0.6 * facing))
        ras.dot(i, j, c)
      }
    }
    ras.rect(Math.round(-r * 0.9), Math.round(-r * 0.55), 2, 1, Night.WHITE, 0.8)
    ras.outline()
    ras.blit(canvas, cx, cy, 1)
    for (let g = 0; g < 2; g++) {
      const ph = frame * 0.35 + g * 2.4
      const tw = Math.max(0, Math.sin(ph))
      const ang = Canvas.hash(Math.floor(ph / Math.PI), g) * Math.PI * 2
      const gx = cx + Math.cos(ang) * r * 0.6
      const gy = cy + Math.sin(ang) * r * 0.6
      const c = Night.DISCO[(g + Math.floor(frame / 10)) % Night.DISCO.length] ?? Night.WHITE
      Night.sparkle(canvas, gx, gy, 1.2 + tw * 0.8, c, tw)
    }
  }

  static rocket(canvas: Surface, center: Point, s: number, seed: number, frame: number): void {
    const target: Point = { x: canvas.width - 8 - Canvas.hash(seed, 3) * 6, y: 5 + Canvas.hash(seed, 4) * 4 }
    const flight = 2.2
    const path = (q: number): Point => {
      const e = q * q * (3 - 2 * q) * 0.35 + q * q * 0.65
      const bend = Math.sin(e * Math.PI) * 6
      return { x: center.x + (target.x - center.x) * e - bend * 0.3, y: center.y + (target.y - center.y) * e - bend }
    }
    const q = Math.min(1, s / flight)
    for (let k = 1; k <= 12; k++) {
      const back = q - k * 0.035
      if (back <= 0) break
      const p = path(back)
      const age = k / 12
      const wob = (Canvas.hash(k, seed + Math.floor(s * 12.5)) - 0.5) * 0.6
      const fade = s > flight ? Math.max(0, 1 - (s - flight) / 1.2) : 1
      canvas.fillCircle(p.x + wob, p.y + age * 1.2, 0.7 + age * 1.6, Canvas.mix([210, 214, 230], Night.SMOKE, age), 0.5 * (1 - age) * fade)
    }
    if (s < flight) {
      const p = path(q)
      const next = path(Math.min(1, q + 0.02))
      const ang = Math.atan2(next.y - p.y, next.x - p.x)
      Night.rocketShip(canvas, p, ang, frame)
      return
    }
    const tb = s - flight
    const life = 1.6
    if (tb > life) return
    const fade = 1 - tb / life
    if (tb < 0.2) canvas.glow(target.x, target.y, 8, Night.WARN, 0.6 * (1 - tb * 5))
    const r = 8 * (1 - Math.exp(-4 * tb))
    for (let j = 0; j < 10; j++) {
      const ang = (j / 10) * Math.PI * 2 - Math.PI / 2
      const c = Night.PAPER[j % Night.PAPER.length] ?? Night.WARN
      Night.sparkle(canvas, target.x + Math.cos(ang) * r, target.y + Math.sin(ang) * r * 0.9 + tb * tb * 2, 1 + (j % 2) * 0.4, c, fade)
    }
    Night.sparkle(canvas, target.x, target.y, 2.2 * fade + 0.6, Night.WARN, fade)
  }

  static rocketShip(canvas: Surface, p: Point, angle: number, frame: number): void {
    const flick = 0.75 + 0.25 * Canvas.hash(Math.floor(frame), 17)
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    canvas.glow(p.x - cos * 2.6, p.y - sin * 2.6, 3, [255, 150, 60], 0.55)
    const octant = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8
    const base = Night.ROCKETS[[0, 1, 2, 1, 0, 1, 2, 1][octant] ?? 0]
    if (!base) return
    const left = octant >= 3 && octant <= 5
    const down = octant >= 1 && octant <= 3
    const turned = left ? base.mirrored() : base
    const sprite = down ? Sprite.of([...turned.rows].reverse()) : turned
    const palette: Palette = {
      R: Night.KO,
      f: Canvas.mix(Night.KO, Night.INK, 0.25),
      h: [196, 204, 226],
      W: Night.ACCENT_BRIGHT,
      C: Night.CANDLE,
      F: flick > 0.88 ? Night.CANDLE : [255, 120, 40],
    }
    Raster.paint(canvas, sprite, palette, p.x, p.y, 1, 1, true)
    canvas.glow(p.x - cos * 2.7, p.y - sin * 2.7, 1.4, Night.CANDLE, 0.6 * flick)
  }

  private static sparkle(canvas: Surface, x: number, y: number, r: number, c: Rgb, alpha: number): void {
    if (alpha <= 0.01 || r <= 0) return
    canvas.glow(x, y, r * 1.6, c, 0.45 * alpha)
    const sprite = Night.SPARKLES[r < 0.7 ? 0 : r < 1.3 ? 1 : r < 2.2 ? 2 : 3]
    if (sprite) Raster.paint(canvas, sprite, { X: Canvas.mix(c, Night.WHITE, 0.5), W: Night.WHITE }, x, y, 1, Math.min(1, alpha), false)
  }

  private static cloud(canvas: Surface, x: number, y: number, k: number, c: Rgb, alpha: number): void {
    const w = Math.ceil(4 * k) + 2
    const h = Math.ceil(2.2 * k) + 2
    const ras = new Raster(-w * 2, -h, w * 4, h * 2)
    for (const [ox, oy, rx, ry] of Night.PUFFS) ras.oval(ox * k * 2, oy * k, rx * k * 2, ry * k, c)
    ras.oval(0.4 * k, 0.55 * k, 6 * k, 0.45 * k, c)
    const shade = Canvas.mix(c, Night.INK, 0.12)
    const top = Canvas.mix(c, Night.WHITE, 0.35)
    const marks: [number, number, Rgb][] = []
    for (let j = ras.top; j < ras.top + ras.height; j++) {
      for (let i = ras.left; i < ras.left + ras.width; i++) {
        if (!ras.has(i, j)) continue
        if (!ras.has(i, j + 1) || !ras.has(i, j + 2)) marks.push([i, j, shade])
        else if (!ras.has(i, j - 1)) marks.push([i, j, top])
      }
    }
    for (const [i, j, m] of marks) ras.dot(i, j, m)
    ras.blit(canvas, x, y, 1, 'none', alpha)
  }

  private static disc(r: number, above = 0): Raster {
    const rx = Math.ceil(r * 2) + 3
    const ry = Math.ceil(r) + 3
    return new Raster(-rx, -ry - above, rx * 2, ry * 2 + above)
  }

  private static sphere(ras: Raster, r: number, tones: readonly Rgb[]): void {
    const rx = r * 2
    const n = tones.length
    for (let j = Math.floor(-r) - 1; j <= Math.ceil(r) + 1; j++) {
      for (let i = Math.floor(-rx) - 1; i <= Math.ceil(rx) + 1; i++) {
        const u = (i + 0.5) / rx
        const v = (j + 0.5) / r
        const d = u * u + v * v
        if (d > 1) continue
        const nz = Math.sqrt(1 - d)
        const light = 0.5 + 0.55 * (-u * 0.55 - v * 0.55 + nz * 0.6) - 0.2
        const band = Math.max(0, Math.min(n - 1, Math.floor(light * n)))
        const c = tones[band]
        if (c) ras.dot(i, j, c)
      }
    }
  }

  private static rim(ras: Raster, c: Rgb, alpha: number): void {
    const marks: [number, number][] = []
    for (let j = ras.top; j < ras.top + ras.height; j++) {
      for (let i = ras.left; i < ras.left + ras.width; i++) {
        if (ras.has(i, j)) continue
        if (ras.has(i - 1, j) || ras.has(i + 1, j) || ras.has(i, j - 1) || ras.has(i, j + 1)) marks.push([i, j])
      }
    }
    for (const [i, j] of marks) ras.dot(i, j, c, alpha)
  }
}
