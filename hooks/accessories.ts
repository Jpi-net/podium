import type { Rgb } from './canvas'
import { Raster } from './sprite'

export type AccessorySlot = 'face' | 'top' | 'body'

export type Accessory = { id: string; label: string; slot: AccessorySlot }

export class Accessories {
  static readonly ALL: readonly Accessory[] = [
    { id: 'round-glasses', label: 'round glasses', slot: 'face' },
    { id: 'square-glasses', label: 'square glasses', slot: 'face' },
    { id: 'sunglasses', label: 'sunglasses', slot: 'face' },
    { id: 'heart-glasses', label: 'heart-shaped glasses', slot: 'face' },
    { id: '3d-glasses', label: '3D glasses', slot: 'face' },
    { id: 'monocle', label: 'monocle', slot: 'face' },
    { id: 'eye-patch', label: 'pirate eye patch', slot: 'face' },
    { id: 'handlebar-mustache', label: 'handlebar mustache', slot: 'face' },
    { id: 'clown-nose', label: 'clown nose', slot: 'face' },
    { id: 'groucho', label: 'disguise glasses', slot: 'face' },
    { id: 'pipe', label: 'pipe', slot: 'face' },
    { id: 'straw', label: 'straw in the mouth', slot: 'face' },
    { id: 'lollipop', label: 'lollipop', slot: 'face' },
    { id: 'ear-pencil', label: 'pencil behind the ear', slot: 'face' },
    { id: 'earring', label: 'earring', slot: 'face' },
    { id: 'bandage', label: 'bandage', slot: 'face' },
    { id: 'ski-mask', label: 'ski mask', slot: 'face' },
    { id: 'forehead-glasses', label: 'glasses on the forehead', slot: 'face' },
    { id: 'headband', label: 'sports headband', slot: 'face' },
    { id: 'hair-flower', label: 'flower in the hair', slot: 'face' },
    { id: 'reading-glasses', label: 'reading glasses', slot: 'face' },
    { id: 'pen-in-teeth', label: 'pen between the teeth', slot: 'face' },
    { id: 'accountant-visor', label: 'accountant visor', slot: 'face' },
    { id: 'laurel-wreath', label: 'laurel wreath', slot: 'top' },
    { id: 'cap', label: 'cap', slot: 'top' },
    { id: 'beanie', label: 'beanie', slot: 'top' },
    { id: 'beret', label: 'beret', slot: 'top' },
    { id: 'antennae', label: 'alien antennae', slot: 'top' },
    { id: 'halo', label: 'halo', slot: 'top' },
    { id: 'bowler-hat', label: 'bowler hat', slot: 'top' },
    { id: 'bow-tie', label: 'bow tie', slot: 'body' },
    { id: 'tie', label: 'tie', slot: 'body' },
    { id: 'scarf', label: 'scarf', slot: 'body' },
    { id: 'boutonniere', label: 'boutonniere flower', slot: 'body' },
    { id: 'pocket-square', label: 'pocket square', slot: 'body' },
    { id: 'gold-chain', label: 'gold chain', slot: 'body' },
    { id: 'medal', label: 'medal', slot: 'body' },
    { id: 'pocket-pen', label: 'pen in the pocket', slot: 'body' },
    { id: 'name-badge', label: 'name badge', slot: 'body' },
    { id: 'shirt-glasses', label: 'glasses hanging from the shirt', slot: 'body' },
    { id: 'lanyard-badge', label: 'lanyard and badge', slot: 'body' },
  ]

