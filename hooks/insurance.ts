import type { FlowEvent } from '../types'
import { Canvas, type Point, type Rgb } from './canvas'
import { Raster, Sprite, type Palette } from './sprite'

export type Business = { branch: string; wi: string; secured: ReadonlySet<string> }

export type Weather = { isRaining: boolean; clearing: number }

export type ClaimKind = 'water' | 'fire' | 'collision'

export type DecorKind = 'policy' | 'policyholder' | 'database' | 'registry' | 'claim' | 'receipt' | 'commission'

export class Insurance {
  static readonly CLEAR_MS = 2200
  static readonly PAID_MS = 1800
  static readonly COIN_MS = 2400
  static readonly WALL_MS = 2600
  static readonly OK_STAMP: Rgb = [30, 150, 84]
  static readonly KO_STAMP: Rgb = [200, 36, 56]
  static readonly CLAIMS: readonly ClaimKind[] = ['water', 'fire', 'collision']
  static readonly DECORS: readonly { kind: DecorKind; words: readonly string[] }[] = [
    { kind: 'policy', words: ['policy', 'policies', 'contract', 'contracts'] },
    { kind: 'claim', words: ['claim', 'claims', 'loss', 'losses'] },
    { kind: 'receipt', words: ['receipt', 'receipts', 'invoice', 'invoices', 'premium', 'premiums'] },
    { kind: 'commission', words: ['commission', 'commissions'] },
    { kind: 'database', words: ['database', 'databases', 'lookup', 'integration', 'sync'] },
    { kind: 'registry', words: ['registry', 'registries', 'company', 'companies', 'naics', 'nace'] },
    { kind: 'policyholder', words: ['policyholder', 'policyholders', 'customer', 'customers', 'history', 'audit'] },
  ]

  private static readonly WHITE: Rgb = [255, 255, 255]
  private static readonly INK: Rgb = [16, 20, 34]
  private static readonly TEAL: Rgb = [0, 170, 152]
  private static readonly TEAL_LIGHT: Rgb = [110, 255, 232]
  private static readonly TEAL_DARK: Rgb = [0, 96, 88]
  private static readonly RAIN: Rgb = [150, 200, 255]
  private static readonly WOOD: Rgb = [120, 76, 44]
  private static readonly GOLD: Rgb = [255, 206, 84]
  private static readonly GOLD_DARK: Rgb = [196, 140, 40]
  private static readonly OK: Rgb = [40, 170, 96]
  private static readonly OK_DARK: Rgb = [16, 96, 52]
  private static readonly KO: Rgb = [214, 40, 60]
  private static readonly WATER: Rgb = [90, 170, 255]
  private static readonly FIRE: Rgb = [255, 120, 30]
  private static readonly FIRE_HOT: Rgb = [255, 224, 90]
  private static readonly FIRE_DEEP: Rgb = [214, 40, 30]
  private static readonly CAR: Rgb = [230, 60, 70]
  private static readonly GLASS: Rgb = [170, 220, 255]
  private static readonly TYRE: Rgb = [30, 30, 36]
  private static readonly SHIELD: Rgb = [120, 200, 255]
  private static readonly STEEL: Rgb = [176, 186, 206]
  private static readonly BRICK: Rgb = [178, 84, 60]
  private static readonly BRICK_DARK: Rgb = [120, 52, 40]
  private static readonly PAPER: Rgb = [244, 240, 228]
  private static readonly PAPER_SHADE: Rgb = [196, 188, 172]
  private static readonly LINE: Rgb = [140, 146, 168]
  private static readonly MANILA: Rgb = [226, 186, 110]
  private static readonly MANILA_DARK: Rgb = [176, 136, 70]
  private static readonly BLUE_INK: Rgb = [52, 90, 210]
  private static readonly RAINBOW: readonly Rgb[] = [
    [255, 72, 72],
    [255, 160, 50],
    [255, 230, 70],
    [80, 210, 110],
    [70, 150, 255],
    [150, 100, 240],
  ]

  private static readonly DOCUMENT = Sprite.of(['ttttt.', 'tWggtt', 'tWggWt', 'tttttt'])

  private static readonly FLAME = [
    Sprite.of(['..h...', '.hoh..', '.oood.', 'odoodo', '.dddd.']),
    Sprite.of(['...h..', '..hoh.', '.dooo.', 'odoodo', '.dddd.']),
    Sprite.of(['..hh..', '.hooh.', '.oodo.', 'oddood', '.dddd.']),
  ]

  private static readonly CAR_SPRITE = Sprite.of(['...gggg...', '..cGGGGc..', 'cccccccccc', 'cWccccccWc', '.tt....tt.'])

  private static readonly STAR = Sprite.of(['.X.', 'XXX', '.X.'])

