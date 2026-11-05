import { expect, mock, test } from 'claude-code/testing'
import type { AgentSpawnInput, On } from 'claude-code'
import { Fixtures } from './fixtures/sample-project'
import { Cases } from '../hooks/signature/cases'
import { Profile } from '../hooks/signature/profile'
import { TagIndex } from '../hooks/signature/tag-index'
import { SignatureFixtures } from './fixtures/signature'

const PANE = {
  plugin: 'podium',
  component: 'Pane',
  requestId: 'podium-stage',
  props: {
    title: 'Podium',
    isFocused: false,
    bodyColumns: 72,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 60 },
    view: {},
  },
} as const

const VIEWPORT = { columns: 120, rows: 50 }

type Sink = { notifications: string[]; copies: string[]; files?: Record<string, string>; stored?: Record<string, unknown>; fetchAgeMs?: number; isBare?: boolean; opens?: number; submitted?: string[]; env?: Record<string, string>; isRooted?: boolean; isDropping?: boolean; received?: Record<string, unknown>[] }

class Engine {
  static spawn(subagentType: string, description: string): AgentSpawnInput {
    return {
      tool_use_id: `tu-${subagentType}`,
      prompt: description,
      description,
      subagentType,
      provider: { plugin: 'engine', tier: 'core' },
      parentModel: 'claude-opus-5-5',
      background: false,
      fork: false,
    }
  }

  static file(sink: Sink, path: string): string | undefined {
    return Object.entries(sink.files ?? {}).find(([key]) => path.endsWith(`/${key}`))?.[1]
  }

  static stub(
    on: On,
    withTools = true,
    branch = 'features/1234-claims',
    git: (argv: string) => string | undefined = () => undefined,
    sink: Sink = { notifications: [], copies: [] },
  ): string[] {
    const toasts: string[] = []
    on('ui.notify', (_, e) => {
      sink.notifications.push(e.text)
      return { value: { isSent: true, channel: 'iterm2' } }
    })
    on('ui.copy', (_, e) => {
      sink.copies.push(e.text)
      return { value: { isCopied: true } }
    })
    on('command.register', () => ({ value: { command: 'podium-stage' } }))
    on('ui.open', () => {
      sink.opens = (sink.opens ?? 0) + 1
      return { value: { isPlaced: true } }
    })
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    on('agent.list', () => ({ value: [] }))
    on('fs.list', (_, e) => {
      if (sink.isRooted !== true) return { value: [] }
      const prefix = `${String(e.path)}/`
      const seen = new Map<string, unknown>()
      for (const [key, text] of Object.entries(sink.files ?? {})) {
        if (!key.startsWith(prefix)) continue
        const rest = key.slice(prefix.length)
        const slash = rest.indexOf('/')
        if (slash < 0) seen.set(rest, { name: rest, kind: 'file', size: text.length, mtimeMs: 1, isLink: false })
        else seen.set(rest.slice(0, slash), { name: rest.slice(0, slash), kind: 'dir', size: 0, mtimeMs: 1, isLink: false })
      }
      return { value: [...seen.values()] as never }
    })
    on('fs.read', (_, e) => ({ value: sink.files?.[e.path] ?? Engine.file(sink, String(e.path)) ?? (String(e.path).endsWith('.claude/podium.json') && sink.isBare !== true ? JSON.stringify(Fixtures.SAMPLE_PROJECT) : '') }))
    on('store.get', () => ({ value: undefined }))
    on('env.get', (_, e) => {
      const key = String((e as Record<string, unknown>).name ?? (e as Record<string, unknown>).key)
      return { value: sink.env?.[key] }
    })
    on('store.set', (_, e) => {
      if (sink.stored) sink.stored[e.key] = e.value
      return { value: undefined }
    })
    on('fs.stat', (_, e) => {
      const path = String(e.path)
      const kind = sink.isRooted === true && !/\.[a-z]+$/.test(path) ? 'dir' : 'file'
      return { value: { kind, size: 0, mtimeMs: Date.now() - (sink.fetchAgeMs ?? 3 * 86_400_000 + 60_000), isLink: false, realPath: path } as never }
    })
    on('prompt.submit', (_, e) => {
      sink.submitted?.push(e.text)
      sink.received?.push(e as never)
      return sink.isDropping === true ? ({ drop: 'blocked' } as never) : { text: e.text }
    })
    on('process.run', (_, e) => {
      const argv = e.argv.join(' ')
      const stdout = git(argv) ?? (argv.includes('rev-parse --git-common-dir')
        ? '.git'
        : argv.includes('rev-parse')
        ? branch
        : argv.includes('rev-list')
          ? '3\t12'
          : argv.includes('status')
            ? ' M src/Contoso.Policies.Domain/Claims/Claim.cs\n M web/src/app/claim.component.ts\n?? docs/claims/README.md'
            : argv.includes('uname')
              ? 'arm64'
              : '')
      return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    })
    if (withTools) on('tool.call', () => ({ result: {} }))
    on('turn.complete', () => ({ text: '' }))
    on('ui.status', () => ({ value: undefined }))
    on('ui.toast', (_, e) => {
      toasts.push(e.text)
      return { value: undefined }
    })
    return toasts
  }
}

test('the panel draws the four tabs with a running agent', async ($, on) => {
  // Arrange
  Engine.stub(on)
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'a1' }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.agent.spawn(Engine.spawn('dotnet-expert', 'Claims domain'))
  await $.tool.call({ tool: 'Bash', command: 'git status', agentId: 'a1' })

  // Act
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })

  // Assert
  expect((await ui.find({ type: 'Text', text: /PODIUM/ }))?.text).toContain('PODIUM')
  expect((await ui.find({ key: 'run-a1' }))?.type).toBe('Button')
  expect((await ui.find({ type: 'Raster' }))?.key).toBe('graph')
  expect((await ui.find({ type: 'Text', text: /dotnet-expert/ }))?.text).toContain('dotnet-expert')
  await ui.press({ key: 'tab-livraison' })
  expect((await ui.find({ type: 'Text', text: /VERDICT/ }))?.text).toContain('VERDICT')
  await ui.press({ key: 'tab-historique' })
  expect((await ui.find({ key: 'filter' }))?.type).toBe('Button')
  await ui.press({ key: 'tab-contexte' })
  expect((await ui.find({ type: 'Text', text: /WATCH/ }))?.text).toContain('WATCH')
  expect((await ui.find({ type: 'Text', text: /features\/1234-claims/ }))?.text).toContain('1234')
  await ui.unmount()
})

test('the repo rules raise alerts', async ($, on) => {
  // Arrange
  Engine.stub(on)
  on('agent.spawn', (_, e) => ({ model: 'claude-sonnet-5-5', agentId: e.subagentType === 'dotnet-expert' ? 'a1' : 'a2' }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.agent.spawn(Engine.spawn('dotnet-expert', 'Back'))
  await $.agent.spawn(Engine.spawn('test-expert', 'Tests'))
  const file = '/repo/src/Contoso.Policies.Domain/Claims/Claim.cs'

  // Act
  await $.tool.call({ tool: 'Edit', file_path: file, old_string: 'a', new_string: 'a\n// TODO revisit\nvar x = 1;', agentId: 'a1' })
  await $.tool.call({ tool: 'Edit', file_path: file, old_string: 'b', new_string: 'c', agentId: 'a2' })
  await $.tool.call({ tool: 'Edit', file_path: '/repo/web/src/shared/api-client/api-client.ts', old_string: 'a', new_string: 'b', agentId: 'a1' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-livraison' })

  // Assert
  expect((await ui.find({ type: 'Text', text: /Comment added/ }))?.text).toContain('Comment added')
  expect((await ui.find({ type: 'Text', text: /var in C#/ }))?.text).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /Partition conflict/ }))?.text).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /Generated file/ }))?.text).toBeTruthy()
  await ui.unmount()
})

test('verification and reviews feed the Delivery tab', async ($, on) => {
  // Arrange
  Engine.stub(on, false)
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'r1' }))
  on('tool.call', (_, e) =>
    e.tool === 'Bash' && e.command.includes('dotnet build')
      ? { result: { stdout: 'Build FAILED.', stderr: '', interrupted: false }, isError: true }
      : { result: {} },
  )
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.agent.spawn(Engine.spawn('code-reviewer', 'Review'))

  // Act
  await $.tool.call({ tool: 'Bash', command: 'dotnet build Contoso.Policies.slnx -c Debug', agentId: 'r1' })
  await $.turn.complete({
    answer: '- Critical: tenant leak in the handler\n- Minor: naming',
    text: '',
    durationMs: 1200,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
    agentId: 'r1',
  } as never)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-livraison' })

  // Assert
  expect((await ui.find({ type: 'Text', text: /✗ Build/ }))?.text).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /^  Build FAILED/ }))?.text).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /tenant leak/ }))?.text).toContain('[C] tenant leak')
  expect((await ui.find({ type: 'Text', text: /Domain/ }))?.text).toContain('Domain')
  await ui.unmount()
})

test('the timeline is drawn and the replay starts', async ($, on) => {
  // Arrange
  Engine.stub(on)
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'l1' }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.agent.spawn(Engine.spawn('lint-runner', 'Verification'))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  // Act
  await ui.press({ key: 'tab-historique' })
  await ui.press({ key: 'mode' })
  await ui.press({ key: 'play' })

  // Assert
  expect((await ui.find({ type: 'Raster' }))?.key).toBe('lanes')
  expect((await ui.find({ type: 'Text', text: /REPLAY/ }))?.text).toContain('REPLAY')
  await ui.press({ key: 'live' })
  expect(await ui.find({ type: 'Text', text: /REPLAY/ })).toBeUndefined()
  await ui.unmount()
})

test('the journal filters errors and the reset command clears everything', async ($, on) => {
  // Arrange
  Engine.stub(on, false)
  on('tool.call', () => ({ result: {}, isError: true, text: 'boom' }))
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'j1' }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.agent.spawn(Engine.spawn('dotnet-expert', 'Back'))
  await $.tool.call({ tool: 'Read', file_path: '/repo/a.cs', agentId: 'j1' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  // Act
  await ui.press({ key: 'tab-historique' })
  await ui.press({ key: 'filter' })

  // Assert
  expect((await ui.find({ type: 'Text', text: /Read failed/ }))?.text).toContain('Read failed')
  await $.command.run({ command: 'podium-stage', args: 'reset' } as never)
  expect(await ui.find({ type: 'Text', text: /Read failed/ })).toBeUndefined()
  await ui.unmount()
})

test('the graph labels open the agent conversation', async ($, on) => {
  // Arrange
  Engine.stub(on)
  const views: unknown[] = []
  on('ui.view', (_, e) => {
    views.push(e)
    return { value: {} }
  })
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'a1' }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.agent.spawn(Engine.spawn('dotnet-expert', 'Claims domain'))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })

  // Act
  await ui.press({ key: 'label-a1' })
  await ui.press({ key: 'label-main' })

  // Assert
  expect(views).toEqual([{ agentId: 'a1' }, {}])
  await ui.unmount()
})

test('the Rules section explains on demand and a violation can be dismissed', async ($, on) => {
  // Arrange
  Engine.stub(on)
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'a1' }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.agent.spawn(Engine.spawn('dotnet-expert', 'Back'))
  const file = '/repo/src/Contoso.Policies.Domain/Claims/Claim.cs'
  await $.tool.call({ tool: 'Edit', file_path: file, old_string: 'a', new_string: 'a\n// TODO revisit', agentId: 'a1' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })
  await ui.press({ key: 'tab-livraison' })
  const ignore = (await ui.findAll({ type: 'Button' })).find(b => (b.key ?? '').startsWith('ignore-'))
  const hidden = await ui.find({ type: 'Text', text: /Why: project rule/ })

  // Act
  await ui.press({ key: 'why' })
  const why = (await ui.find({ type: 'Text', text: /Why: project rule/ }))?.text
  await ui.press({ key: ignore?.key ?? 'missing' })

  // Assert
  expect(ignore).toBeDefined()
  expect(hidden).toBeUndefined()
  expect(why).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /TODO revoir/ })).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: /10\/10 ✓/ }))?.text).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /Why: / })).toBeUndefined()
  await ui.unmount()
})

test('the alert rows shorten project paths without naming a project', async ($, on) => {
  // Arrange
  Engine.stub(on)
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'a1' }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.agent.spawn(Engine.spawn('dotnet-expert', 'Back'))

  // Act
  await $.tool.call({ tool: 'Edit', file_path: '/repo/src/Contoso.Policies.Domain/Claims/Claim.cs', old_string: 'a', new_string: 'a\n// TODO revisit', agentId: 'a1' })
  await $.tool.call({ tool: 'Edit', file_path: '/repo/web/src/app/claim.component.ts', old_string: 'a', new_string: 'a\n// TODO revisit', agentId: 'a1' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })
  await ui.press({ key: 'tab-livraison' })

  // Assert
  const rows = (await ui.findAll({ type: 'Text' })).map(t => t.text ?? '').filter(t => t.startsWith('! Comment added') || t.startsWith('✗ Comment added'))
  expect(rows.some(r => r.includes('   Domain/Claims/Claim.cs'))).toBe(true)
  expect(rows.some(r => r.includes('   web/src/app/claim.component.ts'))).toBe(true)
  await ui.unmount()
})

