import type { VerifKey } from '../types'

export type RoleId =
  | 'setup'
  | 'kickoff'
  | 'stack'
  | 'foundations'
  | 'feature'
  | 'fix'
  | 'investigate'
  | 'faq'
  | 'review'
  | 'comments'
  | 'deliver'
  | 'merge'
  | 'upgrade'
  | 'environment'

export type Stage = 'none' | 'genesis' | 'full'

export type PhaseId = 'plan' | 'experts' | 'verify' | 'review' | 'deliver'

export type Phase = { id?: PhaseId; name: string; short: string; agents: string[] }

export type Reviewer = { agent: string; label: string; short: string }

export type VerifRule = { step: VerifKey; label: string; patterns: string[]; optional?: boolean }

export type Layer = { name: string; pattern: string; rank?: number }

export type ContentRule = { path: string; skipName?: string; when?: string; require: string; message: string }

export type GuardRule = { id: string; label: string; short: string; remedy: string; why: string; fix: string }

export type GuardText = { label?: string; short?: string; remedy?: string; why?: string; fix?: string; detail?: string }

export type Checks = {
  comments?: boolean
  noVar?: boolean
  noFreeFunction?: boolean
  aiMention?: boolean
  partition?: boolean
  hooks?: boolean
  generated?: GuardText
  legacy?: GuardText & { pattern: string; current: string; modern?: string }
  isolation?: GuardText & { rules: ContentRule[]; enabledBy?: { pattern: string; path: string } }
  integrationImage?: GuardText & { command: string; schema: string; build: string; armFlag?: string; stale?: string }
}

export type Git = { base: string; featurePrefixes: string[]; fixPrefixes: string[]; support: string; workItem: string; counterpart?: string }

export type Manifest = {
  version: 1
  name: string
  stage: Stage
  language: { conversation: string; artifacts: string }
  versioned: boolean
  roles: Partial<Record<RoleId, string>>
  phases: Phase[]
  reviewers: Reviewer[]
  verification: VerifRule[]
  layers: Layer[]
  code: { roots: string; extensions: string; ignore: string }
  generated: string
  checks: Checks
  git: Git
  theme: string
  generatedFiles: Record<string, string>
  hooks: Record<string, unknown>
}

export type AgentDef = { name: string; model: string; color: string; description: string; tools: string[] }

export type CommandDef = { name: string; description: string; source: string; plugin?: string }

export type CommandGroup = { id: string; label: string; commands: (CommandDef & { role?: RoleId })[] }

export type ProjectSnapshot = { manifest: Manifest; agents: AgentDef[]; commands: CommandDef[]; hasClaude: boolean; hasManifest: boolean; local: string[] }

export class Project {
  static readonly FILE = '.claude/podium.json'

  static readonly LEGACY_FILE = '.claude/maestro.json'

  static readonly ROLE_LABELS: Record<RoleId, string> = {
    setup: 'Podium',
    kickoff: 'Kickoff',
    stack: 'Tech choices',
    foundations: 'Foundations',
    feature: 'New feature',
    fix: 'Fix',
    investigate: 'Investigation',
    faq: 'Question',
    review: 'PR review',
    comments: 'Review comments',
    deliver: 'Delivery',
    merge: 'Sync',
    upgrade: 'Dependencies',
    environment: 'Environment',
  }

  static readonly SETUP_COMMAND = /^(podium|maestro)(:setup)?$/

  static readonly ROLE_HINTS: readonly (readonly [RoleId, RegExp])[] = [
    ['kickoff', /^(kickoff|cadrage|brief|discover|idea|vision)/],
    ['stack', /^(stack|tech|choix|architecture-choice|choose)/],
    ['foundations', /^(foundation|fondation|bootstrap|scaffold|setup|init-project)/],
    ['feature', /^(feat|feature|implement|story|develop)/],
    ['fix', /^(fix|bug|hotfix|repair)/],
    ['investigate', /^(investigate|debug|diagnos|root-cause)/],
    ['faq', /^(faq|ask|explain|question)/],
    ['review', /^(review-pr|review|audit-pr)/],
    ['comments', /^(pr-comments|comments|address)/],
    ['deliver', /^(deliver|ship|release|livr)/],
    ['merge', /^(merge|sync|rebase)/],
    ['upgrade', /^(renovate|upgrade|deps|bump)/],
    ['environment', /^(stack-run|stack|env|docker|run)$/],
  ]

  static readonly PHASE_HINTS: readonly (readonly [PhaseId, RegExp])[] = [
    ['plan', /architect|plan|debug|design|kickoff|cadrage|product/i],
    ['verify', /lint|verif|runner|check|ci-/i],
    ['review', /review|audit|security|doc-writer|docs?-/i],
    ['deliver', /git|release|deliver|deploy|publish/i],
  ]

