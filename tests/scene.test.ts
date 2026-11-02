import { expect, test } from 'claude-code/testing'
import { Canvas, type Point, type Rgb } from '../hooks/canvas'
import { Effects, type Ambience, type Obstacle } from '../hooks/effects'
import { Robots } from '../hooks/robots'
import { Scene, type Cable, type GraphLabel, type SceneInput, type ToolHit } from '../hooks/scene'
import { Theme } from '../hooks/theme'
import type { FlowAgent, FlowEvent, FlowEventKind } from '../types'

class SceneFixture {
  static readonly NOW = 1_800_000_000_000

  static agent(id: string, type: string, description: string, ageSeconds: number): FlowAgent {
    return {
      id,
      type,
      description,
      model: 'claude-sonnet-5-5',
      parentId: '',
      status: 'running',
      startedAt: SceneFixture.NOW - ageSeconds * 1000,
      endedAt: 0,
      tool: '',
      toolCount: 0,
      files: [],
      tokensIn: 0,
      tokensOut: 0,
    }
  }

  static labels(agents: FlowAgent[]): GraphLabel[] {
    return SceneFixture.render(agents, 84, Scene.graphRows(84, 70), new Date(2026, 5, 1, 12, 0), true).labels
  }

  static render(agents: FlowAgent[], columns: number, rows: number, date: Date, isLive: boolean): { labels: GraphLabel[]; positions: Map<string, Point>; ambience: Ambience } {
    const ambience = Effects.ambience(date, false, 0, false, [])
    const positions = new Map<string, Point>()
    const labels = Scene.graph({
      agents,
      events: [],
      main: { tool: '', toolCount: 0, isBusy: true, busySince: SceneFixture.NOW - 60_000, model: 'claude-opus-5-5' },
      at: SceneFixture.NOW,
      isLive,
      frame: 10,
      dt: 0,
      pulses: new Map(),
      columns,
      rows,
      mode: 'quad',
      ambience,
      positions,
    }).labels
    return { labels, positions, ambience }
  }

  static obstacles(agents: FlowAgent[], columns: number, rows: number, date: Date, positions: Map<string, Point>): Obstacle[] {
    const input: SceneInput = { ...SceneFixture.input(agents, SceneFixture.NOW, 10, 0, true, 0, positions), columns, rows, ambience: Effects.ambience(date, false, 0, false, []) }
    return Scene.graph(input).obstacles ?? []
  }

  static scaleOf(positions: Map<string, Point>, ids: string[], columns: number): number {
    const centerX = columns / 2
    const first = positions.get(ids[0] ?? '')
    const stagger = ids.length > 2 && first && Math.abs(first.x - centerX) > 0.5 ? 0.5 : 0
    let best = 0
    let bestCos = 0
    ids.forEach((id, i) => {
      const point = positions.get(id)
      const cos = Math.cos(-Math.PI / 2 + ((i + stagger) * 2 * Math.PI) / ids.length + (ids.length <= 2 ? Math.PI / 2 : 0))
      if (point && Math.abs(cos) > bestCos) {
        bestCos = Math.abs(cos)
        best = (columns / 2 - 2 - Math.abs(point.x - centerX) / Math.abs(cos)) / (Robots.WIDTH / 2)
      }
    })
    return best
  }

  static input(agents: FlowAgent[], at: number, frame: number, dt: number, isBusy: boolean, idleMs: number, positions: Map<string, Point>): SceneInput {
    return {
      agents,
      events: [],
      main: { tool: '', toolCount: 0, isBusy, busySince: isBusy ? SceneFixture.NOW - 60_000 : 0, model: 'claude-opus-5-5' },
      at,
      isLive: true,
      frame,
      dt,
      pulses: new Map(),
      columns: 84,
      rows: Scene.graphRows(84, 70),
      mode: 'quad',
      ambience: Effects.ambience(new Date(2026, 5, 1, 12, 0), false, idleMs, false, []),
      positions,
    }
  }

  static simulate(agents: FlowAgent[], ticks: number, stepMs: number): Map<string, Point> {
    const positions = new Map<string, Point>()
    for (let i = 1; i <= ticks; i++) {
      const at = SceneFixture.NOW + i * stepMs
      Scene.graph(SceneFixture.input(agents, at, (at - SceneFixture.NOW) / 80, stepMs, true, 0, positions))
    }
    return positions
  }

  static primaries(labels: GraphLabel[]): string[] {
    return labels.filter(l => l.isPrimary && !l.isMain).map(l => l.text)
  }

