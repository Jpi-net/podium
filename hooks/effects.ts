import { Canvas, type Point, type Rgb } from './canvas'
import { Festive } from './festive'
import { Hats } from './hats'
import { Night } from './night'

export type Season = 'winter' | 'spring' | 'summer' | 'autumn'

export type Holiday =
  | 'none'
  | 'new-year'
  | 'epiphany'
  | 'valentine'
  | 'carnaval'
  | 'pi-day'
  | 'april-fool'
  | 'easter'
  | 'may-day'
  | 'star-wars'
  | 'music'
  | 'national-day'
  | 'halloween'
  | 'saint-nicolas'
  | 'christmas'
  | 'friday-13'

export type TimeOfDay = 'dawn' | 'morning' | 'midday' | 'afternoon' | 'sunset' | 'evening' | 'night'

export type Sky = { top: Rgb; bottom: Rgb; halo: Rgb; stars: number }

export type CelebrationKind = 'confetti' | 'fireworks' | 'rocket'

export type Celebration = { kind: CelebrationKind; at: number }

export type ExitStatus = 'done' | 'failed' | 'killed'

export type SolarDay = {
  rise: number
  set: number
  noon: number
  civilDawn: number
  civilDusk: number
  nauticalDawn: number
  nauticalDusk: number
  elevation: number
  peak: number
  nadir: number
}

export type Place = { latitude: number; longitude: number }

export type Ambience = {
  season: Season
  holiday: Holiday
  timeOfDay: TimeOfDay
  minuteOfDay?: number
  sun?: SolarDay
  isFridayParty: boolean
  isDisco: boolean
  idleMs: number
  isDebuggerActive: boolean
  celebrations: Celebration[]
}

export type Obstacle = { x: number; y: number; w: number; h: number }
export type Spot = { x: number; y: number; r: number; lift: number }
type Frame2 = { o: Point; u: Point; v: Point }

type Slot = { slot: TimeOfDay; start: number }

type Orbit = { declination: number; equation: number }

class SolarClock {
  static readonly BRUSSELS: Place = { latitude: 50.85, longitude: 4.35 }
  private static readonly RAD = Math.PI / 180
  private static readonly MINUTE_MS = 60_000
  private static readonly DAY_MINUTES = 1440
  private static readonly HORIZON = -0.833
  private static readonly CIVIL = -6
  private static readonly NAUTICAL = -12

  static at(date: Date, offsetMinutes: number, place: Place): SolarDay {
    const { latitude, longitude } = place
    const local = new Date(date.getTime() - offsetMinutes * SolarClock.MINUTE_MS)
    const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate())
    const day = SolarClock.orbit(midnight + (720 - 4 * longitude) * SolarClock.MINUTE_MS)
    const noon = 720 - 4 * longitude - day.equation - offsetMinutes
    const event = (altitude: number, sign: number): number => {
      const angle = SolarClock.hourAngle(altitude, latitude, day.declination)
      if (angle >= 180) return sign < 0 ? 0 : SolarClock.DAY_MINUTES
      return SolarClock.clampDay(noon + sign * 4 * angle)
    }
    return {
      rise: event(SolarClock.HORIZON, -1),
      set: event(SolarClock.HORIZON, 1),
      noon,
      civilDawn: event(SolarClock.CIVIL, -1),
      civilDusk: event(SolarClock.CIVIL, 1),
      nauticalDawn: event(SolarClock.NAUTICAL, -1),
      nauticalDusk: event(SolarClock.NAUTICAL, 1),
      elevation: SolarClock.elevation(date, latitude, longitude),
      peak: 90 - Math.abs(latitude - day.declination),
      nadir: Math.abs(latitude + day.declination) - 90,
    }
  }

  static elevationAt(sun: SolarDay, minute: number): number {
    const high = Math.sin(sun.peak * SolarClock.RAD)
    const low = Math.sin(sun.nadir * SolarClock.RAD)
    const angle = (minute - sun.noon) * 0.25 * SolarClock.RAD
    const sine = (high + low) / 2 + ((high - low) / 2) * Math.cos(angle)
    return Math.asin(Math.max(-1, Math.min(1, sine))) / SolarClock.RAD
  }

  private static elevation(date: Date, latitude: number, longitude: number): number {
    const now = SolarClock.orbit(date.getTime())
    const utcMinute = (((date.getTime() / SolarClock.MINUTE_MS) % SolarClock.DAY_MINUTES) + SolarClock.DAY_MINUTES) % SolarClock.DAY_MINUTES
    const hourAngle = ((utcMinute + now.equation + 4 * longitude) / 4 - 180) * SolarClock.RAD
    const lat = latitude * SolarClock.RAD
    const decl = now.declination * SolarClock.RAD
    const sine = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(hourAngle)
    return Math.asin(Math.max(-1, Math.min(1, sine))) / SolarClock.RAD
  }

  private static hourAngle(altitude: number, latitude: number, declination: number): number {
    const lat = latitude * SolarClock.RAD
    const decl = declination * SolarClock.RAD
    const cosine = (Math.sin(altitude * SolarClock.RAD) - Math.sin(lat) * Math.sin(decl)) / (Math.cos(lat) * Math.cos(decl))
    return Math.acos(Math.max(-1, Math.min(1, cosine))) / SolarClock.RAD
  }

  private static orbit(ms: number): Orbit {
    const rad = SolarClock.RAD
    const t = (ms / 86_400_000 + 2440587.5 - 2451545) / 36525
    const meanLongitude = (((280.46646 + t * (36000.76983 + t * 0.0003032)) % 360) + 360) % 360
    const anomaly = 357.52911 + t * (35999.05029 - 0.0001537 * t)
    const eccentricity = 0.016708634 - t * (0.000042037 + 0.0000001267 * t)
    const m = anomaly * rad
    const center = Math.sin(m) * (1.914602 - t * (0.004817 + 0.000014 * t)) + Math.sin(2 * m) * (0.019993 - 0.000101 * t) + Math.sin(3 * m) * 0.000289
    const omega = (125.04 - 1934.136 * t) * rad
    const apparent = (meanLongitude + center - 0.00569 - 0.00478 * Math.sin(omega)) * rad
    const meanObliquity = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60
    const obliquity = (meanObliquity + 0.00256 * Math.cos(omega)) * rad
    const declination = Math.asin(Math.sin(obliquity) * Math.sin(apparent)) / rad
    const y = Math.tan(obliquity / 2) ** 2
    const l0 = meanLongitude * rad
    const equation =
      4 / rad * (y * Math.sin(2 * l0) - 2 * eccentricity * Math.sin(m) + 4 * eccentricity * y * Math.sin(m) * Math.cos(2 * l0) - 0.5 * y * y * Math.sin(4 * l0) - 1.25 * eccentricity * eccentricity * Math.sin(2 * m))
    return { declination, equation }
  }

  private static clampDay(minute: number): number {
    return Math.max(0, Math.min(SolarClock.DAY_MINUTES, minute))
  }
}

export class Effects {
  static readonly CELEBRATION_MS = 4000