  private static readonly WHITE: Rgb = [255, 255, 255]
  private static readonly BLACK: Rgb = [18, 18, 24]
  private static readonly TORTOISE: Rgb = [92, 58, 36]
  private static readonly GOLD: Rgb = [232, 186, 84]
  private static readonly SHADE: Rgb = [22, 26, 38]
  private static readonly PINK: Rgb = [255, 96, 150]
  private static readonly RED: Rgb = [222, 44, 58]
  private static readonly RED_DARK: Rgb = [150, 26, 40]
  private static readonly CYAN: Rgb = [40, 200, 240]
  private static readonly BROWN: Rgb = [120, 72, 40]
  private static readonly BROWN_DARK: Rgb = [70, 44, 30]
  private static readonly STRAW: Rgb = [236, 204, 92]
  private static readonly YELLOW: Rgb = [250, 200, 40]
  private static readonly ERASER: Rgb = [244, 140, 160]
  private static readonly GRAPHITE: Rgb = [80, 80, 90]
  private static readonly PLASTER: Rgb = [236, 196, 156]
  private static readonly ORANGE: Rgb = [255, 140, 40]
  private static readonly GREEN: Rgb = [90, 170, 70]
  private static readonly GREEN_DARK: Rgb = [50, 110, 44]
  private static readonly TEAL: Rgb = [0, 150, 136]
  private static readonly TEAL_DARK: Rgb = [0, 96, 88]
  private static readonly ALIEN: Rgb = [150, 255, 120]
  private static readonly BLUE: Rgb = [52, 110, 220]
  private static readonly MUSTACHE: Rgb = [40, 28, 26]
  private static readonly SKIN_NOSE: Rgb = [236, 170, 150]
  private static readonly SMOKE: Rgb = [214, 220, 232]
  private static readonly VISOR: Rgb = [60, 190, 110]

  static find(id: string): Accessory | undefined {
    return Accessories.ALL.find(a => a.id === id)
  }

  static pick(recent: readonly string[], random: number): string {
    const limit = Math.floor(Accessories.ALL.length * 0.6)
    const blocked = new Set(recent.slice(-limit))
    const pool = Accessories.ALL.filter(a => !blocked.has(a.id))
    const choices = pool.length > 0 ? pool : Accessories.ALL
    return choices[Math.min(choices.length - 1, Math.floor(Math.max(0, random) * choices.length))]?.id ?? ''
  }

  static remember(recent: readonly string[], id: string): string[] {
    return [...recent.filter(r => r !== id), id].slice(-Accessories.ALL.length)
  }

  static isShown(id: string, hatted: boolean): boolean {
    const a = Accessories.find(id)
    return a !== undefined && !(a.slot === 'top' && hatted)
  }

