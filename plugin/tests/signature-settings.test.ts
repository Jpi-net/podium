import { expect, test } from 'claude-code/testing'
import { SignatureSettings, type Consent, type Settings } from '../hooks/signature/settings'

class SettingsFixture {
  static parse(value: unknown): Settings {
    return SignatureSettings.parse(JSON.stringify(value))
  }

  static emails(count: number): string[] {
    return Array.from({ length: count }, (_, index) => `user${index}@example.com`)
  }

  static with(exclude: string[]): Settings {
    return { ...SignatureSettings.defaults(), exclude }
  }
}

test('defaults leave the consent undecided', () => {
  // Assert
  expect(SignatureSettings.defaults().consent).toBe('undecided')
})

test('defaults capture sessions and history but not past sessions', () => {
  // Act
  const capture = SignatureSettings.defaults().capture

  // Assert
  expect(capture).toEqual({ sessions: true, history: true, pastSessions: false })
})

test('parse of an empty text gives the defaults', () => {
  // Assert
  expect(SignatureSettings.parse('')).toEqual(SignatureSettings.defaults())
})

test('parse of an array gives the defaults', () => {
  // Assert
  expect(SignatureSettings.parse('[]')).toEqual(SignatureSettings.defaults())
})

test('parse of garbage gives the defaults', () => {
  // Assert
  expect(SignatureSettings.parse('{not json')).toEqual(SignatureSettings.defaults())
})

test('parse of an empty object gives the defaults', () => {
  // Assert
  expect(SignatureSettings.parse('{}')).toEqual(SignatureSettings.defaults())
})

test('parse keeps a valid consent', () => {
  // Assert
  expect(SettingsFixture.parse({ consent: 'enabled' }).consent).toBe('enabled')
})

test('parse falls back to undecided for an unknown consent', () => {
  // Assert
  expect(SettingsFixture.parse({ consent: 'maybe' }).consent).toBe('undecided')
})

test('parse falls back to undecided for a consent of the wrong type', () => {
  // Assert
  expect(SettingsFixture.parse({ consent: 5 }).consent).toBe('undecided')
})

test('parse ignores capture flags of the wrong type', () => {
  // Act
  const settings = SettingsFixture.parse({ capture: { sessions: 'no', history: 0, pastSessions: 'yes' } })

  // Assert
  expect(settings.capture).toEqual({ sessions: true, history: true, pastSessions: false })
})

test('parse keeps valid capture and apply flags', () => {
  // Act
  const settings = SettingsFixture.parse({
    capture: { sessions: false, pastSessions: true },
    apply: { section: false, proxy: false }
  })

  // Assert
  expect(settings.capture).toEqual({ sessions: false, history: true, pastSessions: true })
  expect(settings.apply).toEqual({ section: false, context: true, hints: true, proxy: false })
})

test('parse ignores apply flags of the wrong type', () => {
  // Act
  const settings = SettingsFixture.parse({ apply: { section: 'x', context: null } })

  // Assert
  expect(settings.apply).toEqual(SignatureSettings.defaults().apply)
})

test('parse ignores a learning section that is not an object', () => {
  // Assert
  expect(SettingsFixture.parse({ learning: 'fast' }).learning).toEqual(SignatureSettings.defaults().learning)
})

test('parse ignores learning numbers of the wrong type', () => {
  // Act
  const learning = SettingsFixture.parse({ learning: { runsPerDay: '3', tokensPerDay: null, idleMinutes: 'x', background: 1 } }).learning

  // Assert
  expect(learning).toEqual(SignatureSettings.defaults().learning)
})

test('parse maps an unknown model to sonnet', () => {
  // Assert
  expect(SettingsFixture.parse({ learning: { model: 'gpt' } }).learning.model).toBe('sonnet')
})

test('parse keeps a known model', () => {
  // Assert
  expect(SettingsFixture.parse({ learning: { model: 'opus' } }).learning.model).toBe('opus')
})

test('parse keeps sonnet for a model of the wrong type', () => {
  // Assert
  expect(SettingsFixture.parse({ learning: { model: 3 } }).learning.model).toBe('sonnet')
})

test('parse clamps runs per day between 0 and 24', () => {
  // Assert
  expect(SettingsFixture.parse({ learning: { runsPerDay: -5 } }).learning.runsPerDay).toBe(0)
  expect(SettingsFixture.parse({ learning: { runsPerDay: 99 } }).learning.runsPerDay).toBe(24)
})

