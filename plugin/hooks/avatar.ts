import { Accessories } from './accessories'
import { Canvas, type Point, type Rgb } from './canvas'
import { Motion, Raster, Sprite, type Palette } from './sprite'

export type OrchestratorState = 'working' | 'idle' | 'asleep'

export type OrchestratorReaction = { kind: string; t: number }

type EyeMode = 'open' | 'blink' | 'happy' | 'closed'

type MouthShape = 'rest' | 'grin' | 'smirk' | 'open' | 'o'

type HandStyle = 'open' | 'thumb' | 'point' | 'flat'

type Hand = { x: number; y: number; style: HandStyle; left: boolean; head: boolean; out: number }

type Prop = 'mug' | 'watch' | 'drum' | 'notes' | 'stamp' | 'phone' | 'calendar'

type Face = {
  state: OrchestratorState
  frame: number
  hx: number
  hy: number
  by: number
  look: number
  eyes: [EyeMode, EyeMode]
  browL: number
  browR: number
  furrow: boolean
  mouth: MouthShape
  blush: boolean
  boost: number
}

type Fx = {
  t: number
  e: number
  glint: number
  reticle: number
  burst: number
  sparkle: number
  puff: number
  bang: number
  hands: Hand[]
  prop: Prop | null
}

export class Avatar {
  static readonly REACTION_MS = 1600
  static readonly SPAWN_REACTIONS: readonly string[] = ['wink', 'nod', 'summon', 'eyebrow', 'cheer', 'scan']
  static readonly EXIT_REACTIONS: readonly string[] = ['wave', 'thumbs-up', 'sigh', 'salute', 'chin-rub', 'satisfied']
  static readonly IDLE_QUIRKS: readonly string[] = ['coffee', 'stretch', 'watch', 'hair-ruffle', 'whistle', 'drum', 'stamp', 'phone', 'calendar']
  static readonly IDLE_QUIRK_FRAMES = 30
  static readonly IDLE_QUIRK_PERIOD = 375
  static readonly CROWN = -8
  static readonly WIDTH = 28
  static readonly HEIGHT = 13

  private static readonly KINDS: ReadonlySet<string> = new Set([...Avatar.SPAWN_REACTIONS, ...Avatar.EXIT_REACTIONS, ...Avatar.IDLE_QUIRKS])
  private static gazed: { x: number; y: number; frame: number } = { x: 0, y: 0, frame: Number.NaN }
  private static worn = ''

  private static readonly WHITE: Rgb = [255, 255, 255]
  private static readonly ACCENT: Rgb = [0, 187, 167]
  private static readonly ACCENT_BRIGHT: Rgb = [110, 255, 232]
  private static readonly HAIR: Rgb = [30, 25, 28]
  private static readonly HAIR_DARK: Rgb = [14, 11, 14]
  private static readonly HAIR_LIGHT: Rgb = [86, 76, 80]
  private static readonly SKIN: Rgb = [244, 208, 182]
  private static readonly SKIN_SHADE: Rgb = [210, 160, 138]
  private static readonly STUBBLE: Rgb = [190, 152, 134]
  private static readonly SKIN_LIGHT: Rgb = [252, 226, 204]
  private static readonly NOSTRIL: Rgb = [170, 118, 102]
  private static readonly EAR: Rgb = [196, 144, 124]
  private static readonly BLUSH: Rgb = [240, 140, 132]
  private static readonly LIP: Rgb = [164, 88, 86]
  private static readonly MOUTH: Rgb = [96, 34, 44]
  private static readonly EYE_WHITE: Rgb = [248, 246, 240]
  private static readonly IRIS: Rgb = [112, 74, 46]
  private static readonly IRIS_DARK: Rgb = [40, 26, 20]
  private static readonly NAVY: Rgb = [34, 44, 80]
  private static readonly NAVY_DARK: Rgb = [20, 26, 50]
  private static readonly NAVY_RIM: Rgb = [70, 100, 150]
  private static readonly ARM: Rgb = [50, 64, 110]
  private static readonly LAPEL: Rgb = [56, 70, 114]
  private static readonly SHIRT: Rgb = [236, 226, 208]
  private static readonly SHIRT_SHADE: Rgb = [198, 186, 168]
  private static readonly FRAME: Rgb = [16, 22, 38]
  private static readonly HEADSET: Rgb = [0, 130, 120]
  private static readonly GOLD: Rgb = [255, 208, 96]
  private static readonly DROOL: Rgb = [176, 222, 255]
  private static readonly MUG: Rgb = [242, 246, 250]
  private static readonly PAPER: Rgb = [246, 244, 236]
  private static readonly PAPER_LINE: Rgb = [170, 178, 196]
  private static readonly STAMP_INK: Rgb = [210, 40, 52]
  private static readonly STAMP_HANDLE: Rgb = [128, 80, 44]
  private static readonly CALENDAR_TOP: Rgb = [214, 48, 60]
  private static readonly PHONE: Rgb = [204, 52, 64]
  private static readonly MUG_SHADE: Rgb = [184, 194, 210]
  private static readonly COFFEE: Rgb = [92, 56, 36]
  private static readonly STEAM: Rgb = [214, 226, 240]

