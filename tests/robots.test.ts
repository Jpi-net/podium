import { expect, test } from 'claude-code/testing'
import { Canvas, type RenderMode, type Rgb } from '../hooks/canvas'
import { Robots, type OrchestratorReaction, type OrchestratorState, type RobotInput, type RobotMood, type RobotQuirk } from '../hooks/robots'

class RobotsFixture {
  static readonly TYPES = [
    'general-purpose',
    'architect',
    'debugger',
    'Plan',
    'Explore',
    'dotnet-expert',
    'angular-expert',
    'mssql-expert',
    'test-expert',
    'e2e-expert',
    'ux-ui-expert',
    'docker-expert',
    'proxy-generator',
    'lint-runner',
    'code-reviewer',
    'security-reviewer',
    'doc-writer',
    'git-writer',
    'fork',
    'some-unknown-agent',
  ]
  static readonly MOODS: readonly RobotMood[] = ['working', 'idle', 'done', 'failed', 'killed']
  static readonly MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', '']

  static sheet(mode: RenderMode, frame: number): Canvas {
    const canvas = new Canvas(16 * RobotsFixture.MOODS.length, 8 * RobotsFixture.TYPES.length, mode)
    canvas.paint(() => [7, 10, 20])
    RobotsFixture.TYPES.forEach((type, i) =>
      RobotsFixture.MOODS.forEach((mood, j) =>
        Robots.draw(canvas, 16 * j + 8, 16 * i + 8, 1, {
          type,
          model: RobotsFixture.MODELS[i % RobotsFixture.MODELS.length] ?? '',
          mood,
          frame,
          flash: i % 2 === 0 ? 1 : 0,
          seed: i / RobotsFixture.TYPES.length,
        }),
      ),
    )
    return canvas
  }

  static avatar(mode: RenderMode, frame: number, state: 'working' | 'idle' | 'asleep'): Canvas {
    Robots.wear('')
    const canvas = new Canvas(40, 24, mode)
    canvas.paint(() => [7, 10, 20])
    Robots.drawOrchestrator(canvas, 20, 12, 0.9, frame, state)
    return canvas
  }

  static reacting(mode: RenderMode, state: OrchestratorState, reaction?: OrchestratorReaction, scale = 0.9): string {
    const canvas = new Canvas(40, 24, mode)
    canvas.paint(() => [7, 10, 20])
    Robots.drawOrchestrator(canvas, 20, 12, scale, 10, state, reaction)
    const encoded = canvas.encode()
    return encoded.kind === 'cells' ? encoded.cells : encoded.rgba
  }

  static drawn(mode: RenderMode, scale: number, reaction?: OrchestratorReaction): Canvas {
    const canvas = new Canvas(40, 24, mode)
    canvas.paint(() => [7, 10, 20])
    Robots.drawOrchestrator(canvas, 20, 12, scale, 10, 'idle', reaction)
    return canvas
  }

  static cellWords(canvas: Canvas): Uint32Array {
    const encoded = canvas.encode()
    if (encoded.kind !== 'cells') return new Uint32Array(0)
    const bytes = Uint8Array.from(atob(encoded.cells), c => c.charCodeAt(0))
    return new Uint32Array(bytes.buffer)
  }