  static event(id: number, agentId: string, kind: FlowEventKind, label: string, agoMs: number): FlowEvent {
    return { id, at: SceneFixture.NOW - agoMs, agentId, kind, label, isError: false }
  }

  static cells(agents: FlowAgent[], events: FlowEvent[], positions: Map<string, Point>): Uint8Array {
    const input: SceneInput = { ...SceneFixture.input(agents, SceneFixture.NOW, 10, 0, true, 0, positions), events, isLive: false }
    const encoded = Scene.graph(input).encoded
    const raw = atob(encoded.kind === 'cells' ? encoded.cells : encoded.rgba)
    return Uint8Array.from(raw, ch => ch.charCodeAt(0))
  }

  static changedCells(before: Uint8Array, after: Uint8Array, columns: number): Point[] {
    const changed: Point[] = []
    const cell = 12
    for (let i = 0; i < before.length; i += cell) {
      for (let k = 0; k < cell; k++) {
        if (before[i + k] !== after[i + k]) {
          const index = i / cell
          changed.push({ x: index % columns, y: Math.floor(index / columns) * 2 })
          break
        }
      }
    }
    return changed
  }
}

test('graph labels two agents of the same type differently when descriptions differ', async () => {
  // Arrange
  const agents = [
    SceneFixture.agent('a', 'dotnet-expert', 'Domain policy', 100),
    SceneFixture.agent('b', 'dotnet-expert', 'Application API', 90),
  ]

  // Act
  const texts = SceneFixture.primaries(SceneFixture.labels(agents))

  // Assert
  expect(texts).toHaveLength(2)
  expect(new Set(texts).size).toBe(2)
  expect(texts.every(t => Array.from(t).length <= 24)).toBe(true)
})

test('graph labels duplicates with an ordinal suffix when descriptions are empty', async () => {
  // Arrange
  const agents = [SceneFixture.agent('a', 'dotnet-expert', '', 100), SceneFixture.agent('b', 'dotnet-expert', '', 90)]

  // Act
  const texts = SceneFixture.primaries(SceneFixture.labels(agents))

  // Assert
  expect(new Set(texts).size).toBe(2)
  expect(texts.some(t => t.endsWith('²'))).toBe(true)
})

test('graph keeps the plain label for a single agent of a type', async () => {
  // Arrange
  const agents = [SceneFixture.agent('a', 'dotnet-expert', 'Domain policy', 100)]

  // Act
  const texts = SceneFixture.primaries(SceneFixture.labels(agents))

  // Assert
  expect(texts).toHaveLength(1)
  expect(texts[0]?.endsWith('dotnet-expert')).toBe(true)
})

test('graph adds a +N overflow label when more agents than the maximum are on stage', async () => {
  // Arrange
  const agents = Array.from({ length: 12 }, (_, i) => SceneFixture.agent(`a${i}`, `type-${i}`, '', 100 - i))

  // Act
  const labels = SceneFixture.labels(agents)

  // Assert
  const overflow = labels.find(l => l.text === '+2')
  expect(overflow).toBeDefined()
  expect(overflow?.isMain).toBe(false)
  expect(overflow?.agentId).toBe('')
})

test('graph shows no overflow label when agents fit on stage', async () => {
  // Arrange
  const agents = Array.from({ length: 5 }, (_, i) => SceneFixture.agent(`a${i}`, `type-${i}`, '', 100 - i))

  // Act
  const labels = SceneFixture.labels(agents)

  // Assert
  expect(labels.some(l => /^\+\d+$/.test(l.text))).toBe(false)
})

class LayoutCheck {
  static readonly SIZES: [number, number][] = [[84, 30], [84, 40], [60, 24], [120, 40]]
  static readonly DATES: Date[] = [new Date(2026, 5, 1, 12, 0), new Date(2026, 9, 25, 12, 0), new Date(2026, 11, 10, 12, 0)]
}

