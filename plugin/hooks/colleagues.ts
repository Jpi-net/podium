import { Canvas, type Rgb } from './canvas'
import { Robots, type RobotInput } from './robots'
import { Raster, Sprite, type Palette, type Tint } from './sprite'
import type { Plug, Side } from './wiring'

type Headgear = 'hardhat' | 'cap' | 'beanie' | 'headset' | 'glasses' | 'none'

type DeskItem = 'magnifier' | 'bug' | 'clipboard' | 'flask' | 'shield' | 'books' | 'mug' | 'plant' | 'whale' | 'ruler'

type Look = { outfit: Rgb; skin: Rgb; hair: Rgb; style: number; headgear: Headgear; item: DeskItem; isMe: boolean }

export class Colleagues {
  static readonly WIDTH = 9
  static readonly HEIGHT = 13

  private static readonly INK: Rgb = [14, 14, 28]
  private static readonly EYE: Rgb = [30, 26, 40]
  private static readonly SKINS: readonly Rgb[] = [
    [244, 208, 182],
    [228, 182, 146],
    [200, 144, 108],
    [156, 104, 74],
    [112, 74, 52],
  ]
  private static readonly HAIRS: readonly Rgb[] = [
    [30, 25, 28],
    [96, 60, 36],
    [232, 196, 110],
    [190, 84, 44],
    [168, 168, 180],
    [60, 44, 40],
  ]
  private static readonly ME_HAIR: Rgb = [30, 25, 28]
  private static readonly ME_OUTFIT: Rgb = [52, 66, 112]
  private static readonly HEADSET: Rgb = [0, 150, 136]
  private static readonly HARDHAT: Rgb = [255, 206, 60]
  private static readonly CAP: Rgb = [60, 70, 96]
  private static readonly LID: Rgb = [80, 92, 120]
  private static readonly LID_EDGE: Rgb = [140, 152, 180]
  private static readonly LOGO: Rgb = [0, 220, 196]
  private static readonly DESK_TOP: Rgb = [186, 132, 84]
  private static readonly DESK: Rgb = [128, 84, 52]
  private static readonly DESK_DARK: Rgb = [84, 52, 32]
  private static readonly WHITE: Rgb = [236, 240, 250]
  private static readonly PAPER: Rgb = [250, 246, 232]
  private static readonly LINE: Rgb = [120, 130, 160]
  private static readonly RED: Rgb = [230, 72, 72]
  private static readonly GREEN: Rgb = [90, 220, 140]
  private static readonly YELLOW: Rgb = [255, 206, 60]
  private static readonly HANDLE: Rgb = [150, 100, 60]
  private static readonly BLUE: Rgb = [72, 160, 230]

  private static readonly ROLES: Readonly<Record<string, { headgear: Headgear; item: DeskItem }>> = {
    'general-purpose': { headgear: 'headset', item: 'mug' },
    architect: { headgear: 'hardhat', item: 'ruler' },
    debugger: { headgear: 'none', item: 'bug' },
    plan: { headgear: 'none', item: 'clipboard' },
    explore: { headgear: 'none', item: 'magnifier' },
    'test-expert': { headgear: 'none', item: 'flask' },
    'e2e-expert': { headgear: 'beanie', item: 'flask' },
    'code-reviewer': { headgear: 'glasses', item: 'clipboard' },
    'security-reviewer': { headgear: 'cap', item: 'shield' },
    'doc-writer': { headgear: 'glasses', item: 'books' },
    'git-writer': { headgear: 'beanie', item: 'mug' },
    'docker-expert': { headgear: 'cap', item: 'whale' },
    'ux-ui-expert': { headgear: 'beanie', item: 'ruler' },
    'lint-runner': { headgear: 'none', item: 'clipboard' },
  }

  private static readonly HAIR_STYLES: readonly (readonly string[])[] = [
    ['....hhhhhhhh....', '...hhhhhhhhhh...', '...h........h...'],
    ['....h.hh.h.h....', '...hhhhhhhhhh...', '...h........h...'],
    ['......hhhh......', '....hhhhhhhh....', '...hhhhhhhhhh...'],
    ['....hhhhhhhh....', '...hhhhhhhhhh...', '..hh........hh..'],
  ]

  private static readonly HEADGEAR: Readonly<Partial<Record<Headgear, readonly string[]>>> = {
    hardhat: ['....YYYYYYYY....', '...YYYYYYYYYY...', '..YYYYYYYYYYYY..'],
    cap: ['....CCCCCCCC....', '...CCCCCCCCCC...', '...C........CCC.'],
    beanie: ['.......oo.......', '....oooooooo....', '...oooooooooo...'],
  }

