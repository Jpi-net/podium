import { Avatar, type OrchestratorReaction, type OrchestratorState } from './avatar'
import { Canvas, type Point, type Rgb } from './canvas'
import { Motion, Raster } from './sprite'

export type { OrchestratorReaction, OrchestratorState } from './avatar'

export type RobotMood = 'working' | 'done' | 'failed' | 'killed' | 'idle'

export type RobotQuirk = { kind: string; t: number }

export type RobotInput = {
  type: string
  model: string
  mood: RobotMood
  frame: number
  flash: number
  seed: number
  thrust?: number
  tilt?: number
  squash?: number
  toolColor?: Rgb
}

type Shape = 'rounded' | 'circle' | 'hex' | 'shield' | 'barrel' | 'helmet'

type FaceStyle = 'pair' | 'cyclops' | 'visor' | 'stache'

type Spec = { shell: Rgb; accent: Rgb; eye: Rgb; shape: Shape; face: FaceStyle }

type Geo = {
  s: number
  hw: number
  hh: number
  top: number
  sTop: number
  sBot: number
  sw: number
  ew: number
  eh: number
  gap: number
  eyeTop: number
  mouth: number
  mw: number
  podTop: number
  podRows: number
  pw: number
  widths: readonly number[]
}

type Drive = { thrust: number; tilt: number; squash: number; tool: Rgb | null }

type Anim = {
  mood: RobotMood
  frame: number
  flash: number
  seed: number
  seedIndex: number
  active: boolean
  blink: boolean
  look: number
  bob: number
  quirk: string | null
  qt: number
  qe: number
  dx: number
  k: number
  wiggle: number
}

type Tint = 'none' | 'failed' | 'killed'

type Gadget = (p: Pix, st: Anim, spec: Spec, g: Geo, layer: number) => void

class Pix {
  constructor(
    private readonly canvas: Canvas,
    private readonly ox: number,
    private readonly oy: number,
    readonly tint: Tint,
    private readonly lean = 0,
    private readonly pivot = 0,
  ) {}

  shift(dx: number, dy: number): Pix {
    return new Pix(this.canvas, this.ox + dx * 0.5, this.oy + dy, this.tint, this.lean, this.pivot - dy)
  }

  sheared(lean: number, pivot: number): Pix {
    return new Pix(this.canvas, this.ox, this.oy, this.tint, lean, pivot)
  }

  plain(): Pix {
    return new Pix(this.canvas, this.ox, this.oy, 'none', this.lean, this.pivot)
  }

  color(c: Rgb): Rgb {
    return Raster.tinted(c, this.tint)
  }

  rect(x: number, y: number, w: number, h: number, c: Rgb, a = 1): void {
    if (w <= 0 || h <= 0 || a <= 0) return
    const col = this.color(c)
    if (this.lean === 0) {
      this.canvas.fillRect(this.ox + x * 0.5, this.oy + y, w * 0.5, h, col, a)
      return
    }
    for (let r = y; r < y + h; r++) this.canvas.fillRect(this.ox + (x + Math.round(this.lean * (this.pivot - r - 0.5))) * 0.5, this.oy + r, w * 0.5, 1, col, a)
  }

  dot(x: number, y: number, c: Rgb, a = 1): void {
    this.rect(x, y, 1, 1, c, a)
  }

  frame(x: number, y: number, w: number, h: number, c: Rgb, a = 1): void {
    this.rect(x + 1, y, w - 2, 1, c, a)
    this.rect(x + 1, y + h - 1, w - 2, 1, c, a)
    this.rect(x, y + 1, 1, h - 2, c, a)
    this.rect(x + w - 1, y + 1, 1, h - 2, c, a)
  }

  oval(cx: number, cy: number, rx: number, ry: number, c: Rgb, a = 1): void {
    for (let j = Math.floor(cy - ry); j < Math.ceil(cy + ry); j++) {
      const d = (j + 0.5 - cy) / ry
      if (Math.abs(d) >= 1) continue
      const half = rx * Math.sqrt(1 - d * d)
      const x0 = Math.round(cx - half)
      this.rect(x0, j, Math.round(cx + half) - x0, 1, c, a)
    }
  }

  line(x0: number, y0: number, x1: number, y1: number, c: Rgb, a = 1, thick = 1): void {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1)
    for (let i = 0; i <= n; i++) this.rect(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), thick, 1, c, a)
  }

  glow(x: number, y: number, r: number, c: Rgb, a: number): void {
    if (this.tint === 'killed' || a <= 0) return
    this.canvas.glow(this.ox + x * 0.5, this.oy + y, r, this.color(c), a)
  }
}

export class Robots {
  static readonly WIDTH = 14
  static readonly HEIGHT = 15
  static readonly ORCHESTRATOR_SCALE = 1.6
  static readonly ORCHESTRATOR_QUAD_BOOST = 1.25
  static readonly AVATAR_COLUMNS = Avatar.WIDTH / 2
  static readonly AVATAR_ROWS = Avatar.HEIGHT
  static readonly REACTION_MS = Avatar.REACTION_MS
  static readonly SPAWN_REACTIONS: readonly string[] = Avatar.SPAWN_REACTIONS
  static readonly EXIT_REACTIONS: readonly string[] = Avatar.EXIT_REACTIONS
  static readonly IDLE_QUIRKS: readonly string[] = Avatar.IDLE_QUIRKS
  static readonly ROBOT_QUIRKS: readonly string[] = ['wiggle', 'sneeze', 'yawn', 'dance', 'double-blink', 'look-around', 'spark', 'chest-puff']
  static readonly ROBOT_QUIRK_FRAMES = 19
  static readonly IDLE_QUIRK_FRAMES = Avatar.IDLE_QUIRK_FRAMES
  static readonly IDLE_QUIRK_PERIOD = Avatar.IDLE_QUIRK_PERIOD

  private static readonly WHITE: Rgb = [255, 255, 255]
  private static readonly INK: Rgb = [12, 15, 30]
  private static readonly FACE: Rgb = [26, 34, 58]
  private static readonly PUPIL: Rgb = [18, 26, 48]
  private static readonly BLUSH: Rgb = [246, 140, 140]
  private static readonly STEM: Rgb = [150, 162, 190]
  private static readonly OK: Rgb = [105, 240, 174]
  private static readonly KO: Rgb = [255, 85, 115]
  private static readonly DEAD: Rgb = [110, 116, 134]
  private static readonly SPARK: Rgb = [255, 222, 120]
  private static readonly GOLD: Rgb = [255, 208, 96]
  private static readonly OPUS: Rgb = [181, 140, 255]
  private static readonly SONNET: Rgb = [72, 196, 255]
  private static readonly HAIKU: Rgb = [255, 186, 92]
  private static readonly OTHER: Rgb = [150, 160, 182]
  private static readonly ACCENT: Rgb = [0, 187, 167]
  private static readonly ACCENT_BRIGHT: Rgb = [110, 255, 232]
  private static readonly PAINTS: readonly Rgb[] = [
    [255, 92, 92],
    [255, 210, 80],
    [90, 200, 255],
    [120, 232, 120],
  ]

