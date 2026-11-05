import { expect, test } from 'claude-code/testing'
import { Journal } from '../hooks/signature/journal'
import { SignaturePaths, type SignatureFiles } from '../hooks/signature/paths'
import { SignatureSettings, type Consent, type Settings } from '../hooks/signature/settings'
import { Signature, type PromptEvent, type SignaturePorts, type SignatureViewState, type StartInput } from '../hooks/signature/signature'
import type { Signal } from '../hooks/signature/signals'
import type { ModelAnswer, ModelPort, ModelRequest } from '../hooks/signature/learner'
import { Profile } from '../hooks/signature/profile'
import { ScriptedModel, LearnSeed, MemoryFs } from './fixtures/signature-fs'
import { SignatureFixtures } from './fixtures/signature'

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
  dir?: string
  model?: ModelPort
  tops?: Record<string, string>
}

class FacadeFixture {
  static readonly HOME = '/Users/j'
  static readonly ROOT = '/Users/j/.claude/podium'
  static readonly AT = Date.UTC(2026, 10, 5, 12)
  static readonly CWD = '/work/app'
  static readonly LISTING = 'src/a.ts\nsrc/b.ts\nsrc/c.ts\nlib/x.py\nREADME.md'

  static files(dir: string = FacadeFixture.ROOT): SignatureFiles {
    return SignaturePaths.files(dir)
  }

  static journalPath(): string {
    return SignaturePaths.journalFile(FacadeFixture.ROOT, FacadeFixture.AT, 's1', 0)
  }