  static changedCells(a: Uint32Array, b: Uint32Array): number {
    let count = 0
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) count++
    return count
  }

  static occupiedCells(canvas: Canvas, blank: Uint32Array): number {
    return RobotsFixture.changedCells(RobotsFixture.cellWords(canvas), blank)
  }

  static hash(text: string): number {
    let h = 2166136261
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0
    return h
  }

  static quadHash(state: 'working' | 'idle' | 'asleep', frame: number): number {
    const encoded = RobotsFixture.avatar('quad', frame, state).encode()
    return RobotsFixture.hash(encoded.kind === 'cells' ? encoded.cells : '')
  }

  static robot(scale: number, input: Partial<RobotInput>): Uint32Array {
    const canvas = new Canvas(30, 16, 'quad')
    canvas.paint(() => [7, 10, 20])
    Robots.draw(canvas, 15, 16, scale, { type: 'general-purpose', model: 'claude-sonnet-5-5', mood: 'working', frame: 12, flash: 0, seed: 0.3, ...input }, null)
    return RobotsFixture.cellWords(canvas)
  }

  static blank(): Uint32Array {
    const canvas = new Canvas(30, 16, 'quad')
    canvas.paint(() => [7, 10, 20])
    return RobotsFixture.cellWords(canvas)
  }

  static brightTealCells(words: Uint32Array, columns: number, rows: readonly number[], cols: readonly number[]): number {
    let count = 0
    for (const r of rows) {
      for (const c of cols) {
        const i = (r * columns + c) * 3
        for (const v of [words[i + 1] ?? 0, words[i + 2] ?? 0]) if (((v >> 8) & 255) >= 200 && ((v >> 16) & 255) <= 170) count++
      }
    }
    return count
  }

  static quirky(mode: RenderMode, type: string, mood: RobotMood, quirk: RobotQuirk | null): string {
    return RobotsFixture.cells(mode, canvas => Robots.draw(canvas, 10, 10, 0.9, { type, model: 'claude-sonnet-5-5', mood, frame: 40, flash: 0, seed: 0.3 }, quirk))
  }

  static gazing(mode: RenderMode, x: number): string {
    const canvas = new Canvas(40, 24, mode)
    canvas.paint(() => [7, 10, 20])
    Robots.drawOrchestrator(canvas, 20, 12, 0.9, 10, 'idle', undefined, { x, y: 12 })
    canvas.paint(() => [7, 10, 20])
    Robots.drawOrchestrator(canvas, 20, 12, 0.9, 10, 'idle', undefined, { x, y: 12 })
    const encoded = canvas.encode()
    return encoded.kind === 'cells' ? encoded.cells : encoded.rgba
  }

  static cells(mode: RenderMode, draw: (canvas: Canvas) => void): string {
    const canvas = new Canvas(20, 10, mode)
    canvas.paint(() => [7, 10, 20])
    draw(canvas)
    const encoded = canvas.encode()
    return encoded.kind === 'cells' ? encoded.cells : encoded.rgba
  }
}

test('draws every robot type in every mood in quad at small and regular scales', () => {
  // Arrange
  const blank = RobotsFixture.blank()
  const drawn: string[] = []

  // Act
  for (const scale of [0.6, 1]) {
    for (const type of RobotsFixture.TYPES) {
      for (const mood of RobotsFixture.MOODS) {
        const occupied = RobotsFixture.changedCells(blank, RobotsFixture.robot(scale, { type, mood }))
        drawn.push(`${scale}:${type}:${mood}:${occupied >= 20}`)
      }
    }
  }

  // Assert
  expect(drawn.filter(d => d.endsWith('false'))).toEqual([])
})

test('draws the full sheet of robots in hd without failing', () => {
  for (const frame of [0, 1, 37.25, 1000.5]) {
    // Act
    const encoded = RobotsFixture.sheet('hd', frame).encode()

    // Assert
    expect(encoded.kind).toBe('rgba')
  }
})

test('gives every robot type its own drawing at small and regular scales', () => {
  for (const scale of [0.6, 1]) {
    // Arrange
    const drawings = RobotsFixture.TYPES.map(type => RobotsFixture.robot(scale, { type, mood: 'idle', model: '' }))
    const close: string[] = []

    // Act
    drawings.forEach((a, i) =>
      drawings.forEach((b, j) => {
        if (j > i && RobotsFixture.changedCells(a, b) < 8) close.push(`${scale}:${RobotsFixture.TYPES[i]}~${RobotsFixture.TYPES[j]}`)
      }),
    )

    // Assert
    expect(close).toEqual([])
  }
})

test('changes the drawing with thrust, tilt and squash', () => {
  for (const scale of [0.6, 1]) {
    // Arrange
    const rest = RobotsFixture.robot(scale, { type: 'architect' })

    // Act
    const boosted = RobotsFixture.robot(scale, { type: 'architect', thrust: 1 })
    const leaning = RobotsFixture.robot(scale, { type: 'architect', tilt: 0.4 })
    const squashed = RobotsFixture.robot(scale, { type: 'architect', squash: 1 })
    const stretched = RobotsFixture.robot(scale, { type: 'architect', squash: -1 })

    // Assert
    expect(RobotsFixture.changedCells(rest, boosted) > 0).toBe(true)
    expect(RobotsFixture.changedCells(rest, leaning) > 0).toBe(true)
    expect(RobotsFixture.changedCells(rest, squashed) > 0).toBe(true)
    expect(RobotsFixture.changedCells(rest, stretched) > 0).toBe(true)
    expect(RobotsFixture.changedCells(squashed, stretched) > 0).toBe(true)
  }
})

