import { expect, test } from 'claude-code/testing'

test('the panel opens when the terminal attaches after a startup failure', async ($, on) => {
  // Arrange
  let opens = 0
  let placed = false
  on('command.register', () => ({ value: { command: 'maestro-stage' } }))
  on('ui.open', () => {
    opens++
    return { value: placed ? { isPlaced: true } : { isPlaced: false, reason: 'no-surface' } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.attach', (_, e) => ({ clientId: e.clientId }))
  on('agent.list', () => ({ value: [] }))
  on('fs.list', () => ({ value: [] }))
  on('fs.read', () => ({ value: '' }))
  on('fs.stat', () => ({ value: { kind: 'file', size: 0, mtimeMs: 0, isLink: false } }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('env.get', () => ({ value: undefined }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const before = opens
  placed = true

  // Act
  await $.session.attach({ surface: 'terminal', clientId: 'terminal:default' })

  // Assert
  expect(before).toBeGreaterThan(0)
  expect(opens).toBeGreaterThan(before)
})

test('the panel opens on the first prompt when the automatic opening was not placed', async ($, on) => {
  // Arrange
  let opens = 0
  let placed = false
  on('command.register', () => ({ value: { command: 'maestro-stage' } }))
  on('ui.open', () => {
    opens++
    return { value: placed ? { isPlaced: true } : { isPlaced: false, reason: 'narrow' } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('agent.list', () => ({ value: [] }))
  on('fs.list', () => ({ value: [] }))
  on('fs.read', () => ({ value: '' }))
  on('fs.stat', () => ({ value: { kind: 'file', size: 0, mtimeMs: 0, isLink: false } }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('env.get', () => ({ value: undefined }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const before = opens
  placed = true

  // Act
  await $.prompt.submit({ wait: false, origin: { kind: 'composer' }, text: 'Bonjour' })
  await $.prompt.submit({ wait: false, origin: { kind: 'composer' }, text: 'Encore' })

  // Assert
  expect(opens).toBe(before + 1)
})
