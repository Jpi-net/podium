import type { FlowAgent, FlowEvent, FlowMain, FlowStatus } from '../types'
import { Canvas, type Encoded, type Point, type RenderMode, type Rgb } from './canvas'
import { Colleagues } from './colleagues'
import { Office, type Room } from './office'
import { Effects, type Ambience, type ExitStatus, type Obstacle, type Sky } from './effects'
import { WeatherFx } from './weather'
import { Robots, type OrchestratorReaction, type OrchestratorState, type RobotMood } from './robots'
import { Theme } from './theme'
import { Wiring, type Plug, type Side, type Wire, type WireLook } from './wiring'

export type ToolKind = 'read' | 'edit' | 'shell' | 'search' | 'agent' | 'web' | 'other'

export type SceneInput = {
  agents: FlowAgent[]
  events: FlowEvent[]
  main: FlowMain
  at: number
  isLive: boolean
  frame: number
  dt: number
  pulses: ReadonlyMap<string, number>
  columns: number
  rows: number
  mode: RenderMode
  ambience: Ambience
  positions: Map<string, Point>
}

export type LaneInput = SceneInput & { from: number; to: number }

export type GraphLabel = { agentId: string; column: number; row: number; text: string; color: Rgb; isPrimary: boolean; isMain: boolean }

export type GraphResult = { encoded: Encoded; labels: GraphLabel[]; obstacles?: Obstacle[]; wires?: Wire[] }

export type VerifPulse = { t: number; color: Rgb }

export type ToolHit = { event: FlowEvent; age: number }

type LabelAlign = 'center' | 'start' | 'end'

type Seat = { point: Point; isBack: boolean; align: LabelAlign; anchor: number; room: number }

type Seats = { seats: Seat[]; scale: number; pitch: number }

type Fit = { scale: number; pitch: number; perLeft: number; perRight: number; gap: number; margin: number }

type Placed = {
  agent: FlowAgent
  status: FlowStatus
  slot: Point
  x: number
  y: number
  scale: number
  baseScale: number
  index: number
  exit: number
  isAbove: boolean
  seed: number
  tilt: number
  thrust: number
  squash: number
  labelMax: number
  labelAlign: LabelAlign
  labelAnchor: number
}

type Cabled = { items: Cabling[]; ports: number }

type Cabling = { p: Placed; look: WireLook; wire: Wire }

type Flight = { point: Point; velocity: Point; scale: number; progress: number }

export class Scene {
  static readonly EXIT_MS = 3600
  private static readonly SEAT_MIN = 0.6
  private static readonly SEAT_MAX = 1
  private static readonly SEAT_GAP = 1
  private static readonly SCALE_STEP = 0.025
  private static readonly NARROW_MIN = 0.4
  private static readonly NARROW_GAP = 0.5
  private static readonly EDGE_MARGIN = 2
  static readonly TOOL_COLORS: Record<ToolKind, Rgb> = {
    read: [120, 170, 255],
    edit: [105, 240, 174],
    shell: [255, 186, 92],
    search: [181, 140, 255],
    agent: [0, 212, 190],
    web: [255, 120, 200],
    other: [150, 160, 180],
  }
  static readonly TOOL_LABELS: Record<ToolKind, string> = {
    read: 'Read',
    edit: 'Edit',
    shell: 'Shell',
    search: 'Search',
    agent: 'Agent',
    web: 'Web',
    other: 'Other',
  }

