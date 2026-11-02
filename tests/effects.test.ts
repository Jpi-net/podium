import { expect, test } from 'claude-code/testing'
import { Canvas, type RenderMode, type Rgb } from '../hooks/canvas'
import { Effects, type Ambience, type Celebration, type Holiday, type Place, type Season, type SolarDay, type TimeOfDay } from '../hooks/effects'

class EffectsFixture {
  static readonly MODES: readonly RenderMode[] = ['quad', 'hd']
  static readonly NOW = 1_800_000_000_000
  static readonly HOLIDAYS: readonly Holiday[] = [
    'new-year',
    'epiphany',
    'valentine',
    'carnaval',
    'pi-day',
    'april-fool',
    'easter',
    'may-day',
    'star-wars',
    'music',
    'national-day',
    'halloween',
    'saint-nicolas',
    'christmas',
    'friday-13',
  ]
  static readonly SEASONS: readonly Season[] = ['winter', 'spring', 'summer', 'autumn']
  static readonly TIMES: readonly TimeOfDay[] = ['dawn', 'morning', 'midday', 'afternoon', 'sunset', 'evening', 'night']
  static readonly HD_PIXELS_PER_UNIT = 6

  static ambience(patch: Partial<Ambience>): Ambience {
    return { season: 'autumn', holiday: 'none', timeOfDay: 'midday', isFridayParty: false, isDisco: false, idleMs: 0, isDebuggerActive: false, celebrations: [], ...patch }
  }

  static at(year: number, month: number, day: number, hour: number, minute: number): Ambience {
    return Effects.ambience(new Date(year, month - 1, day, hour, minute), false, 0, false, [])
  }

  static local(year: number, month: number, day: number, hour: number, minute: number, offset: number, place?: Place): Ambience {
    return Effects.ambienceAt(new Date(Date.UTC(year, month - 1, day, hour, minute) + offset * 60_000), offset, false, 0, false, [], place)
  }

  static brussels(year: number, month: number, day: number, hour: number, minute: number): Ambience {
    const offset = EffectsFixture.isSummerTime(year, month, day) ? -120 : -60
    return EffectsFixture.local(year, month, day, hour, minute, offset)
  }

  static sunOf(ambience: Ambience): SolarDay {
    if (!ambience.sun) throw new Error('missing sun')
    return ambience.sun
  }

  static isSummerTime(year: number, month: number, day: number): boolean {
    const lastSunday = (m: number): number => 31 - new Date(Date.UTC(year, m - 1, 31)).getUTCDay()
    if (month > 3 && month < 10) return true
    if (month === 3) return day >= lastSunday(3)
    if (month === 10) return day < lastSunday(10)
    return false
  }

  static utcOffsetAt(ms: number): number {
    const year = new Date(ms).getUTCFullYear()
    const lastSunday = (m: number): number => Date.UTC(year, m - 1, 31 - new Date(Date.UTC(year, m - 1, 31)).getUTCDay(), 1)
    return ms >= lastSunday(3) && ms < lastSunday(10) ? -120 : -60
  }

  static holiday(year: number, month: number, day: number): Holiday {
    return EffectsFixture.at(year, month, day, 12, 0).holiday
  }

  static render(mode: RenderMode, draw: (canvas: Canvas) => void): string {
    const canvas = new Canvas(84, 30, mode)
    canvas.paint(() => [7, 10, 20])
    draw(canvas)
    const encoded = canvas.encode()
    return encoded.kind === 'cells' ? encoded.cells : encoded.rgba
  }

  static changes(mode: RenderMode, draw: (canvas: Canvas) => void): boolean {
    return EffectsFixture.render(mode, () => undefined) !== EffectsFixture.render(mode, draw)
  }

  static celebration(kind: Celebration['kind'], age: number): Ambience {
    return EffectsFixture.ambience({ celebrations: [{ kind, at: EffectsFixture.NOW - age }] })
  }

  static luminance(c: Rgb): number {
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  }