test('parse rounds runs per day to an integer', () => {
  // Assert
  expect(SettingsFixture.parse({ learning: { runsPerDay: 3.6 } }).learning.runsPerDay).toBe(4)
})

test('parse clamps tokens per day between 0 and 5000000', () => {
  // Assert
  expect(SettingsFixture.parse({ learning: { tokensPerDay: -1 } }).learning.tokensPerDay).toBe(0)
  expect(SettingsFixture.parse({ learning: { tokensPerDay: 9000000000 } }).learning.tokensPerDay).toBe(5000000)
})

test('parse clamps idle minutes between 3 and 120', () => {
  // Assert
  expect(SettingsFixture.parse({ learning: { idleMinutes: 1 } }).learning.idleMinutes).toBe(3)
  expect(SettingsFixture.parse({ learning: { idleMinutes: 500 } }).learning.idleMinutes).toBe(120)
})

test('parse keeps fractional idle minutes', () => {
  // Assert
  expect(SettingsFixture.parse({ learning: { idleMinutes: 7.5 } }).learning.idleMinutes).toBe(7.5)
})

test('parse clamps the half life between 1 and 120 months', () => {
  // Assert
  expect(SettingsFixture.parse({ halfLifeMonths: 0 }).halfLifeMonths).toBe(1)
  expect(SettingsFixture.parse({ halfLifeMonths: 500 }).halfLifeMonths).toBe(120)
})

test('parse ignores a half life of the wrong type', () => {
  // Assert
  expect(SettingsFixture.parse({ halfLifeMonths: '6' }).halfLifeMonths).toBe(12)
})

test('parse ignores a notify flag of the wrong type', () => {
  // Assert
  expect(SettingsFixture.parse({ notify: 'no' }).notify).toBe(true)
})

test('parse keeps notify false', () => {
  // Assert
  expect(SettingsFixture.parse({ notify: false }).notify).toBe(false)
})

test('parse keeps only well formed identity emails', () => {
  // Act
  const settings = SettingsFixture.parse({ identities: ['a@b.co', 'not-an-email', 'x@y', 5, 'c d@e.io'] })

  // Assert
  expect(settings.identities).toEqual(['a@b.co'])
})

test('parse trims and dedupes identity emails', () => {
  // Act
  const settings = SettingsFixture.parse({ identities: [' a@b.co ', 'a@b.co', 'c@d.io'] })

  // Assert
  expect(settings.identities).toEqual(['a@b.co', 'c@d.io'])
})

test('parse caps identities at 20', () => {
  // Act
  const settings = SettingsFixture.parse({ identities: SettingsFixture.emails(25) })

  // Assert
  expect(settings.identities).toEqual(SettingsFixture.emails(20))
})

test('parse ignores identities that are not an array', () => {
  // Assert
  expect(SettingsFixture.parse({ identities: 'a@b.co' }).identities).toEqual([])
})

test('parse drops blank and non-string exclude entries', () => {
  // Act
  const settings = SettingsFixture.parse({ exclude: ['', '   ', '~/clients/**', 5, null] })

  // Assert
  expect(settings.exclude).toEqual(['~/clients/**'])
})

test('parse caps exclude at 100 entries', () => {
  // Arrange
  const globs = Array.from({ length: 120 }, (_, index) => `/p${index}`)

  // Act
  const settings = SettingsFixture.parse({ exclude: globs })

  // Assert
  expect(settings.exclude).toEqual(globs.slice(0, 100))
})

test('parse ignores exclude that is not an array', () => {
  // Assert
  expect(SettingsFixture.parse({ exclude: '~/x' }).exclude).toEqual([])
})

test('serialize ends with a newline', () => {
  // Assert
  expect(SignatureSettings.serialize(SignatureSettings.defaults()).endsWith('\n')).toBe(true)
})

test('serialize then parse gives back the same settings', () => {
  // Arrange
  const settings: Settings = {
    ...SignatureSettings.defaults(),
    consent: 'paused',
    identities: ['a@b.co'],
    exclude: ['~/x/**'],
    notify: false,
    halfLifeMonths: 6,
    learning: { background: false, model: 'haiku', runsPerDay: 5, tokensPerDay: 1000, idleMinutes: 30 }
  }

  // Act
  const again = SignatureSettings.parse(SignatureSettings.serialize(settings))

  // Assert
  expect(again).toEqual(settings)
})