  private static readonly DAY_MS = 86_400_000
  private static readonly SKY_FADE = 45
  private static readonly ARC_LO = -0.06
  private static readonly ARC_HI = 1.06
  private static readonly WHITE: Rgb = [255, 255, 255]
  private static readonly INK: Rgb = [12, 15, 30]
  private static readonly ACCENT: Rgb = [0, 187, 167]
  private static readonly OK: Rgb = [105, 240, 174]
  private static readonly KO: Rgb = [255, 85, 115]
  private static readonly WARN: Rgb = [255, 206, 110]
  private static readonly SMOKE: Rgb = [120, 126, 146]
  private static readonly DUST: Rgb = [150, 146, 140]
  private static readonly GOLD: Rgb = [255, 208, 96]
  private static readonly ICE: Rgb = [176, 222, 255]
  private static readonly FLAG_BLACK: Rgb = [20, 20, 20]
  private static readonly FLAG_YELLOW: Rgb = [253, 218, 36]
  private static readonly FLAG_RED: Rgb = [239, 51, 64]
  private static readonly VALENTINE_TINT: Rgb = [92, 22, 58]
  private static readonly NATIONAL_BURSTS: readonly Rgb[] = [[255, 244, 200], Effects.FLAG_YELLOW, Effects.FLAG_RED]
  private static readonly SUNSET_TINT: Rgb = [255, 150, 90]
  private static readonly LIGHT: Partial<Record<TimeOfDay, number>> = { night: 0.45, evening: 0.65, dawn: 0.75, sunset: 0.85 }
  private static readonly PAPER: readonly Rgb[] = [
    [255, 92, 120],
    [255, 210, 80],
    [90, 200, 255],
    [120, 236, 140],
    [190, 130, 255],
    [255, 150, 70],
    [110, 255, 232],
  ]
  private static readonly NEW_YEAR: readonly Rgb[] = [
    [255, 208, 96],
    [222, 228, 244],
    [120, 150, 255],
    [255, 110, 190],
    [255, 236, 170],
  ]
  private static readonly DISCO: readonly Rgb[] = [
    [255, 70, 180],
    [70, 200, 255],
    [255, 220, 70],
    [130, 255, 140],
    [180, 110, 255],
  ]
  private static readonly AURORA: readonly Rgb[] = [
    [60, 255, 170],
    [0, 187, 167],
    [120, 140, 255],
  ]
  private static readonly SLOTS: readonly Slot[] = [
    { slot: 'dawn', start: 300 },
    { slot: 'morning', start: 420 },
    { slot: 'midday', start: 660 },
    { slot: 'afternoon', start: 840 },
    { slot: 'sunset', start: 1020 },
    { slot: 'evening', start: 1200 },
    { slot: 'night', start: 1320 },
  ]
  private static readonly PALETTES: Record<TimeOfDay, Sky> = {
    dawn: { top: [18, 16, 50], bottom: [104, 50, 70], halo: [150, 84, 92], stars: 0.4 },
    morning: { top: [10, 28, 64], bottom: [20, 70, 84], halo: [40, 124, 132], stars: 0.05 },
    midday: { top: [8, 32, 80], bottom: [24, 64, 112], halo: [56, 118, 176], stars: 0.05 },
    afternoon: { top: [14, 28, 72], bottom: [86, 58, 46], halo: [160, 116, 70], stars: 0.05 },
    sunset: { top: [32, 14, 56], bottom: [138, 42, 62], halo: [196, 84, 84], stars: 0.3 },
    evening: { top: [10, 10, 34], bottom: [40, 24, 70], halo: [76, 44, 120], stars: 0.7 },
    night: { top: [5, 8, 18], bottom: [14, 19, 38], halo: [0, 52, 47], stars: 1 },
  }
  private static readonly HAT_HEIGHTS: Record<Holiday, number> = {
    none: 0,
    'new-year': 12.8,
    epiphany: 7.4,
    valentine: 14.9,
    carnaval: 17.0,
    'pi-day': 12.8,
    'april-fool': 10.6,
    easter: 13.8,
    'may-day': 8.2,
    'star-wars': 11.7,
    music: 6.4,
    'national-day': 5.3,
    halloween: 12.8,
    'saint-nicolas': 12.8,
    christmas: 9.6,
    'friday-13': 11.7,
  }
  private static readonly SHOOTING_PERIOD = 200
  private static readonly SHOOTING_FRAMES = 25
  static readonly COMET_PERIOD = 3000
  static readonly COMET_FRAMES = 190
  static ambience(date: Date, isDisco: boolean, idleMs: number, isDebuggerActive: boolean, celebrations: Celebration[]): Ambience {
    return Effects.ambienceAt(date, date.getTimezoneOffset(), isDisco, idleMs, isDebuggerActive, celebrations)
  }

  static ambienceAt(date: Date, offsetMinutes: number, isDisco: boolean, idleMs: number, isDebuggerActive: boolean, celebrations: Celebration[], place: Place = SolarClock.BRUSSELS): Ambience {
    const local = new Date(date.getTime() - offsetMinutes * 60_000)
    const calendar = new Date(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 12)
    const hour = local.getUTCHours()
    const minute = hour * 60 + local.getUTCMinutes() + local.getUTCSeconds() / 60 + local.getUTCMilliseconds() / 60_000
    const holiday = Effects.holiday(calendar)
    const sun = SolarClock.at(date, offsetMinutes, place)
    return {
      season: Effects.season(calendar.getMonth()),
      holiday,
      timeOfDay: Effects.timeOfDay(minute, Effects.solarSlots(sun)),
      minuteOfDay: minute,
      sun,
      isFridayParty: holiday === 'none' && calendar.getDay() === 5 && hour >= 16,
      isDisco,
      idleMs,
      isDebuggerActive,
      celebrations,
    }
  }

  static easterSunday(year: number): Date {
    const a = year % 19
    const b = Math.floor(year / 100)
    const c = year % 100
    const d = Math.floor(b / 4)
    const e = b % 4
    const f = Math.floor((b + 8) / 25)
    const g = Math.floor((b - f + 1) / 3)
    const h = (19 * a + b - d - g + 15) % 30
    const i = Math.floor(c / 4)
    const k = c % 4
    const l = (32 + 2 * e + 2 * i - h - k) % 7
    const m = Math.floor((a + 11 * h + 22 * l) / 451)
    const month = Math.floor((h + l - 7 * m + 114) / 31)
    const day = ((h + l - 7 * m + 114) % 31) + 1
    return new Date(year, month - 1, day)
  }

  static sky(ambience: Ambience, frame: number): Sky {
    const slots = ambience.sun ? Effects.solarSlots(ambience.sun) : Effects.SLOTS
    const palette = Effects.skyAt(Effects.minute(ambience), slots)
    const base = ambience.sun ? { ...palette, stars: Effects.starsAt(ambience.sun.elevation) } : palette
    const tinted = ambience.holiday === 'valentine' ? Effects.tint(base, Effects.VALENTINE_TINT, 0.3) : base
    const stars = ambience.holiday === 'star-wars' ? Math.max(tinted.stars, 0.6) : tinted.stars
    const breathe = 1 + 0.05 * Math.sin(frame * 0.02)
    return { top: tinted.top, bottom: tinted.bottom, halo: Canvas.scale(tinted.halo, breathe), stars }
  }