test('only the setup command is tagged with the setup role, never the panel command', async ($, on) => {
  // Arrange
  Engine.stub(on, true, 'main', () => undefined, { notifications: [], copies: [], isBare: true })
  on('command.list', () => ({
    value: [
      { name: 'podium-stage', description: 'Panel', source: 'plugin', plugin: 'podium' },
      { name: 'podium', description: 'Setup', source: 'plugin', plugin: 'podium' },
    ],
  }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })

  // Act
  await ui.press({ key: 'tab-commandes' })

  // Assert
  const tagged = (await ui.findAll({ type: 'Text' })).filter(t => /^ \[Podium\]$/.test(t.text ?? ''))
  expect(tagged.length).toBe(1)
  expect((await ui.find({ key: 'cmd-plugins-podium-stage' }))?.type).toBe('Button')
  await ui.unmount()
})

test('the lanes mode shows the tool legend', async ($, on) => {
  // Arrange
  Engine.stub(on)
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'c1' }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.agent.spawn(Engine.spawn('angular-expert', 'Front'))
  await $.tool.call({ tool: 'Read', file_path: '/repo/web/a.ts', agentId: 'c1' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })

  // Act
  await ui.press({ key: 'tab-historique' })
  await ui.press({ key: 'mode' })

  // Assert
  expect((await ui.find({ type: 'Text', text: /Read/ }))?.text).toContain('Read')
  expect((await ui.find({ type: 'Text', text: /Edit/ }))?.text).toContain('Edit')
  expect((await ui.find({ key: 'chrono-c1' }))?.type).toBe('Button')
  await ui.unmount()
})

test('the hidden disco command toggles disco mode', async ($, on) => {
  // Arrange
  const toasts = Engine.stub(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  // Act
  const on1 = await $.command.run({ command: 'podium-stage', args: 'disco' } as never)
  const off = await $.command.run({ command: 'podium-stage', args: 'disco' } as never)

  // Assert
  expect(JSON.stringify(on1)).toContain('disco mode on')
  expect(JSON.stringify(off)).toContain('disco mode off')
  expect(toasts.some(t => /disco mode on/.test(t))).toBe(true)
})

test('the accessory command draws another one, forces one and rejects an unknown name', async ($, on) => {
  // Arrange
  Engine.stub(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  // Act
  const drawn = await $.command.run({ command: 'podium-stage', args: 'accessory' } as never)
  const named = await $.command.run({ command: 'podium-stage', args: 'accessory monocle' } as never)
  const unknown = await $.command.run({ command: 'podium-stage', args: 'accessory top-hat' } as never)
  const listed = await $.command.run({ command: 'podium-stage', args: 'accessory list' } as never)

  // Assert
  expect(JSON.stringify(drawn)).toContain('for this session')
  expect(JSON.stringify(named)).toContain('monocle for this session')
  expect(JSON.stringify(unknown)).toContain('unknown accessory')
  expect(JSON.stringify(listed)).toContain('41 accessories')
})

test('a created PR triggers the rocket', async ($, on) => {
  // Arrange
  const toasts = Engine.stub(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  // Act
  await $.tool.call({ tool: 'Bash', command: 'az repos pr create --title "[MAIN] - #1 Fix" --draft true' })

  // Assert
  expect(toasts.some(t => /PR created/.test(t))).toBe(true)
})

class Git {
  static distances(branch: string, distances: Record<string, string>, behind: string): (argv: string) => string | undefined {
    return argv => {
      if (argv.includes('rev-parse --abbrev-ref')) return branch
      if (argv.includes('for-each-ref')) return 'origin/support/6.44\norigin/support/6.45'
      if (argv.includes('--left-right')) return `${behind}\t2`
      const target = /rev-list --count origin\/(\S+)\.\.HEAD/.exec(argv)?.[1]
      return target === undefined ? undefined : (distances[target] ?? '')
    }
  }

  static notification(taskId: string, status: string, summary: string): string {
    return `<task-notification>\n<task-id>${taskId}</task-id>\n<status>${status}</status>\n<summary>${summary}</summary>\n</task-notification>`
  }
}

test('pickBase: the closest support branch becomes the base', async ($, on) => {
  // Arrange
  Engine.stub(on, true, 'bugfixes/4321-claim-job', Git.distances('bugfixes/4321-claim-job', { main: '40', 'support/6.45': '2', 'support/6.44': '9' }, '45'))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })
  await ui.press({ key: 'tab-contexte' })

  // Act
  await ui.press({ key: 'ctx-refresh' })

  // Assert
  expect((await ui.find({ type: 'Text', text: /→ support\/6\.45/ }))?.text).toContain('↓45')
  expect((await ui.find({ type: 'Text', text: /→ merge support\/6\.45/ }))?.text).toContain('45 commits behind')
  expect((await ui.find({ type: 'Text', text: /fetched/ }))?.text).toContain('3 d')
  await ui.unmount()
})

test('pickBase: on a tie the base stays main', async ($, on) => {
  // Arrange
  Engine.stub(on, true, 'bugfixes/4321-claim-job', Git.distances('bugfixes/4321-claim-job', { main: '2', 'support/6.45': '2', 'support/6.44': '9' }, '1'))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })
  await ui.press({ key: 'tab-contexte' })

  // Act
  await ui.press({ key: 'ctx-refresh' })

  // Assert
  expect((await ui.find({ type: 'Text', text: /→ main/ }))?.text).toContain('↓1')
  expect(await ui.find({ type: 'Text', text: /→ support/ })).toBeUndefined()
  await ui.unmount()
})

test('pickBase: a -main branch always compares with main', async ($, on) => {
  // Arrange
  Engine.stub(on, true, 'bugfixes/4321-claim-job-main', Git.distances('bugfixes/4321-claim-job-main', { main: '40', 'support/6.45': '2', 'support/6.44': '9' }, '3'))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })
  await ui.press({ key: 'tab-contexte' })

  // Act
  await ui.press({ key: 'ctx-refresh' })

  // Assert
  expect((await ui.find({ type: 'Text', text: /→ main/ }))?.text).toContain('↓3')
  expect(await ui.find({ type: 'Text', text: /merge main|merge support/ })).toBeUndefined()
  await ui.unmount()
})

test('a background lint turns green on the task completion notification', async ($, on) => {
  // Arrange
  Engine.stub(on, false)
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'bg-1' } }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'npm run lint', run_in_background: true, agentId: 'l1' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })
  await ui.press({ key: 'tab-livraison' })
  expect((await ui.find({ type: 'Text', text: /Lint\s+running/ }))?.text).toContain('◌')

  // Act
  await $.prompt.submit({ wait: false, origin: { kind: 'task-notification' }, text: Git.notification('bg-1', 'completed', 'Background command "npm run lint" completed (exit code 0)') })

  // Assert
  expect((await ui.find({ type: 'Text', text: /✓ Lint/ }))?.text).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /Lint\s+running/ })).toBeUndefined()
  await ui.press({ key: 'tab-historique' })
  expect((await ui.find({ type: 'Text', text: /Background task completed: Lint/ }))?.text).toBeTruthy()
  await ui.unmount()
})

test('a failed background lint turns red on the notification', async ($, on) => {
  // Arrange
  const toasts = Engine.stub(on, false)
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'bg-2' } }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'npm run lint', run_in_background: true, agentId: 'l1' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })
  await ui.press({ key: 'tab-livraison' })

  // Act
  await $.prompt.submit({ wait: false, origin: { kind: 'task-notification' }, text: Git.notification('bg-2', 'failed', 'Background command "npm run lint" failed with exit code 1') })

  // Assert
  expect((await ui.find({ type: 'Text', text: /✗ Lint/ }))?.text).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /^  .*failed with exit code 1/ }))?.text).toBeTruthy()
  expect(toasts.some(t => /Lint failed/.test(t))).toBe(true)
  await ui.unmount()
})

test('parseTaskNotification: a task notification is not a new prompt', async ($, on) => {
  // Arrange
  Engine.stub(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })

  // Act
  await $.prompt.submit({ wait: false, origin: { kind: 'composer' }, text: `Result:\n${Git.notification('bg-9', 'completed', 'done')}` })

  // Assert
  expect((await ui.find({ type: 'Text', text: /Nothing in progress/ }))?.text).toBeTruthy()
  await ui.press({ key: 'tab-historique' })
  expect(await ui.find({ type: 'Text', text: /New prompt/ })).toBeUndefined()
  await $.prompt.submit({ wait: false, origin: { kind: 'composer' }, text: 'Fix the test' })
  expect((await ui.find({ type: 'Text', text: /New prompt/ }))?.text).toBeTruthy()
  await ui.unmount()
})

test('parseTaskNotification: a text without a task id stays a prompt', async ($, on) => {
  // Arrange
  Engine.stub(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })
  await ui.press({ key: 'tab-historique' })

  // Act
  await $.prompt.submit({ wait: false, origin: { kind: 'composer' }, text: '<task-notification><status>completed</status></task-notification>' })

  // Assert
  expect((await ui.find({ type: 'Text', text: /New prompt/ }))?.text).toBeTruthy()
  await ui.unmount()
})

test('the review verdict is shown first with compact counters', async ($, on) => {
  // Arrange
  Engine.stub(on)
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'r1' }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.agent.spawn(Engine.spawn('code-reviewer', 'Review'))

  // Act
  await $.turn.complete({
    answer: ['### verdict', 'FAIL', '', '- [Minor] naming', '- [Critical] tenant leak'].join('\n'),
    text: '',
    durationMs: 1200,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
    agentId: 'r1',
  } as never)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-livraison' })

  // Assert
  const row = (await ui.find({ type: 'Text', text: /^✗ code/ }))?.text ?? ''
  expect(row).toMatch(/^✗ code\s+FAIL\s+1C 0M 1m$/)
  await ui.unmount()
})

class Pass {
  static readonly COMMANDS = [
    'dotnet build Contoso.Policies.slnx -c Debug',
    'dotnet format Contoso.Policies.slnx --verify-no-changes',
    'dotnet test tests/Contoso.Policies.Tests --filter "FullyQualifiedName~.Unit."',
    'npm run lint',
  ]

  static async run(call: (command: string) => Promise<unknown>): Promise<void> {
    for (const command of Pass.COMMANDS) await call(command)
  }
}

test('a four-step verification pass celebrates only once', async ($, on) => {
  // Arrange
  const toasts = Engine.stub(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  // Act
  await Pass.run(command => $.tool.call({ tool: 'Bash', command, agentId: 'l1' }))

  // Assert
  expect(toasts.filter(t => /all green/i.test(t)).length).toBe(1)
})

test('a code change after a green build marks it to rerun', async ($, on) => {
  // Arrange
  Engine.stub(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'dotnet build Contoso.Policies.slnx -c Debug', agentId: 'l1' })

  // Act
  await $.tool.call({ tool: 'Edit', file_path: '/repo/src/Contoso.Policies.Domain/Claims/Claim.cs', old_string: 'a', new_string: 'b', agentId: 'a1' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })
  await ui.press({ key: 'tab-livraison' })

  // Assert
  expect((await ui.find({ type: 'Text', text: /^≈ Build/ }))?.text).toMatch(/^≈ Build\s+✓ \d\d:\d\d · stale$/)
  expect((await ui.find({ type: 'Text', text: /Rerun build/ }))?.text).toContain('1 file modified')
  expect((await ui.find({ type: 'Text', text: /ready to deliver/i }))?.text).toBe('✗ Not ready to deliver')
  await ui.unmount()
})

test('the Ready to deliver banner appears with fresh verifications and a PASS review', async ($, on) => {
  // Arrange
  Engine.stub(on)
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'r1' }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Edit', file_path: '/repo/web/src/app/claim.component.ts', old_string: 'a', new_string: 'b', agentId: 'a1' })
  await Pass.run(command => $.tool.call({ tool: 'Bash', command, agentId: 'l1' }))
  await $.agent.spawn(Engine.spawn('security-reviewer', 'Security review'))

  // Act
  await $.turn.complete({
    answer: ['## Verdict', 'PASS'].join('\n'),
    text: '',
    durationMs: 1200,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
    agentId: 'r1',
  } as never)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })
  await ui.press({ key: 'tab-livraison' })

  // Assert
  expect((await ui.find({ type: 'Text', text: /Ready to deliver/ }))?.text).toBe('✓ Ready to deliver')
  expect(await ui.find({ type: 'Text', text: /stale/ })).toBeUndefined()
  await ui.unmount()
})