  static decorLuminance(season: Season, timeOfDay: TimeOfDay): number {
    const canvas = new Canvas(84, 30, 'hd')
    canvas.paint(() => [0, 0, 0])
    const draw = (Effects as unknown as { seasonBackground: (c: Canvas, frame: number, a: Ambience) => void }).seasonBackground
    draw.call(Effects, canvas, 37.4, EffectsFixture.ambience({ season, timeOfDay }))
    const encoded = canvas.encode()
    const bytes = atob(encoded.kind === 'cells' ? encoded.cells : encoded.rgba)
    let sum = 0
    let count = 0
    for (let i = 0; i < bytes.length; i += 4) {
      const c: Rgb = [bytes.charCodeAt(i), bytes.charCodeAt(i + 1), bytes.charCodeAt(i + 2)]
      const l = EffectsFixture.luminance(c)
      if (l > 0) {
        sum += l
        count++
      }
    }
    return count === 0 ? 0 : sum / count
  }

  static highestInk(draw: (canvas: Canvas) => void): number {
    const blank = atob(EffectsFixture.render('hd', () => undefined))
    const drawn = atob(EffectsFixture.render('hd', draw))
    const width = 84 * Canvas.HD_CELL_WIDTH
    for (let i = 0; i < drawn.length; i += 4) {
      for (let ch = 0; ch < 3; ch++) {
        if (Math.abs(drawn.charCodeAt(i + ch) - blank.charCodeAt(i + ch)) > 24) return Math.floor(i / 4 / width) / EffectsFixture.HD_PIXELS_PER_UNIT
      }
    }
    return Number.POSITIVE_INFINITY
  }
}

test('ambience follows the meteorological seasons', () => {
  // Arrange
  const dates: readonly (readonly [number, number])[] = [
    [2, 28],
    [3, 1],
    [5, 31],
    [6, 1],
    [8, 31],
    [9, 1],
    [11, 30],
    [12, 1],
  ]

  // Act
  const seasons = dates.map(([month, day]) => EffectsFixture.at(2027, month, day, 12, 0).season)

  // Assert
  expect(seasons).toEqual(['winter', 'spring', 'spring', 'summer', 'summer', 'autumn', 'autumn', 'winter'])
})

test('easterSunday computes the Gregorian Easter date', () => {
  // Act
  const dates = [2026, 2027, 2028].map(year => Effects.easterSunday(year))

  // Assert
  expect(dates.map(d => [d.getMonth() + 1, d.getDate()])).toEqual([
    [4, 5],
    [3, 28],
    [4, 16],
  ])
})

test('ambience detects easter from Good Friday to Easter Monday', () => {
  // Arrange
  const days2026 = [2, 3, 5, 6, 7].map(day => EffectsFixture.holiday(2026, 4, day))
  const days2027 = [25, 26, 28, 29, 30].map(day => EffectsFixture.holiday(2027, 3, day))

  // Act
  const holidays = [days2026, days2027]

  // Assert
  expect(holidays).toEqual([
    ['none', 'easter', 'easter', 'easter', 'none'],
    ['none', 'easter', 'easter', 'easter', 'none'],
  ])
})

test('ambience detects carnaval from Jeudi gras to Mardi gras', () => {
  // Arrange
  const days = [11, 12, 15, 17, 18]

  // Act
  const holidays = days.map(day => EffectsFixture.holiday(2026, 2, day))

  // Assert
  expect(holidays).toEqual(['none', 'carnaval', 'carnaval', 'carnaval', 'none'])
})

test('ambience detects each fixed-date holiday', () => {
  // Arrange
  const dates: readonly (readonly [number, number, number, Holiday])[] = [
    [2026, 12, 31, 'new-year'],
    [2027, 1, 1, 'new-year'],
    [2027, 1, 6, 'epiphany'],
    [2027, 2, 14, 'valentine'],
    [2027, 3, 14, 'pi-day'],
    [2026, 4, 1, 'april-fool'],
    [2027, 5, 1, 'may-day'],
    [2027, 5, 4, 'star-wars'],
    [2027, 6, 21, 'music'],
    [2027, 7, 21, 'national-day'],
    [2026, 10, 20, 'halloween'],
    [2026, 11, 1, 'halloween'],
    [2026, 12, 5, 'saint-nicolas'],
    [2026, 12, 6, 'saint-nicolas'],
    [2026, 12, 1, 'christmas'],
    [2026, 12, 24, 'christmas'],
    [2026, 12, 30, 'christmas'],
  ]

  // Act
  const holidays = dates.map(([year, month, day]) => EffectsFixture.holiday(year, month, day))

  // Assert
  expect(holidays).toEqual(dates.map(d => d[3]))
})