  private static readonly FINALE_MS = 1300
  private static readonly FLIGHT_MS = 650
  private static readonly LAND_MS = 480
  private static readonly FLASH_MS = 650
  private static readonly SPARK_MS = 700
  private static readonly WIRES = new Map<string, { key: string; wire: Wire }>()
  private static wiresSize = ''
  private static readonly SEATING = new Map<string, number>()
  private static seatingKey = ''
  private static readonly IDLE_MS = 15_000
  private static readonly ACTIVITY_MS = 10_000
  private static readonly SHADOW: Rgb = [4, 8, 20]
  private static readonly MAX_SHOWN = 10
  static readonly SLEEP_AFTER_MS = 60_000
  private static readonly FOLLOW_MS = 180
  private static readonly MAX_DT_MS = 1000
  private static readonly AVATAR_NAME = 'main'
  private static readonly AVATAR_WIDTH = Robots.AVATAR_COLUMNS / Robots.ORCHESTRATOR_SCALE
  private static readonly AVATAR_HEIGHT = Robots.AVATAR_ROWS / Robots.ORCHESTRATOR_SCALE
  private static readonly HAT_RATIO = 0.42
  private static readonly LANES_SKY: Sky = { top: Theme.BG_TOP, bottom: Theme.BG_BOTTOM, halo: Canvas.scale(Theme.ACCENT, 0.28), stars: 1 }
  private static readonly HINT_MAX = 12
  private static readonly LABEL_MAX = 24
  private static readonly SKIPPED_WORDS = new Set(['le', 'la', 'les', 'de', 'du', 'des', 'the', 'a', 'un', 'une', 'l', 'd', 'of', 'to', 'and', 'et'])
  private static readonly SUPERSCRIPTS = ['', '', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹']
  static readonly BUBBLE_MS = 1200
  static readonly GAZE_MS = 4000
  static readonly VERIF_PULSE_MS = 1500
  private static readonly MAX_BUBBLES = 3
  private static readonly BUBBLE_POP = 0.18
  private static readonly BUBBLE_FADE = 0.55
  private static readonly SCAN_SLACK_MS = 2000
  private static readonly BUBBLE_INK: Rgb = [14, 18, 34]

  static graphRows(columns: number, viewportRows: number): number {
    const wanted = Math.max(Math.round(viewportRows * 0.52), Math.round(columns * 0.34))
    return Math.max(22, Math.min(46, wanted))
  }

  static laneRows(count: number): number {
    return Math.max(6, Math.min(22, count + 3))
  }

  static statusAt(agent: FlowAgent, at: number): FlowStatus {
    if (agent.endedAt > 0 && agent.endedAt <= at) return agent.status === 'running' ? 'completed' : agent.status
    return 'running'
  }

  static visibleAt(agents: FlowAgent[], at: number): FlowAgent[] {
    return agents.filter(a => a.startedAt <= at)
  }

  static reaction(agents: FlowAgent[], at: number): OrchestratorReaction | undefined {
    let best: { agent: FlowAgent; kind: number; eventAt: number } | undefined
    for (const agent of agents) {
      const events = [{ kind: 1, eventAt: agent.startedAt }]
      if (agent.endedAt > 0) events.push({ kind: 2, eventAt: agent.endedAt })
      for (const e of events) {
        const age = at - e.eventAt
        if (age < 0 || age >= Robots.REACTION_MS) continue
        if (!best || e.eventAt >= best.eventAt) best = { agent, kind: e.kind, eventAt: e.eventAt }
      }
    }
    if (!best) return undefined
    const pool = best.kind === 1 ? Robots.SPAWN_REACTIONS : Robots.EXIT_REACTIONS
    const index = Math.min(pool.length - 1, Math.floor(Canvas.hash(Scene.stableHash(best.agent.id), best.kind) * pool.length))
    const kind = pool[index]
    if (kind === undefined) return undefined
    return { kind, t: (at - best.eventAt) / Robots.REACTION_MS }
  }

  static hasReaction(agents: FlowAgent[], at: number): boolean {
    return Scene.reaction(agents, at) !== undefined
  }

  private static stableHash(id: string): number {
    let h = 7
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 9973
    return h + 1
  }

  static isOnStage(agent: FlowAgent, at: number): boolean {
    if (agent.startedAt > at) return false
    if (Scene.statusAt(agent, at) === 'running') return true
    return at - agent.endedAt < Scene.EXIT_MS
  }

  static toolKind(label: string): ToolKind {
    if (/^\$/.test(label)) return 'shell'
    if (/^Read\b/.test(label)) return 'read'
    if (/^(Edit|Write|MultiEdit|NotebookEdit)\b/.test(label)) return 'edit'
    if (/^(Grep|Glob|LSP)\b/.test(label)) return 'search'
    if (/^Agent\b/.test(label)) return 'agent'
    if (/^Web(Search|Fetch)\b/.test(label)) return 'web'
    return 'other'
  }

  static toolAt(agent: FlowAgent, events: FlowEvent[], at: number, isLive: boolean): string {
    if (isLive) return agent.tool
    let label = ''
    for (const e of events) {
      if (e.at > at) break
      if (e.agentId === agent.id && e.kind === 'tool') label = e.label
    }
    return label
  }

  static orchestratorState(isWorking: boolean, idleMs: number): OrchestratorState {
    if (isWorking) return 'working'
    return idleMs >= Scene.SLEEP_AFTER_MS ? 'asleep' : 'idle'
  }

  static follow(previous: Point, target: Point, dt: number): Point {
    const k = 1 - Math.exp(-Math.max(0, Math.min(Scene.MAX_DT_MS, dt)) / Scene.FOLLOW_MS)
    return { x: previous.x + (target.x - previous.x) * k, y: previous.y + (target.y - previous.y) * k }
  }

  static graph(input: SceneInput): GraphResult {
    const canvas = new Canvas(input.columns, input.rows, input.mode)
    const center: Point = { x: canvas.width / 2, y: canvas.height / 2 - 1 }
    Scene.backdrop(canvas, center, Effects.sky(input.ambience, input.frame), input.frame)
    const bust = Scene.orchestratorHalf(canvas)
    const room = Office.room(canvas, center.x, center.y + bust.y, bust.x)

    const placed = Scene.layout(canvas, center, room, input)
    const running = placed.some(p => p.status === 'running')
    const isWorking = (input.isLive && input.main.isBusy) || running
    const state = Scene.orchestratorState(isWorking, input.ambience.idleMs)
    const orchestratorScale = Scene.orchestratorScale(canvas)
    const ordinals = Scene.ordinals(placed)
    const labels = Scene.labels(canvas, center, orchestratorScale, placed, state, input, ordinals)
    const obstacles = Scene.obstacles(canvas, center, orchestratorScale, placed, labels, input)
    const pane = Office.pane(canvas, room)
    const weather = WeatherFx.weather(input.events, input.at)
    const orchestratorTop = Robots.orchestratorTop(center.y, orchestratorScale)
    canvas.clip(pane)
    Effects.outdoor(canvas, input.frame, input.at, input.ambience, obstacles, pane)
    WeatherFx.glass(canvas, pane, input.frame, weather)
    if (weather.clearing >= 0) WeatherFx.rainbow(canvas, center.x, orchestratorTop - 4, weather.clearing, pane)
    canvas.clip()
    const light = Effects.light(input.ambience.timeOfDay)
    const taken = placed.filter(p => !p.isAbove && p.exit < 1).map((p): [number, number] => [p.slot.x - (Colleagues.WIDTH * p.baseScale) / 2, p.slot.x + (Colleagues.WIDTH * p.baseScale) / 2])
    Office.back(canvas, room, light, input.frame, taken)
    Effects.sill(canvas, input.frame, input.ambience, pane, room)
    Effects.indoor(canvas, input.frame, input.at, input.ambience, room, pane)

    const hub = Office.port(room, 0, 1)
    for (const p of placed) Scene.shadow(canvas, hub, p)
    const active = new Map<string, Point>()
    for (const p of placed) if (p.exit === 0) active.set(p.agent.id, { x: p.x, y: p.y })
    const gaze = Scene.gaze(input.events, input.at, active)
    Effects.confetti(canvas, input.frame, input.at, input.ambience)
    const top = orchestratorTop
    const half = Scene.orchestratorHalf(canvas)
    Robots.drawOrchestrator(canvas, center.x, center.y, orchestratorScale, input.frame, state, Scene.reaction(input.agents, input.at), gaze, Effects.hatHeight(input.ambience, 10) > 0)
    const hatWidth = Scene.orchestratorHatWidth(orchestratorScale)
    Effects.hat(canvas, center.x, top, hatWidth, input.ambience, input.frame, 0.5)
    const pulse = Scene.verifPulse(input.events, input.at)
    if (pulse) Scene.shockwave(canvas, center, half, pulse)
    Office.desk(canvas, room, light, light < 0.7, input.frame)
    if (state === 'asleep') {
      const half = (Scene.AVATAR_WIDTH * Robots.ORCHESTRATOR_SCALE * orchestratorScale) / 2
      Effects.sleeping(canvas, center.x + half * 0.45, top + 1, input.frame)
    }

    const cabled = Scene.cables(canvas, room, placed, input, light)
    Office.hub(canvas, room, light, cabled.ports, input.frame)
    const cables = cabled.items
    for (const isBack of [true, false]) {
      const group = cables.filter(c => c.p.isAbove === isBack)
      for (const c of group) {
        Wiring.draw(canvas, c.wire, c.look, 'head')
        Wiring.draw(canvas, c.wire, c.look, 'hang')
      }
      for (const p of placed) if (p.isAbove === isBack) Scene.robot(canvas, hub, p, input, ordinals.get(p.agent.id) ?? 0)
      for (const c of group) {
        Wiring.draw(canvas, c.wire, c.look, 'tail')
      }
    }
    const crown = top - Effects.hatHeight(input.ambience, hatWidth / 0.7)
    Scene.bubbles(canvas, center, placed, crown, orchestratorScale, input)
    const hidden = Math.max(0, Scene.visibleAt(input.agents, input.at).filter(a => Scene.isOnStage(a, input.at)).length - placed.length)
    const overflow = hidden > 0 ? Scene.overflow(canvas, center, orchestratorScale, hidden, input) : undefined

    if (!input.isLive) {
      const tag = ` ⏵ REPLAY ${Theme.clock(input.at)} `
      canvas.text(Math.max(0, input.columns - tag.length - 1), 0, tag, Theme.BG_TOP, Theme.WARN)
    }
    const visibleCount = Scene.visibleAt(input.agents, input.at).filter(a => Scene.isOnStage(a, input.at)).length
    if (visibleCount === 0) {
      const row = Math.min(input.rows - 2, Math.floor((center.y + (Scene.AVATAR_HEIGHT * Robots.ORCHESTRATOR_SCALE * orchestratorScale) / 2) / 2) + 2)
      Scene.centered(canvas, center.x, row, 'Waiting for agents…', Theme.MUTED)
    }
    if (overflow) labels.push(overflow)
    return { encoded: canvas.encode(), labels, obstacles, wires: cables.map(c => c.wire) }
  }

  static lanes(input: LaneInput): Encoded {
    const canvas = new Canvas(input.columns, input.rows, input.mode)
    canvas.paint((x, y) => Scene.sky(canvas, x, y, Scene.LANES_SKY, input.frame, false))
    const gutter = Math.max(10, Math.min(19, Math.round(input.columns * 0.3)))
    const left = gutter + 1
    const right = input.columns - 2
    const span = Math.max(30_000, input.to - input.from)
    const xOf = (t: number): number => left + ((Math.min(Math.max(t, input.from), input.to) - input.from) / span) * (right - left)
    const laneCount = input.rows - 2
    const agents = input.agents
      .filter(a => a.startedAt <= input.at)
      .sort((a, b) => a.startedAt - b.startedAt)
      .slice(-(laneCount - 1))

    Scene.grid(canvas, input.from, span, left, right, xOf)
    for (let lane = 0; lane < laneCount; lane++) {
      if (lane % 2 === 1) canvas.fillRect(0, lane * 2, input.columns, 2, Theme.WHITE, 0.03)
    }

    const byAgent = new Map<string, FlowEvent[]>()
    for (const e of input.events) {
      if (e.kind !== 'tool' || e.at > input.at) continue
      const list = byAgent.get(e.agentId)
      if (list) list.push(e)
      else byAgent.set(e.agentId, [e])
    }

    Scene.toolSegments(canvas, byAgent.get('') ?? [], 0.5, input.main.isBusy ? input.at : 0, xOf)
    canvas.text(0, 0, Theme.pad(` ${input.main.isBusy ? Theme.spinner(input.frame) : '◆'} main`, gutter), Theme.ORCH)

    agents.forEach((agent, i) => {
      const row = i + 1
      const top = row * 2 + 0.3
      const status = Scene.statusAt(agent, input.at)
      const color = Robots.accent(agent.type)
      const start = xOf(agent.startedAt)
      const endAt = status === 'running' ? input.at : agent.endedAt
      const end = Math.max(start + 0.6, xOf(endAt))
      canvas.fillRoundRect(start, top, end - start, 1.4, 0.6, Canvas.scale(color, 0.4), status === 'running' ? 0.9 : 0.6)
      Scene.toolSegments(canvas, byAgent.get(agent.id) ?? [], top, endAt, xOf)
      if (status === 'running') {
        canvas.glow(end, top + 0.7, 1.8, color, 0.7)
        canvas.fillCircle(end, top + 0.7, 0.45, Theme.WHITE)
      } else {
        const cap = status === 'completed' ? Theme.OK : status === 'failed' ? Theme.KO : Theme.MUTED
        canvas.fillCircle(end, top + 0.7, 0.7, cap)
      }
      for (const e of input.events) {
        if (e.agentId !== agent.id || e.at > input.at || !(e.isError || e.kind === 'alert')) continue
        canvas.fillCircle(xOf(e.at), top + 0.7, 0.5, Theme.KO)
      }
      const glyph = Theme.statusGlyph(status, input.frame + i)
      canvas.text(0, row, Theme.pad(` ${glyph} ${agent.type}`, gutter), Theme.statusColor(status, color))
      if (status !== 'running') {
        const after = Math.ceil(end) + 1
        if (after < input.columns - 6) canvas.text(after, row, Theme.duration(agent.endedAt - agent.startedAt), Theme.MUTED)
      }
    })

    if (!input.isLive) canvas.fillRect(xOf(input.at) - 0.15, 0, 0.3, canvas.height - 2, Theme.WARN, 0.85)
    Scene.axis(canvas, input.rows - 1, input.from, span, left, right, input.isLive, xOf)
    return canvas.encode()
  }

  private static toolSegments(canvas: Canvas, events: FlowEvent[], top: number, endAt: number, xOf: (t: number) => number): void {
    events.forEach((e, i) => {
      const next = events[i + 1]
      const stop = next ? next.at : endAt > 0 ? endAt : e.at + 1500
      const x0 = xOf(e.at)
      const x1 = Math.max(x0 + 0.35, xOf(stop))
      const color = Scene.TOOL_COLORS[Scene.toolKind(e.label)]
      canvas.fillRect(x0, top + 0.2, x1 - x0, 1, color, e.isError ? 0.4 : 0.85)
      if (x1 - x0 > 1.2) canvas.fillRect(x0, top + 0.2, 0.18, 1, Theme.WHITE, 0.35)
    })
  }

  private static mood(status: FlowStatus): RobotMood {
    switch (status) {
      case 'running':
        return 'working'
      case 'completed':
        return 'done'
      case 'failed':
        return 'failed'
      default:
        return 'killed'
    }
  }

  private static exitStatus(status: FlowStatus): ExitStatus {
    if (status === 'completed') return 'done'
    if (status === 'failed') return 'failed'
    return 'killed'
  }

  private static sky(canvas: Canvas, x: number, y: number, sky: Sky, frame: number, withHalo: boolean): Rgb {
    const t = y / Math.max(1, canvas.height - 1)
    let c = Canvas.mix(sky.top, sky.bottom, t)
    if (withHalo) {
      const dx = (x - canvas.width / 2) / (canvas.width / 2)
      const dy = (y - canvas.height / 2) / (canvas.height / 2)
      const d = Math.sqrt(dx * dx + dy * dy)
      c = Canvas.mix(c, sky.halo, Math.max(0, 0.55 - d) * 0.55)
      c = Canvas.scale(c, 1 - Math.max(0, d - 0.85) * 0.35)
    }
    if (sky.stars <= 0.01) return c
    const h = Canvas.hash(Math.floor(x * 2), Math.floor(y))
    if (h > 0.988) {
      const twinkle = 0.5 + 0.5 * Math.sin(frame * 0.07 + h * 90)
      c = Canvas.mix(c, Theme.TEXT, (0.1 + twinkle * 0.2) * Math.min(1, sky.stars))
    }
    return c
  }

  private static backdrop(canvas: Canvas, center: Point, sky: Sky, frame: number): void {
    canvas.paint((x, y) => Scene.sky(canvas, x, y, sky, frame, true))
    canvas.glow(center.x, center.y, Math.min(canvas.width, canvas.height) * 0.42, sky.halo, 0.08)
  }

  private static orchestratorScale(canvas: Canvas): number {
    const base = Math.max(0.55, Math.min(1, canvas.height / 70))
    return canvas.mode === 'hd' ? base : Math.max(0.85, Math.min(1, base * Robots.ORCHESTRATOR_QUAD_BOOST))
  }

  private static orchestratorHatWidth(orchestratorScale: number): number {
    return Scene.AVATAR_WIDTH * Robots.ORCHESTRATOR_SCALE * orchestratorScale * Scene.HAT_RATIO
  }

  private static orchestratorHalf(canvas: Canvas): Point {
    const k = Robots.ORCHESTRATOR_SCALE * Scene.orchestratorScale(canvas)
    return { x: (Scene.AVATAR_WIDTH * k) / 2, y: (Scene.AVATAR_HEIGHT * k) / 2 }
  }

  private static orchestratorEdge(canvas: Canvas, center: Point, from: Point): Point {
    const half = Scene.orchestratorHalf(canvas)
    const dx = from.x - center.x
    const dy = from.y - center.y
    const reach = Math.min(half.x / Math.max(1e-6, Math.abs(dx)), half.y / Math.max(1e-6, Math.abs(dy)), 1)
    return { x: center.x + dx * reach, y: center.y + dy * reach }
  }

  private static layout(canvas: Canvas, center: Point, room: Room, input: SceneInput): Placed[] {
    const onStage = Scene.visibleAt(input.agents, input.at).filter(a => Scene.isOnStage(a, input.at))
    const running = onStage.filter(a => Scene.statusAt(a, input.at) === 'running')
    const leaving = onStage.filter(a => Scene.statusAt(a, input.at) !== 'running').sort((a, b) => b.endedAt - a.endedAt)
    const plan = Scene.seats(canvas, room, Math.min(Scene.MAX_SHOWN, onStage.length))
    const chosen = [...running, ...leaving].slice(0, Math.min(Scene.MAX_SHOWN, plan.seats.length)).sort((a, b) => a.startedAt - b.startedAt)
    const ids = new Set(chosen.map(a => a.id))
    for (const id of Array.from(input.positions.keys())) if (!ids.has(id)) input.positions.delete(id)
    if (chosen.length === 0) return []
    const baseScale = plan.scale
    const assigned = Scene.assign(canvas, plan, chosen)

    return chosen.map((agent, i) => {
      const seat: Seat = plan.seats[assigned.get(agent.id) ?? i] ?? plan.seats[0] ?? { point: center, isBack: false, align: 'center', anchor: center.x, room: Scene.LABEL_MAX }
      const slot = seat.point
      const status = Scene.statusAt(agent, input.at)
      const seed = Canvas.hash(Scene.stableHash(agent.id), 29)
      const age = input.at - agent.startedAt
      const origin = Scene.orchestratorEdge(canvas, center, slot)
      const flight = Scene.flight(origin, slot, age)
      const previous = input.positions.get(agent.id)
      const dt = Math.max(0, Math.min(Scene.MAX_DT_MS, input.dt))
      let current: Point = slot
      if (flight) current = flight.point
      else if (input.isLive && previous) current = Scene.follow(previous, slot, dt)
      input.positions.set(agent.id, current)
      const landing = flight ? 0 : Math.min(1, Math.max(0, (age - Scene.FLIGHT_MS) / Scene.LAND_MS))
      const exit = status === 'running' ? 0 : Math.max(0.0001, (input.at - agent.endedAt) / Scene.EXIT_MS)
      return {
        agent,
        status,
        slot,
        x: current.x,
        y: current.y,
        scale: baseScale * (flight ? flight.scale : 1),
        baseScale,
        index: i,
        exit,
        isAbove: seat.isBack,
        seed,
        tilt: 0,
        thrust: 0,
        squash: flight ? -0.25 * Math.sin(Math.PI * flight.progress) : Scene.squash(landing),
        labelMax: Math.max(6, Math.min(Scene.LABEL_MAX, seat.room)),
        labelAlign: seat.align,
        labelAnchor: seat.anchor,
      }
    })
  }

  private static assign(canvas: Canvas, plan: Seats, chosen: FlowAgent[]): Map<string, number> {
    const key = `${canvas.width}x${canvas.height}|${plan.seats.length}|${plan.scale}`
    if (key !== Scene.seatingKey) {
      Scene.SEATING.clear()
      Scene.seatingKey = key
    }
    const ids = new Set(chosen.map(a => a.id))
    for (const id of Array.from(Scene.SEATING.keys())) if (!ids.has(id)) Scene.SEATING.delete(id)
    const used = new Set<number>()
    for (const agent of chosen) {
      const index = Scene.SEATING.get(agent.id)
      if (index === undefined || index >= plan.seats.length || used.has(index)) Scene.SEATING.delete(agent.id)
      else used.add(index)
    }
    let next = 0
    for (const agent of chosen) {
      if (Scene.SEATING.has(agent.id)) continue
      while (used.has(next)) next++
      used.add(next)
      Scene.SEATING.set(agent.id, next)
    }
    return Scene.SEATING
  }

  static seats(canvas: Canvas, room: Room, n: number): Seats {
    const wide = Scene.fit(canvas, room, n, Scene.EDGE_MARGIN, Scene.SEAT_GAP, Scene.SEAT_MIN)
    const fit = wide.perLeft + wide.perRight > 0 ? wide : Scene.fit(canvas, room, n, 0, Scene.NARROW_GAP, Scene.NARROW_MIN)
    const { scale, pitch, perLeft, perRight, gap, margin } = fit.perLeft + fit.perRight > 0 ? fit : wide
    const half = (Colleagues.HEIGHT * scale) / 2
    const width = Colleagues.WIDTH * scale
    const rows = [
      { y: room.floorY + 0.5 - half, isBack: false },
      { y: room.sillY + 1 - half, isBack: true },
    ]
    const seats: Seat[] = []
    if (perLeft + perRight === 0) {
      const per = Math.max(1, Math.floor((canvas.width - 2 * margin + gap) / pitch))
      for (let k = 0; k < per; k++) {
        const x = margin + width / 2 + k * pitch
        seats.push({ point: { x, y: rows[0]?.y ?? 0 }, isBack: false, align: 'center', anchor: x, room: Math.floor(pitch) - 1 })
      }
      return { seats, scale, pitch }
    }
    for (const row of rows) {
      for (let k = 0; k < Math.max(perLeft, perRight); k++) {
        const inner = k === 0
        const middle = canvas.width / 2
        if (k < perLeft) {
          const x = room.deskLeft - gap - k * pitch - width / 2
          const edge = x - width / 2
          seats.push({ point: { x, y: row.y }, isBack: row.isBack, align: inner ? 'start' : 'center', anchor: inner ? edge : x, room: Math.max(0, inner ? Math.floor(middle - edge) - 1 : Math.floor(pitch) - 1) })
        }
        if (k < perRight) {
          const x = room.deskRight + gap + k * pitch + width / 2
          const edge = x + width / 2
          seats.push({ point: { x, y: row.y }, isBack: row.isBack, align: inner ? 'end' : 'center', anchor: inner ? edge : x, room: Math.max(0, inner ? Math.floor(edge - middle) - 1 : Math.floor(pitch) - 1) })
        }
      }
    }
    return { seats, scale, pitch }
  }

  private static fit(canvas: Canvas, room: Room, n: number, margin: number, gap: number, min: number): Fit {
    const left = Math.max(0, room.deskLeft - gap - margin)
    const right = Math.max(0, canvas.width - margin - room.deskRight - gap)
    const steps = Math.round((Scene.SEAT_MAX - min) / (Scene.SCALE_STEP * 2))
    let result: Fit = { scale: Scene.SEAT_MAX, pitch: Colleagues.WIDTH * Scene.SEAT_MAX + gap, perLeft: 0, perRight: 0, gap, margin }
    for (let k = 0; k <= steps; k++) {
      const scale = Math.round((Scene.SEAT_MAX - k * Scene.SCALE_STEP * 2) * 1000) / 1000
      const pitch = Colleagues.WIDTH * scale + gap
      result = { scale, pitch, perLeft: Math.floor((left + gap) / pitch), perRight: Math.floor((right + gap) / pitch), gap, margin }
      if (2 * (result.perLeft + result.perRight) >= n) break
    }
    return result
  }

  private static flight(origin: Point, slot: Point, age: number): Flight | undefined {
    if (age >= Scene.FLIGHT_MS) return undefined
    const at = (ms: number): Point => {
      const f = Math.max(0, Math.min(1, ms / Scene.FLIGHT_MS))
      const e = Scene.easeInOut(f)
      const hop = Math.min(6, Math.hypot(slot.x - origin.x, slot.y - origin.y) * 0.22) * Math.sin(Math.PI * f)
      return { x: origin.x + (slot.x - origin.x) * e, y: origin.y + (slot.y - origin.y) * e - hop }
    }
    const progress = Math.max(0, age / Scene.FLIGHT_MS)
    const point = at(age)
    const before = at(age - 16)
    return { point, velocity: { x: ((point.x - before.x) * 1000) / 16, y: ((point.y - before.y) * 1000) / 16 }, scale: 0.35 + 0.65 * Scene.easeOut(Math.min(1, progress)), progress }
  }

  private static squash(landing: number): number {
    if (landing <= 0 || landing >= 1) return 0
    return 0.6 * Math.exp(-4 * landing) * Math.cos(3 * Math.PI * landing)
  }

  private static obstacles(canvas: Canvas, center: Point, orchestratorScale: number, placed: Placed[], labels: GraphLabel[], input: SceneInput): Obstacle[] {
    const boxes: Obstacle[] = labels.map(l => ({ x: l.column, y: l.row * 2, w: Array.from(l.text).length, h: 2 }))
    const half = Scene.orchestratorHalf(canvas)
    const hat = Effects.hatHeight(input.ambience, Scene.orchestratorHatWidth(orchestratorScale) / 0.7)
    const top = Math.min(Robots.orchestratorTop(center.y, orchestratorScale), center.y - half.y) - hat
    boxes.push({ x: center.x - half.x, y: top, w: half.x * 2, h: center.y + half.y - top })
    for (const p of placed) {
      if (p.exit >= 1) continue
      const h = (Colleagues.HEIGHT * p.baseScale) / 2
      const w = Colleagues.WIDTH * p.baseScale
      boxes.push({ x: p.slot.x - w / 2, y: p.slot.y - h, w, h: h * 2 })
    }
    return boxes
  }

  private static ordinals(placed: Placed[]): Map<string, number> {
    const totals = new Map<string, number>()
    for (const p of placed) if (p.exit === 0) totals.set(p.agent.type, (totals.get(p.agent.type) ?? 0) + 1)
    const seen = new Map<string, number>()
    const result = new Map<string, number>()
    for (const p of placed) {
      if (p.exit > 0 || (totals.get(p.agent.type) ?? 0) < 2) continue
      const next = (seen.get(p.agent.type) ?? 0) + 1
      seen.set(p.agent.type, next)
      result.set(p.agent.id, next)
    }
    return result
  }

  private static hint(description: string): string {
    const words = description.split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 1 && !Scene.SKIPPED_WORDS.has(w.toLowerCase()))
    let hint = ''
    for (const word of words) {
      const next = hint === '' ? word : `${hint} ${word}`
      if (Array.from(next).length > Scene.HINT_MAX) break
      hint = next
    }
    return hint === '' && words[0] ? Array.from(words[0]).slice(0, Scene.HINT_MAX).join('') : hint
  }