  private static season(month: number): Season {
    if (month === 11 || month <= 1) return 'winter'
    if (month <= 4) return 'spring'
    if (month <= 7) return 'summer'
    return 'autumn'
  }

  private static holiday(date: Date): Holiday {
    const month = date.getMonth() + 1
    const day = date.getDate()
    const easter = Effects.easterSunday(date.getFullYear())
    const fromEaster = Math.round((Date.UTC(date.getFullYear(), month - 1, day) - Date.UTC(easter.getFullYear(), easter.getMonth(), easter.getDate())) / Effects.DAY_MS)
    if ((month === 12 && day === 31) || (month === 1 && day === 1)) return 'new-year'
    if (month === 1 && day === 6) return 'epiphany'
    if (month === 2 && day === 14) return 'valentine'
    if (fromEaster >= -52 && fromEaster <= -47) return 'carnaval'
    if (month === 3 && day === 14) return 'pi-day'
    if (month === 4 && day === 1) return 'april-fool'
    if (fromEaster >= -2 && fromEaster <= 1) return 'easter'
    if (month === 5 && day === 1) return 'may-day'
    if (month === 5 && day === 4) return 'star-wars'
    if (month === 6 && day === 21) return 'music'
    if (month === 7 && day === 21) return 'national-day'
    if ((month === 10 && day >= 20) || (month === 11 && day === 1)) return 'halloween'
    if (month === 12 && (day === 5 || day === 6)) return 'saint-nicolas'
    if (month === 12) return 'christmas'
    if (date.getDay() === 5 && day === 13) return 'friday-13'
    return 'none'
  }

  private static solarSlots(sun: SolarDay): Slot[] {
    const starts: readonly (readonly [TimeOfDay, number])[] = [
      ['dawn', sun.nauticalDawn],
      ['morning', Math.min(sun.set, sun.rise + 30)],
      ['midday', Math.min(sun.set, sun.noon - 90)],
      ['afternoon', Math.min(sun.set, sun.noon + 90)],
      ['sunset', sun.set - 75],
      ['evening', sun.set + 20],
      ['night', sun.nauticalDusk],
    ]
    let floor = 0
    return starts.map(([slot, start]) => {
      floor = Math.min(1440, Math.max(floor, start))
      return { slot, start: floor }
    })
  }

  private static starsAt(elevation: number): number {
    const t = Math.max(0, Math.min(1, -elevation / 12))
    return t * t * (3 - 2 * t)
  }

  private static timeOfDay(minute: number, slots: readonly Slot[]): TimeOfDay {
    return (slots[Effects.slotIndex(minute, slots)] ?? { slot: 'night', start: 0 }).slot
  }

  private static slotIndex(minute: number, slots: readonly Slot[]): number {
    let index = slots.length - 1
    slots.forEach((s, i) => {
      if (minute >= s.start) index = i
    })
    return index
  }

  private static minute(ambience: Ambience): number {
    if (ambience.minuteOfDay !== undefined) return ambience.minuteOfDay
    const n = Effects.SLOTS.length
    const i = Effects.SLOTS.findIndex(s => s.slot === ambience.timeOfDay)
    const start = Effects.SLOTS[i]?.start ?? 0
    const next = Effects.SLOTS[(i + 1) % n]?.start ?? 0
    const length = (next - start + 1440) % 1440
    return (start + length / 2) % 1440
  }

  private static skyAt(minute: number, slots: readonly Slot[]): Sky {
    const m = ((minute % 1440) + 1440) % 1440
    const n = slots.length
    for (let i = 0; i < n; i++) {
      const slot = slots[i]
      const previous = slots[(i + n - 1) % n]
      const next = slots[(i + 1) % n]
      if (!slot || !previous || !next) continue
      const before = i === 0 ? slot.start - previous.start + 1440 : slot.start - previous.start
      const after = i === n - 1 ? next.start + 1440 - slot.start : next.start - slot.start
      const fade = Math.min(Effects.SKY_FADE, before / 2, after / 2)
      if (fade <= 0) continue
      let delta = m - slot.start
      if (delta > 720) delta -= 1440
      if (delta < -720) delta += 1440
      if (Math.abs(delta) >= fade) continue
      const t = (delta + fade) / (2 * fade)
      return Effects.mixSky(Effects.PALETTES[previous.slot], Effects.PALETTES[slot.slot], t * t * (3 - 2 * t))
    }
    return Effects.PALETTES[Effects.timeOfDay(m, slots)]
  }

  private static mixSky(a: Sky, b: Sky, t: number): Sky {
    return { top: Canvas.mix(a.top, b.top, t), bottom: Canvas.mix(a.bottom, b.bottom, t), halo: Canvas.mix(a.halo, b.halo, t), stars: a.stars + (b.stars - a.stars) * t }
  }

  private static tint(sky: Sky, c: Rgb, t: number): Sky {
    return { top: Canvas.mix(sky.top, Canvas.scale(c, 0.5), t), bottom: Canvas.mix(sky.bottom, c, t), halo: Canvas.mix(sky.halo, [255, 120, 170], t), stars: sky.stars }
  }

  private static dimmed(canvas: Canvas, timeOfDay: TimeOfDay): Canvas {
    const light = Effects.LIGHT[timeOfDay]
    if (light === undefined) return canvas
    const tone = (c: Rgb): Rgb => Canvas.scale(timeOfDay === 'sunset' ? Canvas.mix(c, Effects.SUNSET_TINT, 0.15) : c, light)
    const isRgb = (v: unknown): v is Rgb => Array.isArray(v) && v.length === 3 && v.every(n => typeof n === 'number')
    return new Proxy(canvas, {
      get: (obj, prop) => {
        const member: unknown = Reflect.get(obj, prop, obj)
        if (typeof member !== 'function') return member
        return (...args: unknown[]): unknown => member.apply(obj, args.map(a => (isRgb(a) ? tone(a) : a)))
      },
    })
  }

  private static isDark(timeOfDay: TimeOfDay): boolean {
    return timeOfDay === 'evening' || timeOfDay === 'night'
  }

  static background(canvas: Canvas, frame: number, at: number, ambience: Ambience, obstacles: readonly Obstacle[] = []): void {
    const sky = Effects.sky(ambience, frame)
    const holiday = ambience.holiday
    if (sky.stars > 0.1) Effects.twinkles(canvas, frame, sky.stars)
    if (holiday === 'star-wars') Effects.warp(canvas, frame)
    if (holiday === 'christmas') Effects.aurora(canvas, frame)
    Effects.celestial(canvas, frame, ambience, sky, obstacles)
    Effects.clouds(canvas, frame, ambience)
    if (ambience.isDisco) Effects.discoBeams(canvas, frame)
    if (sky.stars >= 0.25) Effects.shootingStar(canvas, frame, sky.stars)
    if (Effects.isDark(ambience.timeOfDay)) Effects.comet(canvas, frame, sky.stars)
    if (holiday === 'none') Effects.seasonBackground(canvas, frame, ambience)
    else Effects.holidayBackground(canvas, frame, holiday, ambience.timeOfDay, obstacles)
  }