  private static readonly HEAD = Sprite.of([
    '...HHH.LLHHH.LLHH.HL..',
    '.HHLHHLHHLHHLHHLHHLHH.',
    'HHHLLHHHHLLHHHHLLHHHHL',
    'HHLHHLHHLHHLHHLHHLHHLH',
    'HHHSSHHHSSSSHHSSSSHHHH',
    '.HHSSSSSSSSSSSSSSSSHH.',
    '..sSSSSSSSSSSSSSSSSs..',
    '..sSSSSSSSSSSSSSSSSs..',
    '...SSSSSSSSSSSSSSSS...',
    '...bSSSSbbbbbbSSSSb...',
    '....bbbbbbbbbbbbbb....',
    '......bbbbbbbbbb......',
  ])

  private static readonly BODY = Sprite.symmetric([
    '............ss',
    '......rrNNNlWW',
    '..rrrNNNNNNNNl',
    'rNNNNNNNNNNNNN',
  ])

  private static readonly CUP = Sprite.of(['.TT.', 'TATT', 'TTTT', '.TT.'])

  private static readonly HANDS: Readonly<Record<HandStyle, Sprite>> = {
    open: Sprite.of(['.S.S.S.', '.S.S.S.', 'SSSSSSS', '.SSSSS.', '..sss..']),
    thumb: Sprite.of(['..SS...', '..SS...', 'SSSSSS.', 'SSSSSs.', '.sSSSs.']),
    point: Sprite.of(['...SS..', '...SS..', '.SSSSS.', '.SSSSS.', '..sss..']),
    flat: Sprite.of(['SSSSSSSS', 'sSSSSSSs']),
  }

  private static readonly MUG_SPRITE = Sprite.of(['cccccc..', 'WWWWWWww', 'TTTTTT.w', 'WWWWWWww', 'wWWWWw..'])

  private static readonly NOTE = Sprite.of(['..XX', '..X.', '..X.', 'XXX.', 'XX..'])

  private static readonly STAR_SMALL = Sprite.of(['.X.', 'XWX', '.X.'])

  private static readonly STAR_BIG = Sprite.of(['..X..', '..X..', 'XXWXX', '..X..', '..X..'])

  private static readonly BANG = Sprite.of(['XX', 'XX', 'XX', '..', 'XX'])

  private static readonly RETICLE = [
    Sprite.of(['XX...XX', 'X.....X', '.......', '...W...', '.......', 'X.....X', 'XX...XX']),
    Sprite.of(['...X...', '...X...', '.......', 'XX.W.XX', '.......', '...X...', '...X...']),
  ]

  private static readonly SKIN_PALETTE: Palette = { S: Avatar.SKIN, s: Avatar.SKIN_SHADE }

  static quirk(frame: number, state: OrchestratorState): OrchestratorReaction | null {
    if (state !== 'idle') return null
    return Motion.schedule(frame, Avatar.IDLE_QUIRK_PERIOD, Avatar.IDLE_QUIRK_FRAMES, 0.61, Avatar.IDLE_QUIRKS)
  }

  static top(cy: number, scale: number): number {
    return cy + Avatar.CROWN * Raster.factor(scale)
  }

  static wear(id: string): void {
    Avatar.worn = id
  }

  static wearing(): string {
    return Avatar.worn
  }