test('ambience leaves ordinary days without holiday', () => {
  // Arrange
  const dates: readonly (readonly [number, number, number])[] = [
    [2026, 10, 19],
    [2026, 11, 2],
    [2027, 1, 2],
    [2027, 1, 7],
    [2027, 7, 22],
    [2026, 10, 13],
  ]

  // Act
  const holidays = dates.map(([year, month, day]) => EffectsFixture.holiday(year, month, day))

  // Assert
  expect(holidays).toEqual(['none', 'none', 'none', 'none', 'none', 'none'])
})

test('ambience detects Friday the 13th', () => {
  // Arrange
  const fridays = [EffectsFixture.holiday(2026, 11, 13), EffectsFixture.holiday(2026, 3, 13)]

  // Act
  const weekday = new Date(2026, 10, 13).getDay()

  // Assert
  expect(weekday).toBe(5)
  expect(fridays).toEqual(['friday-13', 'friday-13'])
})

test('ambience resolves overlapping holidays by priority', () => {
  // Arrange
  const valentineInCarnaval = EffectsFixture.holiday(2026, 2, 14)
  const fridayInCarnaval = EffectsFixture.holiday(2026, 2, 13)

  // Act
  const holidays = [EffectsFixture.holiday(2026, 12, 6), EffectsFixture.holiday(2026, 12, 31), valentineInCarnaval, fridayInCarnaval]

  // Assert
  expect(holidays).toEqual(['saint-nicolas', 'new-year', 'valentine', 'carnaval'])
})

test('ambience starts the Friday party at 16:00 on ordinary Fridays only', () => {
  // Arrange
  const party = EffectsFixture.at(2026, 9, 25, 16, 0)
  const almost = EffectsFixture.at(2026, 9, 25, 15, 59)
  const thursday = EffectsFixture.at(2026, 9, 24, 17, 0)
  const holiday = EffectsFixture.at(2026, 11, 13, 17, 0)

  // Act
  const flags = [party.isFridayParty, almost.isFridayParty, thursday.isFridayParty, holiday.isFridayParty]

  // Assert
  expect(flags).toEqual([true, false, false, false])
})

test('ambience splits the day into time slots following the real sun in Brussels', () => {
  // Arrange
  const times: readonly (readonly [number, number, TimeOfDay])[] = [
    [3, 0, 'night'],
    [6, 30, 'dawn'],
    [9, 0, 'morning'],
    [13, 30, 'midday'],
    [16, 0, 'afternoon'],
    [19, 30, 'sunset'],
    [20, 45, 'evening'],
    [22, 0, 'night'],
  ]

  // Act
  const slots = times.map(([hour, minute]) => EffectsFixture.brussels(2026, 9, 15, hour, minute).timeOfDay)

  // Assert
  expect(slots).toEqual(times.map(t => t[2]))
})

test('ambience follows the season and daylight saving time', () => {
  // Arrange
  const cases: readonly (readonly [number, number, number, number, number, readonly TimeOfDay[]])[] = [
    [2026, 10, 29, 17, 45, ['evening', 'night']],
    [2026, 6, 21, 21, 30, ['sunset', 'evening']],
    [2026, 6, 21, 13, 45, ['midday']],
    [2026, 12, 21, 16, 45, ['sunset', 'evening']],
    [2026, 12, 21, 17, 5, ['evening']],
    [2026, 12, 21, 8, 15, ['dawn']],
  ]

  for (const [year, month, day, hour, minute, allowed] of cases) {
    // Act
    const slot = EffectsFixture.brussels(year, month, day, hour, minute).timeOfDay

    // Assert
    expect(allowed).toContain(slot)
  }
})