test('draws the holographic screen in the tool colour only while working', () => {
  // Arrange
  const tool: Rgb = [255, 60, 200]

  // Act
  const working = RobotsFixture.robot(1, { type: 'debugger', mood: 'working' })
  const tinted = RobotsFixture.robot(1, { type: 'debugger', mood: 'working', toolColor: tool })
  const idle = RobotsFixture.robot(1, { type: 'debugger', mood: 'idle' })
  const idleTinted = RobotsFixture.robot(1, { type: 'debugger', mood: 'idle', toolColor: tool })

  // Assert
  expect(RobotsFixture.changedCells(working, tinted) >= 4).toBe(true)
  expect(RobotsFixture.changedCells(idle, idleTinted)).toBe(0)
})

test('taps the hands when a working robot flashes', () => {
  // Act
  const calm = RobotsFixture.robot(1, { type: 'git-writer', flash: 0 })
  const tapping = RobotsFixture.robot(1, { type: 'git-writer', flash: 0.8 })

  // Assert
  expect(RobotsFixture.changedCells(calm, tapping) > 0).toBe(true)
})

test('keeps every robot within its declared extent', () => {
  for (const scale of [0.6, 1]) {
    // Arrange
    const extent = Robots.extent(scale)
    const blank = RobotsFixture.blank()
    const outside: string[] = []

    // Act
    for (const type of RobotsFixture.TYPES) {
      for (const mood of ['working', 'idle', 'done', 'killed'] as const) {
        const words = RobotsFixture.robot(scale, { type, mood, thrust: 1 })
        for (let r = 0; r < 16; r++) {
          for (let c = 0; c < 30; c++) {
            const i = (r * 30 + c) * 3
            if (words[i] === blank[i] && words[i + 1] === blank[i + 1] && words[i + 2] === blank[i + 2]) continue
            if (16 - r * 2 > extent.up + 1 || r * 2 - 16 > extent.down + 1 || Math.abs(c + 0.5 - 15) > extent.half + 1) outside.push(`${scale}:${type}:${mood}:${r}:${c}`)
          }
        }
      }
    }

    // Assert
    expect(outside).toEqual([])
  }
})

test('draws the orchestrator avatar in every state in quad and hd', () => {
  for (const mode of ['quad', 'hd'] as const) {
    for (const state of ['working', 'idle', 'asleep'] as const) {
      // Arrange
      const blank = RobotsFixture.cells(mode, () => undefined)

      // Act
      const drawn = RobotsFixture.cells(mode, canvas => Robots.drawOrchestrator(canvas, 10, 10, 0.5, 3, state))

      // Assert
      expect(drawn === blank).toBe(false)
    }
  }
})

test('draws the sleeping orchestrator differently from the working one', () => {
  for (const mode of ['quad', 'hd'] as const) {
    // Act
    const working = RobotsFixture.cells(mode, canvas => Robots.drawOrchestrator(canvas, 10, 10, 0.5, 20, 'working'))
    const asleep = RobotsFixture.cells(mode, canvas => Robots.drawOrchestrator(canvas, 10, 10, 0.5, 20, 'asleep'))

    // Assert
    expect(working === asleep).toBe(false)
  }
})

test('animates the working orchestrator smoothly between fractional frames', () => {
  // Arrange
  const at = (frame: number): string => RobotsFixture.cells('hd', canvas => Robots.drawOrchestrator(canvas, 10, 10, 0.5, frame, 'working'))

  // Act
  const whole = at(10)
  const half = at(10.5)

  // Assert
  expect(whole === half).toBe(false)
})

test('places the top of the avatar hair above its centre', () => {
  // Act
  const top = Robots.orchestratorTop(10, 1)

  // Assert
  expect(top < 10).toBe(true)
  expect(top > 10 - Robots.AVATAR_ROWS).toBe(true)
})

