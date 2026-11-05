import { expect, test } from 'claude-code/testing'
import { Journal } from '../hooks/signature/journal'
import { SignaturePaths, type SignatureFiles } from '../hooks/signature/paths'
import { SignatureSettings, type Consent, type Settings } from '../hooks/signature/settings'
import { Signature, type PromptEvent, type SignaturePorts, type SignatureViewState, type StartInput } from '../hooks/signature/signature'
import type { Signal } from '../hooks/signature/signals'
import { MemoryFs } from './fixtures/signature-fs'

type Rig = {
  fs: MemoryFs
  git: { argv: readonly string[], cwd: string }[]
  toasts: string[]
  changes: SignatureViewState[]
  clock: { now: number }
  env: Record<string, string>
  ports: SignaturePorts
}

type RigOptions = {
  consent?: Consent
  tweak?: (settings: Settings) => void
  raw?: string
  env?: Record<string, string>
  root?: string
  listing?: string
  isFreshRoot?: boolean
}

class FacadeFixture {
  static readonly HOME = '/Users/j'
  static readonly ROOT = '/Users/j/.claude/podium'
  static readonly AT = Date.UTC(2026, 10, 5, 12)
  static readonly CWD = '/work/app'
  static readonly LISTING = 'src/a.ts\nsrc/b.ts\nsrc/c.ts\nlib/x.py\nREADME.md'

  static files(): SignatureFiles {
    return SignaturePaths.files(FacadeFixture.ROOT)
  }

  static journalPath(): string {
    return SignaturePaths.journalFile(FacadeFixture.ROOT, FacadeFixture.AT, 's1', 0)
  }

  static rig(options: RigOptions = {}): Rig {
    const fs = new MemoryFs()
    if (options.isFreshRoot !== true) fs.directories.add(FacadeFixture.ROOT)
    const git: Rig['git'] = []
    const toasts: string[] = []
    const changes: SignatureViewState[] = []
    const clock = { now: FacadeFixture.AT }
    const env = options.env ?? { HOME: FacadeFixture.HOME }
    const root = options.root ?? '/work/app'
    const listing = options.listing ?? FacadeFixture.LISTING
    if (options.raw !== undefined) fs.seed(FacadeFixture.files().settings, options.raw)
    else if (options.consent !== undefined) {
      const settings = SignatureSettings.defaults()
      settings.consent = options.consent
      options.tweak?.(settings)
      fs.seed(FacadeFixture.files().settings, SignatureSettings.serialize(settings))
    }
    const ports: SignaturePorts = {
      fs,
      git: async (argv, cwd) => {
        git.push({ argv, cwd })
        const verb = argv[2] ?? ''
        if (verb === 'rev-parse') return { exitCode: root === '' ? 128 : 0, stdout: root === '' ? '' : root + '\n' }
        if (verb === 'config') return { exitCode: 0, stdout: 'git@github.com:acme/app.git\n' }
        if (verb === 'ls-files') return { exitCode: 0, stdout: listing }
        return { exitCode: 1, stdout: '' }
      },
      now: () => clock.now,
      env: (name) => env[name] ?? '',
      toast: (text) => void toasts.push(text),
      changed: (state) => void changes.push(state)
    }
    return { fs, git, toasts, changes, clock, env, ports }
  }

  static input(partial: Partial<StartInput> = {}): StartInput {
    return { cwd: FacadeFixture.CWD, session: 's1', isInteractive: true, ...partial }
  }

  static async started(options: RigOptions = {}, input: Partial<StartInput> = {}): Promise<Rig> {
    const rig = FacadeFixture.rig(options)
    await Signature.start(rig.ports, FacadeFixture.input(input))
    return rig
  }

  static prompt(partial: Partial<PromptEvent> = {}): PromptEvent {
    return { text: 'please fix the failing build', command: '', args: '', isUserOrigin: true, isMeta: false, isNotification: false, ...partial }
  }

  static journal(rig: Rig): Signal[] {
    const text = rig.fs.text(FacadeFixture.journalPath()) ?? ''
    return text.split('\n').filter((line) => line !== '').map((line) => JSON.parse(line) as Signal)
  }

  static saved(rig: Rig): Settings {
    return SignatureSettings.parse(rig.fs.text(FacadeFixture.files().settings) ?? '')
  }

  static advance(rig: Rig, ms: number): void {
    rig.clock.now += ms
  }
}

test('start without a home folder turns Signature off with a reason', async () => {
  // Act
  await FacadeFixture.started({ env: {} })

  // Assert
  expect(Signature.isCapturing()).toBe(false)
  expect(Signature.view().lastError).toBe('Signature is off: no home folder was found.')
})