test('ambience computes sunrise and sunset close to the Brussels ephemeris', () => {
  // Arrange
  const references: readonly (readonly [number, number, number, number, number])[] = [
    [2026, 10, 29, 7 * 60 + 28, 17 * 60 + 21],
    [2026, 6, 21, 5 * 60 + 29, 22 * 60],
    [2026, 12, 21, 8 * 60 + 44, 16 * 60 + 40],
  ]

  for (const [year, month, day, rise, set] of references) {
    // Act
    const sun = EffectsFixture.sunOf(EffectsFixture.brussels(year, month, day, 12, 0))

    // Assert
    expect(Math.abs(sun.rise - rise)).toBeLessThanOrEqual(10)
    expect(Math.abs(sun.set - set)).toBeLessThanOrEqual(10)
    expect(sun.nauticalDawn < sun.civilDawn && sun.civilDawn < sun.rise && sun.rise < sun.noon).toBe(true)
    expect(sun.noon < sun.set && sun.set < sun.civilDusk && sun.civilDusk < sun.nauticalDusk).toBe(true)
  }
})

test('ambience does not jump on daylight saving time transitions', () => {
  for (const [year, month, day] of [[2026, 3, 29], [2026, 10, 25]] as const) {
    // Arrange
    const before = EffectsFixture.sunOf(EffectsFixture.brussels(year, month, day - 1, 12, 0))
    const after = EffectsFixture.sunOf(EffectsFixture.brussels(year, month, day, 12, 0))
    const offsetBefore = EffectsFixture.isSummerTime(year, month, day - 1) ? -120 : -60
    const offsetAfter = EffectsFixture.isSummerTime(year, month, day) ? -120 : -60
    const order: readonly TimeOfDay[] = ['night', 'dawn', 'morning', 'midday', 'afternoon', 'sunset', 'evening', 'night']
    const seen: TimeOfDay[] = []

    // Act
    for (let ms = Date.UTC(year, month - 1, day - 1, 23); ms < Date.UTC(year, month - 1, day, 22); ms += 5 * 60_000) {
      const offset = EffectsFixture.utcOffsetAt(ms)
      const slot = Effects.ambienceAt(new Date(ms), offset, false, 0, false, []).timeOfDay
      if (seen[seen.length - 1] !== slot) seen.push(slot)
    }

    // Assert
    expect(Math.abs(after.rise + offsetAfter - (before.rise + offsetBefore))).toBeLessThan(4)
    expect(Math.abs(after.set + offsetAfter - (before.set + offsetBefore))).toBeLessThan(4)
    expect(seen).toEqual([...order])
  }
})

test('ambience never falls into night under the midnight sun and stays defined in polar night', () => {
  // Arrange
  const tromso: Place = { latitude: 69.65, longitude: 18.96 }
  const minutes = Array.from({ length: 48 }, (_, i) => i * 30)

  // Act
  const summer = minutes.map(m => EffectsFixture.local(2026, 6, 21, Math.floor(m / 60), m % 60, -120, tromso))
  const winter = minutes.map(m => EffectsFixture.local(2026, 12, 21, Math.floor(m / 60), m % 60, -60, tromso))

  // Assert
  expect(summer.some(a => a.timeOfDay === 'night')).toBe(false)
  expect(summer.every(a => EffectsFixture.sunOf(a).rise === 0 && EffectsFixture.sunOf(a).set === 1440)).toBe(true)
  expect(winter.every(a => Effects.sky(a, 0).stars > 0.1 && a.timeOfDay !== 'midday' && a.timeOfDay !== 'afternoon')).toBe(true)
})

test('sky lights the stars from the solar elevation', () => {
  // Arrange
  const noon = EffectsFixture.brussels(2026, 10, 29, 12, 30)
  const dusk = EffectsFixture.brussels(2026, 10, 29, 17, 45)
  const night = EffectsFixture.brussels(2026, 10, 29, 21, 0)

  // Act
  const stars = [noon, dusk, night].map(a => Effects.sky(a, 0).stars)

  // Assert
  expect(stars[0]).toBe(0)
  expect(stars[1]! > 0 && stars[1]! < 1).toBe(true)
  expect(stars[2]).toBe(1)
})