test('a commit with a stale verification raises a warning without blocking', async ($, on) => {
  // Arrange
  const toasts = Engine.stub(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await Pass.run(command => $.tool.call({ tool: 'Bash', command, agentId: 'l1' }))
  await $.tool.call({ tool: 'Edit', file_path: '/repo/src/Contoso.Policies.Domain/Claims/Claim.cs', old_string: 'a', new_string: 'b' })

  // Act
  await $.tool.call({ tool: 'Bash', command: 'git commit -m "#1234: Claim +semver:patch"' })

  // Assert
  expect(toasts.some(t => /Delivery with a stale verification/.test(t))).toBe(true)
})

test('the recap command copies a summary of the work item and the agents', async ($, on) => {
  // Arrange
  const sink: Sink = { notifications: [], copies: [] }
  Engine.stub(on, true, 'features/1234-claims', () => undefined, sink)
  on('agent.spawn', (_, e) => ({ model: 'claude-sonnet-5-5', agentId: `id-${e.subagentType}` }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.agent.spawn(Engine.spawn('dotnet-expert', 'Claims domain'))
  await $.agent.spawn(Engine.spawn('code-reviewer', 'Review'))

  // Act
  const answer = await $.command.run({ command: 'podium-stage', args: 'recap' } as never)

  // Assert
  const text = JSON.stringify(answer)
  expect(text).toContain('WI #1234')
  expect(text).toContain('dotnet-expert')
  expect(text).toContain('code-reviewer')
  expect(sink.copies.length).toBe(1)
  expect(sink.copies[0] ?? '').toContain('Podium — WI #1234')
})

test('notify off silences native notifications of a failed verification', async ($, on) => {
  // Arrange
  const sink: Sink = { notifications: [], copies: [] }
  Engine.stub(on, false, 'features/1234-claims', () => undefined, sink)
  on('tool.call', () => ({ result: { stdout: 'Build FAILED.', stderr: '', interrupted: false }, isError: true }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  // Act
  await $.command.run({ command: 'podium-stage', args: 'notify off' } as never)
  await $.tool.call({ tool: 'Bash', command: 'dotnet build Contoso.Policies.slnx -c Debug', agentId: 'l1' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })
  await ui.press({ key: 'tab-contexte' })

  // Assert
  expect(sink.notifications.length).toBe(0)
  expect(await ui.find({ type: 'Text', text: /Notifications/ })).toBeUndefined()
  await ui.unmount()
})

test('notify on sends a single notification for two failures within 60 s', async ($, on) => {
  // Arrange
  const sink: Sink = { notifications: [], copies: [] }
  const toasts = Engine.stub(on, false, 'features/1234-claims', () => undefined, sink)
  on('tool.call', () => ({ result: { stdout: 'Build FAILED.', stderr: '', interrupted: false }, isError: true }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'podium-stage', args: 'notify on' } as never)

  // Act
  await $.tool.call({ tool: 'Bash', command: 'dotnet build Contoso.Policies.slnx -c Debug', agentId: 'l1' })
  await $.tool.call({ tool: 'Bash', command: 'npm run lint', agentId: 'l1' })

  // Assert
  expect(sink.notifications.length).toBe(1)
  expect(sink.notifications[0] ?? '').toContain('Build failed')
  expect(toasts.filter(t => /failed/.test(t)).length).toBe(2)
})

test('four agents in parallel trigger the combo', async ($, on) => {
  // Arrange
  const toasts = Engine.stub(on)
  on('agent.spawn', (_, e) => ({ model: 'claude-sonnet-5-5', agentId: `id-${e.subagentType}` }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  // Act
  for (const type of ['dotnet-expert', 'angular-expert', 'test-expert', 'mssql-expert']) await $.agent.spawn(Engine.spawn(type, 'Work'))

  // Assert
  expect(toasts.filter(t => t === 'Combo ×4: 4 experts in parallel').length).toBe(1)
})

test('verifCompleted: a file modified during a build stays counted', async ($, on) => {
  // Arrange
  Engine.stub(on, false)
  on('tool.call', (_, e) => (e.tool === 'Bash' ? { result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'bg-b' } } : { result: {} }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Edit', file_path: '/repo/web/src/app/before.component.ts', old_string: 'a', new_string: 'b', agentId: 'a1' })
  await $.tool.call({ tool: 'Bash', command: 'dotnet build Contoso.Policies.slnx -c Debug', run_in_background: true, agentId: 'l1' })
  await $.tool.call({ tool: 'Edit', file_path: '/repo/src/Contoso.Policies.Domain/Claims/Claim.cs', old_string: 'a', new_string: 'b', agentId: 'a1' })

  // Act
  await $.prompt.submit({ wait: false, origin: { kind: 'task-notification' }, text: Git.notification('bg-b', 'completed', 'Background command "dotnet build" completed (exit code 0)') })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })
  await ui.press({ key: 'tab-livraison' })

  // Assert
  expect((await ui.find({ type: 'Text', text: /^≈ Build/ }))?.text).toContain('stale')
  expect((await ui.find({ type: 'Text', text: /Rerun build/ }))?.text).toContain('1 file modified')
  await ui.unmount()
})

test('treeChanged: a git pull that changes the working tree makes the verification stale', async ($, on) => {
  // Arrange
  const state = { isPulled: false }
  Engine.stub(on, false, 'features/1234-claims', argv => (argv.includes('status --porcelain') ? (state.isPulled ? ' M src/A.cs' : '') : undefined))
  on('tool.call', (_, e) => {
    if (e.tool === 'Bash' && e.command.startsWith('git pull')) state.isPulled = true
    return { result: {} }
  })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'dotnet build Contoso.Policies.slnx -c Debug', agentId: 'l1' })

  // Act
  await $.tool.call({ tool: 'Bash', command: 'git pull --rebase=false' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })
  await ui.press({ key: 'tab-livraison' })

  // Assert
  expect((await ui.find({ type: 'Text', text: /^≈ Build/ }))?.text).toContain('stale')
  await ui.unmount()
})

test('resolveBackground: a text with two notifications resolves both tasks', async ($, on) => {
  // Arrange
  Engine.stub(on, false)
  on('tool.call', (_, e) => ({ result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: e.tool === 'Bash' && e.command.includes('lint') ? 'bg-l' : 'bg-u' } }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'npm run lint', run_in_background: true, agentId: 'l1' })
  await $.tool.call({ tool: 'Bash', command: 'dotnet test tests/Contoso.Policies.Tests --filter "FullyQualifiedName~.Unit."', run_in_background: true, agentId: 'l1' })
  const text = `${Git.notification('bg-l', 'completed', 'lint done')}\n${Git.notification('bg-u', 'completed', 'tests done')}`

  // Act
  await $.prompt.submit({ wait: false, origin: { kind: 'task-notification' }, text })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })
  await ui.press({ key: 'tab-livraison' })

  // Assert
  expect((await ui.find({ type: 'Text', text: /^✓ Lint/ }))?.text).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /^✓ Unit/ }))?.text).toBeTruthy()
  await ui.unmount()
})

test('resolveBackground: the output file tail with Build FAILED turns the task red', async ($, on) => {
  // Arrange
  const sink: Sink = { notifications: [], copies: [], files: { '/tmp/tasks/bg-o.output': `${'line\n'.repeat(500)}Build FAILED.\n    0 Warning(s)\n    1 Error(s)` } }
  Engine.stub(on, false, 'features/1234-claims', () => undefined, sink)
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'bg-o' } }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'dotnet build Contoso.Policies.slnx -c Debug', run_in_background: true, agentId: 'l1' })
  const text = Git.notification('bg-o', 'completed', 'Background command completed').replace('</summary>', '</summary>\n<output-file>/tmp/tasks/bg-o.output</output-file>')

  // Act
  await $.prompt.submit({ wait: false, origin: { kind: 'task-notification' }, text })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })
  await ui.press({ key: 'tab-livraison' })

  // Assert
  expect((await ui.find({ type: 'Text', text: /^✗ Build/ }))?.text).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /^  Build FAILED\./ }))?.text).toBeTruthy()
  await ui.unmount()
})

test('checkCombo: the combo rearms when the agents drop below four', async ($, on) => {
  // Arrange
  const toasts = Engine.stub(on)
  on('agent.spawn', (_, e) => ({ model: 'claude-sonnet-5-5', agentId: `${e.description}-${e.subagentType}` }))
  const clock = mock.clock(on, { now: 1_000_000 })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const types = ['dotnet-expert', 'angular-expert', 'test-expert', 'mssql-expert']
  for (const type of types) await $.agent.spawn(Engine.spawn(type, 'v1'))
  for (const type of types) {
    await $.turn.complete({ answer: 'fini', text: '', durationMs: 10, isAborted: false, turnId: `t-${type}`, reason: 'answer', agentId: `v1-${type}` } as never)
  }
  for (let minute = 0; minute < 11; minute++) await clock.advance(60_000)

  // Act
  for (const type of types) await $.agent.spawn(Engine.spawn(type, 'v2'))

  // Assert
  expect(toasts.filter(t => t === 'Combo ×4: 4 experts in parallel').length).toBe(2)
})

test('checkCombo: a second wave less than ten minutes later does not celebrate', async ($, on) => {
  // Arrange
  const toasts = Engine.stub(on)
  on('agent.spawn', (_, e) => ({ model: 'claude-sonnet-5-5', agentId: `${e.description}-${e.subagentType}` }))
  const clock = mock.clock(on, { now: 1_000_000 })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const types = ['dotnet-expert', 'angular-expert', 'test-expert', 'mssql-expert']
  for (const type of types) await $.agent.spawn(Engine.spawn(type, 'v1'))
  for (const type of types) {
    await $.turn.complete({ answer: 'fini', text: '', durationMs: 10, isAborted: false, turnId: `t-${type}`, reason: 'answer', agentId: `v1-${type}` } as never)
  }
  await clock.advance(60_000)

  // Act
  for (const type of types) await $.agent.spawn(Engine.spawn(type, 'v2'))

  // Assert
  expect(toasts.filter(t => t === 'Combo ×4: 4 experts in parallel').length).toBe(1)
})

test('delivery: a review older than the last change is stale and must be redone', async ($, on) => {
  // Arrange
  Engine.stub(on)
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'r1' }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.agent.spawn(Engine.spawn('code-reviewer', 'Review'))
  await $.turn.complete({ answer: ['## Verdict', 'PASS'].join('\n'), text: '', durationMs: 1200, isAborted: false, turnId: 't1', reason: 'answer', agentId: 'r1' } as never)

  // Act
  await $.tool.call({ tool: 'Edit', file_path: '/repo/src/Contoso.Policies.Domain/Claims/Claim.cs', old_string: 'a', new_string: 'b', agentId: 'a1' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })
  await ui.press({ key: 'tab-livraison' })

  // Assert
  expect((await ui.find({ type: 'Text', text: /^✓ code/ }))?.text).toContain('PASS  0C 0M 0m · stale')
  expect((await ui.find({ type: 'Text', text: /Redo review code/ }))?.text).toBeTruthy()
  await ui.unmount()
})

test('the fps 20 command is stored and shown in the header', async ($, on) => {
  // Arrange
  const sink: Sink = { notifications: [], copies: [], stored: {} }
  Engine.stub(on, true, 'features/1234-claims', () => undefined, sink)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  // Act
  const answer = await $.command.run({ command: 'podium-stage', args: 'fps 20' } as never)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })

  // Assert
  expect(JSON.stringify(answer)).toContain('20 fps')
  expect(sink.stored?.['fps']).toBe(20)
  expect(await ui.find({ type: 'Text', text: /QUAD/ })).toBeUndefined()
  await ui.unmount()
})

test('the fps command rejects an out-of-range value', async ($, on) => {
  // Arrange
  const sink: Sink = { notifications: [], copies: [], stored: {} }
  Engine.stub(on, true, 'features/1234-claims', () => undefined, sink)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  // Act
  const answer = await $.command.run({ command: 'podium-stage', args: 'fps 90' } as never)

  // Assert
  expect(JSON.stringify(answer)).toContain('between 10 and 60')
  expect(sink.stored?.['fps']).toBeUndefined()
})

test('the header fits on one line at 64 columns with the work item, the phase and the active count', async ($, on) => {
  // Arrange
  Engine.stub(on)
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'a1' }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.agent.spawn(Engine.spawn('dotnet-expert', 'Claims domain'))

  // Act
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 64 }, surface: 'terminal', viewport: VIEWPORT })

  // Assert
  const left = (await ui.find({ type: 'Text', text: /^◆ PODIUM/ }))?.text ?? ''
  const right = (await ui.find({ type: 'Text', text: /^● / }))?.text ?? ''
  expect(left).toMatch(/^◆ PODIUM  (#1234 · )?Experts 0\/1$/)
  expect(right).toBe('● 1')
  expect(Array.from(left).length + 1 + Array.from(right).length).toBeLessThanOrEqual(64)
  expect(await ui.find({ type: 'Text', text: /started|tok/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Halloween|dawn|morning|midday|sunset|evening|night|✦|QUAD/ })).toBeUndefined()
  await ui.unmount()
})

