import { expect, test } from 'claude-code/testing'
import { Project, type AgentDef, type CommandDef } from '../hooks/project'
import { Fixtures } from './fixtures/sample-project'

class ProjectFixture {
  static agent(name: string, tools: string[] = ['Read', 'Edit'], model = 'sonnet'): AgentDef {
    return { name, model, color: '', description: '', tools }
  }

  static command(name: string, source = 'user', description = ''): CommandDef {
    return { name, description, source }
  }
}

test('reads an agent definition from its markdown front matter', () => {
  // Act
  const agent = Project.agentFromMarkdown('lint-runner.md', '---\nname: lint-runner\ndescription: Runs CI checks\ntools: Read, Grep, Bash\nmodel: haiku\ncolor: yellow\n---\n\nBody')

  // Assert
  expect(agent).toEqual({ name: 'lint-runner', model: 'haiku', color: 'yellow', description: 'Runs CI checks', tools: ['Read', 'Grep', 'Bash'] })
  expect(Project.agentFromMarkdown('x.md', 'no front matter')).toBe(undefined)
})

test('guesses the role of freely named project commands and ignores built-ins', () => {
  // Arrange
  const commands = [
    ProjectFixture.command('new-feature'),
    ProjectFixture.command('feature-flow'),
    ProjectFixture.command('bugfix'),
    ProjectFixture.command('ship'),
    ProjectFixture.command('review', 'builtin'),
    ProjectFixture.command('maestro', 'plugin'),
  ]

  // Act
  const roles = Project.inferRoles(commands)

  // Assert
  expect(roles.feature).toBe('feature-flow')
  expect(roles.fix).toBe('bugfix')
  expect(roles.deliver).toBe('ship')
  expect(roles.setup).toBe('maestro')
  expect(roles.review).toBe(undefined)
})

test('gives the setup role to maestro and maestro:setup only, never to the stage panel', () => {
  // Arrange
  const commands = [
    ProjectFixture.command('maestro-stage', 'plugin'),
    ProjectFixture.command('maestro:setup', 'plugin'),
  ]

  // Act
  const roles = Project.inferRoles(commands)

  // Assert
  expect(roles.setup).toBe('maestro:setup')
  expect(roles.foundations).toBe(undefined)
})

test('lets the manifest name the role of a command whatever its name', () => {
  // Arrange
  const manifest = { ...Project.generic('demo'), roles: { feature: 'new-feature' } }

  // Act
  const snapshot = Project.resolve(manifest, [], [ProjectFixture.command('new-feature'), ProjectFixture.command('feat')], true)

  // Assert
  expect(Project.command(snapshot, 'feature')).toBe('new-feature')
  expect(Project.roleOf(snapshot, 'new-feature')).toBe('feature')
})

test('infers the flow phases from the agents of an unknown project', () => {
  // Arrange
  const agents = [
    ProjectFixture.agent('architect', ['Read', 'Grep']),
    ProjectFixture.agent('backend-dev'),
    ProjectFixture.agent('check-runner', ['Read', 'Bash']),
    ProjectFixture.agent('style-reviewer', ['Read']),
    ProjectFixture.agent('release-bot', ['Bash']),
  ]

  // Act
  const phases = Project.inferPhases(agents)

  // Assert
  expect(phases.map(p => `${p.id}:${p.name}:${p.agents.join(',')}`)).toEqual(['plan:Plan:architect', 'experts:Experts:backend-dev', 'verify:Verify:check-runner', 'review:Reviews:style-reviewer', 'deliver:Delivery:release-bot'])
  expect(Project.inferReviewers(agents).map(r => r.short)).toEqual(['style'])
})

test('groups the commands into project, plugins, MCP and built-ins with roles first', () => {
  // Arrange
  const manifest = { ...Project.generic('demo'), roles: { fix: 'oops', feature: 'build-it' } }
  const commands = [
    ProjectFixture.command('zz-notes'),
    ProjectFixture.command('oops'),
    ProjectFixture.command('build-it'),
    ProjectFixture.command('maestro-stage', 'plugin'),
    ProjectFixture.command('help', 'builtin'),
    ProjectFixture.command('jira:create', 'mcp'),
  ]

  // Act
  const groups = Project.groups(Project.resolve(manifest, [], commands, true))

  // Assert
  expect(groups.map(g => g.id)).toEqual(['project', 'plugins', 'mcp', 'builtin'])
  expect(groups[0]?.commands.map(c => `${c.name}:${c.role ?? ''}`)).toEqual(['build-it:feature', 'oops:fix', 'zz-notes:'])
})