  static hat(canvas: Canvas, cx: number, top: number, width: number, ambience: Ambience, frame: number, seed: number): void {
    const k = width / 10
    if (k <= 0) return
    switch (ambience.holiday) {
      case 'none':
        if (ambience.isFridayParty) Hats.partyHat(canvas, cx, top, k, frame, seed, Effects.PAPER)
        return
      case 'new-year':
        Hats.partyHat(canvas, cx, top, k, frame, seed, Effects.NEW_YEAR)
        return
      case 'epiphany':
        Hats.crown(canvas, cx, top, k, frame, seed)
        return
      case 'valentine':
        Hats.heartBoppers(canvas, cx, top, k, frame, seed)
        return
      case 'carnaval':
        Hats.gilleHat(canvas, cx, top, k, frame, seed)
        return
      case 'pi-day':
        Hats.pieHat(canvas, cx, top, k, frame, seed)
        return
      case 'april-fool':
        Hats.foolHat(canvas, cx, top, k, frame, seed)
        return
      case 'easter':
        Hats.bunnyEars(canvas, cx, top, k, frame, seed)
        return
      case 'may-day':
        Festive.sprig(canvas, cx + 1.2 * k, top + 0.3 * k, 1.1 * k, Math.sin(frame * 0.12 + seed * 5) * 0.5, false)
        return
      case 'star-wars':
        Hats.saberHat(canvas, cx, top, k, frame, seed)
        return
      case 'music':
        Hats.headphones(canvas, cx, top, k, frame, seed)
        return
      case 'national-day':
        Hats.cockade(canvas, cx, top, k, frame, seed)
        return
      case 'halloween':
        if (Canvas.hash(seed * 1000, 13) < 0.5) Hats.pumpkinHat(canvas, cx, top, k, frame, seed)
        else Hats.witchHat(canvas, cx, top, k, frame, seed)
        return
      case 'saint-nicolas':
        Hats.mitre(canvas, cx, top, k, frame, seed)
        return
      case 'christmas':
        Hats.santaHat(canvas, cx, top, k, frame, seed)
        return
      case 'friday-13':
        Hats.catHat(canvas, cx, top, k, frame, seed)
        return
    }
  }

  static hatHeight(ambience: Ambience, width: number): number {
    const k = (width * 0.7) / 10
    if (ambience.holiday === 'none') return ambience.isFridayParty ? Effects.HAT_HEIGHTS['new-year'] * k : 0
    return Effects.HAT_HEIGHTS[ambience.holiday] * k
  }

  static sleeping(canvas: Canvas, x: number, y: number, frame: number): void {
    Hats.sleeping(canvas, x, y, frame)
  }

  static celebrate(canvas: Canvas, center: Point, at: number, frame: number, ambience: Ambience): void {
    for (const c of ambience.celebrations) {
      const age = at - c.at
      if (age < 0 || age >= Effects.CELEBRATION_MS) continue
      const seed = Math.abs(c.at % 9973)
      switch (c.kind) {
        case 'confetti':
          Festive.confetti(canvas, age / 1000, seed, frame)
          break
        case 'fireworks':
          Effects.fireworks(canvas, center, age / 1000, seed)
          break
        case 'rocket':
          Night.rocket(canvas, center, age / 1000, seed, frame)
          break
      }
    }
  }

  static finale(canvas: Canvas, at: Point, t: number, status: ExitStatus, color: Rgb, frame: number, seed: number): void {
    const u = Math.max(0, Math.min(1, t))
    switch (status) {
      case 'done':
        Effects.finaleDone(canvas, at, u, color, frame, seed)
        return
      case 'failed':
        Effects.finaleFailed(canvas, at, u, seed)
        return
      case 'killed':
        Effects.dustPuff(canvas, at, u, seed)
        return
    }
  }

  static teleport(canvas: Canvas, from: Point, to: Point, t: number, color: Rgb, frame: number): void {
    const u = Math.max(0, Math.min(1, t))
    const env = Math.min(1, u * 5) * Math.min(1, (1 - u) * 4)
    if (env <= 0) return
    const dx = to.x - from.x
    const dy = to.y - from.y
    const len = Math.max(1, Math.hypot(dx, dy))
    const nx = -dy / len
    const ny = dx / len
    const wob = Math.sin(frame * 0.5) * len * 0.05
    const p1: Point = { x: from.x + dx * 0.33 + nx * (len * 0.12 + wob), y: from.y + dy * 0.33 + ny * (len * 0.12 + wob) }
    const p2: Point = { x: from.x + dx * 0.66 - nx * (len * 0.08 - wob), y: from.y + dy * 0.66 - ny * (len * 0.08 - wob) }
    const bright = Canvas.mix(color, Effects.WHITE, 0.55)
    Effects.column(canvas, from, color, (1 - u) * env + 0.15 * env, frame)
    canvas.curve(from, p1, p2, to, 2.4, color, 0.12 * env)
    canvas.curve(from, p1, p2, to, 1, color, 0.3 * env)
    canvas.curve(from, p1, p2, to, 0.35, bright, (0.6 + 0.3 * Math.sin(frame * 1.3)) * env)
    const tick = Math.floor(frame)
    for (let k = 0; k < 12; k++) {
      const s = (u * 1.6 + k / 12 + frame * 0.015) % 1
      const q = Canvas.bezier(from, p1, p2, to, s)
      const a = env * (0.4 + 0.6 * Canvas.hash(k, tick))
      canvas.glow(q.x, q.y, 1.6, color, 0.5 * a)
      canvas.fillCircle(q.x, q.y, 0.35 + 0.25 * s, Effects.WHITE, 0.85 * a)
    }
    canvas.glow(to.x, to.y, 4 + 2 * Math.sin(frame * 0.6), color, 0.35 * env)
  }

  static foreground(canvas: Canvas, frame: number, at: number, ambience: Ambience): void {
    switch (ambience.holiday) {
      case 'christmas':
        Night.snow(canvas, frame, 8, 50, 1.8)
        break
      case 'new-year':
        Effects.drift(canvas, frame, Effects.NEW_YEAR, 14, 0)
        break
      case 'carnaval':
        Effects.drift(canvas, frame, Effects.PAPER, 18, 20)
        break
      case 'valentine':
        Festive.hearts(canvas, frame, 3, 40, 1.8)
        break
      case 'none':
        Effects.seasonForeground(canvas, frame, ambience.season, ambience.timeOfDay)
        break
      default:
        break
    }
    if (ambience.isFridayParty) Effects.drift(canvas, frame, Effects.PAPER, 12, 0)
    if (ambience.isDisco) Night.mirrorBall(canvas, frame)
    if (ambience.isDebuggerActive) Festive.ladybug(canvas, frame)
  }

  private static celestial(canvas: Canvas, frame: number, ambience: Ambience, sky: Sky, obstacles: readonly Obstacle[]): void {
    const spot = Effects.celestialSpot(canvas, ambience, obstacles)
    if (Effects.isMoonUp(ambience)) {
      if (ambience.holiday === 'halloween') Night.harvestMoon(canvas, frame, spot)
      else Night.paleMoon(canvas, Canvas.mix(sky.top, sky.bottom, 0.12), spot)
      return
    }
    const alpha = ambience.sun ? Math.max(0, Math.min(1, (SolarClock.elevationAt(ambience.sun, Effects.minute(ambience)) + 3) / 4)) : 1
    if (alpha > 0) Night.sun(canvas, frame, spot, ambience.season === 'summer' && ambience.holiday === 'none', alpha)
  }