test('start with settings from a newer Podium turns Signature off', async () => {
  // Act
  await FacadeFixture.started({ raw: '{"version":2,"consent":"enabled"}' })

  // Assert
  expect(Signature.isCapturing()).toBe(false)
  expect(Signature.view().lastError).toContain('newer Podium')
})

test('start with corrupt settings falls back to undecided without an error', async () => {
  // Act
  await FacadeFixture.started({ raw: 'not json {' })

  // Assert
  expect(Signature.view().consent).toBe('undecided')
  expect(Signature.view().lastError).toBe('')
  expect(Signature.isCapturing()).toBe(false)
})

test('an enabled interactive session in a plain folder captures', async () => {
  // Act
  await FacadeFixture.started({ consent: 'enabled' })

  // Assert
  expect(Signature.isCapturing()).toBe(true)
})

test('an undecided consent does not capture', async () => {
  // Act
  await FacadeFixture.started({ consent: 'undecided' })

  // Assert
  expect(Signature.isCapturing()).toBe(false)
})

test('a paused consent does not capture', async () => {
  // Act
  await FacadeFixture.started({ consent: 'paused' })

  // Assert
  expect(Signature.isCapturing()).toBe(false)
})

test('a declined consent does not capture', async () => {
  // Act
  await FacadeFixture.started({ consent: 'declined' })

  // Assert
  expect(Signature.isCapturing()).toBe(false)
})

test('turning session capture off in the settings stops capture', async () => {
  // Act
  await FacadeFixture.started({ consent: 'enabled', tweak: (settings) => { settings.capture.sessions = false } })

  // Assert
  expect(Signature.isCapturing()).toBe(false)
})

test('a non-interactive session does not capture', async () => {
  // Act
  await FacadeFixture.started({ consent: 'enabled' }, { isInteractive: false })

  // Assert
  expect(Signature.isCapturing()).toBe(false)
  expect(Signature.view().exclusionReason).toContain('not an interactive session')
})

test('a folder matching an exclude glob does not capture', async () => {
  // Act
  await FacadeFixture.started({ consent: 'enabled', tweak: (settings) => { settings.exclude = ['/work/**'] } })

  // Assert
  expect(Signature.isCapturing()).toBe(false)
  expect(Signature.view().isExcluded).toBe(true)
  expect(Signature.view().exclusionReason).toContain('excluded by /work/**')
})

test('a private marker in the working folder does not capture', async () => {
  // Arrange
  const rig = FacadeFixture.rig({ consent: 'enabled' })
  rig.fs.seed('/work/app/.podium-private', '')

  // Act
  await Signature.start(rig.ports, FacadeFixture.input())

  // Assert
  expect(Signature.isCapturing()).toBe(false)
  expect(Signature.view().exclusionReason).toContain('.podium-private')
})

test('a private marker in a parent folder up to the git root does not capture', async () => {
  // Arrange
  const rig = FacadeFixture.rig({ consent: 'enabled' })
  rig.fs.seed('/work/app/pkg/.podium-private', '')

  // Act
  await Signature.start(rig.ports, FacadeFixture.input({ cwd: '/work/app/pkg/sub' }))

  // Assert
  expect(Signature.isCapturing()).toBe(false)
})

test('a private marker above the git root is ignored', async () => {
  // Arrange
  const rig = FacadeFixture.rig({ consent: 'enabled' })
  rig.fs.seed('/work/.podium-private', '')

  // Act
  await Signature.start(rig.ports, FacadeFixture.input({ cwd: '/work/app/sub' }))

  // Assert
  expect(Signature.isCapturing()).toBe(true)
})

test('without a git root only the working folder is checked for the private marker', async () => {
  // Arrange
  const rig = FacadeFixture.rig({ consent: 'enabled', root: '' })
  rig.fs.seed('/work/app/.podium-private', '')

  // Act
  await Signature.start(rig.ports, FacadeFixture.input({ cwd: '/work/app/sub' }))

  // Assert
  expect(Signature.isCapturing()).toBe(true)
})

test('without a git root a private marker in the working folder does not capture', async () => {
  // Arrange
  const rig = FacadeFixture.rig({ consent: 'enabled', root: '' })
  rig.fs.seed('/work/app/sub/.podium-private', '')

  // Act
  await Signature.start(rig.ports, FacadeFixture.input({ cwd: '/work/app/sub' }))

  // Assert
  expect(Signature.isCapturing()).toBe(false)
})

test('start runs exactly the three allowed git commands in the session folder', async () => {
  // Act
  const rig = await FacadeFixture.started({ consent: 'enabled' })

  // Assert
  expect(rig.git.map((call) => call.argv)).toEqual([
    ['git', '--no-optional-locks', 'rev-parse', '--show-toplevel'],
    ['git', '--no-optional-locks', 'config', '--get', 'remote.origin.url'],
    ['git', '--no-optional-locks', 'ls-files']
  ])
  expect(rig.git.every((call) => call.cwd === FacadeFixture.CWD)).toBe(true)
})