  static draw(canvas: Canvas, cx: number, cy: number, scale: number, frame: number, state: OrchestratorState, reaction?: OrchestratorReaction, gaze?: Point, hatted = false): void {
    const cue = reaction ?? Avatar.quirk(frame, state)
    const fx = cue ? Avatar.effects(cue) : null
    const live: OrchestratorState = fx && state === 'asleep' ? 'idle' : state
    const f = Raster.factor(scale)
    const g = gaze && live !== 'asleep' ? Avatar.gazeToward(frame, { x: (gaze.x - cx) / (11 * f), y: (gaze.y - cy) / (9 * f) }) : Avatar.gazeRest(frame)
    const face = Avatar.pose(frame, live, g)
    if (fx && cue) Avatar.express(face, fx, cue)
    const glow = live === 'asleep' ? 0.07 : live === 'working' ? 0.15 + 0.04 * Math.sin(frame * 0.2) : 0.11
    canvas.glow(cx, cy - 1, 8 * f, Avatar.ACCENT, glow + 0.08 * face.boost)
    const r = new Raster(-24, -20, 48, 30)
    const floor = 6 + face.by
    const crossed = !fx || (fx.hands.length === 0 && (fx.prop === null || fx.prop === 'notes'))
    Avatar.part(r, l => Avatar.body(l, face))
    if (crossed) Avatar.part(r, l => Avatar.crossedArms(l, face))
    Avatar.part(r, l => Accessories.body(l, Avatar.worn, 3 + face.by))
    for (const hand of fx?.hands ?? []) Avatar.part(r, l => Avatar.arm(l, hand, floor, !hand.head))
    if (fx?.prop === 'watch') Avatar.part(r, l => Avatar.watch(l, fx, floor))
    if (fx?.prop === 'drum') Avatar.part(r, l => Avatar.drum(l, fx, floor))
    if (fx?.prop === 'stamp') Avatar.part(r, l => Avatar.stamp(l, fx, floor))
    if (fx?.prop === 'calendar') Avatar.part(r, l => Avatar.calendar(l, fx, floor))
    const hx = face.hx
    const hy = face.hy + Math.min(0, face.by)
    Avatar.part(r, l => {
      Avatar.head(l, face)
      Accessories.face(l, Avatar.worn, hx, hy, frame, hatted)
    })
    for (const hand of fx?.hands ?? []) if (hand.head) Avatar.part(r, l => Avatar.palm(l, hand))
    if (fx?.prop === 'mug') Avatar.part(r, l => Avatar.mug(l, fx, floor))
    if (fx?.prop === 'phone') Avatar.part(r, l => Avatar.phone(l, fx, hx, hy, floor))
    Accessories.glow(r, Avatar.worn, hx, hy, frame, hatted)
    if (fx) Avatar.flourish(r, face, fx)
    if (live === 'asleep') Avatar.bubble(r, face)
    r.blit(canvas, Math.round(cx), Math.round(cy / 2) * 2, scale)
  }

  private static part(r: Raster, paint: (layer: Raster) => void): void {
    const layer = r.layer()
    paint(layer)
    layer.outline()
    r.merge(layer)
  }

  private static gazeToward(frame: number, target: Point): Point {
    const tx = Math.max(-1, Math.min(1, target.x))
    const ty = Math.max(-1, Math.min(1, target.y))
    const prev = Avatar.gazed
    const dt = frame - prev.frame
    const k = dt > 0 && dt < 40 ? 1 - Math.exp(-dt / 4) : 1
    Avatar.gazed = { x: prev.x + (tx - prev.x) * k, y: prev.y + (ty - prev.y) * k, frame }
    return { x: Avatar.gazed.x, y: Avatar.gazed.y }
  }

  private static gazeRest(frame: number): null {
    Avatar.gazed = { x: 0, y: 0, frame }
    return null
  }

  private static blinking(frame: number, period: number): boolean {
    return ((frame % period) + period) % period < 2
  }

  private static pose(frame: number, state: OrchestratorState, gaze: Point | null): Face {
    const face: Face = {
      state,
      frame,
      hx: 0,
      hy: 0,
      by: 0,
      look: 0,
      eyes: ['open', 'open'],
      browL: 0,
      browR: 0,
      furrow: false,
      mouth: 'rest',
      blush: false,
      boost: 0,
    }
    if (state === 'asleep') {
      face.hy = Math.sin(frame * 0.07) > 0.2 ? 2 : 1
      face.eyes = ['closed', 'closed']
      face.mouth = 'o'
      return face
    }
    if (state === 'working') {
      face.hy = Math.sin(frame * 0.5) > 0.75 ? -1 : 0
      face.look = Math.round(2 * Math.max(-1, Math.min(1, 1.7 * Math.sin(frame * 0.17 + 2.6))))
      face.furrow = true
      if (Avatar.blinking(frame + 13, 47)) face.eyes = ['blink', 'blink']
    } else {
      face.by = Math.sin(frame * 0.08) > 0.6 ? -1 : 0
      face.look = Math.round(Math.sin(frame * 0.035 + 2.6) * 1.2)
      if (Avatar.blinking(frame + 13, 71)) face.eyes = ['blink', 'blink']
    }
    if (gaze) {
      face.look = Math.round(Math.max(-2, Math.min(2, gaze.x * 2.4 + face.look * 0.25)))
      face.hx = Math.round(gaze.x * 1.2)
      face.hy += Math.round(gaze.y)
    }
    return face
  }