  private static badge(canvas: Canvas, x: number, y: number, ordinal: number, color: Rgb): void {
    const tint = Canvas.mix(color, Theme.WHITE, Math.min(0.9, 0.15 * ordinal))
    const width = 1 + ordinal * 1.3
    canvas.fillRoundRect(x - width / 2, y - 0.6, width, 1.2, 0.6, Canvas.scale(color, 0.35), 0.85)
    canvas.strokeCircle(x, y, Math.max(width / 2, 1.2) + 0.4, 0.18, tint, 0.5)
    for (let k = 0; k < ordinal; k++) canvas.fillCircle(x + (k - (ordinal - 1) / 2) * 1.3, y, 0.4, tint)
  }

  private static overflow(canvas: Canvas, center: Point, orchestratorScale: number, hidden: number, input: SceneInput): GraphLabel {
    const mainRow = Math.min(input.rows - 1, Math.floor((center.y + (Scene.AVATAR_HEIGHT * Robots.ORCHESTRATOR_SCALE * orchestratorScale) / 2) / 2) + 1)
    const row = Math.min(input.rows - 1, mainRow + 1)
    const label = Scene.label(canvas, '', center.x, row, `+${hidden}`, Theme.WHITE, false, false)
    const width = label.text.length + 2
    canvas.fillRoundRect(label.column - 1, row * 2 + 0.2, width, 1.6, 0.8, Theme.ORCH, 0.9)
    canvas.text(label.column, row, label.text, Theme.WHITE)
    return label
  }

