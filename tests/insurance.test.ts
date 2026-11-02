import { expect, test } from 'claude-code/testing'
import { Effects } from '../hooks/effects'
import { Insurance } from '../hooks/insurance'
import { Scene, type SceneInput } from '../hooks/scene'
import type { FlowAgent, FlowEvent, FlowEventKind } from '../types'

class InsuranceFixture {
  static readonly NOW = 1_800_000_000_000

  static event(id: number, agoMs: number, kind: FlowEventKind, label: string, isError = false): FlowEvent {
    return { id, at: InsuranceFixture.NOW - agoMs, agentId: '', kind, label, isError }
  }

  static agent(id: string, type: string, status: FlowAgent['status'], endedAgoMs: number): FlowAgent {
    return {
      id,
      type,
      description: '',
      model: 'claude-sonnet-5-5',
      parentId: '',
      status,
      startedAt: InsuranceFixture.NOW - 60_000,
      endedAt: status === 'running' ? 0 : InsuranceFixture.NOW - endedAgoMs,
      tool: '',
      toolCount: 0,
      files: [],
      tokensIn: 0,
      tokensOut: 0,
    }
  }

  static input(agents: FlowAgent[], events: FlowEvent[], secured: ReadonlySet<string>, holiday: Date): SceneInput {
    return {
      agents,
      events,
      main: { tool: '', toolCount: 0, isBusy: true, busySince: InsuranceFixture.NOW - 60_000, model: 'claude-opus-5-5' },
      at: InsuranceFixture.NOW,
      isLive: false,
      frame: 10,
      dt: 0,
      pulses: new Map(),
      columns: 84,
      rows: 32,
      mode: 'quad',
      ambience: Effects.ambience(holiday, false, 0, false, []),
      positions: new Map(),
      business: { branch: '', wi: '', secured },
    }
  }

  static cells(input: SceneInput): string {
    const encoded = Scene.graph(input).encoded
    return encoded.kind === 'cells' ? encoded.cells : ''
  }

  static text(input: SceneInput): string {
    const bytes = Uint8Array.from(atob(InsuranceFixture.cells(input)), c => c.charCodeAt(0))
    const words = new Uint32Array(bytes.buffer)
    let out = ''
    for (let i = 0; i < words.length; i += 3) {
      const code = words[i] ?? 0x20
      out += code >= 0x20 && code < 0x2500 ? String.fromCharCode(code) : ' '
    }
    return out
  }
}

test('makes it rain while the latest verification failed and clears up after a green one', () => {
  // Arrange
  const failed = [InsuranceFixture.event(1, 5000, 'verif', 'build failed (12 s)', true)]
  const launched = [...failed, InsuranceFixture.event(2, 1000, 'verif', 'build started', false)]
  const fixed = [...failed, InsuranceFixture.event(3, 500, 'verif', 'build OK (10 s)', false)]
  const longFixed = [...failed, InsuranceFixture.event(3, Insurance.CLEAR_MS + 100, 'verif', 'build OK (10 s)', false)]

  // Act
  const rain = Insurance.weather(failed, InsuranceFixture.NOW)
  const stillRain = Insurance.weather(launched, InsuranceFixture.NOW)
  const clearing = Insurance.weather(fixed, InsuranceFixture.NOW)
  const clear = Insurance.weather(longFixed, InsuranceFixture.NOW)
  const none = Insurance.weather([], InsuranceFixture.NOW)

  // Assert
  expect(rain).toEqual({ isRaining: true, clearing: -1 })
  expect(stillRain.isRaining).toBe(true)
  expect(clearing.isRaining).toBe(false)
  expect(clearing.clearing > 0 && clearing.clearing < 1).toBe(true)
  expect(clear).toEqual({ isRaining: false, clearing: -1 })
  expect(none).toEqual({ isRaining: false, clearing: -1 })
})

test('does not show the rainbow after a green verification that followed another green one', () => {
  // Arrange
  const events = [InsuranceFixture.event(1, 9000, 'verif', 'lint OK (3 s)'), InsuranceFixture.event(2, 400, 'verif', 'build OK (10 s)')]

  // Act
  const weather = Insurance.weather(events, InsuranceFixture.NOW)

  // Assert
  expect(weather).toEqual({ isRaining: false, clearing: -1 })
})