  private static effects(cue: OrchestratorReaction): Fx | null {
    const e = Motion.envelope(cue.t)
    if (e <= 0 || !Avatar.KINDS.has(cue.kind)) return null
    return { t: cue.t, e, glint: 0, reticle: 0, burst: 0, sparkle: 0, puff: 0, bang: 0, hands: [], prop: null }
  }

  private static express(face: Face, fx: Fx, cue: OrchestratorReaction): void {
    const t = fx.t
    const e = fx.e
    const on = e > 0.3
    const rise = (from: number, to: number): number => Math.round(from + (to - from) * e)
    switch (cue.kind) {
      case 'wink':
        if (on) face.eyes = ['open', 'happy']
        face.mouth = 'smirk'
        face.browL = on ? 1 : 0
        face.hx += on ? 1 : 0
        face.look = -1
        face.blush = on
        fx.glint = e
        break
      case 'nod':
        face.hy += Math.round(2 * Math.abs(Math.sin(t * Math.PI * 3)) * e)
        face.furrow = true
        face.look = 0
        break
      case 'summon':
        fx.hands.push({ x: 13, y: rise(8, -4), style: 'open', left: false, head: false, out: 3 })
        fx.burst = e
        face.mouth = 'grin'
        face.browL = on ? 1 : 0
        face.browR = on ? 1 : 0
        face.look = 2
        face.boost = e
        break
      case 'eyebrow':
        face.browL = Math.round(2 * e)
        face.mouth = 'smirk'
        face.hx -= on ? 1 : 0
        face.look = -1
        fx.bang = e
        break
      case 'cheer': {
        const j = Math.abs(Math.sin(t * Math.PI * 3)) * e
        face.hy -= Math.round(2 * j)
        face.by -= Math.round(j)
        face.eyes = ['happy', 'happy']
        face.mouth = 'open'
        face.blush = true
        face.boost = e
        fx.sparkle = e
        break
      }
      case 'scan':
        fx.reticle = e
        face.boost = e
        face.look = Math.round(Math.sin(t * Math.PI * 2) * 2)
        face.furrow = true
        break
      case 'wave':
        fx.hands.push({ x: 13 + Math.round(Math.sin(t * Math.PI * 6) * e * 1.5), y: rise(8, -5), style: 'open', left: false, head: false, out: 3 })
        face.mouth = 'grin'
        face.look = 1
        break
      case 'thumbs-up':
        fx.hands.push({ x: 12, y: rise(8, -3), style: 'thumb', left: false, head: false, out: 3 })
        face.mouth = 'grin'
        if (e > 0.4) face.eyes = ['happy', 'open']
        fx.glint = e
        break
      case 'sigh':
        if (on) face.eyes = ['closed', 'closed']
        face.mouth = 'o'
        face.by += on ? 1 : 0
        face.hy += on ? 2 : 0
        fx.puff = e
        break
      case 'salute':
        fx.hands.push({ x: -9, y: rise(7, -4), style: 'flat', left: true, head: true, out: -5 })
        face.furrow = true
        face.browR = on ? 1 : 0
        face.look = 0
        fx.glint = e
        break
      case 'chin-rub': {
        const rub = Math.round(Math.sin(t * Math.PI * 8) * e)
        fx.hands.push({ x: 1 + rub, y: rise(10, 5), style: 'open', left: false, head: true, out: 3 })
        face.mouth = 'smirk'
        face.browR = on ? 1 : 0
        face.look = 1
        face.furrow = !on
        break
      }
      case 'satisfied':
        face.eyes = ['happy', 'happy']
        face.mouth = 'grin'
        face.blush = true
        face.hy -= Math.round(Math.max(0, Math.sin(t * Math.PI * 3)) * e)
        fx.sparkle = e * 0.6
        break
      case 'coffee': {
        const sip = Motion.ease((t - 0.36) / 0.12) * Motion.ease((0.8 - t) / 0.12)
        fx.prop = 'mug'
        face.mouth = sip > 0.4 ? 'o' : 'rest'
        if (sip > 0.6) face.eyes = ['closed', 'closed']
        face.hy -= sip > 0.5 ? 1 : 0
        face.look = 1
        break
      }
      case 'stretch':
        face.by -= Math.round(2 * e)
        face.hy -= Math.round(2 * e)
        if (on) face.eyes = ['closed', 'closed']
        face.mouth = 'open'
        face.browL = on ? 1 : 0
        face.browR = on ? 1 : 0
        fx.hands.push({ x: -14, y: rise(8, -11), style: 'open', left: true, head: false, out: -2 })
        fx.hands.push({ x: 13, y: rise(8, -11), style: 'open', left: false, head: false, out: 2 })
        break
      case 'watch':
        fx.prop = 'watch'
        face.look = -2
        face.hy += on ? 1 : 0
        face.browL = on ? 1 : 0
        face.browR = on ? 1 : 0
        face.furrow = true
        break
      case 'hair-ruffle': {
        const ruffle = Math.round(Math.sin(t * Math.PI * 7) * e)
        fx.hands.push({ x: 4 + ruffle, y: rise(9, -7), style: 'open', left: false, head: true, out: 5 })
        face.hx += on ? ruffle : 0
        face.eyes = on ? ['happy', 'happy'] : face.eyes
        face.mouth = 'grin'
        face.blush = on
        break
      }
      case 'whistle':
        fx.prop = 'notes'
        face.mouth = 'o'
        face.look = 2
        face.browL = on ? 1 : 0
        face.browR = on ? 1 : 0
        face.hx += Math.round(Math.sin(t * Math.PI * 4) * e)
        break
      case 'stamp': {
        const hit = Motion.ease((t - 0.4) / 0.1) * Motion.ease((0.75 - t) / 0.1)
        fx.prop = 'stamp'
        face.look = 2
        face.hy += hit > 0.5 ? 1 : 0
        face.mouth = hit > 0.5 ? 'grin' : 'smirk'
        face.furrow = hit <= 0.5
        break
      }
      case 'phone': {
        const talk = Math.sin(t * Math.PI * 14) > 0
        fx.prop = 'phone'
        face.mouth = on && talk ? 'open' : 'smirk'
        face.look = -1
        face.browL = on ? 1 : 0
        face.hx -= on ? 1 : 0
        break
      }
      case 'calendar':
        fx.prop = 'calendar'
        face.look = 0
        face.browL = on ? 1 : 0
        face.browR = on ? 1 : 0
        face.mouth = 'o'
        face.hy += on ? 1 : 0
        break
      case 'drum':
        fx.prop = 'drum'
        face.look = 2
        face.hy += Math.abs(Math.sin(t * Math.PI * 8)) * e > 0.6 ? 1 : 0
        face.hx += on ? 1 : 0
        face.mouth = 'smirk'
        break
    }
  }