  private static robot(canvas: Canvas, hub: Point, p: Placed, input: SceneInput, ordinal: number): void {
    const seed = Canvas.hash((p.agent.startedAt + ordinal * 211) % 9973, p.index + 1)
    const color = Robots.accent(p.agent.type)
    let x = p.x
    let y = p.y
    let scale = p.scale
    let finale = -1
    if (p.exit > 0) {
      const elapsed = p.exit * Scene.EXIT_MS
      if (elapsed < Scene.FINALE_MS) {
        const t = elapsed / Scene.FINALE_MS
        finale = t
        y -= Math.sin(t * Math.PI * 3) * (1 - t) * 1.2
        Effects.finale(canvas, { x, y }, t, Scene.exitStatus(p.status), color, input.frame, seed)
      } else {
        const t = Math.min(1, (elapsed - Scene.FINALE_MS) / (Scene.EXIT_MS - Scene.FINALE_MS))
        const pull = Scene.easeIn(t)
        Effects.teleport(canvas, { x: p.x, y: p.y }, hub, t, color, input.frame)
        x = p.x + (hub.x - p.x) * pull
        y = p.y + (hub.y - p.y) * pull
        scale = p.baseScale * Math.max(0, 1 - pull)
        if (scale < 0.08) return
      }
    }
    const isWorking = p.status === 'running'
    const latest = isWorking ? Scene.latestTool(p.agent.id, input.events, input.at) : undefined
    const label = latest?.event.label ?? (input.isLive && isWorking ? p.agent.tool : '')
    Colleagues.draw(canvas, x, y, scale, {
      type: p.agent.type,
      model: p.agent.model,
      mood: Scene.mood(p.status),
      frame: input.frame,
      flash: Scene.flash(p.agent.id, input),
      seed,
      thrust: p.exit > 0 ? 0 : p.thrust,
      tilt: p.exit > 0 ? 0 : p.tilt,
      squash: p.exit > 0 ? 0 : p.squash,
      toolColor: label === '' ? undefined : Scene.TOOL_COLORS[Scene.toolKind(label)],
    })
    if (ordinal > 0 && p.exit === 0 && scale > 0.3) Scene.badge(canvas, x, y + (Colleagues.HEIGHT * scale) / 2 + 0.2, ordinal, color)
  }