  private static readonly ITEMS: Readonly<Record<DeskItem, readonly string[]>> = {
    magnifier: ['.WW.', 'W..W', '.WW.', 'r...'],
    bug: ['R.R', 'RRR', '.R.'],
    clipboard: ['PPP', 'PlP', 'PlP'],
    flask: ['.W.', 'WgW', 'WgW'],
    shield: ['WWW', 'WgW', '.W.'],
    books: ['Rgy', 'Rgy', 'Rgy'],
    mug: ['WW.', 'WWW', 'WW.'],
    plant: ['g.g', '.g.', 'rrr'],
    whale: ['.b.', 'bbb', 'bb.'],
    ruler: ['y..', 'yy.', 'yyy'],
  }

  static look(type: string, seed: number): Look {
    const key = Colleagues.key(type)
    const isMe = key === 'fork'
    const role = Colleagues.ROLES[key] ?? { headgear: 'none' as Headgear, item: 'mug' as DeskItem }
    const pick = <T>(list: readonly T[], salt: number, fallback: T): T => list[Math.floor(Canvas.hash(seed * 31.7 + salt, salt * 0.37) * list.length)] ?? fallback
    const skin = pick(Colleagues.SKINS, 1, Colleagues.SKINS[0] ?? Colleagues.WHITE)
    if (isMe) return { outfit: Colleagues.ME_OUTFIT, skin: Colleagues.SKINS[0] ?? skin, hair: Colleagues.ME_HAIR, style: 1, headgear: 'headset', item: 'mug', isMe }
    return {
      outfit: Robots.accent(type),
      skin,
      hair: pick(Colleagues.HAIRS, 2, Colleagues.ME_HAIR),
      style: Math.floor(Canvas.hash(seed * 13.1 + 3, 0.71) * Colleagues.HAIR_STYLES.length),
      headgear: role.headgear,
      item: role.item,
      isMe,
    }
  }

  static draw(canvas: Canvas, cx: number, cy: number, scale: number, input: RobotInput): void {
    const look = Colleagues.look(input.type, input.seed)
    const tint: Tint = input.mood === 'failed' ? 'failed' : input.mood === 'killed' ? 'killed' : 'none'
    const rows = Colleagues.rows(look, input)
    const palette = Colleagues.palette(look, input)
    const sprite = Sprite.of(rows)
    const x0 = -Math.floor(sprite.width / 2)
    const y0 = -Math.floor(sprite.height / 2)
    const raster = new Raster(x0 - 1, y0 - 1, sprite.width + 2, sprite.height + 2)
    raster.stamp(sprite, palette, x0, y0)
    raster.outline()
    const bounce = (input.squash ?? 0) * 1.2
    raster.blit(canvas, cx, cy + bounce, scale, tint)
    if (input.mood === 'working' && input.flash > 0) {
      canvas.glow(cx, cy - 1.5 * scale, 4 * scale, input.toolColor ?? Colleagues.LOGO, 0.22 * input.flash)
    }
  }

  static plug(cx: number, cy: number, scale: number, side: Side): Plug {
    const f = Raster.factor(scale)
    const snap = Math.round(cx * 2) / 2
    const y = Math.round(cy)
    const snapHalf = (v: number): number => Math.round(v * 2) / 2
    return {
      socket: { x: snapHalf(snap + side * 1.5 * f) - (side < 0 ? 0.5 : 0), y: y + Math.floor(3 * f) },
      edge: { x: snapHalf(snap + side * 4.5 * f) - (side < 0 ? 0.5 : 0), y: y + Math.floor(4 * f) },
    }
  }