  private static body(r: Raster, face: Face): void {
    const pulse = face.state === 'working' ? 0.5 + 0.5 * Math.sin(face.frame * 0.35) : face.state === 'idle' ? 0.35 : 0.1
    const y = 3 + face.by
    r.stamp(Avatar.BODY, { N: Avatar.NAVY, n: Avatar.NAVY_DARK, r: Avatar.NAVY_RIM, l: Avatar.LAPEL, W: Avatar.SHIRT, s: Avatar.SKIN_SHADE }, -14, y)
    r.rect(8, y + 1, 2, 1, Canvas.mix(Avatar.ACCENT, Avatar.ACCENT_BRIGHT, pulse))
  }

  private static crossedArms(r: Raster, face: Face): void {
    const y = 5 + face.by
    r.rect(-7, y, 15, 2, Avatar.ARM)
    r.rect(8, y, 2, 2, Avatar.SHIRT)
    r.rect(-9, y, 2, 2, Avatar.SHIRT)
    r.rect(-12, y, 3, 2, Avatar.SKIN)
  }

  private static head(r: Raster, face: Face): void {
    const x = face.hx
    const y = face.hy + Math.min(0, face.by)
    r.stamp(Avatar.HEAD, { H: Avatar.HAIR, L: Avatar.HAIR_LIGHT, S: Avatar.SKIN, s: Avatar.SKIN_SHADE, b: Avatar.STUBBLE }, x - 11, y - 9)
    Avatar.nose(r, x, y)
    r.rect(x + 8, y - 3, 1, 2, Avatar.EAR)
    if (face.blush) for (const bx of [-8, 6]) r.rect(x + bx, y - 1, 2, 1, Avatar.BLUSH, 0.85)
    Avatar.brows(r, face, x, y)
    for (const side of [-1, 1]) Avatar.eye(r, face, face.eyes[side < 0 ? 0 : 1], side < 0 ? x - 6 : x + 4, y)
    Avatar.mouth(r, face, x, y)
    Avatar.headset(r, face, x, y)
  }