test('the idle header shows idle', async ($, on) => {
  // Arrange
  Engine.stub(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  // Act
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 64 }, surface: 'terminal', viewport: VIEWPORT })

  // Assert
  expect((await ui.find({ type: 'Text', text: /idle/ }))?.text).toBe('○ idle')
  await ui.unmount()
})

test('the tabs keep full labels at 64 columns and short ones at 40', async ($, on) => {
  // Arrange
  Engine.stub(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  // Act
  const narrow = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 40 }, surface: 'terminal', viewport: VIEWPORT })
  const shortLabels = [(await narrow.find({ key: 'tab-livraison' }))?.text, (await narrow.find({ key: 'tab-historique' }))?.text, (await narrow.find({ key: 'tab-contexte' }))?.text]
  await narrow.unmount()
  const wide = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 64 }, surface: 'terminal', viewport: VIEWPORT })
  const fullLabels = [(await wide.find({ key: 'tab-livraison' }))?.text, (await wide.find({ key: 'tab-historique' }))?.text, (await wide.find({ key: 'tab-contexte' }))?.text]
  await wide.unmount()

  // Assert
  expect(shortLabels.map(t => t?.trim())).toEqual(['Deliv.', 'Hist.', 'Ctx'])
  expect(fullLabels.map(t => t?.trim())).toEqual(['Delivery', 'History', 'Context'])
})

test('the phase bar is absent with only general-purpose agents', async ($, on) => {
  // Arrange
  Engine.stub(on)
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'a1' }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.agent.spawn(Engine.spawn('general-purpose', 'Research'))

  // Act
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })

  // Assert
  expect(await ui.find({ type: 'Text', text: /Plan → / })).toBeUndefined()
  await ui.unmount()
})

test('the phase bar shows Experts 1/2 when one expert out of two has finished', async ($, on) => {
  // Arrange
  Engine.stub(on)
  on('agent.spawn', (_, e) => ({ model: 'claude-sonnet-5-5', agentId: e.subagentType === 'architect' ? 'p1' : e.subagentType === 'dotnet-expert' ? 'p2' : 'p3' }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.agent.spawn(Engine.spawn('architect', 'Plan'))
  await $.agent.spawn(Engine.spawn('dotnet-expert', 'Domain'))
  await $.agent.spawn(Engine.spawn('angular-expert', 'Front'))
  await $.turn.complete({ answer: 'ok', text: '', durationMs: 100, isAborted: false, turnId: 't1', reason: 'answer', agentId: 'p1' } as never)
  await $.turn.complete({ answer: 'ok', text: '', durationMs: 100, isAborted: false, turnId: 't2', reason: 'answer', agentId: 'p2' } as never)

  // Act
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 100 }, surface: 'terminal', viewport: VIEWPORT })

  // Assert
  const bar = (await ui.find({ type: 'Text', text: /Plan → / }))?.text ?? ''
  expect(bar).toBe('✓ Plan → ◉ Experts 1/2 → ○ Verify → ○ Reviews → ○ Deliver')
  await ui.unmount()
})

test('adaptive fps: a running agent gives 60 effective fps in work mode', async ($, on) => {
  // Arrange
  Engine.stub(on)
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'a1' }))
  mock.clock(on, { now: 1_000_000 })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.agent.spawn(Engine.spawn('dotnet-expert', 'Claims domain'))

  // Act
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })

  // Assert
  expect(JSON.stringify(await $.command.run({ command: 'podium-stage', args: 'fps' } as never))).toContain('60 fps')
  await ui.unmount()
})

test('adaptive fps: without running activity the ambient mode gives 20 fps', async ($, on) => {
  // Arrange
  Engine.stub(on)
  mock.clock(on, { now: 1_000_000 })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  // Act
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })

  // Assert
  expect(JSON.stringify(await $.command.run({ command: 'podium-stage', args: 'fps' } as never))).toContain('20 fps')
  await ui.unmount()
})

test('adaptive fps: the fps 30 command caps the work mode at 30', async ($, on) => {
  // Arrange
  const sink: Sink = { notifications: [], copies: [], stored: {} }
  Engine.stub(on, true, 'features/1234-claims', () => undefined, sink)
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'a1' }))
  mock.clock(on, { now: 1_000_000 })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.agent.spawn(Engine.spawn('dotnet-expert', 'Claims domain'))

  // Act
  await $.command.run({ command: 'podium-stage', args: 'fps 30' } as never)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })

  // Assert
  expect(sink.stored?.['fps']).toBe(30)
  expect(JSON.stringify(await $.command.run({ command: 'podium-stage', args: 'fps' } as never))).toContain('30 fps')
  await ui.unmount()
})

test('the hd command keeps QUAD rendering and announces the removal of HD mode', async ($, on) => {
  // Arrange
  Engine.stub(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  // Act
  const answer = await $.command.run({ command: 'podium-stage', args: 'hd' } as never)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })

  // Assert
  expect(JSON.stringify(answer)).toContain('HD mode was removed: pixel rendering is smoother.')
  expect(JSON.stringify(await $.command.run({ command: 'podium-stage', args: 'fps' } as never))).toContain('QUAD')
  await ui.unmount()
})

test('bug: the orchestrator with an unknown model shows no question mark', async ($, on) => {
  // Arrange
  Engine.stub(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ wait: false, origin: { kind: 'composer' }, text: 'go' } as never)

  // Act
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })

  // Assert
  const line = (await ui.find({ key: 'open-main' }))?.text ?? ''
  expect(line).toContain('orchestrator')
  expect(line).not.toContain('?')
  await ui.unmount()
})

test('bug: the footer offers r only in the Context tab', async ($, on) => {
  // Arrange
  Engine.stub(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, isFocused: true }, surface: 'terminal', viewport: VIEWPORT })

  // Act
  const flux = (await ui.find({ type: 'Text', text: /^1-6 tabs/ }))?.text ?? ''
  await ui.press({ key: 'tab-contexte' })
  const contexte = (await ui.find({ type: 'Text', text: /^1-6 tabs/ }))?.text ?? ''

  // Assert
  expect(flux).not.toBe('')
  expect(flux).not.toContain('refreshes')
  expect(contexte).toContain('r refreshes')
  await ui.unmount()
})

test('bug: a warning rule is shown with ! everywhere, never ✗', async ($, on) => {
  // Arrange
  Engine.stub(on)
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'a1' }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.agent.spawn(Engine.spawn('dotnet-expert', 'Back'))

  // Act
  await $.tool.call({ tool: 'Edit', file_path: '/repo/src/Contoso.Policies.Application/Claims/CreateClaimService.cs', old_string: 'a', new_string: 'a\nvar x = 1;', agentId: 'a1' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })
  await ui.press({ key: 'tab-livraison' })

  // Assert
  const row = (await ui.find({ type: 'Text', text: /var in C#/ }))?.text ?? ''
  expect(row).toMatch(/^! var in C#/)
  expect(row).not.toContain('✗')
  expect((await ui.find({ type: 'Text', text: /^\s*!1$/ }))?.text).toContain('!1')
  expect(await ui.find({ type: 'Text', text: /✗1/ })).toBeUndefined()
  await ui.unmount()
})

class Build {
  static readonly COMMAND = 'dotnet build Contoso.Policies.slnx -c Debug /p:TreatWarningsAsErrors=true'
  static readonly ERROR = '/repo/src/Contoso.Policies.Application/Claims/CreateClaimService.cs(42,13): error CS0246: The type or namespace name could not be found\nBuild FAILED.'

  static failing(on: On, state: { isFixed: boolean }): void {
    on('tool.call', (_, e) =>
      e.tool === 'Bash' && e.command.includes('dotnet build') && !state.isFixed
        ? { result: { stdout: Build.ERROR, stderr: '', interrupted: false }, isError: true }
        : { result: { stdout: 'Build succeeded. Passed!', stderr: '', interrupted: false } },
    )
  }
}

test('TO DO shows the failed build with its error excerpt and disappears once fixed', async ($, on) => {
  // Arrange
  const state = { isFixed: false }
  Engine.stub(on, false)
  Build.failing(on, state)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })
  const empty = await ui.find({ type: 'Text', text: /TO DO/ })

  // Act
  await $.tool.call({ tool: 'Bash', command: Build.COMMAND, agentId: 'l1' })
  const failed = (await ui.find({ type: 'Text', text: /^✗ Build failed/ }))?.text
  const detail = (await ui.find({ type: 'Text', text: /error CS0246/ }))?.text
  state.isFixed = true
  await $.tool.call({ tool: 'Bash', command: Build.COMMAND, agentId: 'l1' })

  // Assert
  expect(empty).toBeUndefined()
  expect(failed).toMatch(/^✗ Build failed · l1 \d\d:\d\d$/)
  expect(detail).toBe('  error CS0246 · CreateClaimService.cs:42')
  expect(await ui.find({ type: 'Text', text: /TO DO/ })).toBeUndefined()
  await ui.unmount()
})

test('an idle Flow summarizes the last orchestration', async ($, on) => {
  // Arrange
  Engine.stub(on)
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'a1' }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.agent.spawn(Engine.spawn('dotnet-expert', 'Claims domain'))
  await $.tool.call({ tool: 'Bash', command: 'dotnet build Contoso.Policies.slnx -c Debug', agentId: 'a1' })

  // Act
  await $.turn.complete({ answer: 'ok', text: '', durationMs: 100, isAborted: false, turnId: 't1', reason: 'answer', agentId: 'a1' } as never)
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 64 }, surface: 'terminal', viewport: VIEWPORT })

  // Assert
  expect((await ui.find({ type: 'Text', text: /LAST ORCHESTRATION/ }))?.text).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /1 agent · / }))?.text).toMatch(/^✓ (#1234 · )?1 agent · \d+s · finished at \d\d:\d\d$/)
  expect((await ui.find({ type: 'Text', text: /Verif ✓ build/ }))?.text).toBe('  Verif ✓ build')
  expect((await ui.find({ type: 'Text', text: /Nothing in progress/ }))?.text).toBe('Nothing in progress: run /feat or /fix.')
  expect(await ui.find({ type: 'Text', text: /IN PROGRESS/ })).toBeUndefined()
  await ui.unmount()
})

test('Delivery orders the verdict and keeps a stale failure visible', async ($, on) => {
  // Arrange
  Engine.stub(on, false)
  Build.failing(on, { isFixed: false })
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'r1' }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: Build.COMMAND, agentId: 'l1' })
  await $.tool.call({ tool: 'Bash', command: 'dotnet format Contoso.Policies.slnx --verify-no-changes', agentId: 'l1' })
  await $.tool.call({ tool: 'Bash', command: 'dotnet test tests/Contoso.Policies.Tests --filter "FullyQualifiedName~.Unit."', agentId: 'l1' })
  await $.agent.spawn(Engine.spawn('code-reviewer', 'Review'))
  await $.turn.complete({ answer: '## Verdict\nFAIL\n- **[Critical]** No test that fails before the fix', text: '', durationMs: 10, isAborted: false, turnId: 't1', reason: 'answer', agentId: 'r1' } as never)

  // Act
  await $.tool.call({ tool: 'Edit', file_path: '/repo/src/Contoso.Policies.Domain/Claims/Claim.cs', old_string: 'a', new_string: 'b', agentId: 'a1' })
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 64 }, surface: 'terminal', viewport: VIEWPORT })
  await ui.press({ key: 'tab-livraison' })

  // Assert
  const items = (await ui.findAll({ type: 'Text' })).map(t => t.text ?? '').filter(t => /^ {2}\d\. /.test(t))
  expect(items.slice(0, 4).map(t => t.replace(/\d\d:\d\d/, 'HH:MM'))).toEqual([
    '  1. Fix build: error CS0246 · CreateClaimService.cs:42',
    '  2. Rerun format, unit (1 file modified HH:MM)',
    '  3. Run lint',
    '  4. Review code FAIL: 1 critical to address',
  ])
  expect((await ui.find({ type: 'Text', text: /^≈ Build/ }))?.text).toMatch(/^≈ Build\s+✗ \d\d:\d\d · stale$/)
  expect((await ui.find({ type: 'Text', text: /^ {2}error CS0246/ }))?.text).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /^✗ code/ }))?.text).toContain('· stale')
  expect((await ui.find({ type: 'Text', text: /\[C\] No test/ }))?.text).toBeTruthy()
  await ui.unmount()
})

test('a commit made with a stale verification stays flagged in Delivery', async ($, on) => {
  // Arrange
  Engine.stub(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await Pass.run(command => $.tool.call({ tool: 'Bash', command, agentId: 'l1' }))
  await $.tool.call({ tool: 'Edit', file_path: '/repo/src/Contoso.Policies.Domain/Claims/Claim.cs', old_string: 'a', new_string: 'b' })

  // Act
  await $.tool.call({ tool: 'Bash', command: 'git commit -m "#1234: Claim +semver:patch"' })
  await $.tool.call({ tool: 'Read', file_path: '/repo/src/Contoso.Policies.Domain/Claims/Claim.cs' })
  const first = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })
  await first.press({ key: 'tab-livraison' })
  await first.unmount()
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })

  // Assert
  expect((await ui.find({ type: 'Text', text: /made with a stale verification/ }))?.text).toMatch(/^ {2}\d\. Commit \d\d:\d\d made with a stale verification$/)
  await Pass.run(command => $.tool.call({ tool: 'Bash', command, agentId: 'l1' }))
  await $.tool.call({ tool: 'Bash', command: 'git commit -m "#1234: Claim bis +semver:patch"' })
  expect(await ui.find({ type: 'Text', text: /made with a stale verification/ })).toBeUndefined()
  await ui.unmount()
})