  static face(r: Raster, id: string, x: number, y: number, frame: number, hatted: boolean): void {
    if (!Accessories.isShown(id, hatted)) return
    switch (id) {
      case 'round-glasses':
        Accessories.glasses(r, x, y, Accessories.TORTOISE, false)
        return
      case 'square-glasses':
        Accessories.glasses(r, x, y, Accessories.BLACK, true)
        return
      case 'sunglasses':
        Accessories.glasses(r, x, y, Accessories.GOLD, false)
        for (const x0 of [x - 6, x + 4]) r.rect(x0 - 1, y - 4, 4, 2, Accessories.SHADE, 0.94)
        return
      case 'heart-glasses':
        Accessories.hearts(r, x, y)
        return
      case '3d-glasses':
        Accessories.glasses(r, x, y, Accessories.WHITE, true)
        r.rect(x - 7, y - 4, 4, 2, Accessories.RED, 0.6)
        r.rect(x + 3, y - 4, 4, 2, Accessories.CYAN, 0.6)
        return
      case 'monocle':
        Accessories.lens(r, x + 4, y, Accessories.GOLD, false)
        r.line(x + 7, y - 2, x + 8, y + 4, Accessories.GOLD)
        return
      case 'eye-patch':
        r.rect(x - 8, y - 5, 5, 4, Accessories.BLACK)
        r.line(x - 3, y - 5, x + 6, y - 9, Accessories.BLACK)
        r.line(x - 8, y - 4, x - 10, y - 3, Accessories.BLACK)
        return
      case 'handlebar-mustache':
        r.rect(x - 4, y, 8, 1, Accessories.MUSTACHE)
        r.dot(x - 5, y - 1, Accessories.MUSTACHE)
        r.dot(x + 4, y - 1, Accessories.MUSTACHE)
        r.dot(x - 6, y - 2, Accessories.MUSTACHE)
        r.dot(x + 5, y - 2, Accessories.MUSTACHE)
        return
      case 'clown-nose':
        r.rect(x - 2, y - 2, 4, 2, Accessories.RED)
        r.dot(x - 1, y - 2, Accessories.WHITE)
        return
      case 'groucho':
        Accessories.glasses(r, x, y, Accessories.BLACK, true)
        r.rect(x - 8, y - 6, 6, 1, Accessories.MUSTACHE)
        r.rect(x + 2, y - 6, 6, 1, Accessories.MUSTACHE)
        r.rect(x - 2, y - 2, 4, 2, Accessories.SKIN_NOSE)
        r.rect(x - 4, y, 8, 1, Accessories.MUSTACHE)
        return
      case 'pipe':
        r.rect(x + 2, y + 1, 4, 1, Accessories.BROWN_DARK)
        r.rect(x + 6, y - 1, 2, 3, Accessories.BROWN)
        r.rect(x + 6, y - 1, 2, 1, Accessories.BROWN_DARK)
        return
      case 'straw':
        r.line(x + 2, y + 1, x + 8, y - 1, Accessories.STRAW)
        return
      case 'lollipop':
        r.line(x + 2, y + 1, x + 5, y, Accessories.WHITE)
        r.rect(x + 6, y - 1, 3, 2, Accessories.PINK)
        r.dot(x + 7, y - 1, Accessories.WHITE)
        return
      case 'ear-pencil':
        r.line(x + 6, y - 8, x + 11, y - 3, Accessories.YELLOW)
        r.line(x + 7, y - 8, x + 12, y - 3, Accessories.YELLOW)
        r.dot(x + 6, y - 9, Accessories.ERASER)
        r.dot(x + 12, y - 2, Accessories.GRAPHITE)
        return
      case 'earring':
        r.rect(x + 8, y - 1, 1, 2, Accessories.GOLD)
        return
      case 'bandage':
        r.rect(x + 2, y - 1, 5, 1, Accessories.PLASTER)
        r.rect(x + 4, y - 2, 1, 3, Accessories.PLASTER)
        return
      case 'ski-mask':
        r.rect(x - 11, y - 6, 22, 1, Accessories.BLACK)
        r.rect(x - 7, y - 7, 14, 2, Accessories.ORANGE)
        r.rect(x - 1, y - 7, 2, 2, Accessories.BLACK)
        return
      case 'forehead-glasses':
        r.rect(x - 6, y - 8, 4, 2, Accessories.SHADE)
        r.rect(x + 2, y - 8, 4, 2, Accessories.SHADE)
        r.rect(x - 2, y - 8, 4, 1, Accessories.GOLD)
        return
      case 'headband':
        r.rect(x - 11, y - 6, 22, 1, Accessories.RED)
        r.rect(x - 11, y - 5, 22, 1, Accessories.WHITE)
        return
      case 'hair-flower':
        Accessories.flower(r, x - 8, y - 7, Accessories.PINK)
        return
      case 'reading-glasses':
        for (const x0 of [x - 6, x + 4]) {
          r.rect(x0 - 1, y - 2, 4, 1, Accessories.GOLD)
          r.dot(x0 - 2, y - 3, Accessories.GOLD)
          r.dot(x0 + 2, y - 3, Accessories.GOLD)
        }
        r.rect(x - 3, y - 2, 6, 1, Accessories.GOLD)
        return
      case 'pen-in-teeth':
        r.rect(x - 5, y + 1, 10, 1, Accessories.BLUE)
        r.rect(x + 5, y + 1, 2, 1, Accessories.WHITE)
        return
      case 'accountant-visor':
        r.rect(x - 11, y - 6, 22, 1, Accessories.BLACK)
        r.rect(x - 8, y - 6, 16, 2, Accessories.VISOR, 0.75)
        return
      case 'laurel-wreath':
        for (let k = -5; k <= 5; k++) r.rect(x + 2 * k, y - 9 + Math.floor(Math.abs(k) / 3), 2, 1, k % 2 === 0 ? Accessories.GREEN : Accessories.GREEN_DARK)
        return
      case 'cap':
        r.rect(x - 8, y - 12, 16, 1, Accessories.TEAL)
        r.rect(x - 10, y - 11, 20, 3, Accessories.TEAL)
        r.rect(x + 4, y - 8, 10, 1, Accessories.TEAL_DARK)
        r.rect(x - 1, y - 13, 2, 1, Accessories.TEAL_DARK)
        r.rect(x - 5, y - 10, 2, 1, Accessories.WHITE)
        return
      case 'beanie':
        r.rect(x - 8, y - 12, 16, 1, Accessories.RED)
        r.rect(x - 10, y - 11, 20, 3, Accessories.RED)
        r.rect(x - 11, y - 8, 22, 2, Accessories.RED_DARK)
        r.oval(x, y - 13, 2, 1, Accessories.WHITE)
        return
      case 'beret':
        r.oval(x - 1, y - 10, 10, 1.5, Accessories.RED_DARK)
        r.rect(x - 2, y - 12, 2, 1, Accessories.RED_DARK)
        return
      case 'antennae':
        r.line(x - 4, y - 9, x - 6, y - 13, Accessories.BLACK)
        r.line(x + 3, y - 9, x + 5, y - 13, Accessories.BLACK)
        r.rect(x - 7, y - 15, 2, 2, Accessories.ALIEN)
        r.rect(x + 5, y - 15, 2, 2, Accessories.ALIEN)
        return
      case 'halo':
        r.rect(x - 6, y - 14, 12, 1, Accessories.GOLD)
        r.rect(x - 6, y - 12, 12, 1, Accessories.GOLD)
        r.rect(x - 8, y - 13, 2, 1, Accessories.GOLD)
        r.rect(x + 6, y - 13, 2, 1, Accessories.GOLD)
        return
      case 'bowler-hat':
        r.rect(x - 6, y - 13, 12, 1, Accessories.BLACK)
        r.rect(x - 8, y - 12, 16, 3, Accessories.BLACK)
        r.rect(x - 8, y - 10, 16, 1, Accessories.RED_DARK)
        r.rect(x - 11, y - 9, 22, 1, Accessories.BLACK)
        r.dot(x - 5, y - 12, Accessories.GRAPHITE)
    }
  }