  private static isMoonUp(ambience: Ambience): boolean {
    const sun = ambience.sun
    if (!sun) return Effects.isDark(ambience.timeOfDay)
    const minute = Effects.minute(ambience)
    return minute >= sun.civilDusk || minute < sun.civilDawn
  }

  static celestialSpot(canvas: Canvas, ambience: Ambience, obstacles: readonly Obstacle[] = []): Spot {
    const w = canvas.width
    const m = Math.min(w, canvas.height)
    if (Effects.isMoonUp(ambience)) {
      if (ambience.holiday === 'halloween') {
        const r = Math.max(5, m * 0.11)
        return Effects.slideDisc(canvas, r, 1.15, 0, Math.max(0, w - 2 * r - 8), t => ({ x: w - r - 4 - t, y: r + 3 }), 0, obstacles)
      }
      const r = Math.max(3.5, m * 0.075)
      return Effects.slideDisc(canvas, r, 1.15, 0, Math.max(0, w - 2 * r - 10), t => ({ x: r + 5 + t, y: r + 3 }), 0, obstacles)
    }
    const r = Math.max(3, m * 0.065)
    const sun = ambience.sun
    if (sun) {
      const span = Math.max(1, sun.set - sun.rise)
      const height = (p: number): number => SolarClock.elevationAt(sun, sun.rise + p * span) / Math.max(1, sun.peak)
      const along = Math.max(Effects.ARC_LO, Math.min(Effects.ARC_HI, (Effects.minute(ambience) - sun.rise) / span))
      const arc = (p: number): Point => ({ x: w * (0.07 + 0.86 * p), y: canvas.height * 0.5 - height(p) * canvas.height * 0.4 })
      return Effects.slideDisc(canvas, r, 1.7, Effects.ARC_LO, Effects.ARC_HI, arc, along, obstacles, p => Math.max(0, Math.min(1, height(p))))
    }
    const p0 = Math.max(0, Math.min(1, (Effects.minute(ambience) - 300) / 900))
    const on = (p: number): Point => ({ x: w * (0.07 + 0.86 * p), y: canvas.height * 0.5 - Math.sin(Math.PI * p) * canvas.height * 0.4 })
    return Effects.slideDisc(canvas, r, 1.7, 0, 1, on, p0, obstacles, p => Math.sin(Math.PI * p))
  }

  private static slideDisc(canvas: Canvas, r: number, reach: number, lo: number, hi: number, at: (t: number) => Point, t0: number, obstacles: readonly Obstacle[], lift: (t: number) => number = () => 0): Spot {
    const free = (t: number): boolean => Effects.isClear(at(t), r * reach, obstacles)
    const step = (hi - lo) / 120
    let found: number | undefined = free(t0) ? t0 : undefined
    for (let k = 1; found === undefined && step > 0 && k <= 120; k++) {
      if (t0 + k * step <= hi && free(t0 + k * step)) found = t0 + k * step
      else if (t0 - k * step >= lo && free(t0 - k * step)) found = t0 - k * step
    }
    if (found !== undefined) {
      const p = at(found)
      return { x: p.x, y: p.y, r, lift: lift(found) }
    }
    const small = r * 0.5
    const margin = small + 2
    const corners: Point[] = [{ x: margin, y: margin }, { x: canvas.width - margin, y: margin }]
    const corner = corners.find(c => Effects.isClear(c, small * reach, obstacles)) ?? corners[0] ?? { x: margin, y: margin }
    return { x: corner.x, y: corner.y, r: small, lift: lift(t0) }
  }

  private static isClear(c: Point, radius: number, obstacles: readonly Obstacle[]): boolean {
    return obstacles.every(o => {
      const dx = Math.max(o.x - c.x, 0, c.x - (o.x + o.w))
      const dy = Math.max(o.y - c.y, 0, c.y - (o.y + o.h))
      return dx * dx + dy * dy >= radius * radius
    })
  }

  private static seasonBackground(target: Canvas, frame: number, ambience: Ambience): void {
    const canvas = Effects.dimmed(target, ambience.timeOfDay)
    switch (ambience.season) {
      case 'winter':
        Night.snow(canvas, frame, 16, 0, 1)
        Effects.frost(canvas, frame)
        return
      case 'spring':
        Festive.petals(canvas, frame, 14, 0, 1)
        Festive.meadow(canvas, frame)
        return
      case 'summer':
        if (Effects.isDark(ambience.timeOfDay)) Festive.fireflies(target, frame)
        else {
          Effects.haze(canvas, frame)
          Festive.butterflies(canvas, frame)
        }
        return
      case 'autumn':
        Festive.leaves(canvas, frame, 16, 0, 1.1)
        return
    }
  }

  private static seasonForeground(target: Canvas, frame: number, season: Season, timeOfDay: TimeOfDay): void {
    const canvas = Effects.dimmed(target, timeOfDay)
    switch (season) {
      case 'winter':
        Night.snow(canvas, frame, 5, 50, 1.8)
        return
      case 'spring':
        Festive.petals(canvas, frame, 4, 80, 1.8)
        return
      case 'summer':
        return
      case 'autumn':
        Festive.leaves(canvas, frame, 3, 90, 1.7)
        return
    }
  }

  private static holidayBackground(canvas: Canvas, frame: number, holiday: Holiday, timeOfDay: TimeOfDay, obstacles: readonly Obstacle[]): void {
    switch (holiday) {
      case 'none':
        return
      case 'new-year':
        Effects.bursts(canvas, frame, Effects.NEW_YEAR, 450, 30)
        Effects.glitter(canvas, frame, Effects.GOLD, 6, 460)
        return
      case 'epiphany':
        Night.guidingStar(canvas, frame)
        Effects.glitter(canvas, frame, Effects.GOLD, 7, 470)
        return
      case 'valentine':
        Festive.hearts(canvas, frame, 12, 0, 1)
        return
      case 'carnaval':
        Festive.oranges(canvas, frame)
        return
      case 'pi-day':
        Festive.pis(canvas, frame)
        return
      case 'april-fool':
        Festive.fishes(canvas, frame)
        return
      case 'easter':
        Effects.bells(canvas, frame)
        Festive.eggs(Effects.dimmed(canvas, timeOfDay), frame)
        return
      case 'may-day':
        Festive.lilies(Effects.dimmed(canvas, timeOfDay), frame)
        return
      case 'star-wars':
        Festive.sabers(canvas, frame)
        return
      case 'music':
        Festive.notes(canvas, frame)
        return
      case 'national-day':
        Effects.bursts(canvas, frame, Effects.NATIONAL_BURSTS, 400, 38)
        Festive.nationalFlag(canvas, frame, obstacles)
        return
      case 'halloween':
        Night.bats(canvas, frame)
        return
      case 'saint-nicolas':
        Night.speculoos(canvas, frame)
        return
      case 'christmas':
        Night.snow(canvas, frame, 30, 0, 1)
        Effects.frost(canvas, frame)
        return
      case 'friday-13':
        Night.brokenMirror(canvas, frame)
        Night.walkingCat(canvas, frame)
        return
    }
  }

  static clouds(canvas: Canvas, frame: number, ambience: Ambience): void {
    Night.clouds(canvas, frame, ambience)
  }