test('start does not run git when Signature is not enabled', async () => {
  // Act
  const rig = await FacadeFixture.started({ consent: 'undecided' })

  // Assert
  expect(rig.git).toEqual([])
})

test('the stack comes from the most common file types of ls-files', async () => {
  // Arrange
  const rig = await FacadeFixture.started({ consent: 'enabled' })
  Signature.onPrompt(FacadeFixture.prompt())

  // Act
  await Signature.flush()

  // Assert
  expect(FacadeFixture.journal(rig)[0]?.stack).toEqual(['typescript', 'python'])
})

test('a prompt that is meta is ignored', async () => {
  // Arrange
  await FacadeFixture.started({ consent: 'enabled' })

  // Act
  Signature.onPrompt(FacadeFixture.prompt({ isMeta: true }))

  // Assert
  expect(Signature.view().signals).toBe(0)
})

test('a task notification prompt is ignored', async () => {
  // Arrange
  await FacadeFixture.started({ consent: 'enabled' })

  // Act
  Signature.onPrompt(FacadeFixture.prompt({ isNotification: true }))

  // Assert
  expect(Signature.view().signals).toBe(0)
})

test('a prompt that does not come from the user is ignored', async () => {
  // Arrange
  await FacadeFixture.started({ consent: 'enabled' })

  // Act
  Signature.onPrompt(FacadeFixture.prompt({ isUserOrigin: false }))

  // Assert
  expect(Signature.view().signals).toBe(0)
})

test('a user prompt is recorded and buffered', async () => {
  // Arrange
  await FacadeFixture.started({ consent: 'enabled' })

  // Act
  Signature.onPrompt(FacadeFixture.prompt())

  // Assert
  expect(Signature.view().signals).toBe(1)
  expect(Signature.view().buffered).toBe(1)
})

test('a prompt is not recorded when capture is off', async () => {
  // Arrange
  await FacadeFixture.started({ consent: 'paused' })

  // Act
  Signature.onPrompt(FacadeFixture.prompt())

  // Assert
  expect(Signature.view().signals).toBe(0)
})

test('the prompt after an aborted main-thread turn is marked afterAbort', async () => {
  // Arrange
  const rig = await FacadeFixture.started({ consent: 'enabled' })
  Signature.onTurn('aborted', '', 't1')
  Signature.onPrompt(FacadeFixture.prompt())

  // Act
  await Signature.flush()

  // Assert
  const prompts = FacadeFixture.journal(rig).filter((signal) => signal.kind === 'prompt')
  expect(prompts[0]?.data.afterAbort).toBe(true)
})

test('an aborted subagent turn does not mark the next prompt', async () => {
  // Arrange
  const rig = await FacadeFixture.started({ consent: 'enabled' })
  Signature.onTurn('aborted', 'agent-1', 't1')
  Signature.onPrompt(FacadeFixture.prompt())

  // Act
  await Signature.flush()

  // Assert
  const prompts = FacadeFixture.journal(rig).filter((signal) => signal.kind === 'prompt')
  expect(prompts[0]?.data.afterAbort).toBe(false)
})

test('the flag after an abort applies to one prompt only', async () => {
  // Arrange
  const rig = await FacadeFixture.started({ consent: 'enabled' })
  Signature.onTurn('aborted', '', 't1')
  Signature.onPrompt(FacadeFixture.prompt())
  Signature.onPrompt(FacadeFixture.prompt({ text: 'and then another request' }))

  // Act
  await Signature.flush()

  // Assert
  const prompts = FacadeFixture.journal(rig).filter((signal) => signal.kind === 'prompt')
  expect(prompts.map((signal) => signal.data.afterAbort)).toEqual([true, false])
})

test('reaching the flush threshold writes the journal under the root', async () => {
  // Arrange
  const rig = await FacadeFixture.started({ consent: 'enabled' })
  for (let index = 0; index < Journal.FLUSH_AT; index += 1) Signature.onPrompt(FacadeFixture.prompt({ text: `request number ${index}` }))

  // Act
  Signature.onTurn('answer', '', 't1')
  await Signature.flush()

  // Assert
  expect(FacadeFixture.journal(rig)).toHaveLength(Journal.FLUSH_AT)
  expect(Signature.view().buffered).toBe(0)
})