  static body(r: Raster, id: string, y: number): void {
    switch (id) {
      case 'bow-tie':
        r.rect(-4, y + 1, 3, 2, Accessories.RED)
        r.rect(1, y + 1, 3, 2, Accessories.RED)
        r.rect(-1, y + 1, 2, 2, Accessories.RED_DARK)
        return
      case 'tie':
        r.rect(-1, y + 1, 2, 1, Accessories.TEAL_DARK)
        r.rect(-1, y + 2, 2, 2, Accessories.TEAL)
        return
      case 'scarf':
        for (let i = -6; i < 6; i += 2) r.rect(i, y + 1, 2, 1, Math.abs(i / 2) % 2 === 0 ? Accessories.RED : Accessories.WHITE)
        r.rect(2, y + 2, 3, 2, Accessories.RED)
        r.rect(2, y + 3, 3, 1, Accessories.WHITE)
        return
      case 'boutonniere':
        Accessories.flower(r, -8, y + 2, Accessories.RED)
        return
      case 'pocket-square':
        r.rect(5, y + 2, 3, 1, Accessories.WHITE)
        r.dot(6, y + 1, Accessories.WHITE)
        return
      case 'gold-chain':
        r.line(-4, y, -1, y + 2, Accessories.GOLD)
        r.line(3, y, 0, y + 2, Accessories.GOLD)
        r.rect(-1, y + 2, 2, 1, Accessories.GOLD)
        return
      case 'medal':
        r.line(-3, y, -1, y + 1, Accessories.BLUE)
        r.line(2, y, 0, y + 1, Accessories.RED)
        r.rect(-2, y + 2, 4, 2, Accessories.GOLD)
        return
      case 'pocket-pen':
        r.rect(6, y + 1, 1, 2, Accessories.BLUE)
        r.dot(6, y, Accessories.WHITE)
        return
      case 'name-badge':
        r.rect(-11, y + 2, 4, 1, Accessories.WHITE)
        r.rect(-11, y + 1, 4, 1, Accessories.TEAL)
        return
      case 'shirt-glasses':
        r.rect(-3, y + 1, 2, 2, Accessories.SHADE)
        r.rect(1, y + 1, 2, 2, Accessories.SHADE)
        r.rect(-1, y + 1, 2, 1, Accessories.GOLD)
        return
      case 'lanyard-badge':
        r.line(-4, y, -2, y + 2, Accessories.TEAL)
        r.line(3, y, 1, y + 2, Accessories.TEAL)
        r.rect(-2, y + 2, 4, 2, Accessories.WHITE)
        r.rect(-2, y + 2, 4, 1, Accessories.TEAL)
    }
  }