  private static shadow(canvas: Canvas, hub: Point, p: Placed): void {
    let presence = 1
    let x = p.x
    let y = p.y
    if (p.exit > 0) {
      const elapsed = p.exit * Scene.EXIT_MS
      if (elapsed >= Scene.FINALE_MS) {
        const pull = Scene.easeIn(Math.min(1, (elapsed - Scene.FINALE_MS) / (Scene.EXIT_MS - Scene.FINALE_MS)))
        x = p.x + (hub.x - p.x) * pull
        y = p.y + (hub.y - p.y) * pull
        presence = 1 - pull
      }
    }
    const half = (Colleagues.HEIGHT * p.baseScale) / 2
    const ground = p.slot.y + half + 0.9
    const lift = Math.max(0, ground - (y + (Colleagues.HEIGHT * p.scale) / 2))
    const near = Math.max(0, 1 - lift / 10) * presence
    if (near <= 0.02) return
    const rx = Colleagues.WIDTH * p.baseScale * (0.36 - 0.012 * Math.min(10, lift)) * (1 + 0.25 * Math.max(0, p.squash))
    canvas.fillEllipse(x, ground, rx * 1.35, 0.95, Scene.SHADOW, 0.16 * near)
    canvas.fillEllipse(x, ground, rx, 0.6, Scene.SHADOW, 0.34 * near)
  }