test('a turn below the flush threshold writes nothing', async () => {
  // Arrange
  const rig = await FacadeFixture.started({ consent: 'enabled' })
  Signature.onPrompt(FacadeFixture.prompt())

  // Act
  Signature.onTurn('answer', '', 't1')

  // Assert
  expect(rig.fs.writes.filter((path) => path.includes('/journal/'))).toEqual([])
})

test('concurrent flush calls write each signal once', async () => {
  // Arrange
  const rig = await FacadeFixture.started({ consent: 'enabled' })
  for (let index = 0; index < 3; index += 1) Signature.onPrompt(FacadeFixture.prompt({ text: `request number ${index}` }))

  // Act
  await Promise.all([Signature.flush(), Signature.flush(), Signature.flush()])

  // Assert
  expect(FacadeFixture.journal(rig)).toHaveLength(3)
})

test('a signal recorded during a flush is written by the queued pass', async () => {
  // Arrange
  const rig = await FacadeFixture.started({ consent: 'enabled' })
  Signature.onPrompt(FacadeFixture.prompt({ text: 'first request here' }))
  const first = Signature.flush()
  Signature.onPrompt(FacadeFixture.prompt({ text: 'second request here' }))

  // Act
  const second = Signature.flush()
  await Promise.all([first, second])

  // Assert
  expect(FacadeFixture.journal(rig)).toHaveLength(2)
})

test('a journal write failure turns capture off with a reason', async () => {
  // Arrange
  const rig = await FacadeFixture.started({ consent: 'enabled' })
  rig.fs.failWrite(FacadeFixture.journalPath())
  Signature.onPrompt(FacadeFixture.prompt())

  // Act
  await Signature.flush()

  // Assert
  expect(Signature.isCapturing()).toBe(false)
  expect(Signature.view().lastError).toBe('Signature stopped: its folder is not writable.')
})

test('enabling writes the settings from the draft with all four apply flags on', async () => {
  // Arrange
  const rig = await FacadeFixture.started()

  // Act
  await Signature.enable()

  // Assert
  const saved = FacadeFixture.saved(rig)
  expect(saved.consent).toBe('enabled')
  expect(saved.apply).toEqual({ section: true, context: true, hints: true, proxy: true })
})

test('enabling with the apply choice unticked turns all four apply flags off', async () => {
  // Arrange
  const rig = await FacadeFixture.started()
  Signature.toggle('apply')

  // Act
  await Signature.enable()

  // Assert
  expect(FacadeFixture.saved(rig).apply).toEqual({ section: false, context: false, hints: false, proxy: false })
})

test('enabling saves the other draft choices', async () => {
  // Arrange
  const rig = await FacadeFixture.started()
  Signature.toggle('history')
  Signature.toggle('pastSessions')
  Signature.toggle('background')

  // Act
  await Signature.enable()

  // Assert
  const saved = FacadeFixture.saved(rig)
  expect(saved.capture.history).toBe(false)
  expect(saved.capture.pastSessions).toBe(true)
  expect(saved.learning.background).toBe(false)
})

test('enabling starts capturing', async () => {
  // Arrange
  await FacadeFixture.started()

  // Act
  const text = await Signature.enable()

  // Assert
  expect(Signature.isCapturing()).toBe(true)
  expect(text).toBe('Signature is on: it records your decisions from now on.')
})

test('enabling in an excluded folder says it does not learn there', async () => {
  // Arrange
  const rig = FacadeFixture.rig()
  rig.fs.seed('/work/app/.podium-private', '')
  await Signature.start(rig.ports, FacadeFixture.input())

  // Act
  const text = await Signature.enable()

  // Assert
  expect(text).toContain('it does not learn here')
  expect(Signature.isCapturing()).toBe(false)
})

test('toggling a draft choice flips it in the view state', async () => {
  // Arrange
  await FacadeFixture.started()

  // Act
  Signature.toggle('pastSessions')

  // Assert
  expect(Signature.view().draft.pastSessions).toBe(true)
})

test('pausing stops capture and saves the consent', async () => {
  // Arrange
  const rig = await FacadeFixture.started({ consent: 'enabled' })

  // Act
  await Signature.pause()

  // Assert
  expect(Signature.isCapturing()).toBe(false)
  expect(FacadeFixture.saved(rig).consent).toBe('paused')
})

test('pausing flushes the buffered signals first', async () => {
  // Arrange
  const rig = await FacadeFixture.started({ consent: 'enabled' })
  Signature.onPrompt(FacadeFixture.prompt())

  // Act
  await Signature.pause()

  // Assert
  expect(FacadeFixture.journal(rig)).toHaveLength(1)
})

test('resuming captures again', async () => {
  // Arrange
  const rig = await FacadeFixture.started({ consent: 'paused' })

  // Act
  await Signature.resume()

  // Assert
  expect(Signature.isCapturing()).toBe(true)
  expect(FacadeFixture.saved(rig).consent).toBe('enabled')
})