  static comet(canvas: Canvas, frame: number, stars: number): void {
    Night.comet(canvas, frame, stars)
  }

  private static twinkles(canvas: Canvas, frame: number, stars: number): void {
    for (let i = 0; i < 26; i++) {
      const sway = frame * (0.006 + Canvas.hash(i, 43) * 0.006) + i * 1.7
      const x = Canvas.hash(i, 31) * canvas.width + Math.sin(sway) * 0.45
      const y = Canvas.hash(i, 37) * canvas.height * 0.85 + Math.cos(sway * 0.8) * 0.25
      const tw = 0.5 + 0.5 * Math.sin(frame * (0.08 + Canvas.hash(i, 41) * 0.12) + i * 2.1)
      const c = Canvas.mix([200, 214, 255], Effects.WHITE, tw)
      canvas.glow(x, y, 1.2 + tw * 0.9, c, (0.25 + 0.35 * tw) * stars)
      if (tw > 0.85 && i % 3 === 0) Festive.sparkle(canvas, x, y, 0.9, c, (tw - 0.85) * 4 * stars)
    }
  }

  private static aurora(canvas: Canvas, frame: number): void {
    const n = 14
    for (let i = 0; i < n; i++) {
      const s = i / (n - 1)
      const x = s * canvas.width
      const y = canvas.height * 0.13 + Math.sin(s * 5 + frame * 0.03) * canvas.height * 0.05
      const c = Effects.AURORA[i % Effects.AURORA.length] ?? Effects.ACCENT
      const breathe = 0.5 + 0.5 * Math.sin(frame * 0.05 + s * 7)
      canvas.glow(x, y, canvas.height * 0.13, c, 0.09 + 0.07 * breathe)
      canvas.glow(x, y + canvas.height * 0.06, canvas.height * 0.08, c, 0.08 * breathe)
    }
  }

  private static shootingStar(canvas: Canvas, frame: number, stars: number): void {
    const window = Math.floor(frame / Effects.SHOOTING_PERIOD)
    if (Canvas.hash(window, 7) <= 0.6) return
    const local = frame - window * Effects.SHOOTING_PERIOD
    if (local < 0 || local >= Effects.SHOOTING_FRAMES) return
    const p = local / Effects.SHOOTING_FRAMES
    const dir = Canvas.hash(window, 11) > 0.5 ? 1 : -1
    const sx = canvas.width * (dir > 0 ? 0.1 + Canvas.hash(window, 8) * 0.4 : 0.5 + Canvas.hash(window, 8) * 0.4)
    const sy = 2 + Canvas.hash(window, 9) * canvas.height * 0.25
    const travel = canvas.width * 0.5
    const hx = sx + dir * travel * p
    const hy = sy + travel * 0.35 * p
    const fade = Math.sin(Math.PI * p) * Math.min(1, stars * 1.4)
    const tail = 10
    for (let k = 0; k < 5; k++) {
      const a0 = k / 5
      const a1 = (k + 1) / 5
      canvas.line(
        { x: hx - dir * tail * a0, y: hy - tail * 0.35 * a0 },
        { x: hx - dir * tail * a1, y: hy - tail * 0.35 * a1 },
        0.5 - k * 0.07,
        Canvas.mix(Effects.WHITE, [140, 190, 255], a0),
        fade * (1 - a0) * 0.8,
      )
    }
    canvas.glow(hx, hy, 2.2, [200, 225, 255], 0.7 * fade)
    canvas.fillCircle(hx, hy, 0.45, Effects.WHITE, fade)
  }

  private static discoBeams(canvas: Canvas, frame: number): void {
    const apex: Point = { x: canvas.width / 2, y: 5 }
    const reach = canvas.height * 1.15
    for (let i = 0; i < 4; i++) {
      const angle = Math.PI / 2 + Math.sin(frame * 0.045 + i * 1.6) * 1.05
      const spread = 0.13
      const c = Effects.DISCO[(i + Math.floor(frame / 40)) % Effects.DISCO.length] ?? Effects.WHITE
      const a: Point = { x: apex.x + Math.cos(angle - spread) * reach, y: apex.y + Math.sin(angle - spread) * reach }
      const b: Point = { x: apex.x + Math.cos(angle + spread) * reach, y: apex.y + Math.sin(angle + spread) * reach }
      canvas.fillTriangle(apex, a, b, c, 0.085)
      const spot: Point = { x: apex.x + Math.cos(angle) * reach * 0.7, y: apex.y + Math.sin(angle) * reach * 0.7 }
      canvas.glow(spot.x, spot.y, 7, c, 0.12)
    }
  }

  private static fireworks(canvas: Canvas, center: Point, s: number, seed: number): void {
    for (let i = 0; i < 3; i++) {
      const launch = i * 0.65
      const ts = s - launch
      if (ts < 0) continue
      const c = Effects.PAPER[(i * 2 + seed) % Effects.PAPER.length] ?? Effects.WARN
      const bx = center.x + (i - 1) * canvas.width * 0.3 + (Canvas.hash(i, seed) - 0.5) * 6
      const by = canvas.height * (0.18 + Canvas.hash(i, seed + 1) * 0.15)
      const sx = bx - (i - 1) * 4
      const sy = canvas.height + 1
      const rise = 0.75
      if (ts < rise) {
        const p = 1 - (1 - ts / rise) * (1 - ts / rise)
        const x = sx + (bx - sx) * p
        const y = sy + (by - sy) * p
        const px = sx + (bx - sx) * Math.max(0, p - 0.18)
        const py = sy + (by - sy) * Math.max(0, p - 0.18)
        canvas.line({ x: px, y: py }, { x, y }, 0.4, Canvas.mix(c, Effects.WARN, 0.5), 0.5)
        canvas.glow(x, y, 1.8, Effects.WARN, 0.6)
        canvas.fillCircle(x, y, 0.45, Effects.WHITE)
        continue
      }
      const te = ts - rise
      const life = 2
      if (te > life) continue
      const fade = 1 - te / life
      if (te < 0.25) canvas.glow(bx, by, 9 * (1 - te * 4), Canvas.mix(c, Effects.WHITE, 0.5), 0.5 * (1 - te * 4))
      const radius = 13 * (1 - Math.exp(-3.2 * te))
      const drop = 2.4 * te * te
      const n = 22
      for (let j = 0; j < n; j++) {
        const ang = (j / n) * Math.PI * 2 + Canvas.hash(i, seed + 2) * 3
        const rr = radius * (0.85 + 0.15 * Canvas.hash(j, seed + i))
        const x = bx + Math.cos(ang) * rr
        const y = by + Math.sin(ang) * rr * 0.9 + drop
        const tr = rr * 0.72
        const tx = bx + Math.cos(ang) * tr
        const ty = by + Math.sin(ang) * tr * 0.9 + drop * 0.7
        const sc = j % 2 === 0 ? c : Canvas.mix(c, Effects.WHITE, 0.45)
        canvas.line({ x: tx, y: ty }, { x, y }, 0.5, sc, 0.7 * fade)
        const twinkle = te > 1 ? 0.5 + 0.5 * Math.sin(te * 30 + j) : 1
        canvas.glow(x, y, 1.6, sc, 0.6 * fade * twinkle)
        canvas.fillCircle(x, y, 0.5, Canvas.mix(sc, Effects.WHITE, 0.6), fade * twinkle)
      }
    }
  }