test('sky blends smoothly around the real sun boundaries', () => {
  // Arrange
  let worst = 0

  // Act
  for (let ms = Date.UTC(2026, 11, 20, 23); ms < Date.UTC(2026, 11, 21, 23); ms += 30_000) {
    const a = Effects.sky(Effects.ambienceAt(new Date(ms), -60, false, 0, false, []), 0)
    const b = Effects.sky(Effects.ambienceAt(new Date(ms + 30_000), -60, false, 0, false, []), 0)
    for (let ch = 0; ch < 3; ch++) worst = Math.max(worst, Math.abs(a.bottom[ch]! - b.bottom[ch]!), Math.abs(a.top[ch]! - b.top[ch]!))
    worst = Math.max(worst, Math.abs(a.stars - b.stars) * 100)
  }

  // Assert
  expect(worst).toBeLessThan(3)
})

test('celestialSpot moves the sun from sunrise on the left to sunset on the right at its real height', () => {
  // Arrange
  const canvas = new Canvas(84, 30, 'hd')
  const sun = EffectsFixture.sunOf(EffectsFixture.brussels(2026, 6, 21, 12, 0))
  const at = (minute: number): Ambience => EffectsFixture.brussels(2026, 6, 21, Math.floor(minute / 60), Math.round(minute % 60))
  const winterNoon = EffectsFixture.sunOf(EffectsFixture.brussels(2026, 12, 21, 12, 0)).noon

  // Act
  const rise = Effects.celestialSpot(canvas, at(sun.rise + 2))
  const noon = Effects.celestialSpot(canvas, at(sun.noon))
  const set = Effects.celestialSpot(canvas, at(sun.set - 2))
  const winter = Effects.celestialSpot(canvas, EffectsFixture.brussels(2026, 12, 21, Math.floor(winterNoon / 60), Math.round(winterNoon % 60)))

  // Assert
  expect(rise.x).toBeLessThan(canvas.width * 0.12)
  expect(set.x).toBeGreaterThan(canvas.width * 0.88)
  expect(Math.abs(noon.x - canvas.width / 2)).toBeLessThan(canvas.width * 0.05)
  expect(noon.y).toBeLessThan(rise.y)
  expect(noon.y).toBeLessThan(winter.y)
  expect(noon.lift).toBeGreaterThan(0.99)
  expect(rise.lift).toBeLessThan(0.1)
})

test('background shows the moon from civil dusk only', () => {
  // Arrange
  const sun = EffectsFixture.sunOf(EffectsFixture.brussels(2026, 9, 15, 12, 0))
  const at = (minute: number): Ambience => EffectsFixture.brussels(2026, 9, 15, Math.floor(minute / 60), Math.round(minute % 60))
  const canvas = new Canvas(84, 30, 'hd')

  // Act
  const beforeDusk = Effects.celestialSpot(canvas, at(sun.civilDusk - 3))
  const afterDusk = Effects.celestialSpot(canvas, at(sun.civilDusk + 3))

  // Assert
  expect(beforeDusk.x).toBeGreaterThan(canvas.width * 0.88)
  expect(afterDusk.x).toBeLessThan(canvas.width * 0.2)
})

test('ambience copies the other inputs', () => {
  // Arrange
  const celebrations: Celebration[] = [{ kind: 'rocket', at: 42 }]

  // Act
  const ambience = Effects.ambience(new Date(2026, 5, 1, 12, 0), true, 1234, true, celebrations)

  // Assert
  expect([ambience.isDisco, ambience.idleMs, ambience.isDebuggerActive, ambience.celebrations]).toEqual([true, 1234, true, celebrations])
})

test('sky stays dark enough for robots and labels all day long', () => {
  for (const holiday of ['none', 'valentine', 'star-wars'] as const) {
    for (let minute = 0; minute < 1440; minute += 5) {
      // Arrange
      const ambience = EffectsFixture.ambience({ holiday, minuteOfDay: minute })

      // Act
      const sky = Effects.sky(ambience, minute)

      // Assert
      expect(EffectsFixture.luminance(sky.top)).toBeLessThanOrEqual(60)
      expect(EffectsFixture.luminance(sky.bottom)).toBeLessThanOrEqual(70)
    }
  }
})