test('pausing when Signature is off says it is not on', async () => {
  // Arrange
  await FacadeFixture.started({ consent: 'declined' })

  // Act
  const text = await Signature.pause()

  // Assert
  expect(text).toBe('Signature is not on.')
})

test('resuming when Signature is not paused says so', async () => {
  // Arrange
  await FacadeFixture.started({ consent: 'enabled' })

  // Act
  const text = await Signature.resume()

  // Assert
  expect(text).toBe('Signature is not paused.')
})

test('declining saves the declined consent and drops the buffer', async () => {
  // Arrange
  const rig = await FacadeFixture.started({ consent: 'enabled' })
  Signature.onPrompt(FacadeFixture.prompt())

  // Act
  await Signature.decline()

  // Assert
  expect(FacadeFixture.saved(rig).consent).toBe('declined')
  expect(Signature.view().buffered).toBe(0)
  expect(Signature.isCapturing()).toBe(false)
})

test('never saves the never consent', async () => {
  // Arrange
  const rig = await FacadeFixture.started()

  // Act
  await Signature.never()

  // Assert
  expect(FacadeFixture.saved(rig).consent).toBe('never')
})

test('excluding a relative folder is refused and nothing is written', async () => {
  // Arrange
  const rig = await FacadeFixture.started({ consent: 'enabled' })
  const before = rig.fs.writes.length

  // Act
  const text = await Signature.exclude('clients/acme')

  // Assert
  expect(text).toContain('Give an absolute folder')
  expect(rig.fs.writes).toHaveLength(before)
})

test('excluding a folder that starts with a tilde is accepted', async () => {
  // Arrange
  const rig = await FacadeFixture.started({ consent: 'enabled' })

  // Act
  await Signature.exclude('~/clients')

  // Assert
  expect(FacadeFixture.saved(rig).exclude).toEqual(['~/clients'])
})

test('excluding the same folder twice adds it once', async () => {
  // Arrange
  const rig = await FacadeFixture.started({ consent: 'enabled' })
  await Signature.exclude('/srv/clients')

  // Act
  const text = await Signature.exclude('/srv/clients')

  // Assert
  expect(text).toBe('Signature already skips /srv/clients.')
  expect(FacadeFixture.saved(rig).exclude).toEqual(['/srv/clients'])
})

test('excluding the current folder stops capture right away', async () => {
  // Arrange
  await FacadeFixture.started({ consent: 'enabled' })

  // Act
  await Signature.exclude('/work/app')

  // Assert
  expect(Signature.isCapturing()).toBe(false)
  expect(Signature.view().isExcluded).toBe(true)
})

test('including the folder again resumes capture', async () => {
  // Arrange
  await FacadeFixture.started({ consent: 'enabled' })
  await Signature.exclude('/work/app')

  // Act
  await Signature.include('/work/app')

  // Assert
  expect(Signature.isCapturing()).toBe(true)
  expect(Signature.view().isExcluded).toBe(false)
})

test('including a folder that was not excluded says so', async () => {
  // Arrange
  await FacadeFixture.started({ consent: 'enabled' })

  // Act
  const text = await Signature.include('/srv/other')

  // Assert
  expect(text).toBe('/srv/other is not in the skipped folders.')
})

test('the first erase call only arms the confirmation', async () => {
  // Arrange
  const rig = await FacadeFixture.started({ consent: 'enabled' })
  rig.fs.seed(FacadeFixture.journalPath(), '{"v":1}\n')

  // Act
  const text = await Signature.erase()

  // Assert
  expect(text).toContain('Run it again within 30 seconds')
  expect(Signature.view().confirmErase).toBe(true)
  expect(rig.fs.text(FacadeFixture.journalPath())).toBe('{"v":1}\n')
})

test('a second erase call within thirty seconds empties the journal and declines', async () => {
  // Arrange
  const rig = await FacadeFixture.started({ consent: 'enabled' })
  rig.fs.seed(FacadeFixture.journalPath(), '{"v":1}\n')
  await Signature.erase()
  FacadeFixture.advance(rig, 29_000)

  // Act
  const text = await Signature.erase()

  // Assert
  expect(rig.fs.text(FacadeFixture.journalPath())).toBe('')
  expect(FacadeFixture.saved(rig).consent).toBe('declined')
  expect(Signature.view().consent).toBe('declined')
  expect(text).toContain('erased')
})