test('the non-required verification steps fit on a single line', async ($, on) => {
  // Arrange
  Engine.stub(on, true, 'features/1234-claims', argv => (argv.includes('status --porcelain') ? ' M src/Contoso.Policies.Domain/Claims/Claim.cs' : undefined))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })
  await ui.press({ key: 'tab-contexte' })
  await ui.press({ key: 'ctx-refresh' })

  // Act
  await ui.press({ key: 'tab-livraison' })
  const before = (await ui.find({ type: 'Text', text: /not required/ }))?.text
  await $.tool.call({ tool: 'Bash', command: 'npm test', agentId: 'l1' })

  // Assert
  expect(before).toBe('  Integ., Front, E2E: not required')
  expect((await ui.find({ type: 'Text', text: /not required/ }))?.text).toBe('  Integ., E2E: not required')
  expect((await ui.find({ type: 'Text', text: /^✓ Front/ }))?.text).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /^· (Integ\.|E2E)/ })).toBeUndefined()
  await ui.unmount()
})

test('History filters on the essentials by default and counts the hidden events', async ($, on) => {
  // Arrange
  Engine.stub(on)
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'a1' }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.agent.spawn(Engine.spawn('dotnet-expert', 'Back'))
  await $.tool.call({ tool: 'Read', file_path: '/repo/src/Contoso.Policies.Domain/Claims/Claim.cs', agentId: 'a1' })
  await $.tool.call({ tool: 'Grep', pattern: 'Claim', agentId: 'a1' } as never)
  await $.tool.call({ tool: 'Edit', file_path: '/repo/src/Contoso.Policies.Domain/Claims/Claim.cs', old_string: 'a', new_string: 'b', agentId: 'a1' })
  await $.tool.call({ tool: 'Bash', command: 'dotnet build Contoso.Policies.slnx -c Debug', agentId: 'a1' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })

  // Act
  await ui.press({ key: 'tab-historique' })
  const filter = (await ui.find({ key: 'filter' }))?.text
  const count = (await ui.find({ type: 'Text', text: /events/ }))?.text
  const read = await ui.find({ type: 'Text', text: /Read Claim|Grep Claim/ })
  const launches = (await ui.findAll({ type: 'Text' })).filter(t => /Build started/.test(t.text ?? '')).length
  const results = (await ui.findAll({ type: 'Text' })).filter(t => /^\d\d:\d\d .*Build OK/.test(t.text ?? '')).length
  await ui.press({ key: 'filter' })
  await ui.press({ key: 'filter' })

  // Assert
  expect(filter).toContain('essential')
  expect(count).toBe('6 events · 5 hidden')
  expect(read).toBeUndefined()
  expect(launches).toBe(0)
  expect(results).toBe(1)
  expect((await ui.find({ key: 'filter' }))?.text).toContain('all')
  expect((await ui.find({ type: 'Text', text: /Read Claim/ }))?.text).toBeTruthy()
  await ui.unmount()
})

test('Context shows Nothing to report without anomaly', async ($, on) => {
  // Arrange
  const sink: Sink = { notifications: [], copies: [], fetchAgeMs: 60_000 }
  Engine.stub(on, true, 'features/1234-claims', () => undefined, sink)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })

  // Act
  await ui.press({ key: 'tab-contexte' })
  await ui.press({ key: 'ctx-refresh' })

  // Assert
  expect((await ui.find({ type: 'Text', text: /Nothing to report/ }))?.text).toBe('✓ Nothing to report')
  expect(await ui.find({ type: 'Text', text: /^! / })).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: /fetched/ }))?.text).toContain('1 min')
  expect(await ui.find({ type: 'Text', text: /30 h per wk|V1 0|up to date with/i })).toBeUndefined()
  await ui.unmount()
})

test('the footer only appears when the panel is active and fits in 64 columns', async ($, on) => {
  // Arrange
  Engine.stub(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const idle = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 64 }, surface: 'terminal', viewport: VIEWPORT })
  const hidden = await idle.find({ type: 'Text', text: /^1-6 tabs/ })
  await idle.unmount()
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: 64, isFocused: true }, surface: 'terminal', viewport: VIEWPORT })
  const footers: string[] = []

  // Act
  for (const tab of ['flux', 'livraison', 'historique', 'contexte']) {
    await ui.press({ key: `tab-${tab}` })
    footers.push((await ui.find({ type: 'Text', text: /^1-6 tabs/ }))?.text ?? '')
  }
  await ui.press({ key: 'tab-historique' })
  await ui.press({ key: 'mode' })
  footers.push((await ui.find({ type: 'Text', text: /^1-6 tabs/ }))?.text ?? '')

  // Assert
  expect(hidden).toBeUndefined()
  expect(footers.every(f => f !== '' && Array.from(f).length <= 64)).toBe(true)
  expect(footers[2]).toContain('f filter')
  expect(footers[4]).toContain('p replay')
  expect(footers.filter(f => f.includes('refreshes')).length).toBe(1)
  await ui.unmount()
})

test('the alternative tab names open Delivery and History', async ($, on) => {
  // Arrange
  Engine.stub(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  // Act
  const regles = await $.command.run({ command: 'podium-stage', args: 'rules' } as never)
  const onRegles = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })
  const verdict = (await onRegles.find({ type: 'Text', text: /VERDICT/ }))?.text
  await onRegles.unmount()
  await $.command.run({ command: 'podium-stage', args: 'timeline' } as never)
  const onLanes = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })
  const lanes = (await onLanes.find({ type: 'Raster' }))?.key
  await onLanes.unmount()
  await $.command.run({ command: 'podium-stage', args: 'journal' } as never)
  const onJournal = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })

  // Assert
  expect(JSON.stringify(regles)).toContain('Delivery')
  expect(verdict).toContain('VERDICT')
  expect(lanes).toBe('lanes')
  expect((await onJournal.find({ key: 'filter' }))?.type).toBe('Button')
  await onJournal.unmount()
})

test('the Tools tab lists the project commands with their role and prepares the command on click', async ($, on) => {
  // Arrange
  Engine.stub(on)
  const filled: string[] = []
  on('command.list', () => ({
    value: [
      { name: 'feat', description: 'New feature', source: 'user' },
      { name: 'notes-perso', description: 'My notes', source: 'user' },
      { name: 'podium-stage', description: 'Panel', source: 'plugin', plugin: 'podium' },
      { name: 'help', description: 'Help', source: 'builtin' },
    ],
  }))
  on('prompt.fill', (_, e) => {
    filled.push(e.text)
    return { isFilled: true }
  })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })

  // Act
  await ui.press({ key: 'tab-commandes' })
  const feat = await ui.find({ type: 'Text', text: /^\/feat$/ })
  const role = await ui.find({ type: 'Text', text: /\[New feature\]/ })
  const builtin = await ui.find({ type: 'Text', text: /Claude Code: 1 built-in commands/ })
  await ui.press({ key: 'cmd-project-feat' })

  // Assert
  expect(feat).toBeDefined()
  expect(role).toBeDefined()
  expect(builtin).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^\/notes-perso$/ })).toBeDefined()
  expect(filled).toEqual(['/feat '])
  await ui.unmount()
})

test('a project without .claude suggests /podium as the next step', async ($, on) => {
  // Arrange
  Engine.stub(on, true, 'main', () => undefined, { notifications: [], copies: [], isBare: true })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })

  // Act
  await ui.press({ key: 'tab-commandes' })

  // Assert
  expect((await ui.find({ type: 'Text', text: /Project without \.claude\/: run \/podium/ }))?.text).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /no \.claude\/ setup/ }))?.text).toBeTruthy()
  await ui.unmount()
})

test('/podium launches the plugin skill with its arguments', async ($, on) => {
  // Arrange
  Engine.stub(on)
  const clock = mock.clock(on, { now: 1_000_000 })
  const launched: string[] = []
  on('command.run', { command: 'podium:setup' }, (_, e) => {
    launched.push(e.args)
    return { text: '' }
  })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  // Act
  const answer = await $.command.run({ command: 'podium', args: 'audit' } as never)
  await clock.advance(100)

  // Assert
  expect(launched).toEqual(['audit'])
  expect(JSON.stringify(answer)).toContain('/podium:setup audit')
})

class GitFixture {
  static readonly SUBS = ['rev-parse', 'status', 'rev-list', 'symbolic-ref', 'for-each-ref', 'branch', 'grep']

  static manifest(git: Record<string, string>): string {
    return JSON.stringify({ ...Fixtures.SAMPLE_PROJECT, git: { ...Fixtures.SAMPLE_PROJECT.git, ...git } })
  }

  static files(git: Record<string, string>): Record<string, string> {
    return { '.claude/podium.json': GitFixture.manifest(git) }
  }

  static recorder(calls: string[]): (argv: string) => string | undefined {
    return argv => {
      calls.push(argv)
      return undefined
    }
  }
}

test('every process the panel runs is a read-only git command or uname', async ($, on) => {
  // Arrange
  const calls: string[] = []
  Engine.stub(on, true, 'features/1234-claims', GitFixture.recorder(calls))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })

  // Act
  await ui.press({ key: 'tab-commandes' })

  // Assert
  const subs = calls.filter(c => c !== 'uname -m').map(c => c.split(' ')[2] ?? '')
  expect(calls.length).toBeGreaterThan(0)
  expect(calls.filter(c => c !== 'uname -m').every(c => c.startsWith('git --no-optional-locks '))).toBe(true)
  expect(subs.every(sub => GitFixture.SUBS.includes(sub))).toBe(true)
  await ui.unmount()
})

test('the panel reads the legacy maestro manifest when podium.json is missing', async ($, on) => {
  // Arrange
  const calls: string[] = []
  const sink: Sink = { notifications: [], copies: [], isBare: true, files: { '.claude/maestro.json': GitFixture.manifest({ base: 'legacy-base' }) } }
  Engine.stub(on, true, 'features/1234-claims', GitFixture.recorder(calls), sink)

  // Act
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  // Assert
  expect(calls.some(c => c.includes('origin/legacy-base...HEAD'))).toBe(true)
})

test('podium.json wins over the legacy maestro manifest when both exist', async ($, on) => {
  // Arrange
  const calls: string[] = []
  const files = { '.claude/maestro.json': GitFixture.manifest({ base: 'legacy-base' }), '.claude/podium.json': GitFixture.manifest({ base: 'podium-base' }) }
  Engine.stub(on, true, 'features/1234-claims', GitFixture.recorder(calls), { notifications: [], copies: [], files })

  // Act
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  // Assert
  expect(calls.some(c => c.includes('origin/podium-base...HEAD'))).toBe(true)
  expect(calls.some(c => c.includes('legacy-base'))).toBe(false)
})

test('a base branch starting with a dash is never passed to git', async ($, on) => {
  // Arrange
  const calls: string[] = []
  const sink: Sink = { notifications: [], copies: [], files: GitFixture.files({ base: '--upload-pack=evil' }) }
  Engine.stub(on, true, 'features/1234-claims', GitFixture.recorder(calls), sink)

  // Act
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  // Assert
  expect(calls.some(c => c.includes('status'))).toBe(true)
  expect(calls.some(c => c.includes('upload-pack'))).toBe(false)
})

test('a base branch containing a space is never passed to git', async ($, on) => {
  // Arrange
  const calls: string[] = []
  const sink: Sink = { notifications: [], copies: [], files: GitFixture.files({ base: 'main; rm' }) }
  Engine.stub(on, true, 'features/1234-claims', GitFixture.recorder(calls), sink)

  // Act
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  // Assert
  expect(calls.some(c => c.includes('status'))).toBe(true)
  expect(calls.some(c => c.includes('rm'))).toBe(false)
})

test('a work item starting with a dash is never passed to git', async ($, on) => {
  // Arrange
  const calls: string[] = []
  const sink: Sink = { notifications: [], copies: [], files: GitFixture.files({ workItem: '^(.+)$' }) }
  Engine.stub(on, true, '--exec-path', GitFixture.recorder(calls), sink)

  // Act
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  // Assert
  expect(calls.some(c => c.includes('exec-path'))).toBe(false)
})

test('a work item containing a space is never passed to git', async ($, on) => {
  // Arrange
  const calls: string[] = []
  const sink: Sink = { notifications: [], copies: [], files: GitFixture.files({ workItem: '^(.+)$' }) }
  Engine.stub(on, true, 'wip stuff', GitFixture.recorder(calls), sink)

  // Act
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  // Assert
  expect(calls.some(c => c.includes('stuff'))).toBe(false)
})