  private static nose(r: Raster, x: number, y: number): void {
    r.rect(x - 1, y - 1, 2, 1, Avatar.SKIN_SHADE)
  }

  private static brows(r: Raster, face: Face, x: number, y: number): void {
    for (const side of [-1, 1]) {
      const up = side < 0 ? face.browL : face.browR
      const x0 = side < 0 ? x - 7 : x + 3
      r.rect(x0, y - 5 - up, 4, 1, Avatar.HAIR_DARK)
      if (face.furrow && up === 0) r.dot(side < 0 ? x0 + 3 : x0, y - 4, Avatar.HAIR_DARK)
    }
  }

  private static eye(r: Raster, face: Face, mode: EyeMode, x0: number, y: number): void {
    const ink = Avatar.HAIR_DARK
    const ex = x0 + 2 * Math.max(-1, Math.min(1, Math.trunc(face.look / 2)))
    switch (mode) {
      case 'open':
        r.rect(ex, y - 4, 2, 2, Avatar.IRIS_DARK)
        r.dot(ex + 1, y - 4, Avatar.EYE_WHITE)
        return
      case 'blink':
      case 'closed':
        r.rect(x0, y - 3, 2, 1, ink)
        return
      case 'happy':
        r.rect(x0, y - 4, 2, 1, ink)
    }
  }

  private static mouth(r: Raster, face: Face, x: number, y: number): void {
    const lip = Avatar.LIP
    switch (face.mouth) {
      case 'grin':
        r.rect(x - 3, y + 1, 6, 1, lip)
        r.dot(x - 3, y, lip)
        r.dot(x + 2, y, lip)
        return
      case 'smirk':
        r.rect(x - 2, y + 1, 3, 1, lip)
        r.dot(x + 1, y, lip)
        return
      case 'open':
        r.rect(x - 2, y + 1, 4, 2, Avatar.MOUTH)
        return
      case 'o':
        r.rect(x - 1, y + 1, 2, 2, Avatar.MOUTH)
        return
      default:
        r.rect(x - 2, y + 1, 4, 1, lip)
        r.dot(x + 2, y, lip)
    }
  }

  private static headset(r: Raster, face: Face, x: number, y: number): void {
    const pulse = face.state === 'working' ? 0.5 + 0.5 * Math.sin(face.frame * 0.7) : face.state === 'idle' ? 0.3 : 0
    r.rect(x - 10, y - 8, 1, 4, Avatar.HEADSET)
    r.stamp(Avatar.CUP, { T: Avatar.HEADSET, A: Canvas.mix(Avatar.ACCENT, Avatar.ACCENT_BRIGHT, 0.4 + 0.6 * pulse) }, x - 12, y - 4)
  }

  private static arm(r: Raster, hand: Hand, floor: number, withPalm: boolean): void {
    const wrist = hand.x + (hand.style === 'flat' ? (hand.left ? -3 : 3) : 0)
    if (hand.y < floor) {
      const steps = floor - hand.y
      for (let i = 0; i < steps; i++) {
        const cx = Math.round(wrist + (hand.out * i) / Math.max(1, steps))
        r.rect(cx - 2, hand.y + 1 + i, 4, 1, Avatar.NAVY)
      }
      r.rect(wrist - 2, hand.y, 4, 1, Avatar.SHIRT)
    }
    if (withPalm) Avatar.palm(r, hand)
  }

  private static palm(r: Raster, hand: Hand): void {
    const sprite = hand.left ? Avatar.HANDS[hand.style].mirrored() : Avatar.HANDS[hand.style]
    r.stamp(sprite, Avatar.SKIN_PALETTE, hand.x - Math.floor(sprite.width / 2), hand.y - sprite.height)
  }

  private static stamp(r: Raster, fx: Fx, floor: number): void {
    const t = fx.t
    const press = Motion.ease((t - 0.4) / 0.1) * Motion.ease((0.75 - t) / 0.1)
    const lift = Math.round((1 - fx.e) * 5)
    const px = 8
    const py = 4 + lift
    r.rect(px - 6, py, 12, 3, Avatar.PAPER)
    r.rect(px - 5, py + 1, 6, 1, Avatar.PAPER_LINE)
    if (t > 0.48 && fx.e > 0.3) r.rect(px + 1, py, 4, 2, Avatar.STAMP_INK, 0.9)
    const sy = py - 6 + Math.round(press * 4)
    Avatar.arm(r, { x: px + 7, y: sy + 4, style: 'flat', left: false, head: false, out: 3 }, floor, false)
    r.rect(px + 2, sy, 2, 3, Avatar.STAMP_HANDLE)
    r.rect(px, sy + 3, 6, 2, Avatar.STAMP_INK)
    r.rect(px + 4, sy + 1, 4, 2, Avatar.SKIN)
  }