test('an erase call after thirty-one seconds only arms the confirmation again', async () => {
  // Arrange
  const rig = await FacadeFixture.started({ consent: 'enabled' })
  rig.fs.seed(FacadeFixture.journalPath(), '{"v":1}\n')
  await Signature.erase()
  FacadeFixture.advance(rig, 31_000)

  // Act
  const text = await Signature.erase()

  // Assert
  expect(text).toContain('Run it again within 30 seconds')
  expect(rig.fs.text(FacadeFixture.journalPath())).toBe('{"v":1}\n')
  expect(Signature.view().consent).toBe('enabled')
})

test('erasing drops the signals waiting in memory', async () => {
  // Arrange
  const rig = await FacadeFixture.started({ consent: 'enabled' })
  Signature.onPrompt(FacadeFixture.prompt())
  await Signature.erase()

  // Act
  await Signature.erase()

  // Assert
  expect(Signature.view().buffered).toBe(0)
  expect(Signature.view().signals).toBe(0)
  expect(rig.fs.text(FacadeFixture.journalPath())).toBeUndefined()
})

test('an empty command gives an empty text', async () => {
  // Arrange
  await FacadeFixture.started({ consent: 'enabled' })

  // Act
  const text = await Signature.command('   ')

  // Assert
  expect(text).toBe('')
})

test('an unknown command gives the usage line', async () => {
  // Arrange
  await FacadeFixture.started({ consent: 'enabled' })

  // Act
  const text = await Signature.command('dance')

  // Assert
  expect(text).toContain('Usage: /podium-stage signature')
})

test('exclude without a folder gives the usage line', async () => {
  // Arrange
  await FacadeFixture.started({ consent: 'enabled' })

  // Act
  const text = await Signature.command('exclude')

  // Assert
  expect(text).toContain('Usage: /podium-stage signature')
})

test('include without a folder gives the usage line', async () => {
  // Arrange
  await FacadeFixture.started({ consent: 'enabled' })

  // Act
  const text = await Signature.command('include')

  // Assert
  expect(text).toContain('Usage: /podium-stage signature')
})

test('the on command enables Signature', async () => {
  // Arrange
  await FacadeFixture.started()

  // Act
  const text = await Signature.command('on')

  // Assert
  expect(text).toContain('Signature is on')
  expect(Signature.view().consent).toBe('enabled')
})

test('the off command declines Signature', async () => {
  // Arrange
  await FacadeFixture.started({ consent: 'enabled' })

  // Act
  await Signature.command('off')

  // Assert
  expect(Signature.view().consent).toBe('declined')
})

test('the pause and resume commands switch consent', async () => {
  // Arrange
  await FacadeFixture.started({ consent: 'enabled' })

  // Act
  await Signature.command('pause')
  const paused = Signature.view().consent
  await Signature.command('resume')

  // Assert
  expect(paused).toBe('paused')
  expect(Signature.view().consent).toBe('enabled')
})

test('the exclude command with a relative folder is refused', async () => {
  // Arrange
  await FacadeFixture.started({ consent: 'enabled' })

  // Act
  const text = await Signature.command('exclude x')

  // Assert
  expect(text).toContain('Give an absolute folder')
})

test('the exclude and include commands accept a folder with spaces around it', async () => {
  // Arrange
  const rig = await FacadeFixture.started({ consent: 'enabled' })

  // Act
  await Signature.command('exclude   /srv/clients  ')
  const excluded = FacadeFixture.saved(rig).exclude
  await Signature.command('include /srv/clients')

  // Assert
  expect(excluded).toEqual(['/srv/clients'])
  expect(FacadeFixture.saved(rig).exclude).toEqual([])
})

test('the erase command is case-insensitive and arms the confirmation', async () => {
  // Arrange
  await FacadeFixture.started({ consent: 'enabled' })

  // Act
  const text = await Signature.command('ERASE')

  // Assert
  expect(text).toContain('Run it again within 30 seconds')
})

test('an introduction is not offered before Signature is ready', async () => {
  // Arrange
  const rig = FacadeFixture.rig()
  Signature.remember(0, 0)

  // Act
  const pending = Signature.start(rig.ports, FacadeFixture.input())
  const before = Signature.shouldIntroduce(FacadeFixture.AT)
  await pending

  // Assert
  expect(before).toBe(false)
  expect(Signature.shouldIntroduce(FacadeFixture.AT)).toBe(true)
})

test('an introduction is offered again after twenty-four hours', async () => {
  // Arrange
  await FacadeFixture.started()
  Signature.remember(FacadeFixture.AT - 25 * 3_600_000, 0)

  // Act
  const isOffered = Signature.shouldIntroduce(FacadeFixture.AT)

  // Assert
  expect(isOffered).toBe(true)
})

test('an introduction is not offered twice within twenty-four hours', async () => {
  // Arrange
  await FacadeFixture.started()
  Signature.remember(FacadeFixture.AT - 23 * 3_600_000, 0)

  // Act
  const isOffered = Signature.shouldIntroduce(FacadeFixture.AT)

  // Assert
  expect(isOffered).toBe(false)
})