test('isActive is true only for an enabled consent', () => {
  // Arrange
  const consents: Consent[] = ['undecided', 'enabled', 'paused', 'declined', 'never']

  // Act
  const active = consents.filter((consent) => SignatureSettings.isActive({ ...SignatureSettings.defaults(), consent }))

  // Assert
  expect(active).toEqual(['enabled'])
})

test('matches lets a star stay within one segment', () => {
  // Assert
  expect(SignatureSettings.matches('/w/*/secret', '/w/a/secret', '')).toBe(true)
  expect(SignatureSettings.matches('/w/*/secret', '/w/a/b/secret', '')).toBe(false)
})

test('matches lets a double star cross segments', () => {
  // Assert
  expect(SignatureSettings.matches('/w/**/secret', '/w/a/b/secret', '')).toBe(true)
})

test('matches lets a question mark stand for one character', () => {
  // Assert
  expect(SignatureSettings.matches('/w/file?.txt', '/w/file1.txt', '')).toBe(true)
  expect(SignatureSettings.matches('/w/file?.txt', '/w/file12.txt', '')).toBe(false)
})

test('matches treats a dot in the glob literally', () => {
  // Assert
  expect(SignatureSettings.matches('/w/a.txt', '/w/aXtxt', '')).toBe(false)
})

test('matches expands a tilde to the home directory', () => {
  // Assert
  expect(SignatureSettings.matches('~/clients/**', '/Users/j/clients/acme', '/Users/j')).toBe(true)
})

test('matches expands a tilde in the path as well', () => {
  // Assert
  expect(SignatureSettings.matches('/Users/j/clients', '~/clients', '/Users/j')).toBe(true)
})

test('matches excludes the children of a directory that matches the glob', () => {
  // Assert
  expect(SignatureSettings.matches('/Users/j/clients', '/Users/j/clients/acme/src', '')).toBe(true)
})

test('matches accepts Windows separators in the path', () => {
  // Assert
  expect(SignatureSettings.matches('C:/work/**', 'C:\\work\\app', '')).toBe(true)
})

test('matches rejects a sibling that only shares the prefix', () => {
  // Assert
  expect(SignatureSettings.matches('/w/app', '/w/app2', '')).toBe(false)
})

test('matches rejects an unrelated path', () => {
  // Assert
  expect(SignatureSettings.matches('/w/app/**', '/other/app', '')).toBe(false)
})

test('matches rejects an empty glob', () => {
  // Assert
  expect(SignatureSettings.matches('', '/w/app', '')).toBe(false)
})

test('isExcluded is true when any glob matches', () => {
  // Arrange
  const settings = SettingsFixture.with(['/a/**', '~/clients/**'])

  // Assert
  expect(SignatureSettings.isExcluded(settings, '/Users/j/clients/acme', '/Users/j')).toBe(true)
})

test('isExcluded is false when no glob matches', () => {
  // Arrange
  const settings = SettingsFixture.with(['/a/**', '~/clients/**'])

  // Assert
  expect(SignatureSettings.isExcluded(settings, '/Users/j/own/app', '/Users/j')).toBe(false)
})

test('isExcluded is false without any glob', () => {
  // Assert
  expect(SignatureSettings.isExcluded(SettingsFixture.with([]), '/a', '')).toBe(false)
})

test('matches lets a glob with a double star match its own folder', () => {
  // Assert
  expect(SignatureSettings.matches('~/x/**', '~/x', '/Users/j')).toBe(true)
})

test('matches lets a double star between segments match no folder', () => {
  // Assert
  expect(SignatureSettings.matches('/a/**/b', '/a/b', '')).toBe(true)
})

test('matches ignores the case of the path', () => {
  // Assert
  expect(SignatureSettings.matches('~/clients/**', '/Users/alice/Clients/acme', '/Users/alice')).toBe(true)
})

test('matches treats composed and decomposed accents as equal', () => {
  // Assert
  expect(SignatureSettings.matches('/w/Soci\u00E9t\u00E9/**', '/w/Socie\u0301te\u0301/app', '')).toBe(true)
})

test('matches ignores the case of a Windows drive letter and the separator style', () => {
  // Assert
  expect(SignatureSettings.matches('c:/Work/**', 'C:\\work\\app', '')).toBe(true)
})

test('matches stays fast on a pattern built to backtrack', () => {
  // Arrange
  const glob = '/' + '**a'.repeat(12) + 'b'
  const path = '/' + 'a'.repeat(60)
  const start = Date.now()

  // Act
  SignatureSettings.matches(glob, path, '/Users/j')

  // Assert
  expect(Date.now() - start).toBeLessThan(200)
})