  static glow(r: Raster, id: string, x: number, y: number, frame: number, hatted: boolean): void {
    if (!Accessories.isShown(id, hatted)) return
    switch (id) {
      case 'pipe':
        for (let k = 0; k < 3; k++) {
          const u = ((frame * 0.12 + k * 2) % 6) / 6
          r.dot(x + 7 + Math.round(Math.sin(u * 6 + k)), y - 2 - Math.round(u * 5), Accessories.SMOKE, 0.7 * (1 - u))
        }
        return
      case 'sunglasses':
      case 'square-glasses':
      case 'monocle':
        if (((frame % 90) + 90) % 90 < 6) r.dot(id === 'monocle' ? x + 4 : x - 6, y - 4, Accessories.WHITE)
        return
      case 'earring':
        if (((frame % 60) + 60) % 60 < 5) r.dot(x + 9, y - 1, Accessories.WHITE)
        return
      case 'antennae':
        if (Math.sin(frame * 0.3) > 0) {
          r.dot(x - 6, y - 15, Accessories.WHITE)
          r.dot(x + 6, y - 15, Accessories.WHITE)
        }
        return
      case 'halo':
        r.rect(x - 5, y - 13, 10, 1, Accessories.GOLD, 0.25 + 0.15 * Math.sin(frame * 0.2))
    }
  }

  private static lens(r: Raster, x0: number, y: number, frame: Rgb, corners: boolean): void {
    r.rect(x0 - 1, y - 5, 4, 1, frame)
    r.rect(x0 - 1, y - 2, 4, 1, frame)
    r.rect(x0 - 2, y - 4, 1, 2, frame)
    r.rect(x0 + 3, y - 4, 1, 2, frame)
    if (!corners) return
    for (const [cx, cy] of [
      [x0 - 2, y - 5],
      [x0 + 3, y - 5],
      [x0 - 2, y - 2],
      [x0 + 3, y - 2],
    ] as const)
      r.dot(cx, cy, frame)
  }

  private static glasses(r: Raster, x: number, y: number, frame: Rgb, corners: boolean): void {
    Accessories.lens(r, x - 6, y, frame, corners)
    Accessories.lens(r, x + 4, y, frame, corners)
    r.rect(x - 3, y - 4, 6, 1, frame)
    r.rect(x - 10, y - 4, 2, 1, frame)
    r.dot(x + 8, y - 4, frame)
  }

  private static hearts(r: Raster, x: number, y: number): void {
    for (const x0 of [x - 6, x + 4]) {
      r.rect(x0 - 2, y - 5, 2, 1, Accessories.PINK)
      r.rect(x0 + 2, y - 5, 2, 1, Accessories.PINK)
      r.rect(x0 - 2, y - 4, 6, 1, Accessories.PINK, 0.85)
      r.rect(x0 - 1, y - 3, 4, 1, Accessories.PINK, 0.85)
      r.rect(x0, y - 2, 2, 1, Accessories.PINK)
    }
    r.rect(x - 2, y - 4, 4, 1, Accessories.PINK)
  }

  private static flower(r: Raster, x: number, y: number, petal: Rgb): void {
    r.rect(x - 1, y - 1, 2, 1, petal)
    r.rect(x - 3, y, 2, 1, petal)
    r.rect(x + 1, y, 2, 1, petal)
    r.rect(x - 1, y + 1, 2, 1, petal)
    r.rect(x - 1, y, 2, 1, Accessories.YELLOW)
    r.dot(x + 2, y + 1, Accessories.GREEN)
  }
}