for (const [columns, rows] of LayoutCheck.SIZES) {
  for (const date of LayoutCheck.DATES) {
    for (let n = 1; n <= 6; n++) {
      test(`graph keeps ${n} robots and labels inside the canvas without overlap at ${columns}x${rows} on ${date.toISOString().slice(0, 10)}`, async () => {
        // Arrange
        const agents = Array.from({ length: n }, (_, i) => SceneFixture.agent(`a${i}`, `type-${i}`, '', 100 - i))
        const ids = agents.map(a => a.id)

        // Act
        const { labels, positions } = SceneFixture.render(agents, columns, rows, date, false)

        // Assert
        const scale = SceneFixture.scaleOf(positions, ids, columns)
        expect(scale).toBeGreaterThan(0.3)
        expect(scale).toBeLessThan(1.31)
        const boxes = ids.map(id => {
          const p = positions.get(id) ?? { x: 0, y: 0 }
          const halfWidth = (Robots.WIDTH * scale) / 2
          const halfHeight = (Robots.HEIGHT * scale) / 2
          return { left: p.x - halfWidth, right: p.x + halfWidth, top: p.y - halfHeight, bottom: p.y + halfHeight }
        })
        for (const b of boxes) {
          expect(b.left).toBeGreaterThanOrEqual(0)
          expect(b.right).toBeLessThanOrEqual(columns)
          expect(b.top).toBeGreaterThanOrEqual(0)
          expect(b.bottom).toBeLessThanOrEqual(rows * 2)
        }
        for (const l of labels) {
          const start = l.column
          const end = l.column + Array.from(l.text).length
          const overlaps = boxes.some(b => start < b.right && end > b.left && l.row * 2 < b.bottom && l.row * 2 + 2 > b.top)
          expect(overlaps).toBe(false)
        }
      })
    }
  }
}


test('graph renders fractional and negative frames without throwing', async () => {
  // Arrange
  const agents = [SceneFixture.agent('a', 'dotnet-expert', 'Domaine', 100), SceneFixture.agent('b', 'test-expert', 'Tests', 50)]
  const frames = [0.37, 10.5, 123.999, -3.25]

  // Act
  const results = frames.map(frame => Scene.graph(SceneFixture.input(agents, SceneFixture.NOW, frame, 33, true, 0, new Map())))

  // Assert
  expect(results.every(r => r.labels.length > 0)).toBe(true)
})

test('graph positions converge to the same place whatever the frame rate', async () => {
  // Arrange
  const agents = [SceneFixture.agent('a', 'dotnet-expert', 'Domaine', 100), SceneFixture.agent('b', 'test-expert', 'Tests', 90), SceneFixture.agent('c', 'architect', 'Plan', 80)]

  // Act
  const fast = SceneFixture.simulate(agents, 30, 33)
  const slow = SceneFixture.simulate(agents, 12, 83)

  // Assert
  for (const agent of agents) {
    const a = fast.get(agent.id) ?? { x: Number.NaN, y: Number.NaN }
    const b = slow.get(agent.id) ?? { x: Number.NaN, y: Number.NaN }
    expect(Math.abs(a.x - b.x)).toBeLessThan(0.5)
    expect(Math.abs(a.y - b.y)).toBeLessThan(0.5)
  }
})

test('follow moves further with a longer time step', async () => {
  // Arrange
  const from: Point = { x: 0, y: 0 }
  const to: Point = { x: 100, y: 0 }

  // Act
  const short = Scene.follow(from, to, 33)
  const long = Scene.follow(from, to, 83)
  const twice = Scene.follow(Scene.follow(from, to, 40), to, 40)

  // Assert
  expect(long.x).toBeGreaterThan(short.x)
  expect(Math.abs(twice.x - Scene.follow(from, to, 80).x)).toBeLessThan(0.001)
})

test('orchestratorState maps activity and idle time to working, idle and asleep', async () => {
  // Arrange
  const cases: [boolean, number, string][] = [
    [true, 0, 'working'],
    [true, 10 * 60_000, 'working'],
    [false, 0, 'idle'],
    [false, 59_999, 'idle'],
    [false, 60_000, 'asleep'],
  ]

  // Act
  const states = cases.map(([isWorking, idleMs]) => Scene.orchestratorState(isWorking, idleMs))

  // Assert
  expect(states).toEqual(cases.map(c => c[2]))
})

test('graph labels the avatar main with the model when awake and zzz when asleep', async () => {
  // Arrange
  const awake = SceneFixture.input([], SceneFixture.NOW, 12.5, 33, false, 5_000, new Map())
  const asleep = SceneFixture.input([], SceneFixture.NOW, 12.5, 33, false, 120_000, new Map())
  const working = SceneFixture.input([SceneFixture.agent('a', 'dotnet-expert', '', 10)], SceneFixture.NOW, 12.5, 33, false, 120_000, new Map())

  // Act
  const main = (input: SceneInput): string => Scene.graph(input).labels.find(l => l.isMain)?.text ?? ''

  // Assert
  expect(main(awake)).toBe('◆ main · Opus')
  expect(main(asleep)).toBe('◆ main · zzz')
  expect(main(working)).toBe('◆ main · Opus')
})