  private static activity(events: readonly FlowEvent[], at: number): Map<string, number> {
    const counts = new Map<string, number>()
    for (const hit of Scene.recentTools(events, at, Scene.ACTIVITY_MS)) counts.set(hit.event.agentId, (counts.get(hit.event.agentId) ?? 0) + 1)
    return counts
  }

  private static cables(canvas: Canvas, room: Room, placed: Placed[], input: SceneInput, light: number): Cabled {
    const activity = Scene.activity(input.events, input.at)
    const mid = (room.deskLeft + room.deskRight) / 2
    const base = room.floorY + 3
    const rows = canvas.height - base
    const entries = placed.map(p => ({ p, parent: placed.find(o => o.agent.id === p.agent.parentId && o.exit === 0), lane: base, port: -1, prev: undefined as Placed | undefined }))
    const order = (list: typeof entries): typeof entries => list.slice().sort((a, b) => Math.abs(a.p.slot.x - mid) - Math.abs(b.p.slot.x - mid) || Number(a.p.isAbove) - Number(b.p.isAbove))
    const lefts = order(entries.filter(e => e.p.slot.x < mid))
    const rights = order(entries.filter(e => e.p.slot.x >= mid))
    const step = rows >= 2 * Math.max(lefts.length, rights.length) - 1 ? 2 : 1
    for (const side of [lefts, rights]) {
      side.forEach((e, r) => {
        e.lane = base + Math.max(0, Math.min(r * step, rows - 1))
        if (r < rows || e.parent) return
        for (let k = r - 1; k >= 0; k--) {
          const c = side[k]?.p
          if (!c || c.exit > 0 || input.at - c.agent.startedAt < Scene.FLIGHT_MS || c.isAbove !== e.p.isAbove) continue
          e.prev = c
          break
        }
      })
    }
    const isSwitch = (e: (typeof entries)[number]): boolean => !e.parent && !e.prev
    const mains = [...lefts.filter(isSwitch), ...rights.filter(isSwitch).reverse()]
    mains.forEach((e, i) => (e.port = i))
    const items: Cabling[] = []
    const size = `${canvas.width}x${canvas.height}`
    if (size !== Scene.wiresSize) {
      Scene.WIRES.clear()
      Scene.wiresSize = size
    }
    for (const { p, parent, lane, port, prev } of entries) {
      const age = input.at - p.agent.startedAt
      if (age < Scene.FLIGHT_MS) continue
      const elapsed = p.exit * Scene.EXIT_MS
      if (p.exit > 0 && elapsed >= Scene.FINALE_MS) continue
      const latest = Scene.latestTool(p.agent.id, input.events, input.at)
      const burst = latest ? Scene.burst(latest.age) : 0
      const flash = Math.max(Scene.flash(p.agent.id, input), burst)
      const warmth = latest ? Math.exp(-latest.age / 6000) : 0
      const accent = Robots.accent(p.agent.type)
      const look: WireLook = {
        light,
        activity: Math.min(1, (activity.get(p.agent.id) ?? 0) / 6 + 0.5 * warmth),
        flash,
        tint: Scene.packetColor(p.agent, latest, input.isLive),
        isIdle: (!latest || latest.age > Scene.IDLE_MS) && flash === 0,
        reveal: Math.min(1, Math.max(0, (age - Scene.FLIGHT_MS) / Scene.LAND_MS)),
        exit: p.exit > 0 ? elapsed / Scene.FINALE_MS : 0,
        at: input.at,
        returnAge: latest?.age,
        returnColor: latest ? Scene.TOOL_COLORS[Scene.toolKind(latest.event.label)] : accent,
      }
      const inward: Side = p.slot.x < mid ? 1 : -1
      const probe = Colleagues.plug(p.slot.x, p.slot.y, p.baseScale, inward).edge.x
      const facing: Side = Math.abs(probe - mid) <= Office.SWITCH_WIDTH / 2 + 0.5 ? (-inward as Side) : inward
      const plug = (q: Placed, side: Side): Plug => {
        const o = Colleagues.plug(q.x, q.y, q.scale, side)
        return { socket: o.socket, edge: { x: o.edge.x - (q.isAbove ? side * 0.5 : 0), y: o.edge.y } }
      }
      let from: Plug
      let to = plug(p, facing)
      if (parent) {
        const dx = p.slot.x - parent.slot.x
        const sides: [Side, Side] = Math.abs(dx) < 1 ? [-facing as Side, -facing as Side] : dx > 0 ? [1, -1] : [-1, 1]
        from = plug(parent, sides[0])
        to = plug(p, sides[1])
      } else if (prev) {
        from = plug(prev, -facing as Side)
      } else {
        const pt = Office.port(room, port, mains.length)
        from = { socket: pt, edge: { x: pt.x, y: pt.y } }
      }
      const key = [p.agent.id, from.socket.x, from.socket.y, from.edge.x, from.edge.y, to.socket.x, to.socket.y, to.edge.x, to.edge.y, lane, room.floorY, accent.join(','), p.seed].join('|')
      let cached = Scene.WIRES.get(p.agent.id)
      if (!cached || cached.key !== key) {
        const wall = prev && p.isAbove ? Math.max(from.edge.y, to.edge.y) + 1 : lane
        cached = { key, wire: Wiring.route(from, to, room.floorY, wall, accent, p.seed) }
        Scene.WIRES.set(p.agent.id, cached)
      }
      items.push({ p, look, wire: cached.wire })
    }
    const live = new Set(placed.map(p => p.agent.id))
    for (const id of Scene.WIRES.keys()) if (!live.has(id)) Scene.WIRES.delete(id)
    return { items, ports: mains.length }
  }