  static readonly PHASE_NAMES: Record<PhaseId, { name: string; short: string }> = {
    plan: { name: 'Plan', short: 'Plan' },
    experts: { name: 'Experts', short: 'Experts' },
    verify: { name: 'Verify', short: 'Verify' },
    review: { name: 'Reviews', short: 'Reviews' },
    deliver: { name: 'Delivery', short: 'Deliver' },
  }

  private static readonly AUTOFIX = /--fix\b|:fix\b|--write\b/

  private static readonly WRITE_TOOLS = /\b(Edit|Write|MultiEdit|NotebookEdit|\*)\b/

  static generic(name = ''): Manifest {
    return {
      version: 1,
      name,
      stage: 'none',
      language: { conversation: '', artifacts: 'en' },
      versioned: true,
      roles: {},
      phases: [],
      reviewers: [],
      verification: Project.DEFAULT_VERIFICATION,
      layers: [
        { name: 'Tests', pattern: '(^|/)(tests?|__tests__|spec|e2e)/|\\.(spec|test)\\.[a-z]+$' },
        { name: 'Documentation', pattern: '(^|/)docs?/|\\.md$' },
        { name: 'Infrastructure', pattern: '(^|/)(\\.github|\\.azuredevops|infra|deploy|docker|k8s|helm|terraform)/|Dockerfile|\\.ya?ml$' },
        { name: 'Front', pattern: '(^|/)(web|webui|front|frontend|client|ui|app)/|\\.(tsx|jsx|vue|svelte|html|css|scss)$' },
        { name: 'Back', pattern: '\\.(cs|java|kt|go|rs|py|rb|php|ts|js|sql)$' },
      ],
      code: { roots: '', extensions: '\\.(cs|ts|tsx|js|jsx|mjs|py|go|rs|java|kt|rb|php|sql|vue|svelte|html|css|scss)$', ignore: '(^|/)(\\.claude|node_modules|dist|build|bin|obj|vendor)/' },
      generated: '(^|/)(generated|__generated__)/|\\.g\\.[a-z]+$|\\.generated\\.[a-z]+$',
      checks: { aiMention: true, partition: true, hooks: true },
      git: { base: 'main', featurePrefixes: ['feature/', 'feat/', 'features/'], fixPrefixes: ['fix/', 'bugfix/', 'bugfixes/', 'hotfix/'], support: '^(support|release)/', workItem: '(?:^|/|#)(\\d{3,7})(?:-|$)' },
      theme: '',
      generatedFiles: {},
      hooks: {},
    }
  }

  static readonly DEFAULT_VERIFICATION: VerifRule[] = [
    { step: 'build', label: 'Build', patterns: ['\\bdotnet\\s+build\\b', '\\b(npm|pnpm|yarn|bun)\\s+(run\\s+)?build\\b', '\\bcargo\\s+build\\b', '\\bgo\\s+build\\b', '\\b(mvn|gradle|\\./gradlew)\\b.*\\b(compile|build|package)\\b', '\\btsc\\b'] },
    { step: 'format', label: 'Format', patterns: ['\\bdotnet\\s+format\\b', '\\bprettier\\b.*--check', '\\b(black|ruff\\s+format)\\b.*--check', '\\bcargo\\s+fmt\\b', '\\bgofmt\\b'], optional: true },
    { step: 'lint', label: 'Lint', patterns: ['\\b(npm|pnpm|yarn|bun)\\s+(run\\s+)?lint\\b', '\\bnpx\\s+eslint\\b', '\\beslint\\s', '\\bruff\\s+check\\b', '\\bflake8\\b', '\\bcargo\\s+clippy\\b', '\\bgolangci-lint\\b'] },
    { step: 'unit', label: 'Tests', patterns: ['\\bdotnet\\s+test\\b', '\\b(npm|pnpm|yarn|bun)\\s+(run\\s+)?test\\b', '\\bnpx\\s+(vitest|jest)\\b', '\\bpytest\\b', '\\bcargo\\s+test\\b', '\\bgo\\s+test\\b', '\\b(mvn|gradle|\\./gradlew)\\b.*\\btest\\b'] },
    { step: 'e2e', label: 'E2E', patterns: ['\\b(npm|pnpm|yarn)\\s+run\\s+(e2e|test:e2e)\\b', '\\bplaywright\\s+test\\b', '\\bcypress\\s+run\\b', '\\bcucumber-js\\b'], optional: true },
  ]