test('graph keeps robots at least 0.72 for Halloween with 6 agents and 0.75 for Christmas with 3 agents at 84 columns', async () => {
  // Arrange
  const rows = Scene.graphRows(84, 60)
  const six = Array.from({ length: 6 }, (_, i) => SceneFixture.agent(`a${i}`, `type-${i}`, '', 100 - i))
  const three = six.slice(0, 3)

  // Act
  const halloween = SceneFixture.render(six, 84, rows, new Date(2026, 9, 31, 12, 0), false)
  const christmas = SceneFixture.render(three, 84, rows, new Date(2026, 11, 24, 12, 0), false)
  const plain = SceneFixture.render(three, 84, rows, new Date(2026, 5, 1, 12, 0), false)

  // Assert
  expect(SceneFixture.scaleOf(halloween.positions, six.map(a => a.id), 84)).toBeGreaterThanOrEqual(0.72)
  expect(SceneFixture.scaleOf(christmas.positions, three.map(a => a.id), 84)).toBeGreaterThanOrEqual(0.75)
  expect(SceneFixture.scaleOf(plain.positions, three.map(a => a.id), 84)).toBeGreaterThan(0.74)
})

test('graph keeps the agent label during the finale with its outcome and drops it after the teleport', async () => {
  // Arrange
  const done = { ...SceneFixture.agent('ok', 'dotnet-expert', '', 100), status: 'completed' as const, endedAt: SceneFixture.NOW - 500 }
  const failed = { ...SceneFixture.agent('ko', 'test-expert', '', 100), status: 'failed' as const, endedAt: SceneFixture.NOW - 500 }
  const gone = { ...SceneFixture.agent('old', 'architect', '', 100), status: 'completed' as const, endedAt: SceneFixture.NOW - 2_000 }

  // Act
  const labels = SceneFixture.labels([done, failed, gone])

  // Assert
  const texts = labels.filter(l => !l.isMain).map(l => l.text)
  expect(texts).toContain('✓ dotnet-expert')
  expect(texts).toContain('✗ test-expert · failed')
  expect(texts.some(t => t.includes('architect'))).toBe(false)
  expect(labels.find(l => l.text === '✓ dotnet-expert')?.isPrimary).toBe(true)
})

test('graph keeps the sun and moon disc clear of every robot and label with 6 agents at 84 columns', async () => {
  // Arrange
  const rows = Scene.graphRows(84, 60)
  const six = Array.from({ length: 6 }, (_, i) => SceneFixture.agent(`a${i}`, `type-${i}`, '', 100 - i))
  const dates = [new Date(2026, 5, 1, 12, 0), new Date(2026, 5, 1, 17, 30), new Date(2026, 9, 31, 22, 0)]
  const canvas = new Canvas(84, rows, 'quad')

  for (const date of dates) {
    const ambience = Effects.ambience(date, false, 0, false, [])
    const positions = new Map<string, Point>()
    const obstacles = SceneFixture.obstacles(six, 84, rows, date, positions)

    // Act
    const spot = Effects.celestialSpot(canvas, ambience, obstacles)

    // Assert
    expect(obstacles.length).toBeGreaterThan(6)
    for (const o of obstacles) {
      const dx = Math.max(o.x - spot.x, 0, spot.x - (o.x + o.w))
      const dy = Math.max(o.y - spot.y, 0, spot.y - (o.y + o.h))
      expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(spot.r)
    }
  }
})

test('celestialSpot keeps the arc position when there is no obstacle', async () => {
  // Arrange
  const canvas = new Canvas(84, Scene.graphRows(84, 60), 'quad')
  const ambience = Effects.ambience(new Date(2026, 5, 1, 12, 0), false, 0, false, [])

  // Act
  const free = Effects.celestialSpot(canvas, ambience)
  const empty = Effects.celestialSpot(canvas, ambience, [])

  // Assert
  expect(free).toEqual(empty)
  expect(free.lift).toBeGreaterThan(0.9)
  expect(free.x).toBeGreaterThan(canvas.width * 0.3)
  expect(free.x).toBeLessThan(canvas.width * 0.7)
})

test('celestialSpot slides away from a blocking obstacle and shrinks when the whole arc is blocked', async () => {
  // Arrange
  const canvas = new Canvas(84, Scene.graphRows(84, 60), 'quad')
  const ambience = Effects.ambience(new Date(2026, 5, 1, 12, 0), false, 0, false, [])
  const home = Effects.celestialSpot(canvas, ambience)
  const block: Obstacle = { x: home.x - 6, y: home.y - 6, w: 12, h: 12 }
  const wall: Obstacle = { x: 0, y: 0, w: canvas.width, h: canvas.height }

  // Act
  const slid = Effects.celestialSpot(canvas, ambience, [block])
  const shrunk = Effects.celestialSpot(canvas, ambience, [wall])

  // Assert
  expect(slid.r).toBe(home.r)
  expect(Math.abs(slid.x - home.x) + Math.abs(slid.y - home.y)).toBeGreaterThan(5)
  expect(shrunk.r).toBeLessThan(home.r)
  expect(Effects.celestialSpot(canvas, ambience, [wall])).toEqual(shrunk)
})