test('a working robot animates between consecutive quad frames while a killed one stays still', () => {
  // Arrange
  const at = (mood: RobotMood, frame: number): string =>
    RobotsFixture.cells('quad', canvas => Robots.draw(canvas, 10, 10, 1, { type: 'test-expert', model: 'claude-sonnet-5-5', mood, frame, flash: 0, seed: 0.3 }))

  // Act
  const working = [at('working', 10), at('working', 11), at('working', 12)]
  const killed = [at('killed', 10), at('killed', 11), at('killed', 12)]

  // Assert
  expect(working[0] === working[1]).toBe(false)
  expect(working[1] === working[2]).toBe(false)
  expect(killed[0]).toBe(killed[1])
  expect(killed[1]).toBe(killed[2])
})

test('gives each known type its own accent and a stable accent to unknown types', () => {
  const known = RobotsFixture.TYPES.slice(0, 19).map(type => Robots.accent(type).join(','))
  expect(new Set(known).size).toBe(known.length)
  expect(Robots.accent('some-unknown-agent')).toEqual(Robots.accent('some-unknown-agent'))
  expect(Robots.accent('plan')).toEqual(Robots.accent('Plan'))
  expect(Robots.accent('plugin:code-reviewer')).toEqual(Robots.accent('code-reviewer'))
})

test('declares a bounding box of 14 by 15 units', () => {
  // Assert
  expect(Robots.WIDTH).toBe(14)
  expect(Robots.HEIGHT).toBe(15)
})

test('keeps the resting orchestrator avatar stable between consecutive quad frames outside idle quirks', () => {
  // Arrange
  const blank = RobotsFixture.cellWords(RobotsFixture.avatar('quad', 0, 'idle'))
  const empty = RobotsFixture.cellWords(new Canvas(40, 24, 'quad'))
  const sampled: number[] = []
  for (let f = 0; f < 120; f += 3) sampled.push(f, f + 0.4)
  let total = 0
  let samples = 0

  // Act
  const quirking = sampled.filter(f => Robots.orchestratorQuirk(f, 'idle') !== null)
  for (let f = 0; f < 120; f += 3) {
    total += RobotsFixture.changedCells(RobotsFixture.cellWords(RobotsFixture.avatar('quad', f, 'idle')), RobotsFixture.cellWords(RobotsFixture.avatar('quad', f + 0.4, 'idle')))
    samples++
  }

  // Assert
  expect(quirking).toEqual([])
  expect(blank.length).toBe(empty.length)
  expect(total / samples < 5).toBe(true)
})

test('still moves the resting orchestrator avatar over a breathing cycle in quad', () => {
  // Arrange
  const distinct = new Set<string>()

  // Act
  for (let f = 0; f < 80; f += 1) distinct.add(RobotsFixture.cellWords(RobotsFixture.avatar('quad', f, 'idle')).join(','))

  // Assert
  expect(distinct.size >= 2).toBe(true)
})

test('keeps the quad orchestrator output identical to the recorded snapshots', () => {
  // Act
  const avatars = (['working', 'idle', 'asleep'] as const).flatMap(state => [0, 13.4, 57.25].map(frame => RobotsFixture.quadHash(state, frame)))

  // Assert
  expect(avatars).toEqual([1743643156, 389297112, 1248376195, 2099133378, 826802884, 2099133378, 3756085810, 3071726439, 921630721])
})

test('exposes a quad boost for the orchestrator avatar', () => {
  // Assert
  expect(Robots.ORCHESTRATOR_QUAD_BOOST).toBe(1.25)
})

test('draws no microphone on the chin of the quad orchestrator avatar', () => {
  // Arrange
  const frames = [0, 2.2, 4.5, 6.7]

  // Act
  const bright = frames.map(frame => RobotsFixture.brightTealCells(RobotsFixture.cellWords(RobotsFixture.avatar('quad', frame, 'working')), 40, [7, 8, 9], [17, 18, 19]))

  // Assert
  expect(bright).toEqual([0, 0, 0, 0])
})

test('offers at least six distinct spawn and exit reactions lasting about a second and a half', () => {
  // Arrange
  const spawn = new Set(Robots.SPAWN_REACTIONS)
  const exit = new Set(Robots.EXIT_REACTIONS)

  // Assert
  expect(spawn.size >= 6).toBe(true)
  expect(exit.size >= 6).toBe(true)
  expect(spawn.size).toBe(Robots.SPAWN_REACTIONS.length)
  expect(exit.size).toBe(Robots.EXIT_REACTIONS.length)
  expect(Robots.REACTION_MS >= 1200 && Robots.REACTION_MS <= 2000).toBe(true)
})