test('an introduction waits seven days after Not now', async () => {
  // Arrange
  await FacadeFixture.started()
  Signature.remember(0, FacadeFixture.AT - 6 * 24 * 3_600_000)

  // Act
  const isOffered = Signature.shouldIntroduce(FacadeFixture.AT)

  // Assert
  expect(isOffered).toBe(false)
})

test('an introduction is offered after the seven days of Not now', async () => {
  // Arrange
  await FacadeFixture.started()
  Signature.remember(0, FacadeFixture.AT - 8 * 24 * 3_600_000)

  // Act
  const isOffered = Signature.shouldIntroduce(FacadeFixture.AT)

  // Assert
  expect(isOffered).toBe(true)
})

test('an introduction is only offered while the consent is undecided', async () => {
  // Arrange
  await FacadeFixture.started({ consent: 'declined' })
  Signature.remember(0, 0)

  // Act
  const isOffered = Signature.shouldIntroduce(FacadeFixture.AT)

  // Assert
  expect(isOffered).toBe(false)
})

test('every write goes under the Signature root', async () => {
  // Arrange
  const rig = await FacadeFixture.started()
  await Signature.enable()
  Signature.onPrompt(FacadeFixture.prompt())
  await Signature.flush()
  await Signature.exclude('/srv/clients')
  await Signature.include('/srv/clients')
  await Signature.pause()
  await Signature.resume()
  await Signature.erase()
  await Signature.erase()

  // Act
  const outside = rig.fs.writes.filter((path) => !path.startsWith(FacadeFixture.ROOT + '/'))

  // Assert
  expect(rig.fs.writes.length).toBeGreaterThan(0)
  expect(outside).toEqual([])
})

test('renew sends later signals to the new session file from part zero', async () => {
  // Arrange
  const rig = await FacadeFixture.started({ consent: 'enabled' })
  Signature.onPrompt(FacadeFixture.prompt({ text: 'request in the old session' }))

  // Act
  await Signature.renew('s2')
  Signature.onPrompt(FacadeFixture.prompt({ text: 'request in the new session' }))
  await Signature.flush()

  // Assert
  const fresh = rig.fs.text(SignaturePaths.journalFile(FacadeFixture.ROOT, FacadeFixture.AT, 's2', 0)) ?? ''
  expect(fresh.split('\n').filter((line) => line !== '')).toHaveLength(1)
  expect(FacadeFixture.journal(rig)).toHaveLength(1)
})

test('renew clears the flag after an abort', async () => {
  // Arrange
  const rig = await FacadeFixture.started({ consent: 'enabled' })
  Signature.onTurn('aborted', '', 't1')

  // Act
  await Signature.renew('s2')
  Signature.onPrompt(FacadeFixture.prompt())
  await Signature.flush()

  // Assert
  const text = rig.fs.text(SignaturePaths.journalFile(FacadeFixture.ROOT, FacadeFixture.AT, 's2', 0)) ?? ''
  const prompts = text.split('\n').filter((line) => line !== '').map((line) => JSON.parse(line) as Signal).filter((signal) => signal.kind === 'prompt')
  expect(prompts[0]?.data.afterAbort).toBe(false)
})

test('renew flushes the old session signals first', async () => {
  // Arrange
  const rig = await FacadeFixture.started({ consent: 'enabled' })
  Signature.onPrompt(FacadeFixture.prompt())

  // Act
  await Signature.renew('s2')

  // Assert
  expect(FacadeFixture.journal(rig)).toHaveLength(1)
})

test('settings from a newer Podium make the on command return the block reason', async () => {
  // Arrange
  await FacadeFixture.started({ raw: '{"version":2,"consent":"enabled"}' })

  // Act
  const text = await Signature.command('on')

  // Assert
  expect(text).toContain('newer Podium')
})

test('settings from a newer Podium make exclude return the block reason', async () => {
  // Arrange
  await FacadeFixture.started({ raw: '{"version":2,"consent":"enabled"}' })

  // Act
  const text = await Signature.exclude('/srv/clients')

  // Assert
  expect(text).toContain('newer Podium')
})

test('settings from a newer Podium make never return the block reason', async () => {
  // Arrange
  await FacadeFixture.started({ raw: '{"version":2,"consent":"enabled"}' })

  // Act
  const text = await Signature.never()

  // Assert
  expect(text).toContain('newer Podium')
})