  private static finaleDone(canvas: Canvas, at: Point, t: number, color: Rgb, frame: number, seed: number): void {
    const fade = 1 - t
    const r = 3 + t * 10
    const n = 12
    canvas.strokeCircle(at.x, at.y, r * 0.92, 0.35 * fade + 0.1, Effects.OK, 0.35 * fade)
    for (let j = 0; j < n; j++) {
      const ang = (j / n) * Math.PI * 2 + t * 1.2
      const tw = 0.6 + 0.4 * Math.sin(frame * 0.8 + j * 1.7)
      Festive.sparkle(canvas, at.x + Math.cos(ang) * r, at.y + Math.sin(ang) * r * 0.85, (0.8 + (j % 2) * 0.4) * (0.5 + fade * 0.6), Effects.OK, fade * tw)
    }
    for (let i = 0; i < 16; i++) {
      const ang = -Math.PI / 2 + (Canvas.hash(i, seed * 101) - 0.5) * 2.6
      const v = 10 + Canvas.hash(i, seed * 101 + 1) * 10
      const tt = t * 1.3
      const x = at.x + Math.cos(ang) * v * tt
      const y = at.y - 2 + Math.sin(ang) * v * tt + 14 * tt * tt
      const c = i % 3 === 0 ? color : (Effects.PAPER[i % Effects.PAPER.length] ?? Effects.OK)
      const spin = tt * 12 + i
      const dx = Math.cos(spin) * 0.7
      const dy = Math.sin(spin) * 0.7
      canvas.line({ x: x - dx, y: y - dy }, { x: x + dx, y: y + dy }, 0.6, c, Math.min(1, fade * 1.6))
    }
    const pop = t < 0.25 ? t / 0.25 : 1
    const ck = (1 + 0.35 * Math.sin(Math.min(1, t / 0.3) * Math.PI)) * pop
    const cx = at.x
    const cy = at.y - 9 - t * 2
    const a: Point = { x: cx - 2 * ck, y: cy }
    const b: Point = { x: cx - 0.6 * ck, y: cy + 1.4 * ck }
    const d: Point = { x: cx + 2.4 * ck, y: cy - 2 * ck }
    const ca = Math.min(1, fade * 1.5)
    canvas.glow(cx, cy, 4 * ck, Effects.OK, 0.4 * ca)
    canvas.line(a, b, 0.9, Effects.OK, ca)
    canvas.line(b, d, 0.9, Effects.OK, ca)
    canvas.line(a, b, 0.35, Effects.WHITE, 0.8 * ca)
    canvas.line(b, d, 0.35, Effects.WHITE, 0.8 * ca)
    Festive.sparkle(canvas, d.x + 0.4, d.y - 0.4, 1.2 * ck, Effects.WHITE, ca)
  }

  private static finaleFailed(canvas: Canvas, at: Point, t: number, seed: number): void {
    const fade = 1 - t
    if (t < 0.3) canvas.glow(at.x, at.y, 9, Effects.KO, 0.55 * (1 - t / 0.3))
    const r = 3 + t * 11
    canvas.strokeCircle(at.x, at.y, r, 1.4 * fade + 0.2, Effects.KO, 0.75 * fade)
    canvas.strokeCircle(at.x, at.y, r * 0.75, 0.4, Canvas.mix(Effects.KO, Effects.WHITE, 0.4), 0.4 * fade)
    Effects.smoke(canvas, at, t, seed, Effects.SMOKE, 6)
  }

  private static smoke(canvas: Canvas, at: Point, t: number, seed: number, c: Rgb, n: number): void {
    for (let i = 0; i < n; i++) {
      const delay = i * 0.08
      const p = (t - delay) / (1 - delay)
      if (p <= 0) continue
      const x = at.x + (Canvas.hash(i, seed * 53) - 0.5) * 6 + Math.sin(p * 4 + i) * 1.2
      const y = at.y - 3 - p * 9
      const r = 1 + p * 2.2
      const a = Math.sin(Math.PI * Math.min(1, p * 1.1)) * 0.55
      canvas.fillCircle(x, y, r, Canvas.mix(c, Effects.INK, 0.3), a * 0.7)
      canvas.fillCircle(x - r * 0.25, y - r * 0.25, r * 0.65, Canvas.mix(c, Effects.WHITE, 0.15), a * 0.6)
    }
  }

  private static dustPuff(canvas: Canvas, at: Point, t: number, seed: number): void {
    const fade = Math.sin(Math.PI * Math.min(1, t * 1.05))
    for (let i = 0; i < 12; i++) {
      const side = i % 2 === 0 ? -1 : 1
      const spread = (0.3 + Canvas.hash(i, seed * 71) * 0.7) * 9 * (1 - Math.exp(-3 * t))
      const x = at.x + side * spread
      const y = at.y + 5 - Canvas.hash(i, seed * 71 + 1) * 3 * t - t * 1.5
      const r = 1.2 + t * 2.2 * (0.6 + Canvas.hash(i, seed * 71 + 2) * 0.6)
      canvas.fillCircle(x, y, r, Effects.DUST, 0.6 * fade)
      canvas.fillCircle(x - r * 0.2, y - r * 0.25, r * 0.6, Canvas.mix(Effects.DUST, Effects.WHITE, 0.25), 0.5 * fade)
    }
    canvas.fillEllipse(at.x, at.y + 5, 3 + t * 7, 1.1 + t * 0.6, Effects.DUST, 0.4 * fade)
  }

  private static column(canvas: Canvas, at: Point, color: Rgb, strength: number, frame: number): void {
    if (strength <= 0.01) return
    const h = 18
    const bright = Canvas.mix(color, Effects.WHITE, 0.6)
    for (let k = 0; k < 6; k++) {
      const y = at.y + 3 - (k / 5) * h
      const fall = 1 - k / 6
      canvas.glow(at.x, y, 3.4, color, 0.32 * strength * fall)
    }
    canvas.line({ x: at.x, y: at.y + 3 }, { x: at.x, y: at.y + 3 - h * 0.85 }, 1.4, color, 0.25 * strength)
    canvas.line({ x: at.x, y: at.y + 3 }, { x: at.x, y: at.y + 3 - h * 0.7 }, 0.45, bright, 0.6 * strength)
    canvas.glow(at.x, at.y + 3, 5, color, 0.4 * strength)
    for (let k = 0; k < 3; k++) {
      const p = (frame * 0.06 + k / 3) % 1
      const y = at.y + 4 - p * h
      const a = strength * Math.sin(Math.PI * p)
      canvas.fillEllipse(at.x, y, 2.6 - p * 1.2, 0.5, bright, 0.7 * a)
      canvas.glow(at.x, y, 2.4, color, 0.3 * a)
    }
  }