test('matches refuses a glob longer than 256 characters without throwing', () => {
  // Assert
  expect(SignatureSettings.matches('/' + 'a'.repeat(300), '/a', '')).toBe(false)
})

test('parse drops relative exclude entries', () => {
  // Act
  const settings = SettingsFixture.parse({ exclude: ['rel/x', './y', '*', '**/z'] })

  // Assert
  expect(settings.exclude).toEqual([])
})

test('parse keeps tilde, absolute and drive exclude entries', () => {
  // Act
  const settings = SettingsFixture.parse({ exclude: ['rel/x', '~/a', '/abs', 'C:\\w'] })

  // Assert
  expect(settings.exclude).toEqual(['~/a', '/abs', 'C:\\w'])
})

test('parse drops an exclude entry longer than 256 characters', () => {
  // Act
  const settings = SettingsFixture.parse({ exclude: ['/' + 'a'.repeat(300), '/ok'] })

  // Assert
  expect(settings.exclude).toEqual(['/ok'])
})

test('parse keeps exclude entries that start with a home variable', () => {
  // Act
  const settings = SettingsFixture.parse({ exclude: ['$HOME/clients/**', '${HOME}/x', '%USERPROFILE%\\x'] })

  // Assert
  expect(settings.exclude).toEqual(['$HOME/clients/**', '${HOME}/x', '%USERPROFILE%\\x'])
})

test('matches expands a HOME variable prefix', () => {
  // Assert
  expect(SignatureSettings.matches('$HOME/clients/**', '/Users/j/clients/a', '/Users/j')).toBe(true)
})

test('matches expands a braced HOME variable prefix', () => {
  // Assert
  expect(SignatureSettings.matches('${HOME}/x', '/Users/j/x', '/Users/j')).toBe(true)
})

test('matches expands a USERPROFILE variable prefix', () => {
  // Assert
  expect(SignatureSettings.matches('%USERPROFILE%\\x', 'C:\\Users\\j\\x', 'C:\\Users\\j')).toBe(true)
})

test('dropped lists the relative entries', () => {
  // Assert
  expect(SignatureSettings.dropped(JSON.stringify({ exclude: ['rel/x', '/ok', '*'] }))).toEqual(['rel/x', '*'])
})

test('dropped lists an over-long entry cut to 256 characters', () => {
  // Arrange
  const long = '/' + 'a'.repeat(300)

  // Assert
  expect(SignatureSettings.dropped(JSON.stringify({ exclude: [long] }))).toEqual([long.slice(0, 256)])
})

test('dropped lists the entries beyond the cap', () => {
  // Arrange
  const globs = Array.from({ length: 102 }, (_, index) => `/p${index}`)

  // Assert
  expect(SignatureSettings.dropped(JSON.stringify({ exclude: globs }))).toEqual(['/p100', '/p101'])
})

test('dropped is empty for invalid JSON', () => {
  // Assert
  expect(SignatureSettings.dropped('{nope')).toEqual([])
})

test('parse rejects an identity email longer than 254 characters', () => {
  // Arrange
  const email = 'a'.repeat(64) + '@' + ('b'.repeat(63) + '.').repeat(3) + 'com'

  // Act
  const settings = SettingsFixture.parse({ identities: [email] })

  // Assert
  expect(settings.identities).toEqual([])
})

test('parse handles a 1 MB adversarial identity quickly', () => {
  // Arrange
  const text = JSON.stringify({ identities: ['a@'.repeat(500000), 'a.'.repeat(500000)] })
  const start = Date.now()

  // Act
  SignatureSettings.parse(text)

  // Assert
  expect(Date.now() - start).toBeLessThan(200)
})

test('dropped lists a named user home, HOMEPATH and HOME_DIR entries', () => {
  // Assert
  expect(SignatureSettings.dropped(JSON.stringify({ exclude: ['~alice/clients/**', '$HOMEPATH/x', '$HOME_DIR/x'] }))).toEqual(['~alice/clients/**', '$HOMEPATH/x', '$HOME_DIR/x'])
})

test('parse keeps tilde, HOME, USERPROFILE and bare tilde entries', () => {
  // Act
  const settings = SettingsFixture.parse({ exclude: ['~/x', '$HOME/x', '%USERPROFILE%\\x', '~'] })

  // Assert
  expect(settings.exclude).toEqual(['~/x', '$HOME/x', '%USERPROFILE%\\x', '~'])
})