  static latestTool(agentId: string, events: readonly FlowEvent[], at: number): ToolHit | undefined {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i]
      if (!e || e.at > at || e.kind !== 'tool' || e.agentId !== agentId) continue
      return { event: e, age: at - e.at }
    }
    return undefined
  }

  static packetColor(agent: FlowAgent, latest: ToolHit | undefined, isLive: boolean): Rgb {
    const label = latest?.event.label ?? (isLive ? agent.tool : '')
    return label === '' ? Robots.accent(agent.type) : Scene.TOOL_COLORS[Scene.toolKind(label)]
  }

  static recentTools(events: readonly FlowEvent[], at: number, windowMs: number): ToolHit[] {
    const hits: ToolHit[] = []
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i]
      if (!e || e.at > at) continue
      const age = at - e.at
      if (age > windowMs + Scene.SCAN_SLACK_MS) break
      if (e.kind === 'tool' && age <= windowMs) hits.push({ event: e, age })
    }
    return hits
  }

  static gaze(events: readonly FlowEvent[], at: number, targets: ReadonlyMap<string, Point>): Point | undefined {
    let best: ToolHit | undefined
    for (const hit of Scene.recentTools(events, at, Scene.GAZE_MS)) {
      if (!targets.has(hit.event.agentId)) continue
      if (!best || hit.age < best.age) best = hit
    }
    return best ? targets.get(best.event.agentId) : undefined
  }

  static verifPulse(events: readonly FlowEvent[], at: number): VerifPulse | undefined {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i]
      if (!e || e.at > at) continue
      const age = at - e.at
      if (age > Scene.VERIF_PULSE_MS + Scene.SCAN_SLACK_MS) break
      if (e.kind !== 'verif' || age > Scene.VERIF_PULSE_MS) continue
      if (/fail/i.test(e.label)) return { t: age / Scene.VERIF_PULSE_MS, color: Theme.KO }
      if (e.label.includes('OK')) return { t: age / Scene.VERIF_PULSE_MS, color: Theme.OK }
    }
    return undefined
  }

  private static burst(age: number): number {
    if (age < 0 || age >= Scene.SPARK_MS) return 0
    const k = 1 - age / Scene.SPARK_MS
    return k * k
  }

  private static shockwave(canvas: Canvas, center: Point, half: Point, pulse: VerifPulse): void {
    const start = Math.max(half.x, half.y) * 0.7
    const reach = start + Math.max(10, half.x * 1.6)
    canvas.glow(center.x, center.y, start * 1.4, pulse.color, 0.22 * (1 - pulse.t) * (1 - pulse.t))
    for (let k = 0; k < 2; k++) {
      const t = pulse.t - k * 0.2
      if (t <= 0 || t >= 1) continue
      const r = start + (reach - start) * Scene.easeOut(t)
      const fade = (1 - t) * (1 - t)
      canvas.strokeCircle(center.x, center.y, r, 0.35 + 0.7 * (1 - t), pulse.color, (k === 0 ? 0.85 : 0.5) * fade)
      canvas.glow(center.x, center.y - r, 1.6, pulse.color, 0.3 * fade)
    }
  }

  private static bubbles(canvas: Canvas, center: Point, placed: Placed[], crown: number, orchestratorScale: number, input: SceneInput): void {
    const hits = Scene.recentTools(input.events, input.at, Scene.BUBBLE_MS)
    if (hits.length === 0) return
    const counts = new Map<string, number>()
    for (const hit of hits) {
      const id = hit.event.agentId
      const n = counts.get(id) ?? 0
      if (n >= Scene.MAX_BUBBLES) continue
      counts.set(id, n + 1)
      const seed = Canvas.hash(hit.event.id % 9973, 17)
      if (id === '') {
        const dir = seed < 0.5 ? -1 : 1
        Scene.bubble(canvas, { x: center.x + dir * 2, y: crown }, dir, hit, 1.15 * Math.max(0.8, orchestratorScale), seed)
        continue
      }
      const p = placed.find(o => o.agent.id === id)
      if (!p || p.exit > 0 || p.scale < Scene.SEAT_MIN * 0.5) continue
      const dir = p.x >= center.x ? 1 : -1
      const head = p.y - (Colleagues.HEIGHT * p.scale) / 2
      Scene.bubble(canvas, { x: p.x + dir * Colleagues.WIDTH * p.scale * 0.18, y: head }, dir, hit, Math.max(0.75, p.scale), seed)
    }
  }

  private static bubble(canvas: Canvas, origin: Point, dir: number, hit: ToolHit, size: number, seed: number): void {
    const t = Math.max(0, Math.min(1, hit.age / Scene.BUBBLE_MS))
    const kind = Scene.toolKind(hit.event.label)
    const tint = Scene.TOOL_COLORS[kind]
    const pop = t < Scene.BUBBLE_POP ? Scene.backOut(t / Scene.BUBBLE_POP) : 1
    const fade = t < Scene.BUBBLE_FADE ? 1 : 1 - (t - Scene.BUBBLE_FADE) / (1 - Scene.BUBBLE_FADE)
    const alpha = fade * fade * (hit.event.isError ? 0.75 : 1)
    if (alpha <= 0.01 || pop <= 0.01) return
    const rise = Scene.easeOut(t) * (5 + 3 * seed) * size
    const drift = dir * Scene.easeOut(t) * (1.5 + 2.5 * seed) * size + Math.sin(t * Math.PI * 2 + seed * 6) * 0.35
    const r = 2.2 * size * pop
    const lifted = origin.y - 1.5 * size - rise
    const ceiling = r + 0.6
    const y = Math.max(ceiling, lifted)
    const x = origin.x + drift + dir * Math.max(0, ceiling - lifted) * 0.9
    if (t < 0.35) {
      const k = 1 - t / 0.35
      canvas.fillCircle(origin.x + drift * 0.3, origin.y - 0.4 - rise * 0.3, 0.35 * size, tint, 0.6 * k)
    }
    canvas.glow(x, y, r * 1.9, tint, 0.3 * alpha)
    canvas.fillCircle(x, y, r, Canvas.mix(Scene.BUBBLE_INK, tint, 0.28), 0.88 * alpha)
    canvas.strokeCircle(x, y, r, 0.32, tint, 0.95 * alpha)
    canvas.fillCircle(x - r * 0.4, y - r * 0.45, r * 0.16, Theme.WHITE, 0.5 * alpha)
    Scene.icon(canvas, kind, x, y, r * 0.62, Canvas.mix(tint, Theme.WHITE, 0.55), tint, alpha)
  }

  private static icon(canvas: Canvas, kind: ToolKind, x: number, y: number, s: number, ink: Rgb, tint: Rgb, alpha: number): void {
    switch (kind) {
      case 'read':
        canvas.fillRoundRect(x - s * 0.7, y - s * 0.9, s * 1.4, s * 1.8, s * 0.15, ink, 0.9 * alpha)
        for (let k = 0; k < 3; k++) canvas.fillRect(x - s * 0.45, y - s * 0.5 + k * s * 0.45, s * (k === 2 ? 0.55 : 0.9), s * 0.16, tint, alpha)
        return
      case 'edit':
        canvas.line({ x: x - s * 0.55, y: y + s * 0.55 }, { x: x + s * 0.6, y: y - s * 0.6 }, s * 0.45, ink, alpha)
        canvas.fillTriangle({ x: x - s * 0.85, y: y + s * 0.85 }, { x: x - s * 0.75, y: y + s * 0.3 }, { x: x - s * 0.3, y: y + s * 0.75 }, Theme.WARN, alpha)
        canvas.line({ x: x + s * 0.45, y: y - s * 0.45 }, { x: x + s * 0.7, y: y - s * 0.7 }, s * 0.45, tint, alpha)
        return
      case 'shell':
        canvas.line({ x: x - s * 0.8, y: y - s * 0.5 }, { x: x - s * 0.25, y }, s * 0.24, ink, alpha)
        canvas.line({ x: x - s * 0.25, y }, { x: x - s * 0.8, y: y + s * 0.5 }, s * 0.24, ink, alpha)
        canvas.fillRect(x, y + s * 0.4, s * 0.8, s * 0.2, ink, alpha)
        return
      case 'search':
        canvas.strokeCircle(x - s * 0.15, y - s * 0.15, s * 0.5, s * 0.24, ink, alpha)
        canvas.line({ x: x + s * 0.22, y: y + s * 0.22 }, { x: x + s * 0.8, y: y + s * 0.8 }, s * 0.3, ink, alpha)
        return
      case 'agent':
        canvas.fillRoundRect(x - s * 0.7, y - s * 0.45, s * 1.4, s * 1.1, s * 0.3, ink, alpha)
        canvas.line({ x, y: y - s * 0.45 }, { x, y: y - s * 0.85 }, s * 0.15, ink, alpha)
        canvas.fillCircle(x, y - s * 0.9, s * 0.14, tint, alpha)
        canvas.fillCircle(x - s * 0.3, y + s * 0.05, s * 0.16, Scene.BUBBLE_INK, alpha)
        canvas.fillCircle(x + s * 0.3, y + s * 0.05, s * 0.16, Scene.BUBBLE_INK, alpha)
        return
      case 'web':
        canvas.strokeCircle(x, y, s * 0.8, s * 0.18, ink, alpha)
        canvas.fillRect(x - s * 0.8, y - s * 0.07, s * 1.6, s * 0.14, ink, 0.8 * alpha)
        canvas.fillEllipse(x, y, s * 0.32, s * 0.8, ink, 0.45 * alpha)
        return
      case 'other':
        canvas.fillCircle(x, y, s * 0.35, ink, alpha)
        return
    }
  }

  private static backOut(t: number): number {
    const c = 1.7
    const u = t - 1
    return 1 + (c + 1) * u * u * u + c * u * u
  }

  static mainLabel(state: OrchestratorState, model: string): string {
    return `◆ ${Scene.AVATAR_NAME} · ${state === 'asleep' ? 'zzz' : Theme.modelLabel(model)}`
  }

  private static labels(canvas: Canvas, center: Point, orchestratorScale: number, placed: Placed[], state: OrchestratorState, input: SceneInput, ordinals: Map<string, number>): GraphLabel[] {
    const labels: GraphLabel[] = []
    const mainRow = Math.min(input.rows - 1, Math.floor((center.y + (Scene.AVATAR_HEIGHT * Robots.ORCHESTRATOR_SCALE * orchestratorScale) / 2) / 2) + 1)
    labels.push(Scene.label(canvas, '', center.x, mainRow, Scene.mainLabel(state, input.main.model), Theme.ORCH, true, true))

    for (const p of placed) {
      const finaleElapsed = p.exit * Scene.EXIT_MS
      if (p.exit > 0 && finaleElapsed >= Scene.FINALE_MS) continue
      const color = Robots.accent(p.agent.type)
      const half = (Colleagues.HEIGHT * p.baseScale) / 2
      const rawRow = p.isAbove
        ? Math.floor((p.slot.y - half - 1) / 2) - 2
        : Math.ceil((p.slot.y + half + 2) / 2)
      const nameRow = Math.max(0, Math.min(input.rows - 2, rawRow))
      if (p.exit > 0) {
        const isKilled = p.status === 'killed'
        const isFailed = p.status === 'failed' || isKilled
        const text = isKilled ? `■ ${p.agent.type}` : isFailed ? `✗ ${p.agent.type} · failed` : `✓ ${p.agent.type}`
        labels.push(Scene.label(canvas, p.agent.id, p.labelAnchor, nameRow, Theme.truncate(text, p.labelMax), isKilled ? Theme.MUTED : isFailed ? Theme.KO : Theme.OK, true, false, p.labelAlign))
        continue
      }
      const glyph = Theme.statusGlyph(p.status, input.frame + p.index)
      const ordinal = ordinals.get(p.agent.id) ?? 0
      const room = p.labelMax - Array.from(`${glyph} ${p.agent.type} · `).length
      const hint = ordinal > 0 && room > 2 ? Array.from(Scene.hint(p.agent.description)).slice(0, room).join('').trimEnd() : ''
      const suffix = ordinal === 0 ? '' : hint !== '' ? ` · ${hint}` : ` ${Scene.SUPERSCRIPTS[Math.min(ordinal, 9)] ?? ordinal}`
      const name = Theme.truncate(`${glyph} ${p.agent.type}${suffix}`.trimEnd(), p.labelMax)
      labels.push(Scene.label(canvas, p.agent.id, p.labelAnchor, nameRow, name, Canvas.mix(color, Theme.WHITE, 0.3), true, false, p.labelAlign))
      const tool = Scene.toolAt(p.agent, input.events, input.at, input.isLive)
      const detail = tool !== '' ? `${Theme.duration(input.at - p.agent.startedAt)} · ${tool}` : Theme.duration(input.at - p.agent.startedAt)
      labels.push(Scene.label(canvas, p.agent.id, p.labelAnchor, nameRow + 1, Theme.truncate(detail, p.labelMax), Theme.MUTED, false, false, p.labelAlign))
    }
    return labels
  }

  private static label(canvas: Canvas, agentId: string, x: number, row: number, value: string, color: Rgb, isPrimary: boolean, isMain: boolean, align: LabelAlign = 'center'): GraphLabel {
    const text = Theme.truncate(value, canvas.columns - 2)
    const length = Array.from(text).length
    const start = align === 'start' ? Math.round(x) : align === 'end' ? Math.round(x) - length : Math.round(x - length / 2)
    const column = Math.max(0, Math.min(canvas.columns - length, start))
    return { agentId, column, row, text, color, isPrimary, isMain }
  }

  private static centered(canvas: Canvas, x: number, row: number, value: string, color: Rgb): void {
    const label = Scene.label(canvas, '', x, row, value, color, false, false)
    canvas.text(label.column, label.row, label.text, color)
  }

  private static flash(id: string, input: SceneInput): number {
    if (!input.isLive) return 0
    const last = input.pulses.get(id)
    if (last === undefined) return 0
    const since = input.at - last
    return since < Scene.FLASH_MS ? 1 - since / Scene.FLASH_MS : 0
  }

  private static easeOut(t: number): number {
    return 1 - (1 - t) * (1 - t)
  }

  private static easeInOut(t: number): number {
    return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)
  }

  private static easeIn(t: number): number {
    return t * t * t
  }

  private static grid(canvas: Canvas, from: number, span: number, left: number, right: number, xOf: (t: number) => number): void {
    const step = Scene.step(span)
    const first = Math.ceil(from / step) * step
    for (let t = first; t <= from + span; t += step) {
      const x = xOf(t)
      if (x < left || x > right) continue
      canvas.fillRect(x - 0.06, 0, 0.12, canvas.height - 2, Theme.FAINT, 0.45)
    }
  }

  private static axis(canvas: Canvas, row: number, from: number, span: number, left: number, right: number, isLive: boolean, xOf: (t: number) => number): void {
    const step = Scene.step(span)
    const first = Math.ceil(from / step) * step
    const end = from + span
    let lastX = -10
    for (let t = first; t <= end; t += step) {
      const x = Math.round(xOf(t))
      if (x < left || x > right - 3 || x - lastX < 8) continue
      const label = isLive ? `-${Theme.duration(end - t)}` : Theme.clock(t).slice(0, 5)
      canvas.text(x, row, label, Theme.MUTED)
      lastX = x + label.length
    }
    canvas.text(right - 3, row, isLive ? 'live' : 'fin', isLive ? Theme.OK : Theme.MUTED)
  }

  private static step(span: number): number {
    const steps = [5_000, 10_000, 15_000, 30_000, 60_000, 120_000, 300_000, 600_000, 900_000, 1_800_000, 3_600_000]
    return steps.find(s => span / s <= 6) ?? 3_600_000
  }
}