  private static readonly PADLOCK = Sprite.of(['.ss.', 's..s', 'GGGG', 'GkGG', 'GGGG'])

  private static readonly SHIELD_404 = Sprite.of(['GGGGGGGGGG', 'GLLLLLLLLG', 'GLLLLLLLLG', 'GLLLLLLLLG', '.GLLLLLLG.', '..GLLLLG..', '...GGGG...'])

  private static readonly PIGGY = Sprite.of([
    '.....TTTTTT.e...',
    '...TTTTssTTTee..',
    '..TTTTTTTTTTTTT.',
    '.TTTTTTTTTTTkTnn',
    'TTTTTTTTTTTTTTnn',
    '.TTTTTTTTTTTTTT.',
    '..TT.TT...TT.TT.',
  ])

  private static readonly COIN = Sprite.of(['.GG.', 'GgGG', 'GGGG', '.GG.'])

  private static readonly DECOR_SPRITES: Readonly<Record<DecorKind, Sprite>> = {
    policy: Sprite.of(['PPPPPPPPPP.', 'PllllllllP.', 'PllllllPP..', 'PPPPPPPPP.b', 'P.bbb.bPPbb', 'PPPPPPPPbb.', '.......w...']),
    policyholder: Sprite.of(['..MM........', '..PPPPPPPPP.', '.MMPlllllP..', '.PPPPPPPPPP.', 'MMPllllllP..', 'PPPPPPPPPPP.', 'PlllllllllP.', 'PPPPPPPPPPP.']),
    database: Sprite.of(['...PPPP...', '...PllP...', '...PPPP...', 'SSSSSSSSSS', 'SkkkkkkkkS', 'SSSSSSSSSS', 'S.kk..kk.S', 'SSSSSSSSSS']),
    registry: Sprite.of(['...WW...', '...WW...', '..WWWW..', '.SSSSSS.', 'RRRRRRRR', 'R......R', 'RRRRRRRR']),
    claim: Sprite.of(['MMMM......', 'MMMMMMMMMM', 'MPPPPPPPPM', 'MPRRPPPPPM', 'MPRRPllPPM', 'MPPPPPPPPM', 'MMMMMMMMMM']),
    receipt: Sprite.of(['PPPPPPPPPP', 'P.P.P.P.P.', 'PllllllllP', 'PllllllllP', 'PPPPPPPPPP', 'MMMMMMMMMM']),
    commission: Sprite.of(['.GG..GG..GG.', 'GGGGGGGGGGGG', '.GG..GG..GG.', 'GGGG.GGGGGG.', '.GG..GG..GG.', 'GGGGGGGGGGGG']),
  }

  private static readonly DECOR_PALETTE: Palette = {
    P: Insurance.PAPER,
    l: Insurance.LINE,
    b: Insurance.BLUE_INK,
    w: Insurance.WOOD,
    M: Insurance.MANILA,
    S: Insurance.STEEL,
    k: Insurance.INK,
    R: Insurance.KO,
    G: Insurance.GOLD,
  }