test('a safe work item is searched among the branches', async ($, on) => {
  // Arrange
  const calls: string[] = []
  const sink: Sink = { notifications: [], copies: [], files: GitFixture.files({ workItem: '^(.+)$' }) }
  Engine.stub(on, true, 'wip', GitFixture.recorder(calls), sink)

  // Act
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })
  await ui.unmount()

  // Assert
  expect(calls.some(c => c.startsWith('git --no-optional-locks branch') && c.includes('*wip*'))).toBe(true)
})

test('/podium fills the prompt without submitting it when the skill launch fails', async ($, on) => {
  // Arrange
  const sink: Sink = { notifications: [], copies: [], submitted: [] }
  Engine.stub(on, true, 'features/1234-claims', () => undefined, sink)
  const clock = mock.clock(on, { now: 1_000_000 })
  const filled: string[] = []
  on('command.run', { command: 'podium:setup' }, () => {
    throw new Error('no such command')
  })
  on('prompt.fill', (_, e) => {
    filled.push(e.text)
    return { isFilled: true }
  })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  // Act
  await $.command.run({ command: 'podium', args: 'audit' } as never)
  await clock.advance(100)

  // Assert
  expect(filled).toEqual(['/podium:setup audit'])
  expect(sink.submitted).toEqual([])
})

test('an idle Flow lists all the project commands, clickable', async ($, on) => {
  // Arrange
  Engine.stub(on)
  const filled: string[] = []
  on('command.list', () => ({
    value: ['feat', 'fix', 'investigate', 'faq', 'review-pr', 'deliver'].map(name => ({ name, description: name === 'investigate' ? 'Explains the root cause of a bug. Read-only.' : '', source: 'user' })),
  }))
  on('prompt.fill', (_, e) => {
    filled.push(e.text)
    return { isFilled: true }
  })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })

  // Act
  const investigate = await ui.find({ type: 'Text', text: /^\/investigate\s+$/ })
  const about = await ui.find({ type: 'Text', text: /Explains the root cause of a bug$/ })
  const role = await ui.find({ type: 'Text', text: /New feature/ })
  await ui.press({ key: 'strip-cmd-faq' })

  // Assert
  expect(investigate).toBeDefined()
  expect(about).toBeDefined()
  expect(role).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Project commands/ })).toBeDefined()
  expect(filled).toEqual(['/faq '])
  await ui.unmount()
})

test('the panel does not open by itself in a project without a podium manifest', async ($, on) => {
  // Arrange
  const sink: Sink = { notifications: [], copies: [], isBare: true }
  Engine.stub(on, true, 'main', () => undefined, sink)

  // Act
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.prompt.submit({ wait: false, origin: { kind: 'composer' }, text: 'hello' })
  const before = sink.opens ?? 0
  const answer = await $.command.run({ command: 'podium-stage', args: '' } as never)

  // Assert
  expect(before).toBe(0)
  expect(sink.opens).toBe(1)
  expect(answer.text).toContain('Podium opened')
})

test('the panel opens by itself in a project set up with a podium manifest', async ($, on) => {
  // Arrange
  const sink: Sink = { notifications: [], copies: [] }
  Engine.stub(on, true, 'main', () => undefined, sink)

  // Act
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  // Assert
  expect(sink.opens ?? 0).toBeGreaterThan(0)
})

class ReviewFixture {
  static readonly ANSWER = ['## Verdict', 'CHANGES REQUIRED', '', '- **[Major]** x', '- [Minor] y'].join('\n')
}

test('TO DO names the major findings of a failed review that has no critical one', async ($, on) => {
  // Arrange
  Engine.stub(on)
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'r1' }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.agent.spawn(Engine.spawn('code-reviewer', 'Review'))
  await $.turn.complete({ answer: ReviewFixture.ANSWER, text: '', durationMs: 10, isAborted: false, turnId: 't1', reason: 'answer', agentId: 'r1' } as never)

  // Act
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })

  // Assert
  const line = (await ui.find({ type: 'Text', text: /Review code/ }))?.text ?? ''
  expect(line).toContain('1 major')
  expect(line).not.toContain('0 critical')
  await ui.unmount()
})

test('a verification command denied by a hook leaves the step unchanged', async ($, on) => {
  // Arrange
  Engine.stub(on, false)
  on('tool.call', () => ({ deny: 'hook blocked this command' }) as never)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  // Act
  await $.tool.call({ tool: 'Bash', command: 'dotnet build Contoso.Policies.slnx -c Debug', agentId: 'l1' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })
  await ui.press({ key: 'tab-livraison' })

  // Assert
  expect((await ui.find({ type: 'Text', text: /^. Build\s/ }))?.text).not.toMatch(/✗/)
  expect(await ui.find({ type: 'Text', text: /Fix build/ })).toBeUndefined()
  await ui.unmount()
})

test('a verification command blocked by a project hook leaves the step unchanged', async ($, on) => {
  // Arrange
  Engine.stub(on, false)
  on('tool.call', () => ({ result: {}, isError: true, text: 'PreToolUse hook blocked: no builds on main' }) as never)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  // Act
  await $.tool.call({ tool: 'Bash', command: 'dotnet build Contoso.Policies.slnx -c Debug', agentId: 'l1' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })
  await ui.press({ key: 'tab-livraison' })

  // Assert
  expect((await ui.find({ type: 'Text', text: /^. Build\s/ }))?.text).not.toMatch(/✗/)
  expect(await ui.find({ type: 'Text', text: /Fix build/ })).toBeUndefined()
  await ui.unmount()
})

test('after a reload a verification step left running shows stale', async ($, on) => {
  // Arrange
  Engine.stub(on, false)
  on('tool.call', () => {
    throw new Error('process killed mid-command')
  })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'dotnet build Contoso.Policies.slnx -c Debug', agentId: 'l1' }).catch(() => undefined)
  const before = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })
  await before.press({ key: 'tab-livraison' })
  const running = (await before.find({ type: 'Text', text: /^. Build/ }))?.text
  await before.unmount()

  // Act
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })
  await ui.press({ key: 'tab-livraison' })

  // Assert
  expect(running).toContain('running since')
  expect((await ui.find({ type: 'Text', text: /^. Build/ }))?.text).toMatch(/^. Build\s+no result/)
  await ui.unmount()
})

test('the reset command empties the verification, the alerts and the events', async ($, on) => {
  // Arrange
  const state = { isFixed: false }
  Engine.stub(on, false)
  Build.failing(on, state)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: Build.COMMAND, agentId: 'l1' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })
  const before = await ui.find({ type: 'Text', text: /^✗ Build failed/ })

  // Act
  await $.command.run({ command: 'podium-stage', args: 'reset' } as never)

  // Assert
  expect(before).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^✗ Build failed/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /TO DO/ })).toBeUndefined()
  await ui.press({ key: 'tab-livraison' })
  expect((await ui.find({ type: 'Text', text: /^. Build\s/ }))?.text).not.toMatch(/✗/)
  await ui.press({ key: 'tab-historique' })
  expect(await ui.find({ type: 'Text', text: /Build failed|build failed/ })).toBeUndefined()
  await ui.unmount()
})

test('a failing verification whose output quotes hook words still turns the step red', async ($, on) => {
  // Arrange
  Engine.stub(on, false)
  on('tool.call', () => ({ result: {}, isError: true, text: 'Exit code 1\n(fail) a verification command denied by a hook' }) as never)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  // Act
  await $.tool.call({ tool: 'Bash', command: 'dotnet build Contoso.Policies.slnx -c Debug', agentId: 'l1' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })
  await ui.press({ key: 'tab-livraison' })

  // Assert
  expect((await ui.find({ type: 'Text', text: /^. Build\s/ }))?.text).toMatch(/✗/)
  await ui.unmount()
})

class SignatureEngine {
  static readonly ROOT = '/Users/j/.claude/podium'

  static async run(command: (input: never) => Promise<unknown>, args: string, kind = 'composer'): Promise<string> {
    return JSON.stringify(await command({ command: 'podium-stage', args, origin: { kind } } as never))
  }

  static async ready($: { command: { run: (input: never) => Promise<unknown> } }, record?: { tools: unknown[], registered: (() => void)[] }): Promise<void> {
    await SignatureEngine.run((input) => $.command.run(input), 'signature resume')
    if (record !== undefined && record.tools.length === 0) await new Promise<void>((resolve) => void record.registered.push(resolve))
  }

  static sink(consent: string): Sink {
    const files: Record<string, string> = {}
    if (consent !== '') files[`${SignatureEngine.ROOT}/settings.json`] = JSON.stringify({ version: 1, consent })
    return { notifications: [], copies: [], files, env: { HOME: '/Users/j' }, isRooted: true }
  }

  static stub(on: On, sink: Sink, withTools = true): { writes: string[], attempts: string[], isFailing: boolean, created: number, ended: number, session: string, order: string[], tools: unknown[], watchers: { part: string, resolve: () => void }[], registered: (() => void)[], registerCalls: number, failRegister: number, clock: { isAuto: boolean, pending: (() => void)[], fire: () => void }, written: (part: string) => Promise<void> } {
    const watchers: { part: string, resolve: () => void }[] = []
    const record = {
      writes: [] as string[],
      attempts: [] as string[],
      isFailing: false,
      created: 0,
      ended: 0,
      session: 'old',
      order: [] as string[],
      tools: [] as unknown[],
      watchers,
      registered: [] as (() => void)[],
      registerCalls: 0,
      failRegister: 0,
      clock: { isAuto: false, pending: [] as (() => void)[], fire: () => { for (const resolve of record.clock.pending.splice(0)) resolve() } },
      written: (part: string): Promise<void> => (record.writes.some((path) => path.includes(part)) ? Promise.resolve() : new Promise<void>((resolve) => void watchers.push({ part, resolve })))
    }
    Engine.stub(on, withTools, undefined, undefined, sink)
    on('clock.every', () => {
      record.created += 1
      return { value: { id: `timer-${record.created}` } } as never
    })
    on('clock.after', async () => {
      if (!record.clock.isAuto) await new Promise<void>((resolve) => void record.clock.pending.push(resolve))
      return { value: { id: 'after' } } as never
    })
    on('session.id', () => ({ value: record.session }) as never)
    on('session.end', () => {
      record.ended += 1
      return { sessionId: record.session } as never
    })
    on('fs.write', (_, e) => {
      record.attempts.push(String(e.path))
      if (record.isFailing) throw new Error('disk full')
      record.writes.push(String(e.path))
      for (const watcher of record.watchers.filter((item) => String(e.path).includes(item.part))) watcher.resolve()
      if (sink.files) sink.files[String(e.path)] = String((e as Record<string, unknown>).text ?? (e as Record<string, unknown>).content ?? '')
      return { value: undefined }
    })
    on('fs.exists', () => ({ value: false }))
    on('prompt.compose', () => ({ sections: [{ id: 'engine', scope: 'session', text: 'engine text' }] }) as never)
    on('agent.offer', () => ({ isOffered: true }) as never)
    on('ui.notice', (_, e) => {
      record.order.push(`notice ${String((e as Record<string, unknown>).text)}`)
      return { value: undefined } as never
    })
    on('tool.register', (_, e) => {
      record.registerCalls += 1
      if (record.failRegister > 0) {
        record.failRegister -= 1
        throw new Error('registration failed')
      }
      record.tools.push(e)
      for (const resolve of record.registered.splice(0)) resolve()
      return { value: undefined } as never
    })
    return record
  }

  static applied(options: { apply?: Record<string, boolean>, exclude?: string[], traits?: boolean, shard?: boolean } = {}): Sink {
    const sink = SignatureEngine.sink('')
    const files = sink.files ?? {}
    const filler = Array.from({ length: 20 }, (_, index) => SignatureFixtures.caseOf({ id: index + 1, tags: ['caching'], confidence: 0.9 }))
    const cases = [
      ...filler,
      SignatureFixtures.caseOf({ id: 100, tags: ['untrusted-input', 'fail-open'], confidence: 0.9, evidenceCount: 3 }),
      SignatureFixtures.caseOf({ id: 101, tags: ['db-schema'], status: 'confirmed', confidence: 0.9, choice: 'Use Postgres for storage' })
    ]
    files[`${SignatureEngine.ROOT}/settings.json`] = JSON.stringify({ version: 1, consent: 'enabled', apply: { section: true, context: true, hints: true, proxy: true, ...options.apply }, exclude: options.exclude ?? [] })
    files[`${SignatureEngine.ROOT}/index.json`] = TagIndex.serialize(TagIndex.build(cases))
    if (options.shard !== false) files[`${SignatureEngine.ROOT}/cases/000.jsonl`] = cases.map((item) => Cases.toLine(item) + '\n').join('')
    const trait = options.traits === false ? [] : [SignatureFixtures.trait({ status: 'confirmed', confidence: 0.9 })]
    files[`${SignatureEngine.ROOT}/profile.json`] = Profile.serialize(SignatureFixtures.profile(trait))
    sink.received = []
    return sink
  }