test('draws every reaction differently from the resting avatar halfway through in quad and hd', () => {
  for (const mode of ['quad', 'hd'] as const) {
    // Arrange
    const rest = RobotsFixture.reacting(mode, 'idle')

    for (const kind of [...Robots.SPAWN_REACTIONS, ...Robots.EXIT_REACTIONS]) {
      // Act
      const drawn = RobotsFixture.reacting(mode, 'idle', { kind, t: 0.5 })

      // Assert
      expect(`${mode}:${kind}:${drawn === rest}`).toBe(`${mode}:${kind}:false`)
    }
  }
})

test('changes at least twelve cells for every reaction halfway through in quad', () => {
  for (const scale of [0.9, 1.0, 1.1]) {
    // Arrange
    const rest = RobotsFixture.cellWords(RobotsFixture.drawn('quad', scale))

    for (const kind of [...Robots.SPAWN_REACTIONS, ...Robots.EXIT_REACTIONS]) {
      // Act
      const changed = RobotsFixture.changedCells(rest, RobotsFixture.cellWords(RobotsFixture.drawn('quad', scale, { kind, t: 0.5 })))

      // Assert
      expect(`${scale}:${kind}:${changed >= 12}`).toBe(`${scale}:${kind}:true`)
    }
  }
})

test('eases every reaction in and out so that its start and end match the resting avatar', () => {
  for (const mode of ['quad', 'hd'] as const) {
    for (const state of ['working', 'idle', 'asleep'] as const) {
      // Arrange
      const rest = RobotsFixture.reacting(mode, state)

      for (const kind of [...Robots.SPAWN_REACTIONS, ...Robots.EXIT_REACTIONS]) {
        // Act
        const start = RobotsFixture.reacting(mode, state, { kind, t: 0 })
        const end = RobotsFixture.reacting(mode, state, { kind, t: 1 })

        // Assert
        expect(`${mode}:${state}:${kind}:${start === rest}:${end === rest}`).toBe(`${mode}:${state}:${kind}:true:true`)
      }
    }
  }
})

test('wakes the sleeping avatar for the duration of a reaction', () => {
  for (const mode of ['quad', 'hd'] as const) {
    // Arrange
    const asleep = RobotsFixture.reacting(mode, 'asleep')

    // Act
    const nodding = RobotsFixture.reacting(mode, 'asleep', { kind: 'nod', t: 0.5 })

    // Assert
    expect(nodding === asleep).toBe(false)
  }
})

test('ignores an unknown reaction kind', () => {
  for (const mode of ['quad', 'hd'] as const) {
    // Arrange
    const rest = RobotsFixture.reacting(mode, 'working')

    // Act
    const drawn = RobotsFixture.reacting(mode, 'working', { kind: 'moonwalk', t: 0.5 })

    // Assert
    expect(drawn).toBe(rest)
  }
})

test('offers a pool of robot quirks and avatar idle quirks lasting one to three seconds', () => {
  // Assert
  expect(new Set(Robots.ROBOT_QUIRKS).size).toBe(8)
  expect(new Set(Robots.IDLE_QUIRKS).size).toBe(Robots.IDLE_QUIRKS.length)
  expect(Robots.IDLE_QUIRKS.length >= 9).toBe(true)
  expect(Robots.ROBOT_QUIRK_FRAMES / 12.5 >= 1.2 && Robots.ROBOT_QUIRK_FRAMES / 12.5 <= 2).toBe(true)
  expect(Robots.IDLE_QUIRK_FRAMES / 12.5 >= 1.5 && Robots.IDLE_QUIRK_FRAMES / 12.5 <= 3).toBe(true)
})

test('draws every robot quirk differently from the resting robot halfway through in quad and hd', () => {
  for (const mode of ['quad', 'hd'] as const) {
    for (const mood of ['working', 'idle'] as const) {
      for (const type of ['general-purpose', 'test-expert', 'docker-expert', 'lint-runner', 'security-reviewer', 'fork']) {
        // Arrange
        const rest = RobotsFixture.quirky(mode, type, mood, null)

        for (const kind of Robots.ROBOT_QUIRKS) {
          // Act
          const drawn = RobotsFixture.quirky(mode, type, mood, { kind, t: 0.5 })

          // Assert
          expect(`${mode}:${mood}:${type}:${kind}:${drawn === rest}`).toBe(`${mode}:${mood}:${type}:${kind}:false`)
        }
      }
    }
  }
})