  private static drift(canvas: Canvas, frame: number, palette: readonly Rgb[], count: number, salt: number): void {
    for (let n = 0; n < count; n++) {
      const i = n + salt
      const h = canvas.height + 6
      const speed = 0.1 + Canvas.hash(i, 61) * 0.12
      const y = ((Canvas.hash(i, 62) * h + frame * speed) % h) - 3
      const x = Canvas.hash(i, 63) * canvas.width + Math.sin(frame * 0.06 + i) * 2.5
      const spin = frame * (0.15 + Canvas.hash(i, 64) * 0.2) + i
      const c = palette[i % palette.length] ?? Effects.WARN
      const flip = Math.abs(Math.cos(spin * 1.3))
      const dx = Math.cos(spin) * 0.8
      const dy = Math.sin(spin) * 0.8
      canvas.line({ x: x - dx, y: y - dy }, { x: x + dx, y: y + dy }, 0.5 + 0.4 * flip, Canvas.mix(c, Effects.INK, 0.3 * (1 - flip)), 0.75)
    }
  }

  private static frost(canvas: Canvas, frame: number): void {
    for (let x = 0; x <= canvas.width; x += 10) canvas.glow(x, canvas.height + 1, 6, Effects.ICE, 0.13)
    for (let i = 0; i < 18; i++) {
      const x = Canvas.hash(i, 501) * canvas.width
      const y = canvas.height - 0.7 - Canvas.hash(i, 502) * 2.6
      const tw = Math.sin(frame * (0.06 + Canvas.hash(i, 503) * 0.08) + i * 2.4)
      if (tw > 0.55) Festive.sparkle(canvas, x, y, 0.7 + (tw - 0.55) * 2.2, Effects.ICE, (tw - 0.55) * 2.2)
      else canvas.fillCircle(x, y, 0.3, Effects.ICE, 0.45)
    }
  }

  private static haze(canvas: Canvas, frame: number): void {
    const breathe = 0.85 + 0.15 * Math.sin(frame * 0.03)
    for (let x = 0; x <= canvas.width; x += 14) canvas.glow(x, canvas.height + 4, 20, [255, 156, 64], 0.2 * breathe)
  }

  private static glitter(canvas: Canvas, frame: number, c: Rgb, count: number, salt: number): void {
    for (let i = 0; i < count; i++) {
      const x = 4 + Canvas.hash(i, salt) * (canvas.width - 8)
      const y = 3 + Canvas.hash(i, salt + 1) * canvas.height * 0.55
      const twinkle = 0.5 + 0.5 * Math.sin(frame * (0.1 + Canvas.hash(i, salt + 2) * 0.08) + i * 2.1)
      Festive.sparkle(canvas, x, y, 0.8 + twinkle * 0.9, c, 0.25 + 0.6 * twinkle)
    }
  }

  private static bursts(canvas: Canvas, frame: number, colors: readonly Rgb[], salt: number, period: number): void {
    const life = 66
    const rise = 14
    const index = Math.floor(frame / period)
    const t = frame - index * period
    const lanes = Math.ceil((life + rise) / period) + 1
    for (let w = 0; w < lanes; w++) {
      const n = index - w
      if (n < 0) continue
      const age = t + w * period
      if (age > life + rise) continue
      const c = colors[n % colors.length] ?? Effects.WARN
      const isBlack = c === Effects.FLAG_BLACK
      const bx = canvas.width * (0.2 + Canvas.hash(n, salt + 1) * 0.6)
      const by = canvas.height * (0.15 + Canvas.hash(n, salt + 2) * 0.25)
      if (age < rise) {
        const p = 1 - (1 - age / rise) * (1 - age / rise)
        const sx = bx + (Canvas.hash(n, salt + 3) - 0.5) * 6
        const x = sx + (bx - sx) * p
        const y = canvas.height + 1 + (by - canvas.height - 1) * p
        const q = Math.max(0, p - 0.15)
        canvas.line({ x: sx + (bx - sx) * q, y: canvas.height + 1 + (by - canvas.height - 1) * q }, { x, y }, 0.4, Effects.WARN, 0.5)
        canvas.glow(x, y, 1.6, Effects.WARN, 0.55)
        canvas.fillCircle(x, y, 0.45, Effects.WHITE)
        continue
      }
      const te = (age - rise) / life
      const fade = 1 - te
      if (te < 0.08) canvas.glow(bx, by, 9 * (1 - te * 12), isBlack ? Effects.WHITE : c, 0.5 * (1 - te * 12))
      const radius = 12 * (1 - Math.exp(-4 * te))
      const drop = 5 * te * te
      const count = 24
      for (let j = 0; j < count; j++) {
        const ang = (j / count) * Math.PI * 2 + Canvas.hash(n, salt + 4) * 3
        const rr = radius * (0.85 + 0.15 * Canvas.hash(j, n))
        const x = bx + Math.cos(ang) * rr
        const y = by + Math.sin(ang) * rr * 0.9 + drop
        const tx = bx + Math.cos(ang) * rr * 0.72
        const ty = by + Math.sin(ang) * rr * 0.72 * 0.9 + drop * 0.7
        const twinkle = te > 0.5 ? 0.55 + 0.45 * Math.sin(te * 40 + j) : 1
        if (isBlack) {
          canvas.line({ x: tx, y: ty }, { x, y }, 0.9, [150, 156, 176], 0.55 * fade)
          canvas.line({ x: tx, y: ty }, { x, y }, 0.45, c, 0.95 * fade)
          canvas.fillCircle(x, y, 0.85, [170, 176, 196], 0.85 * fade * twinkle)
          canvas.fillCircle(x, y, 0.5, c, fade * twinkle)
        } else {
          canvas.line({ x: tx, y: ty }, { x, y }, 0.5, c, 0.75 * fade)
          canvas.glow(x, y, 1.6, c, 0.6 * fade * twinkle)
          canvas.fillCircle(x, y, 0.55, Canvas.mix(c, Effects.WHITE, 0.5), fade * twinkle)
        }
      }
    }
  }

  private static bells(canvas: Canvas, frame: number): void {
    for (let i = 0; i < 2; i++) {
      const p = Night.bellAt(canvas, frame, i)
      const period = 90
      const t = (frame + i * 45) % period
      if (t < 30) {
        const from = Night.bellAt(canvas, frame - t, i)
        const y = from.y + 2.4 + 0.06 * t * t
        if (y < canvas.height - 1.2) Festive.egg(canvas, from.x - t * 0.1, y, 0.5, i + 4)
      }
      Night.bell(canvas, p.x, p.y, 1.55, Math.sin(frame * 0.12 + i * 1.3), frame + i * 7)
    }
  }

  private static warp(canvas: Canvas, frame: number): void {
    const cx = canvas.width / 2
    const cy = canvas.height * 0.45
    for (let i = 0; i < 34; i++) {
      const a = Canvas.hash(i, 591) * Math.PI * 2
      const p = (frame * (0.004 + Canvas.hash(i, 592) * 0.006) + Canvas.hash(i, 593)) % 1
      const r0 = 3 + p * p * canvas.width * 0.6
      const len = 0.4 + p * p * 7
      const c = Canvas.mix([140, 170, 255], Effects.WHITE, p)
      canvas.line({ x: cx + Math.cos(a) * r0, y: cy + Math.sin(a) * r0 }, { x: cx + Math.cos(a) * (r0 + len), y: cy + Math.sin(a) * (r0 + len) }, 0.25 + 0.3 * p, c, 0.15 + 0.5 * p)
    }
  }

}