  static rows(look: Look, input: RobotInput): string[] {
    const isWorking = input.mood === 'working'
    const isDone = input.mood === 'done'
    const isSad = input.mood === 'failed' || input.mood === 'killed'
    const blink = Colleagues.isBlinking(input.frame, input.seed) || input.mood === 'killed'
    const top = Colleagues.HEADGEAR[look.headgear] ?? Colleagues.HAIR_STYLES[look.style % Colleagues.HAIR_STYLES.length] ?? []
    const eyes = blink ? '....SssSSssS....' : isDone ? '....SeeSSeeS....' : '....SeSSSSeS....'
    const glasses = look.headgear === 'glasses' && !blink ? '....GeGGGGeG....' : eyes
    const mouth = isDone ? '.....sMMMMs.....' : isSad ? '.....sSmmSs.....' : '.....sSmmSs.....'
    const typing = isWorking ? Math.floor((input.frame + input.seed * 40) / 3) % 2 : 0
    const hands = isWorking ? (typing === 0 ? '...k.LLLLLL..k..' : '....kLLLLLLk....') : '....kLLLLLLk....'
    const rows = [
      ...top.map(r => r.padEnd(16, '.')),
      look.headgear === 'headset' ? '...HSSSSSSSSH...' : '....SSSSSSSS....',
      look.headgear === 'glasses' ? glasses : eyes,
      look.headgear === 'headset' ? '...HSSSSSSSSHa..' : '....SSSSSSSS....',
      mouth,
      '..oOOOwOOwOOOo..',
      '.OOOOLLLLLLOOOO.',
      hands.replace(/\./g, 'O').replace(/^O/, '.').replace(/O$/, '.'),
    ]
    const item = Colleagues.ITEMS[look.item]
    const desk = ['DDDDDDDDDDDDDDDDDD', 'dXdddddddddddddXdd', 'd.d.............d.']
    const width = 18
    const body = rows.map(r => `.${r}.`.padEnd(width, '.'))
    if (isDone) body[body.length - 1] = Colleagues.overlay(body[body.length - 1] ?? '', '.SS', 15)
    const itemTop = body.length - item.length
    item.forEach((line, j) => {
      const at = itemTop + j
      if (at >= 0 && !isDone) body[at] = Colleagues.overlay(body[at] ?? '', line, 14)
    })
    if (isDone) {
      body[body.length - 3] = Colleagues.overlay(body[body.length - 3] ?? '', 'SS', 15)
      body[body.length - 2] = Colleagues.overlay(body[body.length - 2] ?? '', 'SSS', 15)
    }
    const logoRow = body.length - 2
    body[logoRow] = (body[logoRow] ?? '').replace('LLLLLL', 'LLALLL')
    return [...body, ...desk]
  }

  static isBlinking(frame: number, seed: number): boolean {
    const period = 90 + Math.floor(seed * 60)
    return (frame + Math.floor(seed * 1000)) % period < 3
  }

  private static palette(look: Look, input: RobotInput): Palette {
    const isFlash = input.mood === 'working' && input.flash > 0
    const logo = isFlash ? (input.toolColor ?? Colleagues.LOGO) : input.mood === 'working' ? Colleagues.LOGO : Canvas.mix(Colleagues.LOGO, Colleagues.LID, 0.6)
    return {
      h: look.hair,
      S: look.skin,
      s: Canvas.mix(look.skin, Colleagues.INK, 0.22),
      k: Canvas.mix(look.skin, Colleagues.INK, 0.08),
      e: Colleagues.EYE,
      M: Canvas.mix(look.skin, [150, 50, 60], 0.6),
      m: Canvas.mix(look.skin, [150, 60, 60], 0.4),
      O: look.outfit,
      o: Canvas.mix(look.outfit, Colleagues.INK, 0.3),
      w: Canvas.mix(look.outfit, [255, 255, 255], 0.45),
      L: Colleagues.LID,
      A: logo,
      D: Colleagues.DESK_TOP,
      d: Colleagues.DESK,
      X: Colleagues.DESK_DARK,
      Y: Colleagues.HARDHAT,
      C: Colleagues.CAP,
      H: Colleagues.HEADSET,
      a: Colleagues.HEADSET,
      G: [40, 44, 60],
      W: Colleagues.WHITE,
      P: Colleagues.PAPER,
      l: Colleagues.LINE,
      R: Colleagues.RED,
      g: Colleagues.GREEN,
      y: Colleagues.YELLOW,
      r: Colleagues.HANDLE,
      b: Colleagues.BLUE,
      E: Colleagues.LID_EDGE,
    }
  }

  private static overlay(row: string, piece: string, at: number): string {
    const chars = row.split('')
    for (let i = 0; i < piece.length; i++) {
      const c = piece[i]
      if (c !== undefined && c !== '.' && at + i < chars.length) chars[at + i] = c
    }
    return chars.join('')
  }

  private static key(type: string): string {
    const last = type.split(':').pop() ?? type
    const lower = last.trim().toLowerCase()
    return lower === 'claude' || lower === 'general purpose' ? 'general-purpose' : lower
  }
}