test('reaction picks a stable spawn kind from the pool with progress t for a recent spawn', async () => {
  // Arrange
  const agents = [SceneFixture.agent('a', 'dotnet-expert', '', 0.5)]

  // Act
  const first = Scene.reaction(agents, SceneFixture.NOW)
  const next = Scene.reaction(agents, SceneFixture.NOW + 100)

  // Assert
  expect(Robots.SPAWN_REACTIONS).toContain(first?.kind)
  expect(Math.abs((first?.t ?? 0) - 500 / Robots.REACTION_MS)).toBeLessThan(0.01)
  expect(next?.kind).toBe(first?.kind)
})

test('reaction picks an exit kind when an agent just finished and none after REACTION_MS', async () => {
  // Arrange
  const done = { ...SceneFixture.agent('a', 'dotnet-expert', '', 30), status: 'completed' as const, endedAt: SceneFixture.NOW - 300 }

  // Act
  const during = Scene.reaction([done], SceneFixture.NOW)
  const after = Scene.reaction([done], SceneFixture.NOW + Robots.REACTION_MS)

  // Assert
  expect(Robots.EXIT_REACTIONS).toContain(during?.kind)
  expect(after).toBeUndefined()
})

test('reaction lets the most recent event win and varies across agent ids', async () => {
  // Arrange
  const older = { ...SceneFixture.agent('a', 'x', '', 30), status: 'completed' as const, endedAt: SceneFixture.NOW - 900 }
  const newer = SceneFixture.agent('b', 'y', '', 0.2)
  const kinds = new Set(Array.from({ length: 12 }, (_, i) => Scene.reaction([SceneFixture.agent(`agent-${i}`, 'z', '', 0.5)], SceneFixture.NOW)?.kind))

  // Act
  const reaction = Scene.reaction([older, newer], SceneFixture.NOW)

  // Assert
  expect(Robots.SPAWN_REACTIONS).toContain(reaction?.kind)
  expect(kinds.size).toBeGreaterThanOrEqual(2)
})

test('graph places two agents at the same height whatever the date', async () => {
  // Arrange
  const agents = [SceneFixture.agent('a', 'architect', '', 100), SceneFixture.agent('b', 'dotnet-expert', '', 90)]
  const dates = [new Date(2026, 5, 1, 12, 0), new Date(2026, 9, 31, 12, 0), new Date(2026, 11, 24, 12, 0)]

  for (const date of dates) {
    // Act
    const { positions } = SceneFixture.render(agents, 84, Scene.graphRows(84, 70), date, false)

    // Assert
    expect(Math.abs((positions.get('a')?.y ?? 0) - (positions.get('b')?.y ?? 99))).toBeLessThan(0.5)
  }
})

test('graph puts a single agent beside the avatar at the largest size the avatar allows inside the canvas', async () => {
  // Arrange
  const agents = [SceneFixture.agent('a', 'architect', '', 100)]
  const rows = Scene.graphRows(84, 70)

  for (const date of [new Date(2026, 5, 1, 12, 0), new Date(2026, 9, 31, 12, 0)]) {
    // Act
    const { positions } = SceneFixture.render(agents, 84, rows, date, false)

    // Assert
    const p = positions.get('a') ?? { x: 0, y: 0 }
    const scale = SceneFixture.scaleOf(positions, ['a'], 84)
    expect(Math.abs(p.x - 42)).toBeGreaterThan(10)
    expect(scale).toBeGreaterThanOrEqual(0.74)
    expect(scale).toBeLessThanOrEqual(0.76)
    expect(p.y - (Robots.HEIGHT * scale) / 2).toBeGreaterThanOrEqual(0)
  }
})

test('graph never draws a robot larger than the avatar allows whatever the number of agents', async () => {
  for (const n of [1, 2, 3, 6]) {
    // Arrange
    const agents = Array.from({ length: n }, (_, i) => SceneFixture.agent(`r${i}`, 'architect', '', 100 - i))

    // Act
    const { positions } = SceneFixture.render(agents, 120, Scene.graphRows(120, 70), new Date(2026, 5, 1, 12, 0), false)

    // Assert
    expect(`${n}:${SceneFixture.scaleOf(positions, agents.map(a => a.id), 120) <= 0.76}`).toBe(`${n}:true`)
  }
})