  static parse(raw: unknown, name = ''): Manifest | undefined {
    if (typeof raw !== 'object' || raw === null) return undefined
    const loose = raw as Record<string, unknown>
    if (loose['version'] !== 1) return undefined
    const base = Project.generic(name)
    const pick = <T>(key: keyof Manifest, check: (v: unknown) => boolean): T => (check(loose[key]) ? loose[key] : base[key]) as T
    const isObject = (v: unknown): boolean => typeof v === 'object' && v !== null && !Array.isArray(v)
    const isString = (v: unknown): boolean => typeof v === 'string'
    return {
      version: 1,
      name: pick<string>('name', isString) || name,
      stage: pick<Stage>('stage', v => v === 'none' || v === 'genesis' || v === 'full'),
      language: { ...base.language, ...(isObject(loose['language']) ? (loose['language'] as Manifest['language']) : {}) },
      versioned: pick<boolean>('versioned', v => typeof v === 'boolean'),
      roles: Project.migrateRoles(pick<Manifest['roles']>('roles', isObject)),
      phases: pick<Phase[]>('phases', Array.isArray),
      reviewers: pick<Reviewer[]>('reviewers', Array.isArray),
      verification: pick<VerifRule[]>('verification', v => Array.isArray(v) && v.length > 0),
      layers: pick<Layer[]>('layers', Array.isArray),
      code: { ...base.code, ...(isObject(loose['code']) ? (loose['code'] as Manifest['code']) : {}) },
      generated: pick<string>('generated', isString),
      checks: pick<Checks>('checks', isObject),
      git: { ...base.git, ...(isObject(loose['git']) ? (loose['git'] as Git) : {}) },
      theme: pick<string>('theme', isString),
      generatedFiles: pick<Record<string, string>>('generatedFiles', isObject),
      hooks: pick<Record<string, unknown>>('hooks', isObject),
    }
  }

  static migrateRoles(roles: Manifest['roles']): Manifest['roles'] {
    const setup = roles.setup
    if (setup === 'maestro') return { ...roles, setup: 'podium' }
    if (setup === 'maestro:setup') return { ...roles, setup: 'podium:setup' }
    return roles
  }