test('picks the same claim for the same agent and spreads claims across agents', () => {
  // Arrange
  const ids = Array.from({ length: 30 }, (_, i) => `agent-${i}`)

  // Act
  const first = ids.map(id => Insurance.claim(id))
  const again = ids.map(id => Insurance.claim(id))

  // Assert
  expect(again).toEqual(first)
  expect(new Set(first).size).toBe(Insurance.CLAIMS.length)
})

test('drops commission coins for a recent commit or pull request but not for a failed or old one', () => {
  // Arrange
  const events = [
    InsuranceFixture.event(1, Insurance.COIN_MS + 500, 'tool', '$ git commit -m "ancien"'),
    InsuranceFixture.event(2, 900, 'tool', '$ git commit -m "#1: Correctif +semver:patch"'),
    InsuranceFixture.event(3, 600, 'tool', '$ git commit -m "oops"', true),
    InsuranceFixture.event(4, 300, 'tool', '$ az repos pr create --title "x" --draft true'),
    InsuranceFixture.event(5, 100, 'tool', '$ git status'),
  ]

  // Act
  const ages = Insurance.coins(events, InsuranceFixture.NOW)

  // Assert
  expect(ages).toEqual([300, 900])
})

test('chooses the corner decor from the branch or work item keywords', () => {
  // Assert
  expect(Insurance.decor('features/1234-policies', '1234')).toBe('policy')
  expect(Insurance.decor('features/31000-customer-history', '')).toBe('policyholder')
  expect(Insurance.decor('bugfixes/32034-lookup-sync', '')).toBe('database')
  expect(Insurance.decor('features/30170-Add-Nace', '')).toBe('registry')
  expect(Insurance.decor('features/1-claims-handling', '')).toBe('claim')
  expect(Insurance.decor('features/2-Receipts', '')).toBe('receipt')
  expect(Insurance.decor('features/3-commission-adjustments', '')).toBe('commission')
  expect(Insurance.decor('features/30930-Access-management', '')).toBe(undefined)
})

test('stamps PAID for a short while after a green verification only', () => {
  // Arrange
  const green = [InsuranceFixture.event(1, 300, 'verif', 'build OK (10 s)')]
  const red = [InsuranceFixture.event(1, 300, 'verif', 'build failed (10 s)', true)]
  const old = [InsuranceFixture.event(1, Insurance.PAID_MS + 50, 'verif', 'build OK (10 s)')]

  // Act
  const fresh = Insurance.paid(green, InsuranceFixture.NOW)

  // Assert
  expect(fresh > 0 && fresh < 1).toBe(true)
  expect(Insurance.paid(red, InsuranceFixture.NOW)).toBe(-1)
  expect(Insurance.paid(old, InsuranceFixture.NOW)).toBe(-1)
  expect(InsuranceFixture.text(InsuranceFixture.input([], green, new Set(), new Date(2026, 5, 3, 15, 0)))).toContain('PAID')
})

test('lights the 404 shield above a security review that ended without blocking finding', () => {
  // Arrange
  const reviewer = InsuranceFixture.agent('sec', 'security-reviewer', 'completed', 400)
  const date = new Date(2026, 5, 3, 15, 0)

  // Act
  const clean = InsuranceFixture.text(InsuranceFixture.input([reviewer], [], new Set(['sec']), date))
  const unknown = InsuranceFixture.text(InsuranceFixture.input([reviewer], [], new Set(), date))

  // Assert
  expect(clean).toContain('404')
  expect(unknown).toContain('CLOSED')
  expect(unknown.includes('404')).toBe(false)
})

test('stamps CLAIM on a robot that failed during its finale', () => {
  // Arrange
  const failed = InsuranceFixture.agent('ko', 'test-expert', 'failed', 400)

  // Act
  const text = InsuranceFixture.text(InsuranceFixture.input([failed], [], new Set(), new Date(2026, 5, 3, 15, 0)))

  // Assert
  expect(text).toContain('CLAIM')
})

test('opens the umbrella instead of the holiday hat while it rains', () => {
  // Arrange
  const christmas = new Date(2026, 11, 24, 12, 0)
  const failed = [InsuranceFixture.event(1, 5000, 'verif', 'build failed (12 s)', true)]

  // Act
  const dry = InsuranceFixture.cells(InsuranceFixture.input([], [], new Set(), christmas))
  const rainy = InsuranceFixture.cells(InsuranceFixture.input([], failed, new Set(), christmas))

  // Assert
  expect(rainy === dry).toBe(false)
  expect(Insurance.isAnimated(failed, InsuranceFixture.NOW)).toBe(true)
  expect(Insurance.isAnimated([], InsuranceFixture.NOW)).toBe(false)
})