test('graph keeps the sub-agent robots at most 1.1 in quad mode', async () => {
  // Arrange
  const agents = [SceneFixture.agent('a', 'architect', '', 100)]

  // Act
  const { positions } = SceneFixture.render(agents, 120, Scene.graphRows(120, 70), new Date(2026, 5, 1, 12, 0), false)

  // Assert
  expect(SceneFixture.scaleOf(positions, ['a'], 120)).toBeLessThan(1.11)
})

test('graph keeps a leaving robot as an obstacle until its exit ends', async () => {
  // Arrange
  const date = new Date(2026, 5, 1, 12, 0)
  const running = SceneFixture.agent('a', 'architect', '', 100)
  const leaving = { ...SceneFixture.agent('b', 'dotnet-expert', '', 100), status: 'completed' as const, endedAt: SceneFixture.NOW - 1000 }
  const gone = { ...leaving, endedAt: SceneFixture.NOW - 60_000 }
  const rows = Scene.graphRows(84, 70)
  const count = (agents: FlowAgent[]): number => SceneFixture.obstacles(agents, 84, rows, date, new Map()).length

  // Act
  const withLeaving = count([running, leaving])
  const withRunning = count([running])
  const afterExit = count([running, gone])

  // Assert
  expect(withLeaving).toBeGreaterThan(withRunning)
  expect(afterExit).toBe(withRunning)
})

test('graph pops a tool bubble above a robot that called a tool 0.4 s ago', async () => {
  // Arrange
  const agents = [SceneFixture.agent('a', 'architect', '', 100)]
  const positions = new Map<string, Point>()
  const quiet = SceneFixture.cells(agents, [], positions)
  const robot = positions.get('a') ?? { x: 0, y: 0 }
  const head = robot.y - Robots.HEIGHT / 2

  // Act
  const busy = SceneFixture.cells(agents, [SceneFixture.event(1, 'a', 'tool', 'Read foo.ts', 400)], new Map())

  // Assert
  const changed = SceneFixture.changedCells(quiet, busy, 84)
  expect(changed.some(c => c.y < head && Math.abs(c.x - robot.x) < 9)).toBe(true)
})

test('graph pops a tool bubble above the avatar for a main agent tool call', async () => {
  // Arrange
  const agents = [SceneFixture.agent('a', 'architect', '', 100)]
  const quiet = SceneFixture.cells(agents, [], new Map())

  // Act
  const busy = SceneFixture.cells(agents, [SceneFixture.event(1, '', 'tool', '$ npm test', 400)], new Map())

  // Assert
  const changed = SceneFixture.changedCells(quiet, busy, 84)
  expect(changed.some(c => Math.abs(c.x - 42) < 8)).toBe(true)
})

test('graph draws no tool bubble once the tool call is older than the bubble lifetime', async () => {
  // Arrange
  const agents = [SceneFixture.agent('a', 'architect', '', 100)]
  const expired = [SceneFixture.event(1, '', 'tool', 'Read foo.ts', Scene.BUBBLE_MS + 50)]

  // Act
  const quiet = SceneFixture.cells(agents, [], new Map())
  const later = SceneFixture.cells(agents, expired, new Map())

  // Assert
  expect(SceneFixture.changedCells(quiet, later, 84)).toHaveLength(0)
})

test('packetColor follows the kind of the latest tool and falls back to the agent accent', async () => {
  // Arrange
  const agent = SceneFixture.agent('a', 'architect', '', 100)
  const events = [SceneFixture.event(1, 'a', 'tool', 'Read foo.ts', 3000), SceneFixture.event(2, 'b', 'tool', '$ ls', 2000), SceneFixture.event(3, 'a', 'tool', 'Edit foo.ts', 1000)]

  // Act
  const edit = Scene.packetColor(agent, Scene.latestTool('a', events, SceneFixture.NOW), false)
  const read = Scene.packetColor(agent, Scene.latestTool('a', events, SceneFixture.NOW - 2500), false)
  const none = Scene.packetColor(agent, Scene.latestTool('a', [], SceneFixture.NOW), false)

  // Assert
  expect(edit).toEqual(Scene.TOOL_COLORS.edit)
  expect(read).toEqual(Scene.TOOL_COLORS.read)
  expect(none).toEqual(Robots.accent('architect'))
})