  private static calendar(r: Raster, fx: Fx, floor: number): void {
    const lift = Math.round((1 - fx.e) * 6)
    const y = 2 + lift
    for (const side of [-1, 1]) Avatar.arm(r, { x: side * 9, y: y + 5, style: 'flat', left: side < 0, head: false, out: side * 3 }, floor, true)
    r.rect(-8, y, 16, 2, Avatar.CALENDAR_TOP)
    r.rect(-8, y + 2, 16, 4, Avatar.PAPER)
    for (let i = 0; i < 4; i++) r.rect(-6 + i * 4, y + 3, 2, 1, Avatar.PAPER_LINE)
    if (Math.sin(fx.t * Math.PI * 10) > -0.2) r.rect(2, y + 4, 2, 1, Avatar.CALENDAR_TOP)
    for (const x of [-5, 3]) r.rect(x, y - 1, 2, 1, Avatar.FRAME)
  }

  private static phone(r: Raster, fx: Fx, x: number, y: number, floor: number): void {
    if (fx.e < 0.25) return
    Avatar.arm(r, { x: x + 10, y: y + 1, style: 'flat', left: true, head: false, out: 4 }, floor, false)
    r.rect(x + 7, y - 5, 3, 2, Avatar.PHONE)
    r.rect(x + 8, y - 3, 2, 3, Avatar.PHONE)
    r.rect(x + 7, y, 3, 2, Avatar.PHONE)
    r.rect(x + 9, y - 2, 3, 3, Avatar.SKIN)
  }

  private static mug(r: Raster, fx: Fx, floor: number): void {
    const sip = Motion.ease((fx.t - 0.36) / 0.12) * Motion.ease((0.8 - fx.t) / 0.12)
    const x = Math.round(3 - 2 * sip)
    const y = Math.round(8 - 8 * fx.e - sip)
    Avatar.arm(r, { x: x + 9, y: y + 4, style: 'point', left: true, head: false, out: 3 }, floor, true)
    r.stamp(Avatar.MUG_SPRITE, { c: Avatar.COFFEE, W: Avatar.MUG, w: Avatar.MUG_SHADE, T: Avatar.ACCENT }, x, y)
    const steam = fx.e * (1 - sip)
    if (steam <= 0.1) return
    for (let i = 0; i < 2; i++) {
      for (let k = 0; k < 4; k++) {
        const wob = Math.round(Math.sin(fx.t * Math.PI * 6 + i * 2 + k * 1.3))
        r.dot(x + 1 + i * 3 + wob, y - 1 - k, Avatar.STEAM, 0.7 * steam * (1 - k * 0.18))
      }
    }
  }

  private static watch(r: Raster, fx: Fx, floor: number): void {
    const y = Math.round(8 - 5 * fx.e)
    const x = -3
    for (let i = 0; i < floor - y; i++) r.rect(x - 4 - i, y + 1 + i, 5, 1, Avatar.NAVY)
    r.rect(x - 1, y - 1, 7, 3, Avatar.SKIN)
    r.rect(x - 1, y + 1, 7, 1, Avatar.SKIN_SHADE)
    r.rect(x - 3, y - 1, 3, 3, Avatar.FRAME)
    r.dot(x - 2, y, Avatar.ACCENT_BRIGHT)
    const glint = fx.e * Motion.ease((fx.t - 0.38) / 0.12) * Motion.ease((0.78 - fx.t) / 0.12)
    if (glint > 0.3) r.stamp(Avatar.STAR_SMALL, { X: Avatar.WHITE, W: Avatar.WHITE }, x - 4, y - 3, glint)
  }

  private static drum(r: Raster, fx: Fx, floor: number): void {
    const lift = Math.round((1 - fx.e) * 4)
    const x = 7
    const y = 4 + lift
    r.rect(x + 3, y + 1, 4, Math.max(0, floor - y), Avatar.NAVY)
    r.rect(x - 3, y - 1, 7, 2, Avatar.SKIN)
    for (let i = 0; i < 4; i++) {
      const up = Math.sin(fx.t * Math.PI * 14 - i * 0.9) > 0.3 ? 1 : 0
      r.rect(x - 4 + i * 2, y + 1 - up, 1, 1, Avatar.SKIN_SHADE)
      if (!up && fx.e > 0.5) r.dot(x - 4 + i * 2, y + 3, Avatar.ACCENT_BRIGHT, 0.7)
    }
  }