  static journal(sink: Sink, session = ''): { kind: string, session: string, data: Record<string, unknown> }[] {
    return Object.entries(sink.files ?? {})
      .filter(([path]) => path.includes('/journal/') && path.endsWith(`${session}.jsonl`))
      .flatMap(([, text]) => text.split('\n').filter((line) => line !== '').map((line) => JSON.parse(line)))
  }

  static async flush($: { session: { end: (input: never) => Promise<unknown> } }): Promise<void> {
    await $.session.end({ reason: 'exit' } as never)
  }
}

test('the sixth tab renders the Signature view', async ($, on) => {
  // Arrange
  Engine.stub(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })

  // Act
  await ui.press({ key: 'tab-signature' })

  // Assert
  expect((await ui.find({ type: 'Text', text: /Teach Claude how you work/ }))?.text).toContain('Teach Claude how you work')
  expect((await ui.find({ key: 'sig-choice-sessions' }))?.type).toBe('Button')
  await ui.unmount()
})

test('the signature alias opens the Signature tab', async ($, on) => {
  // Arrange
  Engine.stub(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  // Act
  await $.command.run({ command: 'podium-stage', args: 'signature' } as never)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })

  // Assert
  expect((await ui.find({ type: 'Text', text: /Teach Claude how you work/ }))?.text).toContain('Teach Claude')
  await ui.unmount()
})

test('the profile alias opens the Signature tab', async ($, on) => {
  // Arrange
  Engine.stub(on)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  // Act
  await $.command.run({ command: 'podium-stage', args: 'profile' } as never)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })

  // Assert
  expect((await ui.find({ type: 'Text', text: /Teach Claude how you work/ }))?.text).toContain('Teach Claude')
  await ui.unmount()
})

test('the signature on command answers with a one-line text', async ($, on) => {
  // Arrange
  const sink = SignatureEngine.sink('')
  SignatureEngine.stub(on, sink)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  // Act
  const text = await SignatureEngine.run((input) => $.command.run(input), 'signature on')

  // Assert
  expect(text).toBe('{"text":"Signature is on: it records your decisions and learns from them in the background with your Claude plan (up to 300,000 tokens a day). Open /podium-stage signature to change it."}')
})

test('the signature on command enables Signature and writes its settings under the root', async ($, on) => {
  // Arrange
  const sink = SignatureEngine.sink('')
  const record = SignatureEngine.stub(on, sink)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  // Act
  await SignatureEngine.run((input) => $.command.run(input), 'signature on')

  // Assert
  expect(record.writes).toContain(`${SignatureEngine.ROOT}/settings.json`)
  expect(record.writes.every((path) => path.startsWith(SignatureEngine.ROOT + '/'))).toBe(true)
})