test('keeps personal skills out of the project commands when the project lists its own', () => {
  // Arrange
  const commands = [ProjectFixture.command('feat'), ProjectFixture.command('docx'), ProjectFixture.command('anthropic-skills:pdf')]

  // Act
  const groups = Project.groups(Project.resolve(undefined, [], commands, true, 'demo', ['feat']))

  // Assert
  expect(groups.map(g => `${g.id}:${g.commands.map(c => c.name).join(',')}`)).toEqual(['project:feat', 'personal:anthropic-skills:pdf,docx'])
})

test('recognises the verification steps of common toolchains without a manifest', () => {
  // Arrange
  const snapshot = Project.resolve(undefined, [], [], true)

  // Act
  const steps = ['pnpm build', 'npx prettier --check .', 'cargo clippy', 'pytest -q', 'npx playwright test'].map(c => Project.verifSteps(snapshot, c)[0])

  // Assert
  expect(steps).toEqual(['build', 'format', 'lint', 'unit', 'e2e'])
})

test('uses the manifest verification order so integration tests are not taken for unit tests', () => {
  // Arrange
  const snapshot = Project.resolve(Fixtures.SAMPLE_PROJECT, [], [], true)

  // Act
  const steps = Project.verifSteps(snapshot, 'dotnet build X && dotnet test tests --filter "Category=Integration" && dotnet test tests')

  // Assert
  expect(steps).toEqual(['build', 'integ', 'unit'])
})

test('parses a manifest, keeps unknown hook settings and falls back to defaults for empty lists', () => {
  // Act
  const manifest = Project.parse({ version: 1, name: 'demo', verification: [], hooks: { protectedBranches: ['main'] }, git: { base: 'trunk' } })

  // Assert
  expect(manifest?.verification.length).toBe(Project.DEFAULT_VERIFICATION.length)
  expect(manifest?.hooks).toEqual({ protectedBranches: ['main'] })
  expect(manifest?.git.base).toBe('trunk')
  expect(manifest?.git.featurePrefixes.length).toBeGreaterThan(0)
  expect(Project.parse({ version: 2 })).toBe(undefined)
})

test('reports a project without .claude as not set up and one with agents as full', () => {
  // Act
  const empty = Project.resolve(undefined, [], [], false)
  const tooled = Project.resolve(undefined, [ProjectFixture.agent('architect')], [], true)

  // Assert
  expect(empty.manifest.stage).toBe('none')
  expect(tooled.manifest.stage).toBe('full')
})

test('does not take auto-fix commands for a verification', () => {
  // Arrange
  const snapshot = Project.resolve(undefined, [], [], true)

  // Act
  const steps = ['npm run lint:fix', 'npx eslint --fix src/a.ts', 'npx prettier --write .', 'npm run lint'].map(c => Project.verifSteps(snapshot, c).join(','))

  // Assert
  expect(steps).toEqual(['', '', '', 'lint'])
})

test('recognises the experts phase by its id whatever its display name', () => {
  // Arrange
  const phases = [{ id: 'experts' as const, name: 'Builders', short: 'Build', agents: [] }, { name: 'Plan', short: 'Plan', agents: [] }]

  // Act
  const ids = phases.map(p => Project.phaseOf(p))

  // Assert
  expect(ids).toEqual(['experts', 'plan'])
})

test('ignores an invalid regular expression from a manifest instead of throwing', () => {
  // Assert
  expect(Project.matches('([', 'anything')).toBe(false)
  expect(Project.matches('', 'anything')).toBe(false)
})

class VerifFixture {
  static snapshot() {
    const manifest = Project.parse({
      version: 1,
      name: 'plugin',
      verification: [
        { step: 'lint', label: 'Validate', patterns: ['\\bclaude\\s+plugin\\s+validate\\b'] },
        { step: 'unit', label: 'Tests', patterns: ['\\bclaude\\s+plugin\\s+test\\b'] },
      ],
    })
    return Project.resolve(manifest, [], [], true)
  }
}

test('a commit message that quotes a verification command starts no step', () => {
  // Arrange
  const snapshot = VerifFixture.snapshot()

  // Act
  const steps = Project.verifSteps(snapshot, 'git commit -m "Run claude plugin test in CI"')

  // Assert
  expect(steps).toEqual([])
})

test('a grep pattern that quotes a verification command starts no step', () => {
  // Arrange
  const snapshot = VerifFixture.snapshot()

  // Act
  const steps = Project.verifSteps(snapshot, 'grep "claude plugin validate" README.md')

  // Assert
  expect(steps).toEqual([])
})

test('the default manifest maps npm run test:e2e to the e2e step', () => {
  // Arrange
  const snapshot = Project.resolve(undefined, [], [], true)

  // Act
  const steps = Project.verifSteps(snapshot, 'npm run test:e2e')

  // Assert
  expect(steps).toEqual(['e2e'])
})