  static rig(options: RigOptions = {}): Rig {
    const fs = new MemoryFs()
    const dir = options.dir ?? FacadeFixture.ROOT
    if (options.isFreshRoot !== true) fs.directories.add(dir)
    const git: Rig['git'] = []
    const toasts: string[] = []
    const changes: SignatureViewState[] = []
    const clock = { now: FacadeFixture.AT }
    const env = options.env ?? { HOME: FacadeFixture.HOME }
    const root = options.root ?? '/work/app'
    const listing = options.listing ?? FacadeFixture.LISTING
    if (options.raw !== undefined) fs.seed(FacadeFixture.files(dir).settings, options.raw)
    else if (options.consent !== undefined) {
      const settings = SignatureSettings.defaults()
      settings.consent = options.consent
      options.tweak?.(settings)
      fs.seed(FacadeFixture.files(dir).settings, SignatureSettings.serialize(settings))
    }
    const ports: SignaturePorts = {
      fs,
      git: async (argv, cwd) => {
        git.push({ argv, cwd })
        const at = argv.indexOf('-C')
        const target = at < 0 ? undefined : argv[at + 1]
        const verb = argv[at < 0 ? 2 : at + 2] ?? ''
        if (verb === 'rev-parse') {
          const top = target === undefined ? root : options.tops?.[target] ?? ''
          return { exitCode: top === '' ? 128 : 0, stdout: top === '' ? '' : top + '\n' }
        }
        if (verb === 'config') return { exitCode: 0, stdout: 'git@github.com:acme/app.git\n' }
        if (verb === 'ls-files') return { exitCode: 0, stdout: listing }
        return { exitCode: 1, stdout: '' }
      },
      now: () => clock.now,
      env: (name) => env[name] ?? '',
      toast: (text) => void toasts.push(text),
      changed: (state) => void changes.push(state),
      model: options.model,
      wait: () => Promise.resolve()
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

class LearnFixture {
  static readonly DIR = '/r/podium'
  static readonly MINUTE = 60_000

  static files(): SignatureFiles {
    return FacadeFixture.files(LearnFixture.DIR)
  }

  static options(partial: RigOptions = {}): RigOptions {
    return {
      consent: 'enabled',
      dir: LearnFixture.DIR,
      env: { HOME: FacadeFixture.HOME, CLAUDE_CONFIG_DIR: '/r' },
      ...partial,
      tweak: (settings) => {
        settings.capture.history = false
        partial.tweak?.(settings)
      }
    }
  }

  static async started(model: ModelPort | undefined, partial: RigOptions = {}, pending = 25): Promise<Rig> {
    const rig = FacadeFixture.rig(LearnFixture.options({ ...partial, model }))
    LearnSeed.prompts(rig.fs, pending)
    await Signature.start(rig.ports, FacadeFixture.input())
    return rig
  }

  static valid(): ScriptedModel {
    return new ScriptedModel().always(ScriptedModel.ok(LearnSeed.answer([LearnSeed.raw()])))
  }

  static idle(rig: Rig, minutes = 11): number {
    rig.clock.now += minutes * LearnFixture.MINUTE
    return rig.clock.now
  }

  static gate(): { port: ModelPort, requests: ModelRequest[], release: (answer: ModelAnswer) => void, auto: { answer: ModelAnswer | undefined }, arrived: (count?: number) => Promise<void> } {
    const requests: ModelRequest[] = []
    const waiting: ((answer: ModelAnswer) => void)[] = []
    const watchers: { count: number, resolve: () => void }[] = []
    const auto: { answer: ModelAnswer | undefined } = { answer: undefined }
    const port: ModelPort = (request) => {
      requests.push(request)
      for (const watcher of watchers.filter((item) => requests.length >= item.count)) watcher.resolve()
      if (auto.answer !== undefined) return Promise.resolve(auto.answer)
      return new Promise((resolve) => waiting.push(resolve))
    }
    const arrived = (count = 1): Promise<void> => (requests.length >= count ? Promise.resolve() : new Promise<void>((resolve) => void watchers.push({ count, resolve })))
    return { port, requests, release: (answer) => void waiting.shift()?.(answer), auto, arrived }
  }

  static cases(rig: Rig): string {
    return [...rig.fs.files.entries()].filter(([path]) => path.startsWith(LearnFixture.files().cases + '/')).map(([, file]) => file.text).join('')
  }

  static directory(rig: Rig, path: string): void {
    rig.fs.directories.add(path)
  }
}

test('the on command with background learning reports the learning clause and the token budget', async () => {
  // Arrange
  await FacadeFixture.started()

  // Act
  const text = await Signature.command('on')

  // Assert
  expect(text).toBe('Signature is on: it records your decisions and learns from them in the background with your Claude plan (up to 300,000 tokens a day). Open /podium-stage signature to change it.')
})

test('the on command with background learning off reports recording only', async () => {
  // Arrange
  await FacadeFixture.started()
  Signature.toggle('background')

  // Act
  const text = await Signature.command('on')

  // Assert
  expect(text).toBe('Signature is on: it records your decisions. Open /podium-stage signature to change it.')
})

test('the Enable action keeps its short message', async () => {
  // Arrange
  await FacadeFixture.started()

  // Act
  const text = await Signature.enable()

  // Assert
  expect(text).toBe('Signature is on: it records your decisions from now on.')
})

test('an idle tick before the idle minutes starts no run', async () => {
  // Arrange
  const model = LearnFixture.valid()
  const rig = await LearnFixture.started(model.port)

  // Act
  await Signature.tick(LearnFixture.idle(rig, 9))

  // Assert
  expect(model.requests).toEqual([])
})

test('an idle tick after the idle minutes with enough pending signals runs the learner', async () => {
  // Arrange
  const model = LearnFixture.valid()
  const rig = await LearnFixture.started(model.port)

  // Act
  await Signature.tick(LearnFixture.idle(rig))
  await Signature.whenIdle()

  // Assert
  expect(model.requests.length).toBeGreaterThan(0)
})

test('a due run started by tick writes the extracted case through the learner', async () => {
  // Arrange
  const model = LearnFixture.valid()
  const rig = await LearnFixture.started(model.port)

  // Act
  await Signature.tick(LearnFixture.idle(rig))
  await Signature.whenIdle()

  // Assert
  expect(LearnFixture.cases(rig)).toContain('Validate it and fall back to a default')
})

test('a tool call keeps the session active so the tick does not run', async () => {
  // Arrange
  const model = LearnFixture.valid()
  const rig = await LearnFixture.started(model.port)
  rig.clock.now += 9 * LearnFixture.MINUTE
  Signature.onTool()

  // Act
  await Signature.tick(LearnFixture.idle(rig, 2))

  // Assert
  expect(model.requests).toEqual([])
})

test('a tick does nothing while a run is in progress', async () => {
  // Arrange
  const gate = LearnFixture.gate()
  const rig = await LearnFixture.started(gate.port)
  await Signature.tick(LearnFixture.idle(rig))
  await gate.arrived()

  // Act
  await Signature.tick(LearnFixture.idle(rig, 1))

  // Assert
  expect(gate.requests).toHaveLength(1)
  gate.auto.answer = ScriptedModel.failed('stopped')
  gate.release(ScriptedModel.failed('stopped'))
  await Signature.whenIdle()
})

test('a tick does nothing in an excluded folder', async () => {
  // Arrange
  const model = LearnFixture.valid()
  const rig = FacadeFixture.rig(LearnFixture.options({ model: model.port }))
  LearnSeed.prompts(rig.fs, 25)
  rig.fs.seed('/work/app/.podium-private', '')
  await Signature.start(rig.ports, FacadeFixture.input())

  // Act
  await Signature.tick(LearnFixture.idle(rig))

  // Assert
  expect(model.requests).toEqual([])
})

test('a tick does nothing when background learning is off', async () => {
  // Arrange
  const model = LearnFixture.valid()
  const rig = await LearnFixture.started(model.port, { tweak: (settings) => { settings.learning.background = false } })

  // Act
  await Signature.tick(LearnFixture.idle(rig))

  // Assert
  expect(model.requests).toEqual([])
})

test('a tick does nothing when the pending signals are fewer than twenty', async () => {
  // Arrange
  const model = LearnFixture.valid()
  const rig = await LearnFixture.started(model.port, {}, 19)

  // Act
  await Signature.tick(LearnFixture.idle(rig))

  // Assert
  expect(model.requests).toEqual([])
})

test('pending signals already behind the journal cursor are not counted', async () => {
  // Arrange
  const model = LearnFixture.valid()
  const rig = FacadeFixture.rig(LearnFixture.options({ model: model.port }))
  LearnSeed.prompts(rig.fs, 25)
  LearnSeed.state(rig.fs, { journal: { [LearnSeed.KEY]: 10 } })
  await Signature.start(rig.ports, FacadeFixture.input())

  // Act
  await Signature.tick(LearnFixture.idle(rig))

  // Assert
  expect(model.requests).toEqual([])
})

test('pending signals past the journal cursor make a run due', async () => {
  // Arrange
  const model = LearnFixture.valid()
  const rig = FacadeFixture.rig(LearnFixture.options({ model: model.port }))
  LearnSeed.prompts(rig.fs, 25)
  LearnSeed.state(rig.fs, { journal: { [LearnSeed.KEY]: 4 } })
  await Signature.start(rig.ports, FacadeFixture.input())

  // Act
  await Signature.tick(LearnFixture.idle(rig))
  await Signature.whenIdle()

  // Assert
  expect(model.requests.length).toBeGreaterThan(0)
})

test('a run that learned something shows a toast', async () => {
  // Arrange
  const model = LearnFixture.valid()
  const rig = await LearnFixture.started(model.port)

  // Act
  await Signature.tick(LearnFixture.idle(rig))
  await Signature.whenIdle()

  // Assert
  expect(rig.toasts.some((text) => text.startsWith('Signature learned '))).toBe(true)
})

test('a run that learned nothing shows no toast', async () => {
  // Arrange
  const model = new ScriptedModel().always(ScriptedModel.ok(LearnSeed.answer([])))
  const rig = await LearnFixture.started(model.port)

  // Act
  await Signature.tick(LearnFixture.idle(rig))
  await Signature.whenIdle()

  // Assert
  expect(rig.toasts).toEqual([])
})

test('a run that learned something shows no toast when notifications are off', async () => {
  // Arrange
  const model = LearnFixture.valid()
  const rig = await LearnFixture.started(model.port, { tweak: (settings) => { settings.notify = false } })

  // Act
  await Signature.tick(LearnFixture.idle(rig))
  await Signature.whenIdle()

  // Assert
  expect(rig.toasts).toEqual([])
})

test('learn-now runs the learner on demand', async () => {
  // Arrange
  const model = LearnFixture.valid()
  await LearnFixture.started(model.port)

  // Act
  const text = await Signature.command('learn-now')
  await Signature.whenIdle()

  // Assert
  expect(text).toBe('Signature is learning now. Progress shows in the Signature tab.')
  expect(model.requests.length).toBeGreaterThan(0)
})

test('learn-now without a model port says learning is not available', async () => {
  // Arrange
  await LearnFixture.started(undefined)

  // Act
  const text = await Signature.command('learn-now')

  // Assert
  expect(text).toBe('Learning is not available in this session.')
})

test('learn-now when Signature is not on says so', async () => {
  // Arrange
  await LearnFixture.started(LearnFixture.valid().port, { consent: 'paused' })

  // Act
  const text = await Signature.command('learn-now')

  // Assert
  expect(text).toBe('Signature is not on.')
})

test('rebuild starts a run with its own message', async () => {
  // Arrange
  const model = LearnFixture.valid()
  await LearnFixture.started(model.port)

  // Act
  const text = await Signature.command('rebuild')
  await Signature.whenIdle()

  // Assert
  expect(text).toBe('Signature is rebuilding its index and profile.')
})

test('learn without a path gives the usage line', async () => {
  // Arrange
  await LearnFixture.started(LearnFixture.valid().port)

  // Act
  const text = await Signature.command('learn')

  // Assert
  expect(text).toBe('Usage: /podium-stage learn <path to a local repository>')
})

test('learn refuses a URL', async () => {
  // Arrange
  await LearnFixture.started(LearnFixture.valid().port)

  // Act
  const web = await Signature.command('learn https://github.com/acme/app')
  const scp = await Signature.command('learn git@github.com:acme/app.git')

  // Assert
  expect(web).toBe('Clone the repository first, then pass its folder.')
  expect(scp).toBe('Clone the repository first, then pass its folder.')
})

test('learn refuses a path that is not a folder', async () => {
  // Arrange
  const rig = await LearnFixture.started(LearnFixture.valid().port)
  rig.fs.seed('/work/notes.txt', 'hello')

  // Act
  const file = await Signature.command('learn /work/notes.txt')
  const missing = await Signature.command('learn /work/missing')

  // Assert
  expect(file).toBe('That path is not a folder.')
  expect(missing).toBe('That path is not a folder.')
})

test('learn refuses a folder that is not a git repository', async () => {
  // Arrange
  const rig = await LearnFixture.started(LearnFixture.valid().port)
  LearnFixture.directory(rig, '/work/plain')

  // Act
  const text = await Signature.command('learn /work/plain')

  // Assert
  expect(text).toBe('That folder is not a git repository.')
})

test('learn refuses an excluded folder', async () => {
  // Arrange
  const rig = await LearnFixture.started(LearnFixture.valid().port, { tweak: (settings) => { settings.exclude = ['/srv/**'] }, tops: { '/srv/client': '/srv/client' } })
  LearnFixture.directory(rig, '/srv/client')

  // Act
  const text = await Signature.command('learn /srv/client')

  // Assert
  expect(text).toBe('That folder is excluded from Signature.')
})

test('learn refuses a folder with a private marker', async () => {
  // Arrange
  const rig = await LearnFixture.started(LearnFixture.valid().port, { tops: { '/work/secret': '/work/secret' } })
  LearnFixture.directory(rig, '/work/secret')
  rig.fs.seed('/work/secret/.podium-private', '')

  // Act
  const text = await Signature.command('learn /work/secret')

  // Assert
  expect(text).toBe('That folder has a .podium-private file.')
})

test('learn resolves a relative path against the working folder', async () => {
  // Arrange
  const rig = await LearnFixture.started(LearnFixture.valid().port, { tops: { '/work/app/sub/repo': '/work/app/sub/repo' } })
  LearnFixture.directory(rig, '/work/app/sub/repo')

  // Act
  const text = await Signature.command('learn sub/repo')
  await Signature.whenIdle()

  // Assert
  expect(text).toBe('Signature is learning from repo. Progress shows in the Signature tab.')
  expect(rig.git.some((call) => call.argv.includes('-C') && call.argv.includes('/work/app/sub/repo'))).toBe(true)
})

test('forget rejects a trait by its id', async () => {
  // Arrange
  const rig = await LearnFixture.started(undefined)
  rig.fs.seed(LearnFixture.files().profile, Profile.serialize(SignatureFixtures.profile([SignatureFixtures.trait()])))

  // Act
  const text = await Signature.command('forget security.validate-boundaries')

  // Assert
  expect(text).toBe('Trait security.validate-boundaries rejected.')
  expect(Profile.parse(rig.fs.text(LearnFixture.files().profile) ?? '').traits[0]?.status).toBe('rejected')
})

test('forget rejects a case by its number', async () => {
  // Arrange
  const rig = await LearnFixture.started(undefined)
  LearnSeed.cases(rig.fs, [SignatureFixtures.caseOf({ id: 5 })])

  // Act
  const text = await Signature.command('forget #5')

  // Assert
  expect(text).toBe('Case #5 rejected.')
  expect(LearnFixture.cases(rig)).toContain('"status":"rejected"')
})

test('forget of a missing trait or case says so', async () => {
  // Arrange
  const rig = await LearnFixture.started(undefined)
  rig.fs.seed(LearnFixture.files().profile, Profile.serialize(SignatureFixtures.profile([SignatureFixtures.trait()])))

  // Act
  const trait = await Signature.command('forget testing.nothing')
  const found = await Signature.command('forget #99')

  // Assert
  expect(trait).toBe('There is no trait testing.nothing.')
  expect(found).toBe('There is no case #99.')
})

test('forget with a bad format asks for a trait id or a case number', async () => {
  // Arrange
  await LearnFixture.started(undefined)

  // Act
  const word = await Signature.command('forget banana')
  const number = await Signature.command('forget #x')

  // Assert
  expect(word).toBe('Give a trait id or #<case number>.')
  expect(number).toBe('Give a trait id or #<case number>.')
})

test('forget while another process holds the lock says it is busy', async () => {
  // Arrange
  const rig = await LearnFixture.started(undefined)
  rig.fs.seed(LearnFixture.files().profile, Profile.serialize(SignatureFixtures.profile([SignatureFixtures.trait()])))
  rig.fs.seed(LearnFixture.files().lock, JSON.stringify({ version: 1, owner: 'someone-else', expiresAt: FacadeFixture.AT + 600_000 }))

  // Act
  const text = await Signature.command('forget security.validate-boundaries')

  // Assert
  expect(text).toBe('A learning run is in progress; try again in a moment.')
})

test('pausing during a run makes the next model call return stopped', async () => {
  // Arrange
  const gate = LearnFixture.gate()
  const rig = await LearnFixture.started(gate.port)
  await Signature.tick(LearnFixture.idle(rig))
  await gate.arrived()
  await Signature.pause()

  // Act
  gate.release(ScriptedModel.ok(LearnSeed.answer([LearnSeed.raw()])))
  await Signature.whenIdle()

  // Assert
  expect(gate.requests).toHaveLength(1)
})

test('without a pause the same run makes a second model call', async () => {
  // Arrange
  const gate = LearnFixture.gate()
  const rig = await LearnFixture.started(gate.port)
  gate.auto.answer = ScriptedModel.ok(LearnSeed.answer([LearnSeed.raw()]))
  await Signature.tick(LearnFixture.idle(rig))
  await gate.arrived(2)

  // Act
  await Signature.whenIdle()

  // Assert
  expect(gate.requests.length).toBeGreaterThan(1)
})

test('declining during a run makes the next model call return stopped', async () => {
  // Arrange
  const gate = LearnFixture.gate()
  const rig = await LearnFixture.started(gate.port)
  await Signature.tick(LearnFixture.idle(rig))
  await gate.arrived()
  await Signature.decline()

  // Act
  gate.release(ScriptedModel.ok(LearnSeed.answer([LearnSeed.raw()])))
  await Signature.whenIdle()

  // Assert
  expect(gate.requests).toHaveLength(1)
})

test('erasing while a run is in progress is refused', async () => {
  // Arrange
  const gate = LearnFixture.gate()
  const rig = await LearnFixture.started(gate.port)
  await Signature.tick(LearnFixture.idle(rig))
  await gate.arrived()

  // Act
  const text = await Signature.erase()
  gate.release(ScriptedModel.failed('stopped'))
  await Signature.whenIdle()

  // Assert
  expect(text).toBe('A learning run is in progress; try again in a moment.')
})

test('a correction prompt after a turn records the turn text before it', async () => {
  // Arrange
  const rig = await FacadeFixture.started({ consent: 'enabled' })
  Signature.onTurn('answer', '', 't1', 'I will rewrite the module')

  // Act
  Signature.onPrompt(FacadeFixture.prompt({ text: 'no, keep it small' }))
  await Signature.flush()

  // Assert
  expect(FacadeFixture.journal(rig).map((signal) => signal.kind)).toEqual(['turn', 'prompt'])
  expect(FacadeFixture.journal(rig)[0]?.data.text).toBe('I will rewrite the module')
})

test('a prompt that is not a correction does not record the turn', async () => {
  // Arrange
  const rig = await FacadeFixture.started({ consent: 'enabled' })
  Signature.onTurn('answer', '', 't1', 'I will rewrite the module')

  // Act
  Signature.onPrompt(FacadeFixture.prompt({ text: 'please add a test for it' }))
  await Signature.flush()

  // Assert
  expect(FacadeFixture.journal(rig).map((signal) => signal.kind)).toEqual(['prompt'])
})

test('the turn text is recorded only once', async () => {
  // Arrange
  const rig = await FacadeFixture.started({ consent: 'enabled' })
  Signature.onTurn('answer', '', 't1', 'I will rewrite the module')
  Signature.onPrompt(FacadeFixture.prompt({ text: 'no, keep it small' }))

  // Act
  Signature.onPrompt(FacadeFixture.prompt({ text: 'no, not like that either' }))
  await Signature.flush()

  // Assert
  expect(FacadeFixture.journal(rig).map((signal) => signal.kind)).toEqual(['turn', 'prompt', 'prompt'])
})

test('a prompt after an aborted turn records the turn text', async () => {
  // Arrange
  const rig = await FacadeFixture.started({ consent: 'enabled' })
  Signature.onTurn('aborted', '', 't1', 'I was about to rewrite everything')

  // Act
  Signature.onPrompt(FacadeFixture.prompt({ text: 'do it differently' }))
  await Signature.flush()

  // Assert
  expect(FacadeFixture.journal(rig).map((signal) => signal.kind)).toEqual(['abort', 'turn', 'prompt'])
})

class ModelFixture {
  static request(partial: Partial<ModelRequest> = {}): ModelRequest {
    return { model: 'sonnet', system: [{ text: 'rules', cache: true }, { text: 'more' }], prompt: 'evidence', maxTokens: 4000, timeoutMs: 120000, ...partial }
  }

  static usage(partial: Record<string, unknown> = {}): Record<string, unknown> {
    return { input_tokens: 100, cache_creation_input_tokens: 20, cache_read_input_tokens: 30, output_tokens: 10, ...partial }
  }
}

test('the model request keeps the model, prompt, token limit and timeout', () => {
  // Act
  const request = Signature.modelRequest(ModelFixture.request())

  // Assert
  expect(request.model).toBe('sonnet')
  expect(request.prompt).toBe('evidence')
  expect(request.maxTokens).toBe(4000)
  expect(request.timeoutMs).toBe(120000)
})

test('the model request marks only the cached system blocks', () => {
  // Act
  const request = Signature.modelRequest(ModelFixture.request())

  // Assert
  expect(request.system).toEqual([{ text: 'rules', cache: true }, { text: 'more' }])
  expect('cache' in (request.system[1] ?? {})).toBe(false)
})

test('the model answer sums input, cache creation and cache read tokens', () => {
  // Act
  const answer = Signature.modelAnswer({ isAnswered: true, text: 'ok', usage: ModelFixture.usage() })

  // Assert
  expect(answer).toEqual({ isAnswered: true, text: 'ok', reason: '', inputTokens: 150, outputTokens: 10 })
})

test('the model answer counts missing usage as zero', () => {
  // Act
  const answer = Signature.modelAnswer({ isAnswered: true, text: 'ok' })

  // Assert
  expect(answer.inputTokens).toBe(0)
  expect(answer.outputTokens).toBe(0)
})

test('the model answer counts negative and non-finite usage as zero', () => {
  // Act
  const answer = Signature.modelAnswer({
    isAnswered: true,
    text: 'ok',
    usage: ModelFixture.usage({ input_tokens: -5, cache_creation_input_tokens: Number.NaN, cache_read_input_tokens: Number.POSITIVE_INFINITY, output_tokens: -1 })
  })

  // Assert
  expect(answer.inputTokens).toBe(0)
  expect(answer.outputTokens).toBe(0)
})

test('the model answer keeps the reason of an unanswered call', () => {
  // Act
  const answer = Signature.modelAnswer({ isAnswered: false, reason: 'timeout', usage: ModelFixture.usage() })

  // Assert
  expect(answer).toEqual({ isAnswered: false, text: '', reason: 'timeout', inputTokens: 150, outputTokens: 10 })
})

test('the model answer uses invalid when an unanswered call has no reason', () => {
  // Act
  const answer = Signature.modelAnswer({ isAnswered: false })

  // Assert
  expect(answer.reason).toBe('invalid')
  expect(answer.isAnswered).toBe(false)
})

test('the model answer of a non-object is invalid', () => {
  // Act
  const answers = [Signature.modelAnswer(undefined), Signature.modelAnswer(null), Signature.modelAnswer('text')]

  // Assert
  expect(answers.every((answer) => !answer.isAnswered && answer.reason === 'invalid')).toBe(true)
})

test('the model answer without an isAnswered flag is invalid', () => {
  // Act
  const answer = Signature.modelAnswer({ text: 'ok', usage: ModelFixture.usage() })

  // Assert
  expect(answer).toEqual({ isAnswered: false, text: '', reason: 'invalid', inputTokens: 0, outputTokens: 0 })
})

class DiskFixture {
  static declined(rig: Rig, consent: Consent = 'declined', dir: string = LearnFixture.DIR): void {
    const settings = SignatureSettings.defaults()
    settings.consent = consent
    rig.fs.seed(FacadeFixture.files(dir).settings, SignatureSettings.serialize(settings))
  }

  static journalReads(rig: Rig): number {
    return rig.fs.calls.filter((call) => call.startsWith('read ') && call.includes('/journal/')).length
  }

  static state(rig: Rig): { runs: unknown[], runsToday: number } {
    return JSON.parse(rig.fs.text(LearnFixture.files().state) ?? '{"runs":[],"runsToday":0}') as { runs: unknown[], runsToday: number }
  }
}

test('a tick does not start a run when another window declined consent on disk', async () => {
  // Arrange
  const model = LearnFixture.valid()
  const rig = await LearnFixture.started(model.port)
  DiskFixture.declined(rig)

  // Act
  await Signature.tick(LearnFixture.idle(rig))

  // Assert
  expect(model.requests).toEqual([])
  expect(Signature.view().consent).toBe('declined')
})

test('a run in progress stops at its next model call when consent is declined on disk', async () => {
  // Arrange
  const gate = LearnFixture.gate()
  const rig = await LearnFixture.started(gate.port)
  await Signature.tick(LearnFixture.idle(rig))
  await gate.arrived()
  DiskFixture.declined(rig)

  // Act
  gate.release(ScriptedModel.ok(LearnSeed.answer([LearnSeed.raw()])))
  await Signature.whenIdle()

  // Assert
  expect(gate.requests).toHaveLength(1)
})

test('erasing while another session holds a live lock reports the run in another session', async () => {
  // Arrange
  const rig = await LearnFixture.started(undefined)
  const journal = LearnFixture.files().journal + '/' + LearnSeed.KEY
  rig.fs.seed(LearnFixture.files().lock, JSON.stringify({ version: 1, owner: 'other-session:1:1', expiresAt: FacadeFixture.AT + 600_000 }))
  await Signature.erase()

  // Act
  const text = await Signature.erase()

  // Assert
  expect(text).toBe('A learning run is in progress in another session; try again in a moment.')
  expect(rig.fs.text(journal)).not.toBe('')
  expect(Signature.view().consent).toBe('enabled')
})

test('ticks after runs that made no model call start exactly the runs per day', async () => {
  // Arrange
  const model = LearnFixture.valid()
  const rig = FacadeFixture.rig(LearnFixture.options({ model: model.port }))
  await Signature.start(rig.ports, FacadeFixture.input())

  // Act
  for (let index = 0; index < 4; index += 1) {
    const uses = Array.from({ length: 25 }, (_, line) => SignatureFixtures.signal({ at: LearnSeed.BASE + line * 1000, session: `u${index}`, kind: 'use', data: { caseIds: [1] } }))
    rig.fs.seed(`${LearnFixture.files().journal}/2026-0${index + 1}/u${index}.jsonl`, Journal.lines(uses))
    await Signature.tick(LearnFixture.idle(rig))
    await Signature.whenIdle()
  }

  // Assert
  expect(DiskFixture.state(rig).runsToday).toBe(2)
  expect(DiskFixture.state(rig).runs).toHaveLength(2)
})

test('keeping a trait makes the next synthesis due', async () => {
  // Arrange
  const rig = await LearnFixture.started(undefined)
  rig.fs.seed(LearnFixture.files().profile, Profile.serialize(SignatureFixtures.profile([SignatureFixtures.trait({ isNew: true })], { changedSince: 0 })))

  // Act
  await Signature.keep('security.validate-boundaries')

  // Assert
  expect(Profile.parse(rig.fs.text(LearnFixture.files().profile) ?? '').changedSince).toBeGreaterThanOrEqual(10)
})

test('forgetting a trait makes the next synthesis due', async () => {
  // Arrange
  const rig = await LearnFixture.started(undefined)
  rig.fs.seed(LearnFixture.files().profile, Profile.serialize(SignatureFixtures.profile([SignatureFixtures.trait()], { changedSince: 0 })))

  // Act
  await Signature.command('forget security.validate-boundaries')

  // Assert
  expect(Profile.parse(rig.fs.text(LearnFixture.files().profile) ?? '').changedSince).toBeGreaterThanOrEqual(10)
})

test('forgetting a case makes the next synthesis due', async () => {
  // Arrange
  const rig = await LearnFixture.started(undefined)
  LearnSeed.cases(rig.fs, [SignatureFixtures.caseOf({ id: 5 })])
  rig.fs.seed(LearnFixture.files().profile, Profile.serialize(SignatureFixtures.profile([], { changedSince: 0 })))

  // Act
  await Signature.command('forget #5')

  // Assert
  expect(Profile.parse(rig.fs.text(LearnFixture.files().profile) ?? '').changedSince).toBeGreaterThanOrEqual(10)
})

test('a manual repository with an unfinished cursor is resumed after start', async () => {
  // Arrange
  const model = LearnFixture.valid()
  const rig = FacadeFixture.rig(LearnFixture.options({ model: model.port, tops: { '/work/other': '/work/other' } }))
  rig.fs.directories.add('/work/other')
  const cursor = { version: 1, root: '/work/other', name: 'other', identities: [], head: '', done: [], scanned: 5, selected: 1, isComplete: false, source: 'manual' }
  rig.fs.seed(LearnFixture.files().history + '/abcd1234.json', JSON.stringify(cursor))
  await Signature.start(rig.ports, FacadeFixture.input())

  // Act
  await Signature.learnNow()
  await Signature.whenIdle()

  // Assert
  expect(Signature.view().repositories.map((item) => item.name)).toContain('other')
})

test('a finished manual repository is not restored', async () => {
  // Arrange
  const model = LearnFixture.valid()
  const rig = FacadeFixture.rig(LearnFixture.options({ model: model.port, tops: { '/work/other': '/work/other' } }))
  rig.fs.directories.add('/work/other')
  const cursor = { version: 1, root: '/work/other', name: 'other', identities: [], head: '', done: [], scanned: 5, selected: 1, isComplete: true, source: 'manual' }
  rig.fs.seed(LearnFixture.files().history + '/abcd1234.json', JSON.stringify(cursor))
  await Signature.start(rig.ports, FacadeFixture.input())

  // Act
  await Signature.learnNow()
  await Signature.whenIdle()

  // Assert
  expect(Signature.view().repositories.map((item) => item.name)).not.toContain('other')
})

test('the pending count is not recomputed while the journal sizes are unchanged', async () => {
  // Arrange
  const model = LearnFixture.valid()
  const rig = await LearnFixture.started(model.port, {}, 19)
  await Signature.tick(LearnFixture.idle(rig))
  const first = DiskFixture.journalReads(rig)

  // Act
  await Signature.tick(LearnFixture.idle(rig, 1))

  // Assert
  expect(first).toBeGreaterThan(0)
  expect(DiskFixture.journalReads(rig)).toBe(first)
})

test('the pending count is recomputed when a journal file size changes', async () => {
  // Arrange
  const model = LearnFixture.valid()
  const rig = await LearnFixture.started(model.port, {}, 19)
  await Signature.tick(LearnFixture.idle(rig))
  const first = DiskFixture.journalReads(rig)
  LearnSeed.prompts(rig.fs, 20)

  // Act
  await Signature.tick(LearnFixture.idle(rig, 1))
  await Signature.whenIdle()

  // Assert
  expect(DiskFixture.journalReads(rig)).toBeGreaterThan(first)
})

test('a run paused part way shows the paused consent and no error', async () => {
  // Arrange
  const gate = LearnFixture.gate()
  const rig = await LearnFixture.started(gate.port)
  await Signature.tick(LearnFixture.idle(rig))
  await gate.arrived()
  await Signature.pause()

  // Act
  gate.release(ScriptedModel.ok(LearnSeed.answer([LearnSeed.raw()])))
  await Signature.whenIdle()

  // Assert
  expect(Signature.view().consent).toBe('paused')
  expect(Signature.view().learning.lastError).toBe('')
})

test('a flush after another window paused consent on disk writes nothing and empties the buffer', async () => {
  // Arrange
  const rig = await FacadeFixture.started({ consent: 'enabled' })
  Signature.onPrompt(FacadeFixture.prompt())
  DiskFixture.declined(rig, 'paused', FacadeFixture.ROOT)

  // Act
  await Signature.flush()

  // Assert
  expect(rig.fs.text(FacadeFixture.journalPath())).toBeUndefined()
  expect(Signature.view().buffered).toBe(0)
})

test('a tick after another window paused consent on disk empties the buffer without writing', async () => {
  // Arrange
  const rig = await LearnFixture.started(undefined, {}, 0)
  Signature.onPrompt(FacadeFixture.prompt())
  DiskFixture.declined(rig, 'paused')
  const journal = SignaturePaths.journalFile(LearnFixture.DIR, FacadeFixture.AT, 's1', 0)

  // Act
  await Signature.tick(LearnFixture.idle(rig))

  // Assert
  expect(rig.fs.text(journal)).toBe('')
  expect(Signature.view().buffered).toBe(0)
})

test('a refused erase keeps the buffer and the counters', async () => {
  // Arrange
  const rig = await LearnFixture.started(undefined, {}, 0)
  Signature.onPrompt(FacadeFixture.prompt())
  rig.fs.seed(LearnFixture.files().lock, JSON.stringify({ version: 1, owner: 'other-session:1:1', expiresAt: FacadeFixture.AT + 600_000 }))
  await Signature.erase()

  // Act
  const text = await Signature.erase()

  // Assert
  expect(text).toBe('A learning run is in progress in another session; try again in a moment.')
  expect(Signature.view().buffered).toBe(1)
  expect(Signature.view().signals).toBe(1)
})