test('an AskUserQuestion result passes through unchanged with Signature enabled', async ($, on) => {
  // Arrange
  const sink = SignatureEngine.sink('enabled')
  const result = { questions: [{ question: 'Which database?', options: [{ label: 'Postgres' }, { label: 'SQLite' }] }], answers: { 'Which database?': 'Postgres' } }
  SignatureEngine.stub(on, sink, false)
  on('tool.call', () => ({ result }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  // Act
  const ran = await $.tool.call({ tool: 'AskUserQuestion', questions: result.questions } as never)

  // Assert
  expect(ran).toEqual({ result })
})

test('an ExitPlanMode result passes through unchanged with Signature enabled', async ($, on) => {
  // Arrange
  const sink = SignatureEngine.sink('enabled')
  const result = { plan: '1. Add the table\n2. Migrate', planWasEdited: false }
  SignatureEngine.stub(on, sink, false)
  on('tool.call', () => ({ result }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  // Act
  const ran = await $.tool.call({ tool: 'ExitPlanMode', plan: result.plan } as never)

  // Assert
  expect(ran).toEqual({ result })
})

test('a refused ExitPlanMode passes through unchanged with Signature enabled', async ($, on) => {
  // Arrange
  const sink = SignatureEngine.sink('enabled')
  SignatureEngine.stub(on, sink, false)
  on('tool.call', () => ({ deny: 'Use a smaller plan' }) as never)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  // Act
  const ran = await $.tool.call({ tool: 'ExitPlanMode', plan: '1. Rewrite everything' } as never)

  // Assert
  expect(ran).toEqual({ deny: 'Use a smaller plan' })
})

test('session end calls next and does not throw when Signature fails', async ($, on) => {
  // Arrange
  const sink = SignatureEngine.sink('enabled')
  const record = SignatureEngine.stub(on, sink)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await SignatureEngine.ready($)
  await $.prompt.submit({ text: 'please fix the build', origin: { kind: 'composer' } } as never)
  record.isFailing = true

  // Act
  await $.session.end({ reason: 'exit' } as never)

  // Assert
  expect(record.ended).toBe(1)
  expect(record.attempts.some((path) => path.includes('/journal/'))).toBe(true)
})

test('session end calls next when Signature has nothing to write', async ($, on) => {
  // Arrange
  const record = SignatureEngine.stub(on, SignatureEngine.sink(''))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  // Act
  await $.session.end({ reason: 'exit' } as never)

  // Assert
  expect(record.ended).toBe(1)
})

test('a signature command from a model origin is refused', async ($, on) => {
  // Arrange
  SignatureEngine.stub(on, SignatureEngine.sink(''))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  // Act
  const text = await SignatureEngine.run((input) => $.command.run(input), 'signature on', 'model')

  // Assert
  expect(text).toBe('{"text":"Run this command yourself."}')
})

test('the bare signature command still opens the tab from a model origin', async ($, on) => {
  // Arrange
  SignatureEngine.stub(on, SignatureEngine.sink(''))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  // Act
  const text = await SignatureEngine.run((input) => $.command.run(input), 'signature', 'model')
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', viewport: VIEWPORT })

  // Assert
  expect(text).not.toContain('Run this command yourself.')
  expect((await ui.find({ type: 'Text', text: /Teach Claude how you work/ }))?.text).toContain('Teach Claude')
  await ui.unmount()
})

test('a user prompt is recorded in the journal', async ($, on) => {
  // Arrange
  const sink = SignatureEngine.sink('enabled')
  SignatureEngine.stub(on, sink)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await SignatureEngine.ready($)

  // Act
  await $.prompt.submit({ text: 'please fix the build', origin: { kind: 'composer' } } as never)
  await SignatureEngine.flush($)

  // Assert
  expect(SignatureEngine.journal(sink).filter((signal) => signal.kind === 'prompt')).toHaveLength(1)
})

test('a task notification is not recorded', async ($, on) => {
  // Arrange
  const sink = SignatureEngine.sink('enabled')
  SignatureEngine.stub(on, sink)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await SignatureEngine.ready($)

  // Act
  await $.prompt.submit({ text: 'background task finished', origin: { kind: 'task-notification' } } as never)
  await SignatureEngine.flush($)

  // Assert
  expect(SignatureEngine.journal(sink)).toEqual([])
})

test('a prompt dropped by a hook below is not recorded', async ($, on) => {
  // Arrange
  const sink = { ...SignatureEngine.sink('enabled'), isDropping: true }
  SignatureEngine.stub(on, sink)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await SignatureEngine.ready($)

  // Act
  await $.prompt.submit({ text: 'please fix the build', origin: { kind: 'composer' } } as never)
  await SignatureEngine.flush($)

  // Assert
  expect(SignatureEngine.journal(sink)).toEqual([])
})

test('an answered question is recorded', async ($, on) => {
  // Arrange
  const sink = SignatureEngine.sink('enabled')
  const result = { questions: [{ question: 'Which database?', options: [{ label: 'Postgres' }, { label: 'SQLite' }] }], answers: { 'Which database?': 'Postgres' } }
  SignatureEngine.stub(on, sink, false)
  on('tool.call', () => ({ result }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await SignatureEngine.ready($)

  // Act
  await $.tool.call({ tool: 'AskUserQuestion', questions: result.questions } as never)
  await SignatureEngine.flush($)

  // Assert
  expect(SignatureEngine.journal(sink).filter((signal) => signal.kind === 'question')).toHaveLength(1)
})

test('a refused plan takes its feedback from the error text', async ($, on) => {
  // Arrange
  const sink = SignatureEngine.sink('enabled')
  SignatureEngine.stub(on, sink, false)
  on('tool.call', () => ({ result: {}, isError: true, text: 'The agent proposed a plan that was rejected by the user. the user said: Use smaller steps' }) as never)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await SignatureEngine.ready($)

  // Act
  await $.tool.call({ tool: 'ExitPlanMode', plan: '1. Rewrite everything' } as never)
  await SignatureEngine.flush($)

  // Assert
  const plans = SignatureEngine.journal(sink).filter((signal) => signal.kind === 'plan')
  expect(plans).toHaveLength(1)
  expect(plans[0]?.data.outcome).toBe('refused')
  expect(plans[0]?.data.feedback).toBe('Use smaller steps')
})

test('a deny-only plan refusal is recorded with an empty feedback', async ($, on) => {
  // Arrange
  const sink = SignatureEngine.sink('enabled')
  SignatureEngine.stub(on, sink, false)
  on('tool.call', () => ({ deny: 'blocked by a rule' }) as never)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await SignatureEngine.ready($)

  // Act
  await $.tool.call({ tool: 'ExitPlanMode', plan: '1. Rewrite everything' } as never)
  await SignatureEngine.flush($)

  // Assert
  const plans = SignatureEngine.journal(sink).filter((signal) => signal.kind === 'plan')
  expect(plans[0]?.data.outcome).toBe('refused')
  expect(plans[0]?.data.feedback).toBe('')
})

test('an aborted main turn marks the next prompt as after an abort', async ($, on) => {
  // Arrange
  const sink = SignatureEngine.sink('enabled')
  SignatureEngine.stub(on, sink)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await SignatureEngine.ready($)
  await $.turn.complete({ answer: '', text: '', durationMs: 10, isAborted: true, turnId: 't1', reason: 'aborted' } as never)

  // Act
  await $.prompt.submit({ text: 'no, do it differently', origin: { kind: 'composer' } } as never)
  await SignatureEngine.flush($)

  // Assert
  const prompts = SignatureEngine.journal(sink).filter((signal) => signal.kind === 'prompt')
  expect(prompts[0]?.data.afterAbort).toBe(true)
})

test('a session end with the clear reason moves recording to the new session id', async ($, on) => {
  // Arrange
  const sink = SignatureEngine.sink('enabled')
  const record = SignatureEngine.stub(on, sink)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await SignatureEngine.ready($)
  await $.prompt.submit({ text: 'first request in the old session', origin: { kind: 'composer' } } as never)
  record.session = 'new'

  // Act
  await $.session.end({ reason: 'clear' } as never)
  await $.prompt.submit({ text: 'second request in the new session', origin: { kind: 'composer' } } as never)
  await SignatureEngine.flush($)

  // Assert
  expect(SignatureEngine.journal(sink, 'old')).toHaveLength(1)
  expect(SignatureEngine.journal(sink, 'new')).toHaveLength(1)
})

test('a plan refusal without the rejection wording records no feedback', async ($, on) => {
  // Arrange
  const sink = SignatureEngine.sink('enabled')
  SignatureEngine.stub(on, sink, false)
  on('tool.call', () => ({ result: {}, isError: true, text: 'Use smaller steps' }) as never)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await SignatureEngine.ready($)

  // Act
  await $.tool.call({ tool: 'ExitPlanMode', plan: '1. Rewrite everything' } as never)
  await SignatureEngine.flush($)

  // Assert
  const plans = SignatureEngine.journal(sink).filter((signal) => signal.kind === 'plan')
  expect(plans[0]?.data.outcome).toBe('refused')
  expect(plans[0]?.data.feedback).toBe('')
})

test('a plan refusal with the wording but no user words records no feedback', async ($, on) => {
  // Arrange
  const sink = SignatureEngine.sink('enabled')
  SignatureEngine.stub(on, sink, false)
  on('tool.call', () => ({ result: {}, isError: true, text: 'The agent proposed a plan that was rejected by the user.' }) as never)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await SignatureEngine.ready($)

  // Act
  await $.tool.call({ tool: 'ExitPlanMode', plan: '1. Rewrite everything' } as never)
  await SignatureEngine.flush($)

  // Assert
  const plans = SignatureEngine.journal(sink).filter((signal) => signal.kind === 'plan')
  expect(plans[0]?.data.feedback).toBe('')
})

test('a plan refusal with the other engine wording records the user words', async ($, on) => {
  // Arrange
  const sink = SignatureEngine.sink('enabled')
  SignatureEngine.stub(on, sink, false)
  on('tool.call', () => ({ result: {}, isError: true, text: "The user doesn't want to proceed with this tool use. the user said: not this one" }) as never)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await SignatureEngine.ready($)

  // Act
  await $.tool.call({ tool: 'ExitPlanMode', plan: '1. Rewrite everything' } as never)
  await SignatureEngine.flush($)

  // Assert
  const plans = SignatureEngine.journal(sink).filter((signal) => signal.kind === 'plan')
  expect(plans[0]?.data.feedback).toBe('not this one')
})

test('the answer of a completed turn is recorded before a correction prompt', async ($, on) => {
  // Arrange
  const sink = SignatureEngine.sink('enabled')
  SignatureEngine.stub(on, sink)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await SignatureEngine.ready($)
  await $.turn.complete({ answer: 'I will rewrite the whole module', text: '', durationMs: 10, isAborted: false, turnId: 't1', reason: 'answer' } as never)

  // Act
  await $.prompt.submit({ text: 'no, keep it small', origin: { kind: 'composer' } } as never)
  await SignatureEngine.flush($)

  // Assert
  const turns = SignatureEngine.journal(sink).filter((signal) => signal.kind === 'turn')
  expect(turns).toHaveLength(1)
  expect(JSON.stringify(turns[0]?.data)).toContain('I will rewrite the whole module')
})

test('a tool call keeps working with Signature enabled', async ($, on) => {
  // Arrange
  const sink = SignatureEngine.sink('enabled')
  SignatureEngine.stub(on, sink)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  // Act
  const ran = await $.tool.call({ tool: 'Bash', command: 'git status', agentId: 'a1' })

  // Assert
  expect(ran).toEqual({ result: {} })
})

test('a top-level learn command from a model origin is refused', async ($, on) => {
  // Arrange
  SignatureEngine.stub(on, SignatureEngine.sink('enabled'))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  // Act
  const text = await SignatureEngine.run((input) => $.command.run(input), 'learn /repo', 'model')

  // Assert
  expect(text).toBe('{"text":"Run this command yourself."}')
})

test('a top-level learn command from the composer reaches Signature', async ($, on) => {
  // Arrange
  SignatureEngine.stub(on, SignatureEngine.sink('enabled'))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  // Act
  const text = await SignatureEngine.run((input) => $.command.run(input), 'learn')

  // Assert
  expect(text).toBe('{"text":"Usage: /podium-stage learn <path to a local repository>"}')
})

test('the learn-now, rebuild and forget subcommands from a model origin are refused', async ($, on) => {
  // Arrange
  SignatureEngine.stub(on, SignatureEngine.sink('enabled'))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })

  // Act
  const answers = [
    await SignatureEngine.run((input) => $.command.run(input), 'signature learn-now', 'model'),
    await SignatureEngine.run((input) => $.command.run(input), 'signature rebuild', 'model'),
    await SignatureEngine.run((input) => $.command.run(input), 'signature forget #3', 'model')
  ]

  // Assert
  expect(answers).toEqual(Array(3).fill('{"text":"Run this command yourself."}'))
})

test('prompt compose adds the Signature section after the engine sections', async ($, on) => {
  // Arrange
  SignatureEngine.stub(on, SignatureEngine.applied())
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await SignatureEngine.ready($)

  // Act
  const composed = (await $.prompt.compose({ promptModel: 'claude-sonnet-5-5', outputStyle: null, tools: [], traits: [], surfaces: [] } as never)) as unknown as { sections: { id: string, scope: string, text: string }[] }

  // Assert
  expect(composed.sections.map((section) => section.id)).toEqual(['engine', 'podium:signature'])
  expect(composed.sections[1]?.scope).toBe('session')
  expect(composed.sections[1]?.text).toContain('Security: ')
})

test('prompt compose adds nothing when the section text is empty', async ($, on) => {
  // Arrange
  SignatureEngine.stub(on, SignatureEngine.applied({ traits: false }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await SignatureEngine.ready($)

  // Act
  const composed = (await $.prompt.compose({ promptModel: 'claude-sonnet-5-5', outputStyle: null, tools: [], traits: [], surfaces: [] } as never)) as unknown as { sections: { id: string }[] }

  // Assert
  expect(composed.sections.map((section) => section.id)).toEqual(['engine'])
})

test('a matching prompt gets exactly one context entry', async ($, on) => {
  // Arrange
  const sink = SignatureEngine.applied()
  SignatureEngine.stub(on, sink)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await SignatureEngine.ready($)

  // Act
  await $.prompt.submit({ text: 'validate the input and fall back to a default', origin: { kind: 'composer' } } as never)

  // Assert
  const context = sink.received?.[sink.received.length - 1]?.context as string[] | undefined
  expect(context).toHaveLength(1)
  expect(context?.[0]).toContain('Developer precedents (Podium Signature')
})

test('a meta prompt passes through without a context entry', async ($, on) => {
  // Arrange
  const sink = SignatureEngine.applied()
  SignatureEngine.stub(on, sink)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await SignatureEngine.ready($)

  // Act
  await $.prompt.submit({ text: 'validate the input and fall back to a default', isMeta: true, origin: { kind: 'composer' } } as never)

  // Assert
  expect(sink.received?.[sink.received.length - 1]?.context).toBeUndefined()
})

test('a task notification passes through without a context entry', async ($, on) => {
  // Arrange
  const sink = SignatureEngine.applied()
  SignatureEngine.stub(on, sink)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await SignatureEngine.ready($)

  // Act
  await $.prompt.submit({ text: 'validate the input and fall back to a default', origin: { kind: 'task-notification' } } as never)

  // Assert
  expect(sink.received?.[sink.received.length - 1]?.context).toBeUndefined()
})

test('a prompt starting with an exclamation mark passes through without a context entry', async ($, on) => {
  // Arrange
  const sink = SignatureEngine.applied()
  SignatureEngine.stub(on, sink)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await SignatureEngine.ready($)

  // Act
  await $.prompt.submit({ text: '!validate the input and fall back to a default', origin: { kind: 'composer' } } as never)

  // Assert
  expect(sink.received?.[sink.received.length - 1]?.context).toBeUndefined()
})

test('a slash command passes through without a context entry', async ($, on) => {
  // Arrange
  const sink = SignatureEngine.applied()
  SignatureEngine.stub(on, sink)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await SignatureEngine.ready($)

  // Act
  await $.prompt.submit({ text: '/feat validate the input and fall back to a default', command: { name: 'feat', args: 'validate the input and fall back to a default' }, origin: { kind: 'composer' } } as never)

  // Assert
  expect(sink.received?.[sink.received.length - 1]?.context).toBeUndefined()
})

test('a prompt passes through unchanged when the precedents cannot be read', async ($, on) => {
  // Arrange
  const sink = SignatureEngine.applied({ shard: false })
  SignatureEngine.stub(on, sink)
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await SignatureEngine.ready($)

  // Act
  await $.prompt.submit({ text: 'validate the input and fall back to a default', origin: { kind: 'composer' } } as never)

  // Assert
  expect(sink.received?.[sink.received.length - 1]?.context).toBeUndefined()
})

test('a question gets a notice before the call and its prediction in the journal', async ($, on) => {
  // Arrange
  const sink = SignatureEngine.applied()
  const questions = [{ question: 'Which database?', header: 'DB', options: [{ label: 'Postgres' }, { label: 'SQLite' }] }]
  const record = SignatureEngine.stub(on, sink, false)
  on('tool.call', () => {
    record.order.push('call')
    return { result: { questions, answers: { 'Which database?': 'Postgres' } } }
  })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await SignatureEngine.ready($, record)

  // Act
  await $.tool.call({ tool: 'AskUserQuestion', tool_use_id: 'tu-1', questions } as never)
  for (let index = 0; index < 19; index += 1) await $.prompt.submit({ text: `request number ${index} for the build`, origin: { kind: 'composer' } } as never)
  await $.turn.complete({ answer: '', text: '', durationMs: 10, isAborted: false, turnId: 't1', reason: 'answer' } as never)
  await record.written('/journal/')

  // Assert
  expect(record.order).toEqual(['notice Signature: you usually choose "Postgres"', 'call'])
  const signal = SignatureEngine.journal(sink).find((item) => item.kind === 'question')
  expect(JSON.stringify(signal?.data.predicted)).toContain('Postgres')
})

test('the recall tool call returns the cases as a result', async ($, on) => {
  // Arrange
  SignatureEngine.stub(on, SignatureEngine.applied())
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await SignatureEngine.ready($)

  // Act
  const ran = (await $.tool.call({ tool: 'mcp__podium__recall', situation: 'validate the input and fall back to a default', tags: ['untrusted-input'] } as never)) as unknown as { result: string }

  // Assert
  expect(ran.result.startsWith('#100 (')).toBe(true)
})

test('the proxy agent is passed through when Signature applies', async ($, on) => {
  // Arrange
  SignatureEngine.stub(on, SignatureEngine.applied())
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await SignatureEngine.ready($)

  // Act
  const offer = await $.agent.offer({ agent: 'podium:developer-proxy', description: 'Stands in for the developer' } as never)

  // Assert
  expect(offer).toEqual({ isOffered: true })
})

test('the proxy agent is hidden when the proxy flag is off', async ($, on) => {
  // Arrange
  SignatureEngine.stub(on, SignatureEngine.applied({ apply: { proxy: false } }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await SignatureEngine.ready($)

  // Act
  const offer = await $.agent.offer({ agent: 'podium:developer-proxy', description: 'Stands in for the developer' } as never)

  // Assert
  expect(offer).toEqual({ isOffered: false })
})

test('the proxy agent is hidden when Signature is not applying', async ($, on) => {
  // Arrange
  SignatureEngine.stub(on, SignatureEngine.sink(''))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await SignatureEngine.ready($)

  // Act
  const offer = await $.agent.offer({ agent: 'podium:developer-proxy', description: 'Stands in for the developer' } as never)

  // Assert
  expect(offer).toEqual({ isOffered: false })
})

test('the proxy agent is hidden in an excluded session', async ($, on) => {
  // Arrange
  SignatureEngine.stub(on, SignatureEngine.applied({ exclude: ['/repo'] }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await SignatureEngine.ready($)

  // Act
  const offer = await $.agent.offer({ agent: 'podium:developer-proxy', description: 'Stands in for the developer' } as never)

  // Assert
  expect(offer).toEqual({ isOffered: false })
})

test('the recall tool is registered once and not deferred', async ($, on) => {
  // Arrange
  const record = SignatureEngine.stub(on, SignatureEngine.applied())
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await SignatureEngine.ready($)

  // Act
  const tools = record.tools as { name: string, isDeferred: boolean }[]

  // Assert
  expect(tools).toHaveLength(1)
  expect(tools[0]?.name).toBe('recall')
  expect(tools[0]?.isDeferred).toBe(false)
})

test('ending the session after a recorded prediction persists the stats into the profile', async ($, on) => {
  // Arrange
  const sink = SignatureEngine.applied()
  const questions = [{ question: 'Which database?', header: 'DB', options: [{ label: 'Postgres' }, { label: 'SQLite' }] }]
  const record = SignatureEngine.stub(on, sink, false)
  on('tool.call', () => ({ result: { questions, answers: { 'Which database?': 'Postgres' } } }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await SignatureEngine.ready($, record)
  await $.tool.call({ tool: 'AskUserQuestion', tool_use_id: 'tu-1', questions } as never)
  record.clock.isAuto = true

  // Act
  await $.session.end({ reason: 'exit' } as never)

  // Assert
  const stats = Profile.parse(sink.files?.[`${SignatureEngine.ROOT}/profile.json`] ?? '').stats
  expect(stats).toEqual({ predictions: 1, hits: 1, missed: 0 })
})

test('the recall tool is registered after enabling when it was not registered at start', async ($, on) => {
  // Arrange
  const record = SignatureEngine.stub(on, SignatureEngine.sink(''))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await SignatureEngine.ready($)

  // Act
  await SignatureEngine.run((input) => $.command.run(input), 'signature on')
  if (record.tools.length === 0) await new Promise<void>((resolve) => void record.registered.push(resolve))

  // Assert
  const tools = record.tools as { name: string, isDeferred: boolean }[]
  expect(tools).toHaveLength(1)
  expect(tools[0]?.isDeferred).toBe(false)
})

test('a failed registration is tried again by the next signature command', async ($, on) => {
  // Arrange
  const sink = SignatureEngine.applied()
  const record = SignatureEngine.stub(on, sink)
  record.failRegister = 1
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await SignatureEngine.ready($)

  // Act
  await SignatureEngine.run((input) => $.command.run(input), 'signature resume')
  if (record.tools.length === 0) await new Promise<void>((resolve) => void record.registered.push(resolve))

  // Assert
  expect(record.registerCalls).toBe(2)
  expect(record.tools).toHaveLength(1)
})

test('the recall tool is not registered again once it has been registered', async ($, on) => {
  // Arrange
  const record = SignatureEngine.stub(on, SignatureEngine.applied())
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await SignatureEngine.ready($, record)

  // Act
  await SignatureEngine.run((input) => $.command.run(input), 'signature resume')
  await SignatureEngine.run((input) => $.command.run(input), 'signature on')

  // Assert
  expect(record.registerCalls).toBe(1)
})