  private static readonly SPECS: Readonly<Record<string, Spec>> = {
    'general-purpose': { shell: [205, 214, 232], accent: [196, 210, 236], eye: [110, 232, 255], shape: 'rounded', face: 'pair' },
    architect: { shell: [64, 112, 228], accent: [96, 146, 255], eye: [205, 232, 255], shape: 'rounded', face: 'pair' },
    debugger: { shell: [246, 150, 44], accent: [255, 158, 54], eye: [130, 240, 255], shape: 'rounded', face: 'pair' },
    plan: { shell: [238, 128, 168], accent: [255, 136, 176], eye: [255, 238, 150], shape: 'rounded', face: 'pair' },
    explore: { shell: [64, 192, 104], accent: [84, 214, 124], eye: [170, 255, 200], shape: 'rounded', face: 'pair' },
    'dotnet-expert': { shell: [138, 82, 222], accent: [176, 116, 255], eye: [228, 206, 255], shape: 'hex', face: 'pair' },
    'angular-expert': { shell: [226, 46, 72], accent: [246, 72, 98], eye: [255, 226, 232], shape: 'shield', face: 'pair' },
    'mssql-expert': { shell: [132, 150, 190], accent: [236, 120, 92], eye: [255, 180, 140], shape: 'barrel', face: 'pair' },
    'test-expert': { shell: [146, 222, 86], accent: [158, 240, 96], eye: [210, 255, 170], shape: 'circle', face: 'pair' },
    'e2e-expert': { shell: [244, 212, 66], accent: [250, 226, 80], eye: [255, 110, 110], shape: 'rounded', face: 'cyclops' },
    'ux-ui-expert': { shell: [222, 90, 200], accent: [240, 104, 220], eye: [255, 214, 248], shape: 'rounded', face: 'pair' },
    'docker-expert': { shell: [36, 146, 232], accent: [50, 168, 248], eye: [190, 240, 255], shape: 'rounded', face: 'pair' },
    'proxy-generator': { shell: [146, 160, 196], accent: [100, 232, 255], eye: [120, 236, 255], shape: 'rounded', face: 'pair' },
    'lint-runner': { shell: [118, 98, 240], accent: [146, 124, 255], eye: [200, 236, 255], shape: 'rounded', face: 'stache' },
    'code-reviewer': { shell: [86, 166, 212], accent: [106, 190, 236], eye: [150, 240, 255], shape: 'rounded', face: 'pair' },
    'security-reviewer': { shell: [176, 186, 210], accent: [238, 196, 92], eye: [255, 176, 72], shape: 'helmet', face: 'visor' },
    'doc-writer': { shell: [240, 228, 198], accent: [244, 214, 140], eye: [96, 150, 255], shape: 'rounded', face: 'pair' },
    'git-writer': { shell: [240, 92, 52], accent: [255, 116, 72], eye: [255, 232, 200], shape: 'rounded', face: 'pair' },
    fork: { shell: [168, 214, 250], accent: [160, 220, 255], eye: [110, 232, 255], shape: 'rounded', face: 'pair' },
  }

  private static readonly ALIASES: Readonly<Record<string, string>> = {
    claude: 'general-purpose',
    'general purpose': 'general-purpose',
  }

  private static readonly GADGETS: Readonly<Record<string, Gadget>> = {
    'general-purpose': (p, st, spec, g, layer) => Robots.generalPurpose(p, st, spec, g, layer),
    architect: (p, st, spec, g, layer) => Robots.architect(p, st, spec, g, layer),
    debugger: (p, st, spec, g, layer) => Robots.debuggerBot(p, st, spec, g, layer),
    plan: (p, st, spec, g, layer) => Robots.plan(p, st, spec, g, layer),
    explore: (p, st, spec, g, layer) => Robots.explore(p, st, spec, g, layer),
    'dotnet-expert': (p, st, spec, g, layer) => Robots.dotnet(p, st, spec, g, layer),
    'angular-expert': (p, st, spec, g, layer) => Robots.angular(p, st, spec, g, layer),
    'mssql-expert': (p, st, spec, g, layer) => Robots.mssql(p, st, spec, g, layer),
    'test-expert': (p, st, spec, g, layer) => Robots.testBot(p, st, spec, g, layer),
    'e2e-expert': (p, st, spec, g, layer) => Robots.e2e(p, st, spec, g, layer),
    'ux-ui-expert': (p, st, spec, g, layer) => Robots.uxUi(p, st, spec, g, layer),
    'docker-expert': (p, st, spec, g, layer) => Robots.docker(p, st, spec, g, layer),
    'proxy-generator': (p, st, spec, g, layer) => Robots.proxy(p, st, spec, g, layer),
    'lint-runner': (p, st, spec, g, layer) => Robots.lint(p, st, spec, g, layer),
    'code-reviewer': (p, st, spec, g, layer) => Robots.codeReviewer(p, st, spec, g, layer),
    'security-reviewer': (p, st, spec, g, layer) => Robots.security(p, st, spec, g, layer),
    'doc-writer': (p, st, spec, g, layer) => Robots.docWriter(p, st, spec, g, layer),
    'git-writer': (p, st, spec, g, layer) => Robots.gitWriter(p, st, spec, g, layer),
  }

  static accent(type: string): Rgb {
    return Robots.spec(type).accent
  }

  static draw(canvas: Canvas, cx: number, cy: number, scale: number, input: RobotInput, quirk: RobotQuirk | null = Robots.quirk(input)): void {
    const key = Robots.key(input.type)
    const spec = Robots.spec(input.type)
    const st = Robots.quirked(Robots.anim(input), Robots.lively(input.mood) ? quirk : null)
    const tint: Tint = input.mood === 'failed' ? 'failed' : input.mood === 'killed' ? 'killed' : 'none'
    const drive = Robots.drive(input)
    const pen = new Pix(canvas, Math.round(cx + st.dx * scale * 1.5), Math.round(cy + st.bob * 1.4), tint)
    if (key === 'fork') {
      Robots.fork(pen, st, spec, input.model, scale * st.k, drive)
      return
    }
    const gadget = Robots.GADGETS[key] ?? ((p: Pix, s: Anim, sp: Spec, g: Geo, layer: number) => Robots.generalPurpose(p, s, sp, g, layer))
    Robots.robot(pen, st, spec, gadget, input.model, scale * st.k, drive, true)
  }

  static extent(scale: number): { up: number; down: number; half: number } {
    const g = Robots.geo(scale, 'rounded', 0)
    return { up: 6 - g.top, down: g.podTop + g.podRows + 7, half: g.hw / 2 + 5 }
  }

  static quirk(input: RobotInput): RobotQuirk | null {
    if (!Robots.lively(input.mood)) return null
    const sv = Canvas.hash(input.seed * 97.31 + 0.5, 0.37)
    const period = 230 + (Math.floor(sv * 997) % 80)
    return Motion.schedule(input.frame, period, Robots.ROBOT_QUIRK_FRAMES, sv, Robots.ROBOT_QUIRKS)
  }

  static orchestratorQuirk(frame: number, state: OrchestratorState): OrchestratorReaction | null {
    return Avatar.quirk(frame, state)
  }