test('gaze targets the robot with the most recent tool event within four seconds', async () => {
  // Arrange
  const targets = new Map<string, Point>([
    ['a', { x: 10, y: 20 }],
    ['b', { x: 70, y: 30 }],
  ])
  const events = [SceneFixture.event(1, 'a', 'tool', 'Read', 3000), SceneFixture.event(2, 'b', 'tool', 'Grep', 1000), SceneFixture.event(3, 'ghost', 'tool', 'Read', 200), SceneFixture.event(4, '', 'tool', 'Read', 100)]

  // Act
  const recent = Scene.gaze(events, SceneFixture.NOW, targets)
  const stale = Scene.gaze(events, SceneFixture.NOW + Scene.GAZE_MS + 100, targets)

  // Assert
  expect(recent).toEqual({ x: 70, y: 30 })
  expect(stale).toBeUndefined()
})

test('verifPulse turns green on OK, red on failure and fades after the pulse lifetime', async () => {
  // Arrange
  const ok = [SceneFixture.event(1, '', 'verif', 'Build, Tests OK (3s)', 400)]
  const ko = [SceneFixture.event(1, '', 'verif', 'Lint failed (2s)', 400)]
  const started = [SceneFixture.event(1, '', 'verif', 'Build started', 400)]

  // Act
  const green = Scene.verifPulse(ok, SceneFixture.NOW)
  const red = Scene.verifPulse(ko, SceneFixture.NOW)
  const neutral = Scene.verifPulse(started, SceneFixture.NOW)
  const gone = Scene.verifPulse(ok, SceneFixture.NOW + Scene.VERIF_PULSE_MS)

  // Assert
  expect(green?.color).toEqual(Theme.OK)
  expect(red?.color).toEqual(Theme.KO)
  expect(Math.abs((green?.t ?? 0) - 400 / Scene.VERIF_PULSE_MS)).toBeLessThan(1e-6)
  expect(neutral).toBeUndefined()
  expect(gone).toBeUndefined()
})

test('graph draws a visible shockwave around the avatar after a successful verification', async () => {
  // Arrange
  const agents = [SceneFixture.agent('a', 'architect', '', 100)]
  const quiet = SceneFixture.cells(agents, [], new Map())

  // Act
  const pulse = SceneFixture.cells(agents, [SceneFixture.event(1, '', 'verif', 'Tests OK (3s)', 500)], new Map())

  // Assert
  expect(SceneFixture.changedCells(quiet, pulse, 84).length).toBeGreaterThan(10)
})

class CableFixture {
  static readonly COLUMNS = 40
  static readonly ROWS = 10
  static readonly RED: Rgb = [255, 40, 40]

  static canvas(): Canvas {
    return new Canvas(CableFixture.COLUMNS, CableFixture.ROWS, 'hd')
  }

  static straight(): Cable {
    return Scene.cable({ x: 2, y: 10 }, { x: 14, y: 10 }, { x: 26, y: 10 }, { x: 38, y: 10 }, Theme.ACCENT, CableFixture.RED, 0.3)
  }

  static pixels(canvas: Canvas): Uint8Array {
    const encoded = canvas.encode()
    const raw = atob(encoded.kind === 'rgba' ? encoded.rgba : encoded.cells)
    return Uint8Array.from(raw, ch => ch.charCodeAt(0))
  }

  static pixel(data: Uint8Array, x: number, y: number): Rgb {
    const i = (Math.floor(y * (Canvas.HD_CELL_HEIGHT / 2)) * CableFixture.COLUMNS * Canvas.HD_CELL_WIDTH + Math.floor(x * Canvas.HD_CELL_WIDTH)) * 4
    return [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0]
  }

  static lit(data: Uint8Array, predicate: (x: number, y: number) => boolean): number {
    const width = CableFixture.COLUMNS * Canvas.HD_CELL_WIDTH
    let count = 0
    for (let i = 0; i < data.length; i += 4) {
      const p = i / 4
      const x = (p % width) / Canvas.HD_CELL_WIDTH
      const y = Math.floor(p / width) / (Canvas.HD_CELL_HEIGHT / 2)
      if ((data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0) > 60 && predicate(x, y)) count++
    }
    return count
  }

  static hit(age: number): ToolHit {
    return { event: SceneFixture.event(7, 'a', 'tool', '$ npm test', age), age }
  }
}

test('energyCable blends from the avatar teal to the robot accent along its length', async () => {
  // Arrange
  const canvas = CableFixture.canvas()

  // Act
  Scene.energyCable(canvas, CableFixture.straight(), SceneFixture.NOW, 0, 0)

  // Assert
  const data = CableFixture.pixels(canvas)
  const start = CableFixture.pixel(data, 6, 10)
  const end = CableFixture.pixel(data, 34, 10)
  expect(start[1]).toBeGreaterThan(start[0])
  expect(end[0]).toBeGreaterThan(end[1])
})