test('schedules robot quirks every fifteen to thirty seconds or so and never when done, failed or killed', () => {
  // Arrange
  const lively: number[] = []
  const quiet: number[] = []

  // Act
  for (const seed of [0, 0.13, 0.5, 0.77]) {
    let starts = 0
    let was = false
    for (let frame = 0; frame < 12.5 * 300; frame += 0.5) {
      const on = Robots.quirk({ type: 'architect', model: '', mood: 'working', frame, flash: 0, seed }) !== null
      if (on && !was) starts++
      was = on
      for (const mood of ['done', 'failed', 'killed'] as const) if (Robots.quirk({ type: 'architect', model: '', mood, frame, flash: 0, seed }) !== null) quiet.push(frame)
    }
    lively.push(starts)
  }

  // Assert
  expect(lively.every(n => n >= 8 && n <= 20)).toBe(true)
  expect(quiet).toEqual([])
})

test('ignores a forced quirk on a done or killed robot', () => {
  for (const mode of ['quad', 'hd'] as const) {
    for (const mood of ['done', 'killed'] as const) {
      // Arrange
      const rest = RobotsFixture.quirky(mode, 'test-expert', mood, null)

      for (const kind of Robots.ROBOT_QUIRKS) {
        // Act
        const drawn = RobotsFixture.quirky(mode, 'test-expert', mood, { kind, t: 0.5 })

        // Assert
        expect(`${mode}:${mood}:${kind}:${drawn === rest}`).toBe(`${mode}:${mood}:${kind}:true`)
      }
    }
  }
})

test('moves the avatar pupils toward a gaze on the left or on the right in quad and hd', () => {
  for (const mode of ['quad', 'hd'] as const) {
    // Arrange
    const rest = RobotsFixture.reacting(mode, 'idle')

    // Act
    const left = RobotsFixture.gazing(mode, -20)
    const right = RobotsFixture.gazing(mode, 60)

    // Assert
    expect(left === right).toBe(false)
    expect(left === rest).toBe(false)
    expect(right === rest).toBe(false)
  }
})

test('keeps the avatar output unchanged without a gaze after a gaze was drawn', () => {
  // Arrange
  const before = RobotsFixture.quadHash('working', 13.4)
  RobotsFixture.gazing('hd', -20)

  // Act
  const after = RobotsFixture.quadHash('working', 13.4)

  // Assert
  expect(after).toBe(before)
})

test('shows an idle quirk on the resting avatar within sixty seconds but never while working or asleep', () => {
  // Arrange
  const idle = new Set<string>()
  const busy: number[] = []

  // Act
  for (let frame = 0; frame < 12.5 * 60; frame += 0.5) {
    const quirk = Robots.orchestratorQuirk(frame, 'idle')
    if (quirk) idle.add(quirk.kind)
    if (Robots.orchestratorQuirk(frame, 'working') || Robots.orchestratorQuirk(frame, 'asleep')) busy.push(frame)
  }

  // Assert
  expect(idle.size >= 1).toBe(true)
  expect(busy).toEqual([])
})

test('draws every avatar idle quirk differently from the resting avatar halfway through in quad and hd', () => {
  for (const mode of ['quad', 'hd'] as const) {
    // Arrange
    const rest = RobotsFixture.reacting(mode, 'idle')

    for (const kind of Robots.IDLE_QUIRKS) {
      // Act
      const drawn = RobotsFixture.reacting(mode, 'idle', { kind, t: 0.5 })

      // Assert
      expect(`${mode}:${kind}:${drawn === rest}`).toBe(`${mode}:${kind}:false`)
    }
  }
})

test('changes at least ten cells for every avatar idle quirk halfway through in quad', () => {
  for (const scale of [0.9, 1.1]) {
    // Arrange
    const rest = RobotsFixture.cellWords(RobotsFixture.drawn('quad', scale))

    for (const kind of Robots.IDLE_QUIRKS) {
      // Act
      const changed = RobotsFixture.changedCells(rest, RobotsFixture.cellWords(RobotsFixture.drawn('quad', scale, { kind, t: 0.5 })))

      // Assert
      expect(`${scale}:${kind}:${changed >= 10}`).toBe(`${scale}:${kind}:true`)
    }
  }
})