test('sky shows the stars by time slot', () => {
  // Arrange
  const ambiences = EffectsFixture.TIMES.map(timeOfDay => EffectsFixture.ambience({ timeOfDay }))

  // Act
  const stars = ambiences.map(ambience => Effects.sky(ambience, 0).stars)

  // Assert
  expect(stars).toEqual([0.4, 0.05, 0.05, 0.05, 0.3, 0.7, 1])
})

test('sky blends smoothly from one minute to the next', () => {
  // Arrange
  let worst = 0

  // Act
  for (let minute = 0; minute < 1440; minute += 0.5) {
    const a = Effects.sky(EffectsFixture.ambience({ minuteOfDay: minute }), 0)
    const b = Effects.sky(EffectsFixture.ambience({ minuteOfDay: minute + 0.5 }), 0)
    for (let ch = 0; ch < 3; ch++) worst = Math.max(worst, Math.abs(a.bottom[ch]! - b.bottom[ch]!), Math.abs(a.top[ch]! - b.top[ch]!))
    worst = Math.max(worst, Math.abs(a.stars - b.stars) * 100)
  }

  // Assert
  expect(worst).toBeLessThan(3)
})

test('background draws every time of day, season and holiday in quad and hd', () => {
  // Arrange
  const ambiences = [
    ...EffectsFixture.TIMES.map(timeOfDay => EffectsFixture.ambience({ timeOfDay })),
    ...EffectsFixture.SEASONS.flatMap(season => [EffectsFixture.ambience({ season }), EffectsFixture.ambience({ season, timeOfDay: 'night' })]),
    ...EffectsFixture.HOLIDAYS.map(holiday => EffectsFixture.ambience({ holiday })),
    EffectsFixture.ambience({ isDisco: true }),
  ]

  for (const mode of EffectsFixture.MODES) {
    for (const ambience of ambiences) {
      // Act
      const changed = EffectsFixture.changes(mode, canvas => Effects.background(canvas, 37.4, EffectsFixture.NOW, ambience))

      // Assert
      expect(changed).toBe(true)
    }
  }
})

test('hat draws for every holiday and the Friday party in quad and hd', () => {
  // Arrange
  const ambiences = [...EffectsFixture.HOLIDAYS.map(holiday => EffectsFixture.ambience({ holiday })), EffectsFixture.ambience({ isFridayParty: true })]

  for (const mode of EffectsFixture.MODES) {
    for (const ambience of ambiences) {
      for (const seed of [0.1, 0.7]) {
        // Act
        const changed = EffectsFixture.changes(mode, canvas => Effects.hat(canvas, 42, 40, 10, ambience, 5.5, seed))

        // Assert
        expect(changed).toBe(true)
        expect(Effects.hatHeight(ambience, 10)).toBeGreaterThan(0)
      }
    }
  }
})

test('hatHeight covers the drawn hat', () => {
  // Arrange
  const ambiences = [...EffectsFixture.HOLIDAYS.map(holiday => EffectsFixture.ambience({ holiday })), EffectsFixture.ambience({ isFridayParty: true })]
  const top = 40

  for (const ambience of ambiences) {
    for (const frame of [0, 7.3, 21.7, 40.2]) {
      for (const seed of [0.1, 0.62]) {
        // Act
        const highest = EffectsFixture.highestInk(canvas => Effects.hat(canvas, 42, top, 10, ambience, frame, seed))

        // Assert
        expect(top - highest).toBeLessThanOrEqual(Effects.hatHeight(ambience, 10 / 0.7) + 0.3)
      }
    }
  }
})

test('hat draws nothing on ordinary days without party', () => {
  // Arrange
  const ambience = EffectsFixture.ambience({ timeOfDay: 'night', isDisco: true })

  for (const mode of EffectsFixture.MODES) {
    // Act
    const changed = EffectsFixture.changes(mode, canvas => Effects.hat(canvas, 42, 30, 10, ambience, 5, 0.3))

    // Assert
    expect(changed).toBe(false)
    expect(Effects.hatHeight(ambience, 10)).toBe(0)
  }
})

test('halloween hats alternate between pumpkin and witch by seed', () => {
  // Arrange
  const ambience = EffectsFixture.ambience({ holiday: 'halloween' })
  const seeds = [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75]

  // Act
  const looks = new Set(seeds.map(seed => EffectsFixture.render('hd', canvas => Effects.hat(canvas, 42, 30, 10, ambience, 0, seed))))

  // Assert
  expect(looks.size > 1).toBe(true)
})