  static orchestratorTop(cy: number, scale: number): number {
    return Avatar.top(cy, scale)
  }

  static drawOrchestrator(canvas: Canvas, cx: number, cy: number, scale: number, frame: number, state: OrchestratorState, reaction?: OrchestratorReaction, gaze?: Point, hatted = false): void {
    Avatar.draw(canvas, cx, cy, scale, frame, state, reaction, gaze, hatted)
  }

  static wear(id: string): void {
    Avatar.wear(id)
  }

  static wearing(): string {
    return Avatar.wearing()
  }

  private static lively(mood: RobotMood): boolean {
    return mood === 'working' || mood === 'idle'
  }

  private static quirked(st: Anim, quirk: RobotQuirk | null): Anim {
    if (!quirk || !Robots.ROBOT_QUIRKS.includes(quirk.kind)) return st
    const t = quirk.t
    const e = Motion.envelope(t)
    if (e <= 0) return st
    const q: Anim = { ...st, quirk: quirk.kind, qt: t, qe: e }
    switch (quirk.kind) {
      case 'wiggle':
        q.wiggle = Math.sin(t * Math.PI * 7) * 0.9 * e
        break
      case 'sneeze': {
        const inhale = Motion.ease(t / 0.38) * (1 - Motion.ease((t - 0.38) / 0.06))
        const jolt = Motion.ease((t - 0.38) / 0.08) * Motion.ease((0.78 - t) / 0.2)
        q.bob += (-0.7 * inhale + 1.1 * jolt) * e
        q.dx = 0.55 * jolt * e
        q.blink = t > 0.24 && t < 0.62
        break
      }
      case 'yawn':
        q.bob -= 0.45 * e
        q.blink = e > 0.35
        break
      case 'dance': {
        const s = Math.sin(t * Math.PI * 5)
        q.dx = s * 1.1 * e
        q.bob -= Math.abs(s) * 0.7 * e
        break
      }
      case 'double-blink':
        q.blink = (t > 0.2 && t < 0.32) || (t > 0.44 && t < 0.56)
        break
      case 'look-around': {
        const v = -Math.cos(t * Math.PI * 2)
        q.look = st.look * (1 - e) + v * e
        q.dx = v * 0.5 * e
        q.blink = false
        break
      }
      case 'chest-puff':
        q.k = 1 + 0.15 * e
        q.bob -= 0.4 * e
        break
    }
    return q
  }

  private static key(type: string): string {
    const last = type.split(':').pop() ?? type
    const lower = last.trim().toLowerCase()
    return Robots.ALIASES[lower] ?? lower
  }

  private static spec(type: string): Spec {
    const key = Robots.key(type)
    const known = Robots.SPECS[key]
    if (known) return known
    const h = Robots.hashText(key)
    const shell = Robots.hsl(h * 360, 0.62, 0.62)
    return { shell, accent: Robots.hsl(h * 360, 0.85, 0.68), eye: Robots.hsl((h * 360 + 180) % 360, 0.9, 0.8), shape: 'rounded', face: 'pair' }
  }

  private static hashText(text: string): number {
    let h = 2166136261
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
    return (h >>> 0) / 4294967296
  }