  static weather(events: readonly FlowEvent[], at: number): Weather {
    let last: FlowEvent | undefined
    let previous: FlowEvent | undefined
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i]
      if (!e || e.at > at || e.kind !== 'verif' || Insurance.outcome(e) === undefined) continue
      if (!last) last = e
      else {
        previous = e
        break
      }
    }
    if (!last) return { isRaining: false, clearing: -1 }
    if (Insurance.outcome(last) === false) return { isRaining: true, clearing: -1 }
    const age = at - last.at
    if (previous && Insurance.outcome(previous) === false && age < Insurance.CLEAR_MS) return { isRaining: false, clearing: age / Insurance.CLEAR_MS }
    return { isRaining: false, clearing: -1 }
  }

  static paid(events: readonly FlowEvent[], at: number): number {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i]
      if (!e || e.at > at) continue
      const age = at - e.at
      if (age > Insurance.PAID_MS) return -1
      if (e.kind === 'verif' && Insurance.outcome(e) === true) return age / Insurance.PAID_MS
    }
    return -1
  }

  static coins(events: readonly FlowEvent[], at: number): number[] {
    const ages: number[] = []
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i]
      if (!e || e.at > at) continue
      const age = at - e.at
      if (age > Insurance.COIN_MS) break
      if (e.kind === 'tool' && !e.isError && Insurance.isDeal(e.label)) ages.push(age)
    }
    return ages
  }

  static isDeal(label: string): boolean {
    return /\bgit\s+commit\b|\b(az\s+repos\s+pr|gh\s+pr|glab\s+mr)\s+create\b/.test(label)
  }

  static isAnimated(events: readonly FlowEvent[], at: number): boolean {
    const weather = Insurance.weather(events, at)
    return weather.isRaining || weather.clearing >= 0 || Insurance.paid(events, at) >= 0 || Insurance.coins(events, at).length > 0
  }

  static claim(agentId: string): ClaimKind {
    let h = 2166136261
    for (let i = 0; i < agentId.length; i++) h = Math.imul(h ^ agentId.charCodeAt(i), 16777619) >>> 0
    return Insurance.CLAIMS[h % Insurance.CLAIMS.length] ?? 'water'
  }

  static decor(branch: string, wi: string): DecorKind | undefined {
    const tokens = Insurance.tokens(branch, wi)
    return Insurance.DECORS.find(d => d.words.some(w => tokens.has(w)))?.kind
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
      canvas.block(x, y, 0.5, 2, Insurance.RAIN, 0.75)
    }
    if (!canopy) return
    for (const edge of [canopy.left, canopy.right]) {
      const fall = Math.round((frame * 0.8) % 8)
      canvas.block(Math.round(edge * 2) / 2, canopy.top + 7 + fall, 0.5, 1, Insurance.RAIN, 0.8)
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
        r.dot(i, j, j === 1 && i > -half + 2 && i < -half + 7 ? Insurance.TEAL_LIGHT : band ? Insurance.TEAL : Insurance.WHITE)
      }
    }
    r.rect(-1, -3, 2, 3, Insurance.TEAL_DARK)
    const handle: Point = { x: 13, y: 33 }
    r.line(0, rows, handle.x, handle.y, Insurance.WOOD)
    r.line(1, rows, handle.x + 1, handle.y, Insurance.WOOD)
    r.dot(handle.x + 2, handle.y + 1, Insurance.WOOD)
    r.dot(handle.x + 1, handle.y + 2, Insurance.WOOD)
    r.dot(handle.x, handle.y + 1, Insurance.WOOD)
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
    Insurance.RAINBOW.forEach((c, k) => {
      const rx = 18 - k * 0.5
      const ry = 9 - k
      for (let a = 0; a <= 60; a++) {
        const ang = Math.PI * (a / 60)
        canvas.block(Math.round((cx + Math.cos(ang) * rx) * 2) / 2, Math.round(top + 2 - Math.sin(ang) * ry), 0.5, 1, c, 0.7 * fade)
      }
    })
  }

  static document(canvas: Canvas, x: number, y: number, tint: Rgb, alpha: number): void {
    Raster.paint(canvas, Insurance.DOCUMENT, { t: tint, W: Insurance.PAPER, g: Insurance.LINE }, x, y, 1, alpha, false)
  }

  static claimFx(canvas: Canvas, x: number, y: number, scale: number, kind: ClaimKind, frame: number): void {
    const head = y - 7.5 * scale
    const foot = y + 7.5 * scale
    switch (kind) {
      case 'water': {
        const u = ((frame * 0.05) % 1 + 1) % 1
        const dy = head - 4 + (foot - head + 4) * u
        Raster.paint(canvas, Sprite.of(['.w.', 'www', '.w.']), { w: Insurance.WATER }, x - 2, dy, 1, 1, true)
        Raster.paint(canvas, Sprite.of(['..wwwwww..', 'wwwwwwwwww']), { w: Insurance.WATER }, x, foot + 2, 1, 0.8, true)
        return
      }
      case 'fire': {
        const sprite = Insurance.FLAME[Math.floor(frame / 3) % Insurance.FLAME.length] ?? Insurance.FLAME[0]
        if (sprite) Raster.paint(canvas, sprite, { h: Insurance.FIRE_HOT, o: Insurance.FIRE, d: Insurance.FIRE_DEEP }, x + 3, head - 1, 1, 1, true)
        canvas.glow(x + 3, head, 3, Insurance.FIRE, 0.25)
        return
      }
      case 'collision': {
        const bump = Math.round(Math.abs(Math.sin(frame * 0.2)))
        Raster.paint(canvas, Insurance.CAR_SPRITE, { c: Insurance.CAR, g: Insurance.GLASS, G: Insurance.GLASS, W: Insurance.WHITE, t: Insurance.TYRE }, x + (x < canvas.width / 2 ? -1 : 1) * (7 * scale + 3 + bump * 0.5), foot - 1, 1, 1, true)
        for (let k = 0; k < 3; k++) {
          const ang = frame * 0.15 + (k * Math.PI * 2) / 3
          Raster.paint(canvas, Insurance.STAR, { X: Insurance.GOLD }, x + Math.cos(ang) * 4, head - 2 + Math.sin(ang) * 1.5, 1, 1, false)
        }
      }
    }
  }

  static stamp(canvas: Canvas, x: number, y: number, text: string, color: Rgb, t: number): void {
    if (t < 0.12 || t > 1) return
    const label = ` ${text} `
    canvas.text(Math.round(x - label.length / 2), Math.floor(y / 2), label, Insurance.WHITE, color)
  }

  static shield(canvas: Canvas, x: number, y: number, scale: number, frame: number): void {
    const w = Math.round(7 * scale + 2)
    const h = Math.round(9 * scale + 2)
    const r = new Raster(-2 * w - 2, -h - 2, 4 * w + 4, 2 * h + 8)
    const pulse = 0.5 + 0.3 * Math.sin(frame * 0.2)
    for (let j = -h + 1; j <= h + 3; j++) {
      const narrow = j > 0 ? Math.round((j / (h + 3)) * w * 2) : 0
      const round = j === -h + 1 ? 1 : 0
      r.rect(-w * 2 + narrow + round, j, 2, 1, Insurance.SHIELD)
      r.rect(w * 2 - narrow - round - 2, j, 2, 1, Insurance.SHIELD)
    }
    r.rect(-w * 2 + 2, -h, w * 4 - 4, 1, Insurance.SHIELD)
    r.blit(canvas, x, y, 1, 'none', pulse)
    Raster.paint(canvas, Insurance.PADLOCK, { s: Insurance.STEEL, G: Insurance.GOLD, k: Insurance.INK }, x + w + 1, y - h + 1, 1, 1, true)
  }

  static wall(canvas: Canvas, from: Point, to: Point, t: number): void {
    if (t < 0 || t >= 1) return
    const rise = Math.min(1, t * 4)
    const fade = t > 0.75 ? (1 - t) / 0.25 : 1
    const at: Point = { x: from.x + (to.x - from.x) * 0.38, y: from.y + (to.y - from.y) * 0.38 }
    const rows = Math.max(1, Math.round(4 * rise))
    const r = new Raster(-12, -5, 24, 6)
    for (let j = 0; j < rows; j++) {
      r.rect(-11, -j, 22, 1, Insurance.BRICK)
      for (let i = -11 + (j % 2 === 0 ? 0 : 2); i < 11; i += 4) r.dot(i, -j, Insurance.BRICK_DARK)
    }
    r.outline()
    r.blit(canvas, at.x, at.y + 4, 1, 'none', fade)
  }

  static shield404(canvas: Canvas, x: number, y: number, t: number): void {
    if (t < 0.1 || t > 1) return
    Raster.paint(canvas, Insurance.SHIELD_404, { G: Insurance.OK_DARK, L: Insurance.OK }, x, y, 1, 1, true)
    canvas.text(Math.round(x - 1.5), Math.floor((y - 1) / 2), '404', Insurance.WHITE, Insurance.OK)
  }

  static piggy(canvas: Canvas, x: number, y: number, ages: readonly number[]): void {
    if (ages.length === 0) return
    const youngest = Math.min(...ages)
    const pop = Math.min(1, youngest / 200)
    const leave = Math.max(0, (youngest - (Insurance.COIN_MS - 400)) / 400)
    const alpha = Math.max(0, Math.min(pop, 1 - leave))
    Raster.paint(canvas, Insurance.PIGGY, { T: Insurance.TEAL, s: Insurance.TEAL_DARK, e: Insurance.TEAL_DARK, k: Insurance.INK, n: Insurance.TEAL_LIGHT }, x, y, 1, alpha, true)
    for (const age of ages) {
      for (let k = 0; k < 3; k++) {
        const u = (age - k * 260) / 700
        if (u < 0 || u > 1) continue
        const cy = y - 14 + 11 * u * u
        Raster.paint(canvas, Insurance.COIN, { G: Insurance.GOLD, g: Insurance.GOLD_DARK }, x - 1 + k * 0.5, cy, 1, 1, true)
      }
    }
  }

  static decorAt(canvas: Canvas, kind: DecorKind, frame: number): void {
    const sprite = Insurance.DECOR_SPRITES[kind]
    const x = 4 + sprite.width / 4
    const y = canvas.height - 2 - sprite.height / 2
    Raster.paint(canvas, sprite, Insurance.DECOR_PALETTE, x, y, 1, 0.9, true)
    if (kind === 'database') {
      const shift = Math.floor(frame / 6) % 3
      canvas.block(x - 1, y - sprite.height / 2 - 1 - shift, 2, 1, Insurance.PAPER, 0.8)
    }
    if (kind === 'registry') canvas.text(Math.round(x + 3), Math.floor((y + 2) / 2), 'REG', Insurance.KO)
  }

  private static outcome(e: FlowEvent): boolean | undefined {
    if (/fail/i.test(e.label)) return false
    if (/\bOK\b|completed|done/.test(e.label)) return true
    return undefined
  }

  private static tokens(branch: string, wi: string): Set<string> {
    return new Set(`${branch} ${wi}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(t => t !== ''))
  }
}