test('effects animate smoothly and deterministically with fractional frames', () => {
  // Arrange
  const ambiences = [
    EffectsFixture.ambience({ season: 'autumn' }),
    EffectsFixture.ambience({ holiday: 'easter' }),
    EffectsFixture.ambience({ holiday: 'star-wars', timeOfDay: 'night' }),
    EffectsFixture.ambience({ season: 'summer', timeOfDay: 'night', isDisco: true }),
  ]
  const draw = (frame: number, ambience: Ambience) => (canvas: Canvas): void => {
    Effects.background(canvas, frame, EffectsFixture.NOW, ambience)
    Effects.hat(canvas, 42, 40, 10, ambience, frame, 0.4)
    Effects.foreground(canvas, frame, EffectsFixture.NOW, ambience)
    Effects.teleport(canvas, { x: 66, y: 44 }, { x: 42, y: 30 }, 0.5, [181, 140, 255], frame)
  }

  for (const ambience of ambiences) {
    // Act
    const first = EffectsFixture.render('quad', draw(37.25, ambience))
    const again = EffectsFixture.render('quad', draw(37.25, ambience))
    const later = EffectsFixture.render('hd', draw(37.75, ambience))
    const earlier = EffectsFixture.render('hd', draw(37.25, ambience))

    // Assert
    expect(first).toBe(again)
    expect(later === earlier).toBe(false)
  }
})

test('sleeping draws rising Zs that move over time', () => {
  for (const mode of EffectsFixture.MODES) {
    // Act
    const a = EffectsFixture.render(mode, canvas => Effects.sleeping(canvas, 40, 30, 3))
    const b = EffectsFixture.render(mode, canvas => Effects.sleeping(canvas, 40, 30, 9))

    // Assert
    expect(EffectsFixture.changes(mode, canvas => Effects.sleeping(canvas, 40, 30, 3))).toBe(true)
    expect(a === b).toBe(false)
  }
})

test('celebrate draws every celebration kind while it is fresh', () => {
  for (const mode of EffectsFixture.MODES) {
    for (const kind of ['confetti', 'fireworks', 'rocket'] as const) {
      for (const age of [300, 1500, 3000]) {
        // Act
        const changed = EffectsFixture.changes(mode, canvas => Effects.celebrate(canvas, { x: 42, y: 30 }, EffectsFixture.NOW, 10.5, EffectsFixture.celebration(kind, age)))

        // Assert
        expect(changed).toBe(true)
      }
    }
  }
})

test('celebrate ignores expired and future celebrations', () => {
  for (const age of [-10, Effects.CELEBRATION_MS, Effects.CELEBRATION_MS + 500]) {
    // Act
    const changed = EffectsFixture.changes('hd', canvas => Effects.celebrate(canvas, { x: 42, y: 30 }, EffectsFixture.NOW, 10, EffectsFixture.celebration('fireworks', age)))

    // Assert
    expect(changed).toBe(false)
  }
})

test('finale draws each exit status in quad and hd', () => {
  for (const mode of EffectsFixture.MODES) {
    for (const status of ['done', 'failed', 'killed'] as const) {
      for (const t of [0.2, 0.6]) {
        // Act
        const changed = EffectsFixture.changes(mode, canvas => Effects.finale(canvas, { x: 30, y: 30 }, t, status, [72, 196, 255], 12, 0.4))

        // Assert
        expect(changed).toBe(true)
      }
    }
  }
})

test('teleport draws a beam between the slot and the orchestrator', () => {
  for (const mode of EffectsFixture.MODES) {
    // Act
    const changed = EffectsFixture.changes(mode, canvas => Effects.teleport(canvas, { x: 66, y: 44 }, { x: 42, y: 30 }, 0.5, [181, 140, 255], 12.6))

    // Assert
    expect(changed).toBe(true)
  }
})