test('returnPacket travels back from the robot to the avatar between 0.35 s and 0.9 s after a tool call', async () => {
  // Arrange
  const cable = CableFixture.straight()
  const draw = (age: number): Uint8Array => {
    const canvas = CableFixture.canvas()
    Scene.returnPacket(canvas, cable, CableFixture.hit(age))
    return CableFixture.pixels(canvas)
  }

  // Act
  const early = draw(100)
  const leaving = draw(450)
  const arriving = draw(820)
  const gone = draw(950)

  // Assert
  expect(CableFixture.lit(early, () => true)).toBe(0)
  expect(CableFixture.lit(gone, () => true)).toBe(0)
  expect(CableFixture.lit(leaving, x => x > 26)).toBeGreaterThan(0)
  expect(CableFixture.lit(leaving, x => x < 14)).toBe(0)
  expect(CableFixture.lit(arriving, x => x < 14)).toBeGreaterThan(0)
  expect(CableFixture.lit(arriving, x => x > 26)).toBe(0)
})

test('dissolve breaks the cable into particles drifting away and fading over the finale', async () => {
  // Arrange
  const cable = CableFixture.straight()
  const draw = (t: number): Uint8Array => {
    const canvas = CableFixture.canvas()
    Scene.dissolve(canvas, cable, t, SceneFixture.NOW)
    return CableFixture.pixels(canvas)
  }

  // Act
  const start = draw(0.05)
  const middle = draw(0.6)
  const end = draw(1)

  // Assert
  expect(CableFixture.lit(start, (_, y) => y > 9 && y < 11)).toBeGreaterThan(0)
  expect(CableFixture.lit(middle, (_, y) => y < 8)).toBeGreaterThan(0)
  expect(CableFixture.lit(middle, (_, y) => y < 8)).toBeGreaterThan(CableFixture.lit(start, (_, y) => y < 8))
  expect(CableFixture.lit(end, () => true)).toBe(0)
})

test('hover keeps every robot within one unit of its slot and desynchronises robots', async () => {
  // Arrange
  const seeds = [0, 0.13, 0.5, 0.77, 0.99]
  const times = Array.from({ length: 400 }, (_, i) => SceneFixture.NOW + i * 97)

  // Act
  const offsets = seeds.map(seed => times.map(at => Scene.hover(seed, at)))

  // Assert
  for (const series of offsets) {
    for (const o of series) {
      expect(Math.abs(o.x)).toBeLessThanOrEqual(1)
      expect(Math.abs(o.y)).toBeLessThanOrEqual(1)
    }
    expect(Math.max(...series.map(o => o.y)) - Math.min(...series.map(o => o.y))).toBeGreaterThan(0.3)
  }
  expect(offsets[0]?.[0]).not.toEqual(offsets[2]?.[0])
})

test('graph sizes robots the same on Halloween as on a plain day because robots wear no hat', async () => {
  // Arrange
  const rows = Scene.graphRows(84, 60)
  const agents = Array.from({ length: 4 }, (_, i) => SceneFixture.agent(`a${i}`, `type-${i}`, '', 100 - i))
  const ids = agents.map(a => a.id)

  // Act
  const halloween = SceneFixture.render(agents, 84, rows, new Date(2026, 9, 31, 12, 0), false)
  const plain = SceneFixture.render(agents, 84, rows, new Date(2026, 5, 1, 12, 0), false)

  // Assert
  expect(Math.abs(SceneFixture.scaleOf(halloween.positions, ids, 84) - SceneFixture.scaleOf(plain.positions, ids, 84))).toBeLessThan(0.001)
})

test('graph lands a freshly spawned robot on its slot after flying out of the avatar', async () => {
  // Arrange
  const agent = { ...SceneFixture.agent('a', 'architect', '', 0), startedAt: SceneFixture.NOW }
  const at = (ms: number): Point => {
    const positions = new Map<string, Point>()
    Scene.graph({ ...SceneFixture.input([agent], SceneFixture.NOW + ms, ms / 16, 16, true, 0, positions), isLive: false })
    return positions.get('a') ?? { x: Number.NaN, y: Number.NaN }
  }
  const slot = at(5_000)

  // Act
  const launch = at(30)
  const landed = at(1_500)

  // Assert
  expect(Math.hypot(launch.x - 42, launch.y - slot.y)).toBeLessThan(Math.hypot(slot.x - 42, 0))
  expect(Math.abs(launch.x - 42)).toBeLessThan(Math.abs(slot.x - 42))
  expect(landed).toEqual(slot)
})
