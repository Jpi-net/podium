export class Font {
  static readonly CELL_WIDTH = 6
  static readonly CELL_HEIGHT = 12

  private static readonly ASCII_COLUMNS =
    '0000000000 00005F0000 0007000700 147F147F14 242A7F2A12 2313086462 3649562050 0005030000 ' +
    '001C224100 0041221C00 2A1C7F1C2A 08083E0808 0050300000 0808080808 0060600000 2010080402 ' +
    '3E5149453E 00427F4000 4261514946 2141454B31 1814127F10 2745454539 3C4A494930 0171090503 ' +
    '3649494936 064949291E 0036360000 0056360000 0814224100 1414141414 0041221408 0201510906 ' +
    '324979413E 7E1111117E 7F49494936 3E41414122 7F4141221C 7F49494941 7F09090901 3E4149497A ' +
    '7F0808087F 00417F4100 2040413F01 7F08142241 7F40404040 7F020C027F 7F0408107F 3E4141413E ' +
    '7F09090906 3E4151215E 7F09192946 4649494931 01017F0101 3F4040403F 1F2040201F 3F4038403F ' +
    '6314081463 0708700807 6151494543 007F414100 0204081020 0041417F00 0402010204 4040404040 ' +
    '0001020400 2054545478 7F48444438 3844444420 384444487F 3854545418 087E090102 0C5252523E ' +
    '7F08040478 00447D4000 2040443D00 7F10284400 00417F4000 7C04180478 7C08040478 3844444438 ' +
    '7C14141408 081414187C 7C08040408 4854545420 043F444020 3C4040207C 1C2040201C 3C4030403C ' +
    '4428102844 0C5050503C 4464544C44 0008364100 00007F0000 0041360800 0804081008'

  private static readonly SYMBOLS: ReadonlyMap<number, readonly number[]> = new Map<number, readonly number[]>([
    [0x2713, [0x00, 0x01, 0x03, 0x12, 0x0a, 0x04, 0x00]],
    [0x2717, [0x00, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x00]],
    [0x25c6, [0x00, 0x04, 0x0e, 0x1f, 0x0e, 0x04, 0x00]],
    [0x25c9, [0x00, 0x0e, 0x11, 0x15, 0x11, 0x0e, 0x00]],
    [0x25cb, [0x00, 0x0e, 0x11, 0x11, 0x11, 0x0e, 0x00]],
    [0x25cf, [0x00, 0x0e, 0x1f, 0x1f, 0x1f, 0x0e, 0x00]],
    [0x25a0, [0x00, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x00]],
    [0x00b7, [0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00]],
    [0x2026, [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x15]],
    [0x2197, [0x00, 0x0f, 0x03, 0x05, 0x09, 0x10, 0x00]],
    [0x2199, [0x00, 0x01, 0x12, 0x14, 0x18, 0x1e, 0x00]],
    [0x26a0, [0x04, 0x0a, 0x0a, 0x15, 0x15, 0x11, 0x1f]],
    [0x2022, [0x00, 0x00, 0x0e, 0x0e, 0x0e, 0x00, 0x00]],
    [0x203a, [0x00, 0x10, 0x08, 0x04, 0x08, 0x10, 0x00]],
    [0x23f5, [0x00, 0x08, 0x0c, 0x0e, 0x0c, 0x08, 0x00]],
    [0x25b6, [0x10, 0x18, 0x1c, 0x1e, 0x1c, 0x18, 0x10]],
    [0x23f8, [0x00, 0x1b, 0x1b, 0x1b, 0x1b, 0x1b, 0x00]],
    [0x23f9, [0x00, 0x0e, 0x0e, 0x0e, 0x0e, 0x0e, 0x00]],
    [0x25cc, [0x00, 0x0a, 0x11, 0x00, 0x11, 0x0a, 0x00]],
    [0x2191, [0x04, 0x0e, 0x15, 0x04, 0x04, 0x04, 0x04]],
    [0x2193, [0x04, 0x04, 0x04, 0x04, 0x15, 0x0e, 0x04]],
    [0x2387, [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04]],
    [0x0153, [0x00, 0x00, 0x0d, 0x12, 0x17, 0x12, 0x0d]],
  ])

  private static readonly ACCENTS: ReadonlyMap<string, readonly number[]> = new Map<string, readonly number[]>([
    ['acute', [0x02, 0x04]],
    ['grave', [0x08, 0x04]],
    ['circumflex', [0x04, 0x0a]],
    ['diaeresis', [0x0a, 0x00]],
    ['cedilla', [0x04, 0x08]],
  ])

  private static readonly COMPOSED: ReadonlyMap<number, readonly [string, string]> = new Map<number, readonly [string, string]>([
    [0xe0, ['a', 'grave']],
    [0xe2, ['a', 'circumflex']],
    [0xe4, ['a', 'diaeresis']],
    [0xe7, ['c', 'cedilla']],
    [0xe9, ['e', 'acute']],
    [0xe8, ['e', 'grave']],
    [0xea, ['e', 'circumflex']],
    [0xeb, ['e', 'diaeresis']],
    [0xee, ['i', 'circumflex']],
    [0xef, ['i', 'diaeresis']],
    [0xf4, ['o', 'circumflex']],
    [0xf6, ['o', 'diaeresis']],
    [0xf9, ['u', 'grave']],
    [0xfb, ['u', 'circumflex']],
    [0xfc, ['u', 'diaeresis']],
    [0xff, ['y', 'diaeresis']],
    [0xc0, ['A', 'grave']],
    [0xc2, ['A', 'circumflex']],
    [0xc4, ['A', 'diaeresis']],
    [0xc7, ['C', 'cedilla']],
    [0xc9, ['E', 'acute']],
    [0xc8, ['E', 'grave']],
    [0xca, ['E', 'circumflex']],
    [0xcb, ['E', 'diaeresis']],
    [0xce, ['I', 'circumflex']],
    [0xcf, ['I', 'diaeresis']],
    [0xd4, ['O', 'circumflex']],
    [0xd6, ['O', 'diaeresis']],
    [0xd9, ['U', 'grave']],
    [0xdb, ['U', 'circumflex']],
    [0xdc, ['U', 'diaeresis']],
  ])

  private static readonly WIDE_RANGES: readonly (readonly [number, number])[] = [
    [0x0300, 0x036f],
    [0x1100, 0x115f],
    [0x200b, 0x200f],
    [0x2028, 0x202e],
    [0x231a, 0x231b],
    [0x23e9, 0x23ec],
    [0x23f0, 0x23f0],
    [0x23f3, 0x23f3],
    [0x25fd, 0x25fe],
    [0x2614, 0x2615],
    [0x2648, 0x2653],
    [0x267f, 0x267f],
    [0x2693, 0x2693],
    [0x26a1, 0x26a1],
    [0x26aa, 0x26ab],
    [0x26bd, 0x26be],
    [0x26c4, 0x26c5],
    [0x26ce, 0x26ce],
    [0x26d4, 0x26d4],
    [0x26ea, 0x26ea],
    [0x26f2, 0x26f3],
    [0x26f5, 0x26f5],
    [0x26fa, 0x26fa],
    [0x26fd, 0x26fd],
    [0x2705, 0x2705],
    [0x270a, 0x270b],
    [0x2728, 0x2728],
    [0x274c, 0x274c],
    [0x274e, 0x274e],
    [0x2753, 0x2755],
    [0x2757, 0x2757],
    [0x2795, 0x2797],
    [0x27b0, 0x27b0],
    [0x27bf, 0x27bf],
    [0x2b1b, 0x2b1c],
    [0x2b50, 0x2b50],
    [0x2b55, 0x2b55],
    [0x2e80, 0xa4cf],
    [0xac00, 0xd7ff],
    [0xf900, 0xfaff],
    [0xfe00, 0xfe0f],
    [0xfe30, 0xfe6f],
    [0xff00, 0xff60],
    [0xffe0, 0xffe6],
    [0xfff0, 0xffff],
  ]

  private static readonly ALIASES: ReadonlyMap<number, number> = new Map<number, number>([
    [0x2018, 0x27],
    [0x2019, 0x27],
    [0x201c, 0x22],
    [0x201d, 0x22],
    [0x2013, 0x2d],
    [0x2014, 0x2d],
    [0xa0, 0x20],
  ])

  private static readonly cache = new Map<number, Uint8Array>()
  private static baseRows: Map<string, number[]> | undefined

  static sanitize(codePoint: number): number {
    if (codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f) || codePoint > 0xffff) return 0x3f
    if (codePoint >= 0xd800 && codePoint <= 0xdfff) return 0x3f
    for (const range of Font.WIDE_RANGES) {
      if (codePoint >= range[0] && codePoint <= range[1]) return 0x3f
    }
    return codePoint
  }

  static blockEighths(codePoint: number): number {
    return codePoint >= 0x2581 && codePoint <= 0x2588 ? codePoint - 0x2580 : 0
  }

  static cell(codePoint: number): Uint8Array {
    const cached = Font.cache.get(codePoint)
    if (cached !== undefined) return cached
    const built = Font.build(codePoint)
    Font.cache.set(codePoint, built)
    return built
  }

  private static ascii(): Map<string, number[]> {
    if (Font.baseRows !== undefined) return Font.baseRows
    const map = new Map<string, number[]>()
    const entries = Font.ASCII_COLUMNS.replace(/\s+/g, '')
    for (let k = 0; k < 95; k++) {
      const rows: number[] = [0, 0, 0, 0, 0, 0, 0]
      for (let c = 0; c < 5; c++) {
        const column = parseInt(entries.substr(k * 10 + c * 2, 2), 16)
        for (let r = 0; r < 7; r++) {
          if (((column >> r) & 1) === 1) rows[r] = (rows[r] ?? 0) | (1 << (4 - c))
        }
      }
      map.set(String.fromCharCode(0x20 + k), rows)
    }
    Font.baseRows = map
    return map
  }

  private static build(requested: number): Uint8Array {
    const codePoint = Font.ALIASES.get(requested) ?? requested
    const out = new Uint8Array(Font.CELL_HEIGHT)
    const blocks = Font.blockEighths(codePoint)
    if (blocks > 0) {
      const height = Math.round((Font.CELL_HEIGHT * blocks) / 8)
      for (let r = Font.CELL_HEIGHT - height; r < Font.CELL_HEIGHT; r++) out[r] = 0x3f
      return out
    }
    if (codePoint === 0x2500) {
      out[5] = 0x3f
      return out
    }
    if (codePoint === 0x2501) {
      out[5] = 0x3f
      out[6] = 0x3f
      return out
    }
    if (codePoint >= 0x2800 && codePoint <= 0x28ff) {
      const bits = codePoint - 0x2800
      const dots: readonly (readonly [number, number, number])[] = [
        [0x01, 0, 0],
        [0x02, 0, 1],
        [0x04, 0, 2],
        [0x08, 1, 0],
        [0x10, 1, 1],
        [0x20, 1, 2],
        [0x40, 0, 3],
        [0x80, 1, 3],
      ]
      for (const dot of dots) {
        if ((bits & dot[0]) === 0) continue
        const mask = dot[1] === 0 ? 0x30 : 0x03
        const top = dot[2] * 3
        out[top] = (out[top] ?? 0) | mask
        out[top + 1] = (out[top + 1] ?? 0) | mask
      }
      return out
    }
    const symbol = Font.SYMBOLS.get(codePoint)
    if (symbol !== undefined) {
      for (let r = 0; r < 7; r++) out[3 + r] = symbol[r] ?? 0
      return out
    }
    const composed = Font.COMPOSED.get(codePoint)
    if (composed !== undefined) return Font.compose(composed[0], composed[1])
    const base = Font.ascii().get(String.fromCharCode(codePoint))
    if (base !== undefined && codePoint >= 0x20 && codePoint <= 0x7e) {
      for (let r = 0; r < 7; r++) out[3 + r] = base[r] ?? 0
      return out
    }
    const box = [0x1f, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1f]
    for (let r = 0; r < 7; r++) out[3 + r] = box[r] ?? 0
    return out
  }

  private static compose(letter: string, accent: string): Uint8Array {
    const out = new Uint8Array(Font.CELL_HEIGHT)
    const base = (Font.ascii().get(letter) ?? []).slice()
    if (letter === 'i') base[0] = 0
    for (let r = 0; r < 7; r++) out[3 + r] = base[r] ?? 0
    const pattern = Font.ACCENTS.get(accent) ?? []
    if (accent === 'cedilla') {
      out[10] = pattern[0] ?? 0
      out[11] = pattern[1] ?? 0
      return out
    }
    const top = letter === letter.toUpperCase() ? 0 : 2
    out[top] = pattern[0] ?? 0
    out[top + 1] = pattern[1] ?? 0
    return out
  }
}