test('foreground draws the ladybug, party confetti, seasonal flurries and mirror ball', () => {
  // Arrange
  const ambiences = [
    EffectsFixture.ambience({ isDebuggerActive: true }),
    EffectsFixture.ambience({ isFridayParty: true }),
    EffectsFixture.ambience({ holiday: 'christmas' }),
    EffectsFixture.ambience({ holiday: 'new-year' }),
    EffectsFixture.ambience({ holiday: 'carnaval' }),
    EffectsFixture.ambience({ season: 'winter' }),
    EffectsFixture.ambience({ season: 'spring' }),
    EffectsFixture.ambience({ season: 'autumn' }),
    EffectsFixture.ambience({ isDisco: true }),
  ]

  for (const mode of EffectsFixture.MODES) {
    for (const ambience of ambiences) {
      // Act
      const changed = EffectsFixture.changes(mode, canvas => Effects.foreground(canvas, 40, EffectsFixture.NOW, ambience))

      // Assert
      expect(changed).toBe(true)
    }
  }
})

test('effects are deterministic for the same inputs', () => {
  // Arrange
  const ambience = EffectsFixture.ambience({ holiday: 'christmas', isDisco: true, isDebuggerActive: true, celebrations: [{ kind: 'confetti', at: EffectsFixture.NOW - 900 }] })
  const draw = (canvas: Canvas): void => {
    Effects.background(canvas, 77.3, EffectsFixture.NOW, ambience)
    Effects.celebrate(canvas, { x: 42, y: 30 }, EffectsFixture.NOW, 77.3, ambience)
    Effects.foreground(canvas, 77.3, EffectsFixture.NOW, ambience)
  }

  // Act
  const first = EffectsFixture.render('quad', draw)
  const second = EffectsFixture.render('quad', draw)

  // Assert
  expect(first).toBe(second)
})

test('seasonal decor is dimmer at night than at midday', () => {
  for (const season of ['spring', 'autumn', 'winter'] as const) {
    // Act
    const midday = EffectsFixture.decorLuminance(season, 'midday')
    const night = EffectsFixture.decorLuminance(season, 'night')

    // Assert
    expect(midday).toBeGreaterThan(0)
    expect(night).toBeLessThan(midday * 0.6)
  }
})

test('national-day bursts use no dark colour', () => {
  // Arrange
  const palette = (Effects as unknown as { NATIONAL_BURSTS: readonly Rgb[] }).NATIONAL_BURSTS

  // Act
  const darkest = Math.min(...palette.map(c => EffectsFixture.luminance(c)))

  // Assert
  expect(palette.length).toBe(3)
  expect(darkest).toBeGreaterThan(60)
})

test('clouds drift in the sky by day only', () => {
  for (const mode of EffectsFixture.MODES) {
    // Act
    const byDay = ['dawn', 'morning', 'midday', 'afternoon', 'sunset'].map(t => EffectsFixture.changes(mode, c => Effects.clouds(c, 37.4, EffectsFixture.ambience({ timeOfDay: t as TimeOfDay }))))
    const byNight = ['evening', 'night'].map(t => EffectsFixture.changes(mode, c => Effects.clouds(c, 37.4, EffectsFixture.ambience({ timeOfDay: t as TimeOfDay }))))
    const moved = EffectsFixture.render(mode, c => Effects.clouds(c, 37.4, EffectsFixture.ambience({}))) !== EffectsFixture.render(mode, c => Effects.clouds(c, 437.4, EffectsFixture.ambience({})))

    // Assert
    expect(byDay.every(Boolean)).toBe(true)
    expect(byNight.some(Boolean)).toBe(false)
    expect(moved).toBe(true)
  }
})

test('comet crosses the night sky in some deterministic windows only', () => {
  // Arrange
  const windows = Array.from({ length: 20 }, (_, w) => w * Effects.COMET_PERIOD + Effects.COMET_FRAMES / 2)

  // Act
  const shown = windows.map(frame => EffectsFixture.changes('quad', c => Effects.comet(c, frame, 1)))
  const outside = windows.map(frame => EffectsFixture.changes('quad', c => Effects.comet(c, frame + Effects.COMET_FRAMES, 1)))

  // Assert
  expect(shown.some(Boolean)).toBe(true)
  expect(shown.every(Boolean)).toBe(false)
  expect(outside.some(Boolean)).toBe(false)
})