  private static hsl(h: number, s: number, l: number): Rgb {
    const a = s * Math.min(l, 1 - l)
    const f = (n: number): number => {
      const k = (n + h / 30) % 12
      return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))
    }
    return [f(0), f(8), f(4)]
  }

  private static modelColor(model: string): Rgb {
    const m = model.toLowerCase()
    if (m.includes('opus')) return Robots.OPUS
    if (m.includes('sonnet')) return Robots.SONNET
    if (m.includes('haiku')) return Robots.HAIKU
    return Robots.OTHER
  }

  private static anim(input: RobotInput): Anim {
    const sv = Canvas.hash(input.seed * 97.31 + 0.5, 0.37)
    const seedIndex = Math.floor(sv * 997)
    const f = input.frame
    const active = input.mood === 'working'
    const idle = input.mood === 'idle'
    const flash = active ? Math.max(0, Math.min(1, input.flash)) : 0
    const period = active ? 34 + (seedIndex % 27) : 56 + (seedIndex % 31)
    const blink = (active || idle) && (f + seedIndex) % period < 2 && flash < 0.5
    const look = active ? Math.max(-1, Math.min(1, 1.7 * Math.sin(f * 0.17 + sv * 6.28))) : idle ? Math.sin(f * 0.035 + sv * 6.28) * 0.35 : 0
    const bob = idle
      ? Math.sin(f * 0.11 + sv * 6.28) * 0.55
      : active
        ? -Math.sin(flash * Math.PI) * 0.7 + Math.sin(f * 0.55 + sv * 6.28) * 0.12
        : input.mood === 'killed'
          ? 0.5
          : 0
    return { mood: input.mood, frame: f, flash, seed: sv, seedIndex, active, blink, look, bob, quirk: null, qt: 0, qe: 0, dx: 0, k: 1, wiggle: 0 }
  }

  private static robot(p: Pix, st: Anim, spec: Spec, gadget: Gadget, model: string, scale: number, drive: Drive, badges: boolean): void {
    const g = Robots.geo(scale, spec.shape, drive.squash, !badges)
    const lean = Math.tan(Math.max(-0.6, Math.min(0.6, drive.tilt))) * 1.6
    const h = lean === 0 ? p : p.sheared(lean, g.podTop)
    const gp = st.wiggle === 0 ? h : h.shift(Math.round(st.wiggle * 2), 0)
    if (st.active && st.flash > 0) p.glow(0, g.top + g.hh / 2, g.hw * 0.7, spec.accent, st.flash * 0.18)
    Robots.flame(p, st, g, drive)
    Robots.pod(p, st, spec, g, model)
    Robots.hands(p, st, spec, g)
    gadget(gp, st, spec, g, 0)
    Robots.head(h, spec, g)
    gadget(gp, st, spec, g, 1)
    Robots.screen(st.mood === 'failed' ? h.plain() : h, st, spec, g)
    if (spec.face !== 'cyclops') Robots.eyes(h, st, spec, g)
    gadget(gp, st, spec, g, 2)
    if (spec.face !== 'stache' && st.quirk !== 'yawn') Robots.mouth(h, st, spec, g)
    if (st.mood === 'failed') Robots.crack(h, g)
    if (st.active) Robots.holo(p, st, spec, g, drive)
    if (st.quirk) Robots.quirkFx(h, st, spec, g)
    if (!badges) return
    if (st.mood === 'done') Robots.check(p.plain(), g.hw + 1, g.podTop - 2)
    if (st.mood === 'failed') Robots.sparks(p.plain(), st, g)
  }

  private static drive(input: RobotInput): Drive {
    const clamp = (v: number | undefined, lo: number, hi: number): number => (v === undefined || !Number.isFinite(v) ? 0 : Math.max(lo, Math.min(hi, v)))
    return { thrust: clamp(input.thrust, 0, 1), tilt: clamp(input.tilt, -1, 1), squash: clamp(input.squash, -1, 1), tool: input.toolColor ?? null }
  }

  private static unit(g: Geo, n: number): number {
    return Math.max(1, Math.round(n * g.s))
  }

  private static outline(c: Rgb): Rgb {
    return Canvas.mix(c, Robots.INK, 0.8)
  }

  private static geo(scale: number, shape: Shape, squash: number, small = false): Geo {
    const s = scale
    const hw = Math.max(6, 2 * Math.max(small ? 3 : 4, Math.round(5 * s)) + 2 * Math.round(squash))
    const base = Math.max(5, Math.max(small ? 6 : 7, Math.round(9 * s)) - Math.round(squash * 2))
    const extraTop = shape === 'barrel' || shape === 'helmet' ? 1 : 0
    const extraBottom = shape === 'shield' ? (hw >= 10 ? 3 : 2) : 0
    const hh = base + extraTop + extraBottom
    const podTop = Math.max(2, Math.round(3 * s))
    const top = podTop - hh
    const rows = base - (base >= 8 ? 4 : 3)
    const sTop = top + extraTop + 2
    const sBot = sTop + rows - 1
    const sw = hw >= 10 ? hw - 3 : hw - 2
    const widths: number[] = []
    for (let r = 0; r < hh; r++) {
      const w = Robots.profile(shape, r, hh, hw, extraBottom)
      const y = top + r
      widths.push(y >= sTop - 1 && y <= sBot + 1 ? Math.max(w, sw + 1) : w)
    }
    return {
      s,
      hw,
      hh,
      top,
      sTop,
      sBot,
      sw,
      ew: hw >= 10 ? 4 : 2,
      eh: rows >= 5 ? 3 : 2,
      gap: hw >= 8 ? 4 : 2,
      eyeTop: sTop + (rows >= 6 ? 1 : 0),
      mouth: sBot,
      mw: hw >= 10 ? 6 : 4,
      podTop,
      podRows: s >= 0.85 ? 2 : 1,
      pw: 2 * Math.max(1, Math.round(hw * 0.22)),
      widths,
    }
  }

  private static profile(shape: Shape, r: number, n: number, hw: number, tail: number): number {
    const last = n - 1
    const edge = Math.min(r, last - r)
    const c = last / 2
    switch (shape) {
      case 'rounded':
        return edge === 0 ? hw - 2 : edge === 1 && n >= 7 ? hw - 1 : hw
      case 'barrel':
        return edge === 0 ? hw - 2 : hw
      case 'circle': {
        const d = (r - c) / (c + 0.7)
        return Math.max(2, Math.round(hw * Math.sqrt(Math.max(0, 1 - d * d)) + 0.3))
      }
      case 'hex':
        return hw + 1 - Math.round(Math.abs(r - c) * 1.5)
      case 'shield': {
        const t = r - (n - tail)
        if (t >= 0) return Math.max(1, Math.round(hw * (1 - (t + 1) / (tail + 1))))
        return r === 0 ? hw + 1 : hw
      }
      case 'helmet':
        if (r === 0) return hw - 4
        if (r === 1) return hw - 2
        if (r === 2 && n >= 9) return hw - 1
        return r === last ? hw - 1 : hw
    }
  }

  private static head(p: Pix, spec: Spec, g: Geo): void {
    const o = Robots.outline(spec.shell)
    const light = Canvas.mix(spec.shell, Robots.WHITE, 0.45)
    const dark = Canvas.mix(spec.shell, Robots.INK, 0.3)
    const n = g.widths.length
    g.widths.forEach((w, r) => {
      const y = g.top + r
      p.rect(-w, y, 2 * w, 1, o)
      if (r === 0 || r === n - 1) return
      const inner = Math.min(w, g.widths[r - 1] ?? 0, g.widths[r + 1] ?? 0) - 1
      if (inner <= 0) return
      const topEdge = y < g.sTop
      p.rect(-inner, y, 2 * inner, 1, topEdge && r === 1 ? light : y > g.sBot && r === n - 2 ? dark : spec.shell)
      if (topEdge || y <= g.sBot) p.dot(-inner, y, light)
      if (y > g.sTop) p.dot(inner - 1, y, dark)
    })
  }

  private static screen(p: Pix, st: Anim, spec: Spec, g: Geo): void {
    const h = g.sBot - g.sTop + 1
    p.rect(-g.sw, g.sTop, 2 * g.sw, h, Robots.FACE)
    if (g.sw >= 6) {
      const o = spec.shell
      for (const y of [g.sTop, g.sBot]) {
        p.dot(-g.sw, y, o)
        p.dot(g.sw - 1, y, o)
      }
    }
    if (spec.face === 'visor') {
      const lit = st.mood === 'killed' ? 0 : 0.4
      p.rect(-g.sw, g.eyeTop, 2 * g.sw, g.eh, spec.eye, lit)
      p.rect(-g.sw, g.eyeTop - 1, 2 * g.sw, 1, Robots.WHITE, 0.12)
    }
  }

  private static look(st: Anim, g: Geo): number {
    const room = Math.max(0, g.sw - g.gap / 2 - g.ew)
    return Math.round(Math.max(-1, Math.min(1, st.look)) * room)
  }

  private static eyes(p: Pix, st: Anim, spec: Spec, g: Geo): void {
    const lx = Robots.look(st, g)
    Robots.eye(p, st, spec.eye, -g.gap / 2 - g.ew + lx, g.eyeTop, g.ew, g.eh)
    Robots.eye(p, st, spec.eye, g.gap / 2 + lx, g.eyeTop, g.ew, g.eh)
  }

  private static eye(p: Pix, st: Anim, c: Rgb, x: number, y: number, w: number, h: number): void {
    if (st.mood === 'killed') {
      p.rect(x, y + h - 1, w, 1, Robots.DEAD)
      return
    }
    if (st.mood === 'failed') {
      const x0 = x + w / 2 - 3
      for (let i = 0; i < 3; i++) {
        const k = i === 1 ? 2 : 0
        p.rect(x0 + k, y + i, 2, 1, Robots.KO)
        if (i !== 1) p.rect(x0 + 4, y + i, 2, 1, Robots.KO)
      }
      return
    }
    if (st.mood === 'done') {
      const cw = Math.max(w, 3)
      const x0 = x - Math.floor((cw - w) / 2)
      p.rect(x0 + 1, y, cw - 2, 1, c)
      p.dot(x0, y + 1, c)
      p.dot(x0 + cw - 1, y + 1, c)
      return
    }
    if (st.blink) {
      p.rect(x, y + h - 1, w, 1, c)
      return
    }
    const hot = st.flash > 0.3 ? Canvas.mix(c, Robots.WHITE, 0.5) : c
    if (st.mood === 'idle' && h >= 3) {
      p.rect(x, y + 1, w, h - 1, hot)
      return
    }
    p.rect(x, y, w, h, hot)
    p.dot(x, y, Canvas.mix(hot, Robots.WHITE, 0.65))
  }

  private static mouth(p: Pix, st: Anim, spec: Spec, g: Geo): void {
    const y = g.mouth
    const w = g.mw
    const x0 = -w / 2
    const free = g.mouth - 1 > g.eyeTop + g.eh
    const c = spec.eye
    switch (st.mood) {
      case 'killed':
        p.rect(x0, y, w, 1, Robots.DEAD)
        return
      case 'failed':
        if (g.mouth - 1 <= g.eyeTop + 2) return
        for (let i = 0; i < w; i++) p.dot(x0 + i, i % 2 === 1 ? y - 1 : y, Robots.KO)
        return
      case 'done':
        if (free) {
          p.rect(x0 + 1, y, w - 2, 1, c)
          p.dot(x0, y - 1, c)
          p.dot(x0 + w - 1, y - 1, c)
        } else p.rect(x0, y, w, 1, c)
        return
      case 'idle':
        p.rect(x0 + 1, y, w - 2, 1, Canvas.mix(c, Robots.FACE, 0.35))
        return
      case 'working':
        break
    }
    for (let i = 0; i < w; i++) {
      const wave = 0.5 + 0.5 * Math.sin(st.frame * 1.3 + i * 2.1 + st.seed * 12)
      const v = Math.max(wave, st.flash)
      if (free && v > 0.62) p.dot(x0 + i, y - 1, c)
      p.dot(x0 + i, y, v > 0.3 || i === w / 2 ? c : Canvas.mix(c, Robots.FACE, 0.6))
    }
  }

  private static pod(p: Pix, st: Anim, spec: Spec, g: Geo, model: string): void {
    const o = Robots.outline(spec.shell)
    const w = g.pw
    const band = st.mood === 'killed' ? Robots.DEAD : Robots.modelColor(model)
    p.rect(-w - 1, g.podTop, 2 * w + 2, 1, o)
    p.rect(-w, g.podTop, 2 * w, 1, band)
    if (g.podRows < 2) return
    p.rect(-w, g.podTop + 1, 2 * w, 1, o)
    p.rect(-w + 1, g.podTop + 1, 2 * w - 2, 1, Canvas.mix(spec.shell, Robots.INK, 0.4))
  }

  private static hands(p: Pix, st: Anim, spec: Spec, g: Geo): void {
    const tap = st.active && st.flash > 0
    const beat = Math.floor(st.frame * 1.5) % 2
    const c = Canvas.mix(spec.shell, Robots.WHITE, 0.25)
    const o = Robots.outline(spec.shell)
    for (const side of [-1, 1]) {
      const down = tap && (side < 0 ? beat === 0 : beat === 1) ? 1 : 0
      const x = side < 0 ? -g.pw - 4 : g.pw + 2
      const y = g.podTop - 1 + down
      p.rect(x, y, 2, 1, c)
      p.dot(side < 0 ? x - 1 : x + 2, y, o)
      if (down && st.flash > 0.4) p.dot(x + (side < 0 ? 0 : 1), y + 1, Robots.SPARK)
    }
  }

  private static flame(p: Pix, st: Anim, g: Geo, drive: Drive): void {
    if (st.mood === 'killed') return
    const f = Math.floor(st.frame * 0.9 + st.seedIndex)
    const flick = f % 3
    if (st.mood === 'failed' && Canvas.hash(f, st.seed) < 0.4) return
    const calm = st.mood === 'idle' || st.mood === 'done'
    const outer: Rgb = calm ? [70, 140, 255] : [255, 146, 48]
    const tip: Rgb = calm ? [50, 80, 210] : [230, 64, 56]
    const core: Rgb = drive.tool && drive.thrust > 0 ? Canvas.mix(drive.tool, Robots.WHITE, 0.45) : calm ? [200, 238, 255] : [255, 240, 170]
    const len = (st.active ? 2 : 1) + (flick === 1 ? 1 : 0) + Math.round(drive.thrust * 2)
    const y0 = g.podTop + g.podRows
    const wob = flick === 2 ? 1 : flick === 0 ? -1 : 0
    const wide = drive.thrust > 0.5 ? 1 : 0
    for (let i = 0; i < len; i++) {
      const y = y0 + i
      if (i === len - 1 && len > 1) {
        p.dot(wob < 0 ? -1 : 0, y, tip)
        continue
      }
      if (i === 0) {
        p.rect(-2 - wide, y, 4 + 2 * wide, 1, outer)
        p.rect(-1, y, 2, 1, core)
        continue
      }
      p.rect(-1 - wide, y, 2 + 2 * wide, 1, i === 1 ? core : outer)
    }
    if (drive.thrust > 0) p.glow(0, y0 + len, 1.6 + drive.thrust * 1.5, core, 0.18 + drive.thrust * 0.22)
  }

  private static holo(p: Pix, st: Anim, spec: Spec, g: Geo, drive: Drive): void {
    const c = drive.tool ?? spec.accent
    const w = g.s >= 0.9 ? 8 : 6
    const h = g.s >= 0.9 ? 5 : 3
    const x0 = g.hw
    const y0 = g.podTop - h + 1
    const light = Canvas.mix(c, Robots.WHITE, 0.55)
    p.rect(x0, y0, w, h, c, 0.28)
    p.rect(x0 - 1, y0, 1, h, c, 0.7)
    const scroll = Math.floor(st.frame / 2.5)
    for (let r = 0; r < h; r += 2) {
      const len = 2 + Math.floor(Canvas.hash(r + scroll * 1.7, st.seed * 9.1) * (w - 3))
      p.rect(x0 + 1, y0 + r, len, 1, light)
    }
  }

  private static quirkFx(p: Pix, st: Anim, spec: Spec, g: Geo): void {
    const t = st.qt
    const e = st.qe
    switch (st.quirk) {
      case 'yawn': {
        const free = g.mouth - 1 >= g.eyeTop + g.eh
        const w = g.mw - 2
        p.rect(-w / 2, free ? g.mouth - 1 : g.mouth, w, free ? 2 : 1, spec.eye)
        p.rect(-w / 2 + 1, free ? g.mouth - 1 : g.mouth, w - 2, free ? 2 : 1, Robots.BLUSH)
        return
      }
      case 'sneeze': {
        if (t < 0.4) return
        const u = Motion.ease((t - 0.4) / 0.5)
        for (let i = 0; i < 3; i++) p.rect(g.hw + 1 + Math.round(u * 3) + i * 2, g.mouth - i, 2, 1, Robots.WHITE, 0.85 * e)
        return
      }
      case 'spark': {
        const x = g.hw - 3
        const y = g.top - 2
        p.glow(x, y, 2.4, Robots.SPARK, 0.5 * e)
        p.line(x, y - 2, x + 2, y, Robots.SPARK, e, 2)
        p.line(x + 2, y, x, y + 1, Robots.SPARK, e, 2)
        if (Math.sin(t * Math.PI * 9) > -0.3) p.dot(x + 4, y - 2, Robots.WHITE)
        return
      }
      case 'chest-puff':
        for (const side of [-1, 1]) Robots.twinkle(p, side * (g.hw + 3), g.top + 2, Robots.GOLD, e)
        return
    }
  }

  private static twinkle(p: Pix, x: number, y: number, c: Rgb, a: number): void {
    p.rect(x - 1, y, 3, 1, c, a)
    p.rect(x, y - 1, 1, 3, c, a)
    p.dot(x, y, Robots.WHITE, a)
  }

  private static check(p: Pix, x: number, y: number): void {
    const dark: Rgb = [12, 60, 40]
    p.rect(x - 1, y - 2, 6, 5, dark)
    p.dot(x + 3, y - 1, Robots.OK)
    p.dot(x, y, Robots.OK)
    p.dot(x + 2, y, Robots.OK)
    p.dot(x + 1, y + 1, Robots.OK)
  }

  private static crack(p: Pix, g: Geo): void {
    const n = g.sBot - g.sTop + 1
    for (let i = 0; i < n; i++) p.dot(g.sw - 3 - (i % 2), g.sTop + i, [255, 210, 220], 0.8)
  }

  private static sparks(p: Pix, st: Anim, g: Geo): void {
    const step = Math.floor(st.frame / 2)
    for (let i = 0; i < 3; i++) {
      const h = Canvas.hash(step + i * 7.3, st.seed * 13 + i)
      if (h > 0.62) continue
      const a = Canvas.hash(step * 1.7 + i, st.seed * 3.1) * Math.PI * 2
      const x = Math.round(Math.cos(a) * (g.hw + 2))
      const y = Math.round(g.top + g.hh / 2 + Math.sin(a) * (g.hh / 2 + 1))
      Robots.twinkle(p, x, y, Robots.SPARK, 1)
    }
  }

  private static antenna(p: Pix, st: Anim, g: Geo, x: number, len: number, led: Rgb): void {
    const top = g.top - len
    p.rect(x - 1, top, 2, len, Robots.STEM)
    const on = st.flash > 0.3 || st.mood === 'done' || (st.active ? (st.frame + st.seedIndex) % 8 < 4 : st.mood === 'idle' && Math.sin(st.frame * 0.12 + st.seed * 6) > 0.6)
    const rows = g.s >= 0.9 ? 2 : 1
    p.rect(x - 2, top - rows, 4, rows, on ? led : Canvas.mix(led, Robots.INK, 0.5))
    p.dot(x - 2, top - rows, Canvas.mix(led, Robots.WHITE, 0.6))
    if (on) p.glow(x, top - rows / 2, 1.8, led, 0.3 + st.flash * 0.4)
  }

  private static generalPurpose(p: Pix, st: Anim, spec: Spec, g: Geo, layer: number): void {
    if (layer === 1) Robots.antenna(p, st, g, 0, Robots.unit(g, 2), [255, 96, 110])
    if (layer !== 0) return
    const c = Canvas.mix(spec.accent, Robots.WHITE, 0.25)
    const o = Robots.outline(spec.shell)
    const y = g.eyeTop
    for (const side of [-1, 1]) {
      const x = side < 0 ? -g.hw - 2 : g.hw
      p.rect(x, y, 2, g.eh, o)
      p.rect(side < 0 ? x + 1 : x, y, 1, g.eh, c)
    }
  }

  private static architect(p: Pix, st: Anim, spec: Spec, g: Geo, layer: number): void {
    if (layer !== 1) return
    const hat: Rgb = [252, 200, 56]
    const light: Rgb = [255, 238, 150]
    const o = Robots.outline(hat)
    const y = g.top
    p.rect(-g.hw - 1, y, 2 * g.hw + 2, 1, o)
    p.rect(-g.hw, y, 2 * g.hw, 1, hat)
    const dome = g.s >= 0.9 ? 3 : 2
    for (let i = 0; i < dome; i++) {
      const w = g.hw - 2 - i - (i === dome - 1 && dome > 2 ? 1 : 0)
      const yy = y - 1 - i
      p.rect(-w - 1, yy, 2 * w + 2, 1, o)
      if (i < dome - 1) p.rect(-w, yy, 2 * w, 1, i === dome - 2 ? light : hat)
    }
    p.rect(-1, y - dome, 2, dome, Canvas.mix(hat, Robots.WHITE, 0.55))
    if (st.active && Math.floor(st.frame / 6) % 2 === 0) p.dot(-g.hw + 1, y, Robots.WHITE)
  }

  private static debuggerBot(p: Pix, st: Anim, spec: Spec, g: Geo, layer: number): void {
    if (layer !== 2) return
    const gold: Rgb = [255, 214, 90]
    const x = g.gap / 2 + Robots.look(st, g)
    const fx = x - 2
    const fy = g.eyeTop - 1
    const fw = g.ew + 4
    const fh = g.eh + 2
    p.frame(fx, fy, fw, fh, gold)
    p.dot(fx + 1, fy + 1, Robots.WHITE, 0.5)
    const by = fy + fh
    p.dot(fx + fw - 1, by, gold, 0.9)
    p.dot(fx + fw, by + 1, gold, 0.75)
    p.dot(fx + fw + 1, by + 2, gold, 0.6)
    if (st.active && st.flash > 0) p.glow(fx + fw / 2, fy + fh / 2, 2, gold, 0.25)
  }

  private static plan(p: Pix, st: Anim, spec: Spec, g: Geo, layer: number): void {
    if (layer !== 1) return
    const flag: Rgb = [255, 222, 90]
    const x = g.hw - 4
    const len = Robots.unit(g, 3) + 1
    const top = g.top - len
    p.rect(x, top, 1, len, Robots.STEM)
    p.dot(x, top - 1, Robots.WHITE)
    const w = Math.max(5, Math.round(7 * g.s))
    const rows = g.s >= 0.9 ? 3 : 2
    const live = st.mood === 'working' || st.mood === 'idle'
    for (let i = 0; i < w; i++) {
      const dy = live ? Math.round(Math.sin(st.frame * 0.4 - i * 0.9) * 0.55) : i > w / 2 ? 1 : 0
      const r = i === w - 1 ? rows - 1 : rows
      p.rect(x + 1 + i, top + dy + (i === w - 1 ? 1 : 0) * (rows > 2 ? 1 : 0), 1, Math.max(1, r), i % 3 === 0 ? Canvas.mix(flag, Robots.WHITE, 0.4) : flag)
    }
  }

  private static explore(p: Pix, st: Anim, spec: Spec, g: Geo, layer: number): void {
    if (layer !== 2) return
    const metal: Rgb = [214, 232, 222]
    const o = Robots.outline(spec.shell)
    const lens = Canvas.mix(spec.accent, Robots.WHITE, 0.5)
    const lx = Robots.look(st, g)
    const top = g.top - 2
    for (const x of [-g.gap / 2 - g.ew + lx, g.gap / 2 + lx]) {
      p.rect(x - 1, top, g.ew + 2, g.eyeTop + g.eh + 1 - top, o)
      p.rect(x, top + 1, g.ew, g.eyeTop - top - 1, metal)
      p.rect(x, top + 1, g.ew, 1, lens)
      p.rect(x, g.eyeTop, g.ew, g.eh, [20, 44, 36])
      Robots.eye(p, st, spec.eye, x, g.eyeTop, g.ew, g.eh)
    }
    p.rect(-g.gap / 2 + lx, g.eyeTop, g.gap, 1, o)
  }

  private static dotnet(p: Pix, st: Anim, spec: Spec, g: Geo, layer: number): void {
    if (layer !== 1) return
    const c = Canvas.mix(spec.accent, Robots.WHITE, 0.45)
    const y = g.top + Math.floor(g.hh / 2)
    const w = g.widths[y - g.top] ?? g.hw
    const on = !st.active || Math.floor((st.frame + st.seedIndex) / 5) % 2 === 0
    p.rect(-w + 1, y - 1, 1, 2, on ? c : spec.shell)
    p.rect(w - 2, y - 1, 1, 2, on ? spec.shell : c)
    p.rect(-1, g.top + 1, 2, 1, c)
  }

  private static angular(p: Pix, st: Anim, spec: Spec, g: Geo, layer: number): void {
    if (layer !== 1) return
    const dark = Canvas.mix(spec.shell, Robots.INK, 0.3)
    const n = g.widths.length
    g.widths.forEach((w, r) => {
      if (r === 0 || r === n - 1) return
      const inner = Math.min(w, g.widths[r - 1] ?? 0, g.widths[r + 1] ?? 0) - 1
      if (inner > 0) p.rect(0, g.top + r, inner, 1, r === 1 ? Canvas.mix(spec.shell, Robots.WHITE, 0.3) : dark)
    })
    p.rect(-1, g.top - 1, 2, 1, Robots.outline(spec.shell))
    p.rect(-1, g.sBot + 2, 2, Math.max(1, g.hh - (g.sBot + 2 - g.top) - 1), Canvas.mix(spec.shell, Robots.WHITE, 0.6))
  }

  private static mssql(p: Pix, st: Anim, spec: Spec, g: Geo, layer: number): void {
    if (layer !== 1) return
    const cap = Canvas.mix(spec.shell, Robots.WHITE, 0.55)
    const o = Robots.outline(spec.shell)
    const w = g.hw - 1
    p.rect(-w + 1, g.top + 1, 2 * w - 2, 1, cap)
    p.rect(-w + 2, g.top + 2, 2 * w - 4, 1, o)
    p.rect(-w, g.top + 2, 2, 1, spec.shell)
    p.rect(w - 2, g.top + 2, 2, 1, spec.shell)
    const lit = st.active ? Math.floor((st.frame + st.seedIndex) / 3) % 3 : -1
    for (let i = 0; i < 3; i++) p.dot(-2 + i * 2, g.top + 1, i === lit ? spec.accent : Canvas.mix(spec.accent, cap, 0.5))
    const band = g.sBot + 1
    if (band < g.top + g.hh - 1) p.rect(-g.hw + 1, band, 2 * g.hw - 2, 1, spec.accent)
  }

  private static testBot(p: Pix, st: Anim, spec: Spec, g: Geo, layer: number): void {
    if (layer !== 1) return
    const glass: Rgb = [214, 240, 255]
    const o = Robots.outline(glass)
    const liquid = Canvas.mix(spec.accent, Robots.WHITE, st.flash * 0.4)
    const y = g.top
    const big = g.s >= 0.9
    p.rect(-4, y - 1, 8, 1, o)
    p.rect(-3, y - 1, 6, 1, liquid)
    p.rect(-3, y - 2, 6, 1, o)
    p.rect(-2, y - 2, 4, 1, big ? liquid : glass)
    let top = y - 3
    if (big) {
      p.rect(-2, y - 3, 4, 1, o)
      p.rect(-1, y - 3, 2, 1, glass)
      top = y - 4
    }
    p.rect(-2, top, 4, 1, o)
    p.rect(-1, top, 2, 1, glass)
    p.rect(-2, top - 1, 4, 1, o)
    if (!st.active && st.mood !== 'idle') return
    const b = Math.floor(st.frame / 3) % 3
    p.dot(-2 + b * 2, y - 1, Robots.WHITE, 0.8)
    if (b === 0) p.dot(-1, top - 2, Robots.WHITE, 0.85)
  }

  private static e2e(p: Pix, st: Anim, spec: Spec, g: Geo, layer: number): void {
    if (layer === 1) {
      const o = Robots.outline(spec.shell)
      p.rect(-g.hw + 2, g.top - 1, 4, 1, o)
      p.rect(-g.hw + 3, g.top - 1, 2, 1, [90, 96, 110])
      const rec = st.mood === 'working' ? Math.floor(st.frame / 5) % 2 === 0 : st.mood === 'idle'
      p.rect(g.hw - 4, g.top + 1, 2, 1, rec ? [255, 60, 70] : [110, 40, 50])
      return
    }
    if (layer !== 2) return
    const w = g.ew + 4
    const cy = g.eyeTop + g.eh / 2
    const ry = g.eh / 2 + 1
    p.oval(0, cy, w / 2 + 2, ry + 1, [24, 26, 36])
    p.oval(0, cy, w / 2 + 1, ry + 0.5, [70, 76, 96])
    p.oval(0, cy, w / 2, ry, [18, 14, 30])
    const lx = Math.max(-1, Math.min(1, Robots.look(st, g)))
    Robots.eye(p, st, spec.eye, -g.ew / 2 + lx, g.eyeTop, g.ew, g.eh)
  }

  private static uxUi(p: Pix, st: Anim, spec: Spec, g: Geo, layer: number): void {
    if (layer === 0) {
      const wood: Rgb = [176, 120, 70]
      const x0 = g.hw - 1
      const y0 = g.top + g.hh - 3
      const x1 = g.hw + 4
      const y1 = g.top - Robots.unit(g, 2)
      p.line(x0, y0, x1, y1, wood, 1, 2)
      const paint = Robots.PAINTS[(st.active ? Math.floor(st.frame / 10) : 0) % Robots.PAINTS.length] ?? Robots.GOLD
      p.rect(x1 - 1, y1 - 2, 4, 2, paint)
      p.dot(x1 + 2, y1 - 2, Canvas.mix(paint, Robots.WHITE, 0.5))
      return
    }
    if (layer !== 1) return
    const beret: Rgb = [96, 44, 128]
    const light = Canvas.mix(beret, Robots.WHITE, 0.3)
    const o = Robots.outline(beret)
    const y = g.top
    p.rect(-g.hw - 1, y, 2 * g.hw - 2, 1, o)
    p.rect(-g.hw, y - 1, 2 * g.hw - 1, 1, o)
    p.rect(-g.hw + 1, y - 1, 2 * g.hw - 3, 1, beret)
    p.rect(-g.hw + 2, y - 2, g.hw + 1, 1, o)
    p.rect(-g.hw + 3, y - 2, g.hw - 1, 1, light)
    p.rect(-2, y - 3, 2, 1, o)
  }

  private static docker(p: Pix, st: Anim, spec: Spec, g: Geo, layer: number): void {
    if (layer !== 1) return
    const box: Rgb = [206, 238, 255]
    const o = Robots.outline(spec.shell)
    const h = g.s >= 0.9 ? 2 : 1
    const lit = st.active ? Math.floor((st.frame + st.seedIndex) / 4) % 5 : -1
    const level = (y: number, n: number, k: number): void => {
      const x0 = -n * 2 - Math.floor(n / 2)
      p.rect(x0 - 1, y, n * 5 + 1, h, o)
      p.rect(x0 - 1, y - 1, n * 5 + 1, 1, o)
      for (let i = 0; i < n; i++) {
        const x = x0 + i * 5
        p.rect(x, y, 4, h, k + i === lit ? Robots.WHITE : box)
        p.dot(x + 3, y + h - 1, Canvas.mix(box, spec.shell, 0.6))
      }
    }
    level(g.top - h, 3, 0)
    level(g.top - 2 * h - 1, 2, 3)
  }

  private static proxy(p: Pix, st: Anim, spec: Spec, g: Geo, layer: number): void {
    if (layer !== 1) return
    const dish: Rgb = [232, 238, 250]
    const inner: Rgb = [136, 150, 182]
    const o = Robots.outline(dish)
    const big = g.s >= 0.9
    const rx = big ? 7 : 5
    const cx = 1
    const cy = g.top - (big ? 2 : 1.5)
    p.rect(-1, g.top - 1, 2, 1, Robots.STEM)
    p.oval(cx, cy, rx + 1, big ? 2.5 : 2, o)
    p.oval(cx, cy, rx, big ? 2 : 1.5, dish)
    p.oval(cx + 1, cy - 0.5, rx - 2, 1, inner)
    p.line(cx + 1, cy, cx + 4, cy - 2, Robots.STEM)
    const on = st.flash > 0.3 || (st.active && Math.floor(st.frame / 4) % 2 === 0)
    p.rect(cx + 4, cy - 3, 2, 1, on ? spec.accent : Canvas.mix(spec.accent, Robots.INK, 0.5))
    if (!st.active) return
    const k = Math.floor(st.frame / 4) % 3
    if (k > 0) p.rect(cx + 5 + k * 2, cy - 3 - k, 1, 2, spec.accent, 0.8)
  }

  private static lint(p: Pix, st: Anim, spec: Spec, g: Geo, layer: number): void {
    if (layer !== 2) return
    const straw: Rgb = [240, 200, 96]
    const dark: Rgb = [176, 120, 44]
    const w = g.sw + 1
    const y = g.mouth
    p.rect(-w, y, 2 * w, 1, straw)
    p.dot(-1, y, dark)
    p.dot(0, y, dark)
    const shift = st.active ? Math.floor(st.frame / 2) % 2 : 0
    for (let i = -w + 1; i < w - 1; i++) if ((i + shift) % 2 === 0) p.dot(i, y + 1, i % 4 === 0 ? dark : straw)
    p.dot(-w - 1, y - 1, straw)
    p.dot(w, y - 1, straw)
  }

  private static codeReviewer(p: Pix, st: Anim, spec: Spec, g: Geo, layer: number): void {
    if (layer !== 2) return
    const ink: Rgb = [12, 14, 24]
    const glint: Rgb = [250, 252, 255]
    const lx = Robots.look(st, g)
    const y = g.eyeTop - 1
    const big = g.s >= 0.9
    p.rect(-g.hw - 1, y, 2 * g.hw + 2, big ? 2 : 1, ink)
    for (const x of [-g.gap / 2 - g.ew + lx, g.gap / 2 + lx]) {
      p.rect(x - 1, y, g.ew + 2, 1, ink)
      p.rect(x - 1, g.eyeTop, 1, g.eh + 1, ink)
      p.rect(x + g.ew, g.eyeTop, 1, g.eh + 1, ink)
      p.rect(x - 1, g.eyeTop + g.eh, g.ew + 2, 1, ink)
      p.rect(x, y, g.ew, 1, glint, 0.9)
    }
  }

  private static security(p: Pix, st: Anim, spec: Spec, g: Geo, layer: number): void {
    if (layer !== 1) return
    const plume: Rgb = [255, 72, 88]
    const o = Robots.outline(plume)
    const y = g.top
    const big = g.s >= 0.9
    p.rect(-2, y - 1, 4, 1, o)
    p.rect(-1, y - 1, 3, 1, plume)
    p.rect(-1, y - 2, 4, 1, o)
    p.rect(0, y - 2, 3, 1, Canvas.mix(plume, Robots.WHITE, 0.3))
    if (big) {
      p.rect(1, y - 3, 4, 1, o)
      p.rect(2, y - 3, 2, 1, plume)
    }
    p.rect(-g.hw + 1, g.eyeTop + g.eh, 2 * g.hw - 2, 1, Robots.outline(spec.shell))
  }

  private static docWriter(p: Pix, st: Anim, spec: Spec, g: Geo, layer: number): void {
    if (layer !== 0) return
    const feather: Rgb = [248, 250, 255]
    const vane: Rgb = [170, 186, 220]
    const nib: Rgb = [40, 44, 70]
    const wag = st.active ? (Math.floor(st.frame / 3) % 2) : 0
    const x0 = g.hw - 3
    const y0 = g.top + 2
    const x1 = g.hw + 4 + wag
    const y1 = g.top - Robots.unit(g, 3) - 1
    p.line(x0, y0, x1, y1, vane, 1, 3)
    p.line(x0, y0, x1, y1, feather, 1, 2)
    p.dot(x1 + 1, y1 - 1, feather)
    p.dot(x0 - 1, y0 + 1, nib)
  }

  private static gitWriter(p: Pix, st: Anim, spec: Spec, g: Geo, layer: number): void {
    if (layer !== 1) return
    const line: Rgb = [236, 236, 246]
    const len = Robots.unit(g, 3) + 1
    const top = g.top - len
    p.rect(-1, top, 2, len, line)
    p.line(0, g.top - 2, 4, top + 1, line, 1, 2)
    const lit = st.active ? Math.floor((st.frame + st.seedIndex) / 4) % 3 : st.mood === 'done' ? 0 : -1
    const nodes: readonly (readonly [number, number])[] = [
      [-2, top - 1],
      [3, top],
      [-2, g.top - 2],
    ]
    nodes.forEach((q, i) => {
      const on = i === lit || st.flash > 0.4
      const nh = g.s >= 0.9 ? 2 : 1
      p.rect(q[0] - 1, q[1], 6, nh, Robots.outline(spec.accent))
      p.rect(q[0], q[1], 4, nh, on ? Canvas.mix(spec.accent, Robots.WHITE, 0.6) : spec.accent)
    })
  }

  private static fork(p: Pix, st: Anim, spec: Spec, model: string, scale: number, drive: Drive): void {
    const k = scale * 0.72
    const g = Robots.geo(k, spec.shape, 0, true)
    const twin: Spec = { ...spec, shell: [236, 178, 250], accent: [236, 178, 250], eye: [255, 206, 120] }
    const plain = (pp: Pix, s: Anim, sp: Spec, gg: Geo, layer: number): void => Robots.generalPurpose(pp, s, sp, gg, layer)
    const second: Anim = { ...st, look: -st.look, blink: st.active && (st.frame + st.seedIndex + 9) % 40 < 2, frame: st.frame + 5, flash: 0 }
    const off = Math.round(g.hw * 0.7)
    Robots.robot(p.shift(off, -1), second, twin, plain, model, k, drive, false)
    Robots.robot(p.shift(-off, 1), st, spec, plain, model, k, drive, false)
    if (st.mood === 'done') Robots.check(p.plain(), off + g.hw + 1, g.podTop - 2)
    if (st.mood === 'failed') Robots.sparks(p.plain(), st, g)
  }
}