  private static flourish(r: Raster, face: Face, fx: Fx): void {
    const x = face.hx
    const y = face.hy
    const star = { X: Avatar.WHITE, W: Avatar.WHITE }
    if (fx.glint > 0.3) r.stamp(Avatar.STAR_BIG, star, x - 11, y - 6, fx.glint)
    if (fx.reticle > 0) {
      const sprite = Avatar.RETICLE[Math.floor(fx.t * 8) % 2] ?? Avatar.RETICLE[0]
      if (sprite) r.stamp(sprite, { X: Avatar.ACCENT_BRIGHT, W: Avatar.WHITE }, x + 11, y - 10, fx.reticle)
    }
    if (fx.bang > 0) r.stamp(Avatar.BANG, { X: Avatar.GOLD }, x + 9, y - 16, fx.bang)
    if (fx.sparkle > 0) {
      for (let i = 0; i < 5; i++) {
        const a = i * 1.257 + fx.t * 1.6
        const twinkle = Math.sin(fx.t * Math.PI * 5 + i * 2) > 0
        const sprite = twinkle ? Avatar.STAR_BIG : Avatar.STAR_SMALL
        const c = i % 2 === 0 ? Avatar.GOLD : Avatar.ACCENT_BRIGHT
        r.stamp(sprite, { X: c, W: Avatar.WHITE }, Math.round(x + Math.cos(a) * 15) - 2, Math.round(y - 3 + Math.sin(a) * 8) - 2, fx.sparkle)
      }
    }
    if (fx.burst > 0) {
      const hand = fx.hands[0]
      if (hand) {
        const cx = hand.x
        const cy = hand.y - 8
        for (let i = 0; i < 8; i++) {
          const ang = i * Math.PI * 0.25 + fx.t * 1.5
          const r0 = 2
          const r1 = r0 + (i % 2 === 0 ? 4 : 2) * fx.burst
          r.line(cx + Math.cos(ang) * r0 * 2, cy + Math.sin(ang) * r0, cx + Math.cos(ang) * r1 * 2, cy + Math.sin(ang) * r1, i % 2 === 0 ? Avatar.ACCENT_BRIGHT : Avatar.GOLD, fx.burst)
        }
        r.dot(cx, cy, Avatar.WHITE)
      }
    }
    if (fx.puff > 0) {
      for (let i = 0; i < 3; i++) {
        const u = Math.max(0, Math.min(1, fx.t * 1.3 - i * 0.18))
        if (u <= 0) continue
        const rad = 1 + u * 1.5
        r.oval(x + 3 + u * 8 + i * 2, y + 1 + u - i * 0.5, rad * 2, rad, Avatar.DROOL, 0.55 * fx.e * (1 - u * 0.4))
      }
    }
    if (fx.prop === 'phone' && fx.e > 0.4) {
      r.rect(x + 10, y - 13, 9, 4, Avatar.WHITE, 0.95)
      r.dot(x + 10, y - 9, Avatar.WHITE, 0.95)
      for (let i = 0; i < 3; i++) if (Math.floor(fx.t * 12) % 4 > i) r.dot(x + 12 + i * 2, y - 11, Avatar.ACCENT)
    }
    if (fx.prop === 'stamp' && fx.t > 0.48 && fx.t < 0.62) r.stamp(Avatar.BANG, { X: Avatar.GOLD }, 14, -1, fx.e)
    if (fx.prop === 'notes') {
      for (let i = 0; i < 3; i++) {
        const u = fx.t * 1.6 - i * 0.28
        if (u <= 0 || u >= 1) continue
        const c = i % 2 === 0 ? Avatar.GOLD : Avatar.ACCENT_BRIGHT
        r.stamp(Avatar.NOTE, { X: c }, Math.round(x + 6 + u * 8), Math.round(y - u * 8 + Math.sin(u * Math.PI * 3 + i)), fx.e * Math.min(1, (1 - u) * 3))
      }
    }
  }

  private static bubble(r: Raster, face: Face): void {
    const u = 0.5 + 0.5 * Math.sin(face.frame * 0.1)
    const rad = Math.round(u * 2)
    const x = face.hx + 2 + rad
    const y = face.hy + 1
    if (rad === 0) {
      r.dot(x, y, Avatar.DROOL, 0.8)
      return
    }
    r.oval(x + rad, y, rad * 2, rad, Avatar.DROOL, 0.55)
    r.dot(x + rad - 1, y - rad + 1, Avatar.WHITE, 0.9)
  }

}
