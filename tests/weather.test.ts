import { expect, test } from 'claude-code/testing'
import { Effects } from '../hooks/effects'
import { WeatherFx } from '../hooks/weather'
import { Scene, type SceneInput } from '../hooks/scene'
import type { FlowAgent, FlowEvent, FlowEventKind } from '../types'

class WeatherFixture {
  static readonly NOW = 1_800_000_000_000

  static event(id: number, agoMs: number, kind: FlowEventKind, label: string, isError = false): FlowEvent {
    return { id, at: WeatherFixture.NOW - agoMs, agentId: '', kind, label, isError }
  }

  static input(agents: FlowAgent[], events: FlowEvent[], holiday: Date): SceneInput {
    return {
      agents,
      events,
      main: { tool: '', toolCount: 0, isBusy: true, busySince: WeatherFixture.NOW - 60_000, model: 'claude-opus-5-5' },
      at: WeatherFixture.NOW,
      isLive: false,
      frame: 10,
      dt: 0,
      pulses: new Map(),
      columns: 84,
      rows: 32,
      mode: 'quad',
      ambience: Effects.ambience(holiday, false, 0, false, []),
      positions: new Map(),
    }
  }

  static cells(input: SceneInput): string {
    const encoded = Scene.graph(input).encoded
    return encoded.kind === 'cells' ? encoded.cells : ''
  }
}

test('makes it rain while the latest verification failed and clears up after a green one', () => {
  // Arrange
  const failed = [WeatherFixture.event(1, 5000, 'verif', 'build failed (12 s)', true)]
  const launched = [...failed, WeatherFixture.event(2, 1000, 'verif', 'build started', false)]
  const fixed = [...failed, WeatherFixture.event(3, 500, 'verif', 'build OK (10 s)', false)]
  const longFixed = [...failed, WeatherFixture.event(3, WeatherFx.CLEAR_MS + 100, 'verif', 'build OK (10 s)', false)]

  // Act
  const rain = WeatherFx.weather(failed, WeatherFixture.NOW)
  const stillRain = WeatherFx.weather(launched, WeatherFixture.NOW)
  const clearing = WeatherFx.weather(fixed, WeatherFixture.NOW)
  const clear = WeatherFx.weather(longFixed, WeatherFixture.NOW)
  const none = WeatherFx.weather([], WeatherFixture.NOW)

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
  const events = [WeatherFixture.event(1, 9000, 'verif', 'lint OK (3 s)'), WeatherFixture.event(2, 400, 'verif', 'build OK (10 s)')]

  // Act
  const weather = WeatherFx.weather(events, WeatherFixture.NOW)

  // Assert
  expect(weather).toEqual({ isRaining: false, clearing: -1 })
})

test('opens the umbrella instead of the holiday hat while it rains', () => {
  // Arrange
  const christmas = new Date(2026, 11, 24, 12, 0)
  const failed = [WeatherFixture.event(1, 5000, 'verif', 'build failed (12 s)', true)]

  // Act
  const dry = WeatherFixture.cells(WeatherFixture.input([], [], christmas))
  const rainy = WeatherFixture.cells(WeatherFixture.input([], failed, christmas))

  // Assert
  expect(rainy === dry).toBe(false)
  expect(WeatherFx.isAnimated(failed, WeatherFixture.NOW)).toBe(true)
  expect(WeatherFx.isAnimated([], WeatherFixture.NOW)).toBe(false)
})