test('erasing after a newer-settings block lets the on command capture again', async () => {
  // Arrange
  await FacadeFixture.started({ raw: '{"version":2,"consent":"enabled"}' })
  await Signature.erase()

  // Act
  await Signature.erase()
  const text = await Signature.command('on')

  // Assert
  expect(text).toContain('Signature is on')
  expect(Signature.isCapturing()).toBe(true)
})

test('signals beyond the buffer capacity are counted as lost', async () => {
  // Arrange
  await FacadeFixture.started({ consent: 'enabled' })
  for (let index = 0; index < 501; index += 1) Signature.onPrompt(FacadeFixture.prompt({ text: `request number ${index}` }))

  // Act
  const state = Signature.view()

  // Assert
  expect(state.lost).toBe(1)
  expect(state.buffered).toBe(500)
  expect(state.signals).toBe(501)
})

test('a private marker in the git top is found from a deeper working folder', async () => {
  // Arrange
  const rig = FacadeFixture.rig({ consent: 'enabled' })
  rig.fs.seed('/work/app/.podium-private', '')

  // Act
  await Signature.start(rig.ports, FacadeFixture.input({ cwd: '/work/app/pkg/sub' }))

  // Assert
  expect(Signature.isCapturing()).toBe(false)
})

test('a private marker is found when the working folder differs in case through an alias', async () => {
  // Arrange
  const rig = FacadeFixture.rig({ consent: 'enabled' })
  rig.fs.seed('/work/app/.podium-private', '')
  rig.fs.directories.add('/WORK/APP/sub')
  rig.fs.alias('/WORK/APP', '/work/app')

  // Act
  await Signature.start(rig.ports, FacadeFixture.input({ cwd: '/WORK/APP/sub' }))

  // Assert
  expect(Signature.isCapturing()).toBe(false)
  expect(Signature.view().exclusionReason).toContain('.podium-private')
})

test('a private marker is found when the working folder is reached through a link', async () => {
  // Arrange
  const rig = FacadeFixture.rig({ consent: 'enabled' })
  rig.fs.seed('/work/app/.podium-private', '')
  rig.fs.directories.add('/link/app')
  rig.fs.alias('/link', '/work')

  // Act
  await Signature.start(rig.ports, FacadeFixture.input({ cwd: '/link/app' }))

  // Assert
  expect(Signature.isCapturing()).toBe(false)
})

test('a prompt that starts with an exclamation mark is ignored', async () => {
  // Arrange
  await FacadeFixture.started({ consent: 'enabled' })

  // Act
  Signature.onPrompt(FacadeFixture.prompt({ text: '!ls -la' }))

  // Assert
  expect(Signature.view().signals).toBe(0)
})

test('a flush requested during an erase writes nothing', async () => {
  // Arrange
  const rig = await FacadeFixture.started({ consent: 'enabled' })
  Signature.onPrompt(FacadeFixture.prompt())
  await Signature.erase()

  // Act
  const erasing = Signature.erase()
  const flushing = Signature.flush()
  await Promise.all([erasing, flushing])

  // Assert
  expect(rig.fs.text(FacadeFixture.journalPath())).toBeUndefined()
  expect(Signature.view().buffered).toBe(0)
})

test('an erase that cannot empty every file says some could not be reached', async () => {
  // Arrange
  const rig = await FacadeFixture.started({ consent: 'enabled' })
  const files = FacadeFixture.files()
  rig.fs.seed(files.cases + '/000.jsonl', 'kept')
  rig.fs.seed(files.cases + '/001.jsonl', 'emptied')
  rig.fs.failWrite(files.cases + '/000.jsonl')
  await Signature.erase()

  // Act
  const text = await Signature.erase()

  // Assert
  expect(text).toContain('some could not be reached')
  expect(rig.fs.text(files.cases + '/001.jsonl')).toBe('')
})

test('a non-interactive session runs no git command', async () => {
  // Act
  const rig = await FacadeFixture.started({ consent: 'enabled' }, { isInteractive: false })

  // Assert
  expect(rig.git).toEqual([])
})

test('ending the session does not walk the Signature tree', async () => {
  // Arrange
  const rig = await FacadeFixture.started({ consent: 'enabled' })
  Signature.onPrompt(FacadeFixture.prompt())
  const before = rig.fs.calls.length

  // Act
  await Signature.end()

  // Assert
  expect(rig.fs.calls.slice(before).filter((call) => call.startsWith('list '))).toEqual([])
})

test('enabling when the Signature folder does not exist yet writes the settings', async () => {
  // Arrange
  const rig = FacadeFixture.rig({ isFreshRoot: true })
  await Signature.start(rig.ports, FacadeFixture.input())

  // Act
  const text = await Signature.enable()

  // Assert
  expect(text).toBe('Signature is on: it records your decisions from now on.')
  expect(FacadeFixture.saved(rig).consent).toBe('enabled')
})