  static agentFromMarkdown(fileName: string, text: string): AgentDef | undefined {
    const front = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1]
    if (front === undefined) return undefined
    const field = (key: string): string => front.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1]?.trim().replace(/^["']|["']$/g, '') ?? ''
    const name = field('name') || fileName.replace(/\.md$/, '')
    const tools = field('tools')
      .split(',')
      .map(t => t.trim())
      .filter(t => t !== '')
    return { name, model: field('model'), color: field('color'), description: field('description'), tools }
  }

  static inferPhases(agents: readonly AgentDef[]): Phase[] {
    const order: PhaseId[] = ['plan', 'experts', 'verify', 'review', 'deliver']
    const buckets = new Map<PhaseId, string[]>(order.map(id => [id, []]))
    for (const agent of agents) {
      const hint = Project.PHASE_HINTS.find(([, re]) => re.test(agent.name))?.[0]
      const writes = agent.tools.length === 0 || agent.tools.some(t => Project.WRITE_TOOLS.test(t))
      buckets.get(hint ?? (writes ? 'experts' : 'review'))?.push(agent.name)
    }
    return order.filter(id => (buckets.get(id) ?? []).length > 0).map(id => ({ id, ...Project.PHASE_NAMES[id], agents: buckets.get(id) ?? [] }))
  }

  static phaseOf(phase: Phase): PhaseId | undefined {
    if (phase.id) return phase.id
    return (Object.keys(Project.PHASE_NAMES) as PhaseId[]).find(id => Project.PHASE_NAMES[id].name === phase.name || id === phase.name.toLowerCase())
  }

  static inferReviewers(agents: readonly AgentDef[]): Reviewer[] {
    return agents
      .filter(a => /review|audit/i.test(a.name))
      .map(a => {
        const short = a.name.replace(/[-_]?(reviewer|review|audit(or)?)$/i, '').replace(/-/g, ' ') || a.name
        return { agent: a.name, label: `revue ${short}`, short }
      })
  }

  static inferRoles(commands: readonly CommandDef[]): Partial<Record<RoleId, string>> {
    const roles: Partial<Record<RoleId, string>> = {}
    for (const c of commands) {
      if (c.source === 'builtin') continue
      const bare = (c.name.split(':').pop() ?? c.name).toLowerCase()
      const role = Project.SETUP_COMMAND.test(c.name.toLowerCase()) ? 'setup' : Project.ROLE_HINTS.find(([, re]) => re.test(bare))?.[0]
      if (role && roles[role] === undefined) roles[role] = c.name
    }
    return roles
  }

  static resolve(manifest: Manifest | undefined, agents: readonly AgentDef[], commands: readonly CommandDef[], hasClaude: boolean, name = '', local: readonly string[] = []): ProjectSnapshot {
    const base = manifest ?? Project.generic(name)
    const roles = { ...Project.inferRoles(commands), ...base.roles }
    const phases = base.phases.length > 0 ? base.phases : Project.inferPhases(agents)
    const reviewers = base.reviewers.length > 0 ? base.reviewers : Project.inferReviewers(agents)
    const stage: Stage = manifest ? base.stage : hasClaude && agents.length > 0 ? 'full' : 'none'
    return { manifest: { ...base, roles, phases, reviewers, stage }, agents: [...agents], commands: [...commands], hasClaude, hasManifest: manifest !== undefined, local: [...local] }
  }

  static roleOf(snapshot: ProjectSnapshot, command: string): RoleId | undefined {
    const entry = Object.entries(snapshot.manifest.roles).find(([, name]) => name === command)
    return entry ? (entry[0] as RoleId) : undefined
  }

  static command(snapshot: ProjectSnapshot, role: RoleId): string | undefined {
    const name = snapshot.manifest.roles[role]
    if (name === undefined || name === '') return undefined
    return snapshot.commands.some(c => c.name === name) || snapshot.commands.length === 0 ? name : undefined
  }

  static groups(snapshot: ProjectSnapshot): CommandGroup[] {
    const project: CommandGroup = { id: 'project', label: 'Projet', commands: [] }
    const personal: CommandGroup = { id: 'personal', label: 'Personnelles', commands: [] }
    const plugins: CommandGroup = { id: 'plugins', label: 'Plugins', commands: [] }
    const mcp: CommandGroup = { id: 'mcp', label: 'MCP', commands: [] }
    const builtin: CommandGroup = { id: 'builtin', label: 'Claude Code', commands: [] }
    for (const c of snapshot.commands) {
      const role = Project.roleOf(snapshot, c.name)
      const entry = role ? { ...c, role } : { ...c }
      if (c.source === 'user' && (snapshot.local.length === 0 || snapshot.local.includes(c.name))) project.commands.push(entry)
      else if (c.source === 'user') personal.commands.push(entry)
      else if (c.source === 'plugin') plugins.commands.push(entry)
      else if (c.source === 'mcp') mcp.commands.push(entry)
      else builtin.commands.push(entry)
    }
    const order = Object.keys(Project.ROLE_LABELS)
    const rank = (c: { role?: RoleId; name: string }): number => (c.role ? order.indexOf(c.role) : order.length)
    for (const g of [project, personal, plugins, mcp]) g.commands.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
    builtin.commands.sort((a, b) => a.name.localeCompare(b.name))
    return [project, personal, plugins, mcp, builtin].filter(g => g.commands.length > 0)
  }

  static matches(pattern: string, value: string): boolean {
    if (pattern === '') return false
    try {
      return new RegExp(pattern).test(value)
    } catch {
      return false
    }
  }

  static verifSteps(snapshot: ProjectSnapshot, command: string): VerifKey[] {
    const keys: VerifKey[] = []
    for (const part of Project.mask(command).split(/&&|\|\||;|\n/)) {
      if (Project.AUTOFIX.test(part)) continue
      let best: { step: VerifKey; length: number } | undefined
      for (const rule of snapshot.manifest.verification) {
        const length = Math.max(0, ...rule.patterns.map(p => Project.matchLength(p, part)))
        if (length > 0 && (best === undefined || length > best.length)) best = { step: rule.step, length }
      }
      if (best) keys.push(best.step)
    }
    return keys
  }

  private static matchLength(pattern: string, value: string): number {
    if (pattern === '') return 0
    try {
      const m = value.match(new RegExp(pattern))
      return m === null ? 0 : Math.max(1, m[0].length)
    } catch {
      return 0
    }
  }

  private static mask(command: string): string {
    return command
      .replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2\s*(?=\n|$)/g, '\n')
      .replace(/"(?:[^"\\]|\\[\s\S])*"|'[^']*'/g, quoted => {
        const inner = quoted.slice(1, -1)
        if (quoted.startsWith('"') && /\$\(|`/.test(inner)) return quoted
        return /[\s;|&<>`]/.test(inner) ? `${quoted[0]}?${quoted[0]}` : quoted
      })
  }

  static layer(snapshot: ProjectSnapshot, path: string): string {
    return snapshot.manifest.layers.find(l => Project.matches(l.pattern, path))?.name ?? 'Other'
  }

  static phaseIndex(snapshot: ProjectSnapshot, type: string): number {
    const bare = type.split(':').pop() ?? type
    return snapshot.manifest.phases.findIndex(p => p.agents.some(a => a.toLowerCase() === bare.toLowerCase()))
  }

  static isReviewer(snapshot: ProjectSnapshot, type: string): boolean {
    const bare = type.split(':').pop() ?? type
    return snapshot.manifest.reviewers.some(r => r.agent === bare)
  }

  static reviewer(snapshot: ProjectSnapshot, type: string): Reviewer | undefined {
    const bare = type.split(':').pop() ?? type
    return snapshot.manifest.reviewers.find(r => r.agent === bare)
  }
}
