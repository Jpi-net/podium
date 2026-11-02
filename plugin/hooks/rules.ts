import type { AlertLevel, FlowVerifStep, RuleId, VerifKey } from '../types'
import { Project, type GuardText, type ProjectSnapshot } from './project'

export type RuleHit = { level: AlertLevel; rule: RuleId; detail: string }

export type CommandContext = { isArm: boolean; schemaEditedAt: number; imageBuiltAt: number }

export type EditContext = { branch: string; isNewFile: boolean; functionCandidates: string[] }

export type ReviewVerdict = 'PASS' | 'FAIL' | 'WARN' | ''

export type Readiness = { state: 'ready' | 'reviews' | 'blocked'; reasons: string[] }

export type StepTiming = Pick<FlowVerifStep, 'status' | 'at' | 'durationMs'>

export type VerifTimings = Record<VerifKey, StepTiming>

export type ReviewCount = { verdict: ReviewVerdict; critical: number; major: number; minor: number; highlights: string[] }

export class Rules {
  private static snapshot: ProjectSnapshot = Project.resolve(undefined, [], [], false)
  private static root = ''

  static configure(snapshot: ProjectSnapshot, root = Rules.root): void {
    Rules.snapshot = snapshot
    Rules.root = root.replace(/\\/g, '/').replace(/\/$/, '')
  }

  static project(): ProjectSnapshot {
    return Rules.snapshot
  }

  static label(rule: RuleId): string {
    return Rules.guard(rule)?.label ?? Rules.LABELS[rule]
  }

  static short(rule: RuleId): string {
    return Rules.guard(rule)?.short ?? Rules.SHORT[rule]
  }

  static remedy(rule: RuleId): string {
    return Rules.guard(rule)?.remedy ?? Rules.REMEDY[rule]
  }

  static help(rule: RuleId): { why: string; fix: string } {
    const g = Rules.guard(rule)
    const base = Rules.HELP[rule]
    return { why: g?.why ?? base.why, fix: g?.fix ?? base.fix }
  }

  private static guard(rule: RuleId): GuardText | undefined {
    const checks = Rules.snapshot.manifest.checks
    if (rule === 'generated') return checks.generated
    if (rule === 'v1') return checks.legacy
    if (rule === 'isolation') return checks.isolation
    if (rule === 'docker') return checks.integrationImage
    return undefined
  }

  static readonly LABELS: Record<RuleId, string> = {
    generated: 'Generated file edited by hand',
    comment: 'Comment added',
    var: '`var` in C#',
    function: 'Function outside a class',
    partition: 'Partition conflict',
    'ai-mention': 'AI mention',
    hook: 'Blocked by a hook',
    v1: 'Legacy code touched during a feature',
    isolation: 'Data isolation to check',
    docker: 'Integration tests / image',
  }

  static readonly SHORT: Record<RuleId, string> = {
    generated: 'generated file',
    comment: 'comment',
    var: 'var',
    function: 'free function',
    partition: 'partition',
    'ai-mention': 'AI mention',
    hook: 'hook',
    v1: 'legacy',
    isolation: 'isolation',
    docker: 'image',
  }

  static readonly REMEDY: Record<RuleId, string> = {
    generated: 'regenerate',
    comment: 'remove',
    var: 'explicit type',
    function: 'class method',
    partition: 'single expert',
    'ai-mention': 'reword',
    hook: 'read the hook',
    v1: 'new code',
    isolation: 'filter',
    docker: 'rebuild',
  }

  static readonly HELP: Record<RuleId, { why: string; fix: string }> = {
    generated: {
      why: 'file produced by a generator: any manual change will be overwritten',
      fix: 'revert the change and run the generator again',
    },
    comment: {
      why: 'project rule: no comments except AAA markers in tests and // ---- banners',
      fix: 'remove the comment and make the code explicit through naming',
    },
    var: {
      why: 'project C# rule: no var, the type is always written',
      fix: 'replace var with the explicit type',
    },
    function: {
      why: 'project TS/C# rule: no function declared outside a class',
      fix: 'make it a private method or a private static readonly member of the class',
    },
    partition: {
      why: 'two experts edit the same file in parallel: risk of one overwriting the other',
      fix: 'assign the file to a single expert and rerun the other on a disjoint partition',
    },
    'ai-mention': {
      why: 'no AI attribution in commits, branches or pull requests',
      fix: 'reword the text without any reference to the tool before committing or publishing',
    },
    hook: {
      why: 'a project hook refused the action',
      fix: 'read the hook message and correct the action, never work around it',
    },
    v1: {
      why: 'new features go in the new code, the legacy code only receives fixes',
      fix: 'move the new file to the modern part of the code',
    },
    isolation: {
      why: 'every data access must explicitly apply the project isolation rule',
      fix: 'apply the isolation filter described in the project rules',
    },
    docker: {
      why: 'integration tests require an up-to-date image',
      fix: 'rebuild the image then rerun the tests',
    },
  }


  private static readonly GENERATED = /(^|\/)(service-proxies|http-proxies|app-permissions)\.ts$|\.g\.cs$/
  private static readonly ASSISTANTS = String.raw`claude(?:\s+code)?|anthropic|chatgpt|openai|gpt-?\d|copilot|gemini|codeium|an?\s+(?:ai|llm)(?:\s+assistant)?|ai|llm`
  private static readonly FORBIDDEN_ATTRIBUTION = new RegExp([
    String.raw`co-authored-by:[^\n]*\b(?:${Rules.ASSISTANTS}|assistant|noreply@anthropic\.com)\b`,
    String.raw`\b(?:generated|written|authored|created|made|produced|assisted|drafted)\s+(?:with|by|using)\s+(?:\S+\s+){0,2}[\[(*_"'\`]*(?:${Rules.ASSISTANTS})\b`,
    String.raw`\bAI[- ](?:generated|assisted|written)\b`,
    '🤖',
  ].join('|'), 'i')
  private static readonly ASSISTANT_NAMES = /\b(claude|anthropic|chatgpt|copilot|llm|opus|sonnet|haiku)\b/i
  private static readonly MODEL_ATTRIBUTION = /\b(written|authored|created|made|produced|generated|assisted|drafted|co-?authored)\s+(with|by|using)\s+(\S+\s+){0,2}(opus|sonnet|haiku)\b|\b(opus|sonnet|haiku)[\s-]+\d/i
  private static readonly TECHNICAL_TOKENS = /(?:[A-Za-z]:)?[\w.\\/~-]*?[\\/](?:claude-[\w-]+|\.claude)[\\/][^\s'")]*|(?:^|[\s(`'"])\.claude\b\/?|\$\{?(?:CLAUDE_PROJECT_DIR|CLAUDE_PLUGIN_ROOT|TMPDIR|TEMP|TMP)\}?|%(?:TEMP|TMP)%/g
  private static readonly REVIEW_REQUEST = /^(pr|mr|repos pr)\b/
  private static readonly MESSAGE_FLAGS = ['-m', '--message'] as const
  private static readonly REQUEST_FLAGS = ['--title', '-t', '--body', '-b', '--description', '-d', '--message', '-m'] as const
  private static readonly PASS_LINE = /^\s*(\(pass\)|✓|ok \d|PASS\b)/
  static readonly PR_CREATE = /\b(az\s+repos\s+pr|gh\s+pr|glab\s+mr)\s+create\b/
  private static readonly TS_FREE_FUNCTION =
    /^(export\s+)?(default\s+)?(async\s+)?function[\s*]|^(export\s+)?(const|let)\s+[A-Za-z_$][\w$]*\s*(:\s*[^=]+)?=\s*(async\s+)?(\([^)]*\)|[A-Za-z_$][\w$]*)\s*(:\s*[^=]+)?=>/

  private static readonly SEVERITIES = 'Critical|Critique|Blocking|Bloquant|High|Major|Majeur|Medium|Moyen|Low|Minor|Mineur|Nit'
  private static readonly BULLET = '^\\s*(?:[-*•]|\\d+[.)])\\s*'
  private static readonly TAGGED_FINDING = new RegExp(`${Rules.BULLET}(?:\\*\\*)?\\[(${Rules.SEVERITIES})\\]`, 'i')
  private static readonly BOLD_FINDING = new RegExp(`${Rules.BULLET}\\*\\*(?:\\[)?(${Rules.SEVERITIES})(?:\\])?\\*\\*`, 'i')
  private static readonly LEADING_SEVERITY = new RegExp(`${Rules.BULLET}(?:\\*\\*)?(${Rules.SEVERITIES})\\b`, 'i')
  private static readonly NEGATION_ONLY =
    /^(?:aucun|aucune|none|no|nothing|rien|n\u00e9ant|ras|n\/a|0|pas d['e]\s*(?:probl\u00e8me|souci|constat|point|remarque)s?)(?:\s+(?:autre|other|probl\u00e8me|souci|issue|finding|constat|point)s?)?(?:\s+(?:trouv\u00e9|found|d\u00e9tect\u00e9|signal\u00e9|\u00e0 signaler)e?s?)?[\s.!;:]*$/i
  private static readonly MSBUILD_ERROR = /([^\s\\/()]+\.[A-Za-z]{1,6})\((\d+),\d+\):\s*error\s+([A-Z]{2,4}\d{3,5})/
  private static readonly ERROR_CODE = /\berror\s+[A-Z]{2,4}\d{3,5}\b.*/
  private static readonly FAILURE_LINE = /\berror\b|FAILED|✖|\bfailed\b|Failed!/i
  private static readonly VERDICT_HEADING = /^\s*#+\s*verdict\b(.*)$/i
  private static readonly VERDICT_INLINE = /^\s*(?:[-*•]\s*)?\*{0,2}verdict\*{0,2}\s*:\s*\*{0,2}\s*(.*)$/i

  static readonly STEP_ORDER: VerifKey[] = ['build', 'format', 'lint', 'unit', 'integ', 'front', 'e2e']
  private static readonly STEP_LABELS: Record<VerifKey, string> = { build: 'Build', format: 'Format', lint: 'Lint', unit: 'Unit', integ: 'Integ.', front: 'Front', e2e: 'E2E' }
  static readonly FRESH_WINDOW_MS = 30 * 60_000
  private static readonly DELIVERY_COMMAND = /\bgit\s+commit\b|\b(az\s+repos\s+pr|gh\s+pr|glab\s+mr)\s+create\b/

  static deliverySteps(): VerifKey[] {
    const rules = Rules.snapshot.manifest.verification
    return Rules.STEP_ORDER.filter(k => rules.some(r => r.step === k && r.optional !== true))
  }

  static optionalSteps(): VerifKey[] {
    const required = Rules.deliverySteps()
    const rules = Rules.snapshot.manifest.verification
    return Rules.STEP_ORDER.filter(k => !required.includes(k) && rules.some(r => r.step === k))
  }

  static celebrationSteps(): VerifKey[] {
    const rules = Rules.snapshot.manifest.verification
    return Rules.STEP_ORDER.filter(k => k !== 'integ' && k !== 'e2e' && rules.some(r => r.step === k))
  }

  static verifLabel(step: VerifKey): string {
    return Rules.snapshot.manifest.verification.find(r => r.step === step)?.label ?? Rules.STEP_LABELS[step]
  }

  static enabledRules(): RuleId[] {
    const m = Rules.snapshot.manifest
    const c = m.checks
    const flags: Record<RuleId, boolean> = {
      generated: m.generated !== '',
      comment: c.comments === true,
      var: c.noVar === true,
      function: c.noFreeFunction === true,
      partition: c.partition === true,
      'ai-mention': c.aiMention === true,
      hook: c.hooks === true,
      v1: c.legacy !== undefined,
      isolation: c.isolation !== undefined,
      docker: c.integrationImage !== undefined,
    }
    return (Object.keys(Rules.LABELS) as RuleId[]).filter(id => flags[id])
  }

  static reviewName(type: string): string {
    return Project.reviewer(Rules.snapshot, type)?.label ?? type
  }

  static isCodePath(path: string): boolean {
    const p = Rules.normalize(path)
    const code = Rules.snapshot.manifest.code
    if (/(^|\/)\.claude\/|(^|\/)docs\/|\.md$/.test(p) || Project.matches(code.ignore, p)) return false
    if (code.roots !== '' && !Project.matches(`^(${code.roots})`, p)) return false
    return Project.matches(code.extensions, p)
  }

  static isStale(step: StepTiming, codeEditedAt: number): boolean {
    return (step.status === 'ok' || step.status === 'ko') && step.at - step.durationMs < codeEditedAt
  }

  static isDelivery(command: string): boolean {
    return Rules.DELIVERY_COMMAND.test(command)
  }

  static shouldCelebrate(verif: VerifTimings, lastKey: string, codeEditedAt: number, now: number): string | undefined {
    const considered = Rules.celebrationSteps().map(k => ({ key: k, step: verif[k] }))
    if (considered.some(s => s.step.status === 'running')) return undefined
    if (considered.some(s => s.step.status === 'ko' && Rules.isFresh(s.step, codeEditedAt, now))) return undefined
    const counted = considered.filter(s => s.step.status === 'ok' && Rules.isFresh(s.step, codeEditedAt, now))
    if (counted.length < 2) return undefined
    const names: string[] = counted.map(s => s.key).sort()
    const key = `${names.join(',')}@${codeEditedAt}`
    if (key === lastKey) return undefined
    const separator = lastKey.lastIndexOf('@')
    if (separator >= 0 && lastKey.slice(separator + 1) === String(codeEditedAt)) {
      const previous = lastKey.slice(0, separator).split(',')
      if (previous.every(p => names.includes(p))) return undefined
    }
    return key
  }

  static deliveryGaps(verif: VerifTimings, codeEditedAt: number, labels: Record<VerifKey, string>): string[] {
    return Rules.deliverySteps().flatMap(k => {
      const step = verif[k]
      const label = labels[k]
      if (step.status === 'stale' || Rules.isStale(step, codeEditedAt)) return [`${label} to rerun`]
      if (step.status === 'idle') return [`${label} to run`]
      if (step.status === 'running') return [`${label} running`]
      if (step.status === 'ko') return [`${label} failing`]
      return []
    })
  }

  static readiness(verif: VerifTimings, reviews: { type: string; verdict: string; at?: number }[], codeEditedAt: number, labels: Record<VerifKey, string>): Readiness {
    const latest = new Map<string, { verdict: string; at?: number }>()
    for (const r of reviews) latest.set(r.type, { verdict: r.verdict, at: r.at })
    const reviewGaps = Array.from(latest.entries()).flatMap(([type, r]) => {
      const name = Rules.reviewName(type)
      if (r.at !== undefined && r.at > 0 && r.at < codeEditedAt) return [`${name} to redo`]
      if (r.verdict === 'PASS') return []
      return [`${name} ${r.verdict === '' ? 'no verdict' : r.verdict}`]
    })
    const reasons = [...Rules.deliveryGaps(verif, codeEditedAt, labels), ...reviewGaps]
    if (reasons.length > 0) return { state: 'blocked', reasons }
    return { state: latest.size === 0 ? 'reviews' : 'ready', reasons: [] }
  }

  static addedLines(oldText: string, newText: string): string[] {
    const before = new Set(oldText.split(/\r?\n/).map(l => l.trim()))
    return newText.split(/\r?\n/).filter(l => l.trim() !== '' && !before.has(l.trim()))
  }

  static inspectEdit(path: string, added: string[], context: EditContext): RuleHit[] {
    const p = Rules.normalize(path)
    if (Rules.isOutsideCode(p)) return []
    const checks = Rules.snapshot.manifest.checks
    const hits: RuleHit[] = []
    if (Project.matches(Rules.snapshot.manifest.generated, p)) {
      hits.push({ level: 'error', rule: 'generated', detail: checks.generated?.detail ?? 'regenerate, never edit' })
    }
    if (checks.comments) {
      const comment = added.find(l => Rules.isComment(p, l))
      if (comment !== undefined) hits.push({ level: 'warn', rule: 'comment', detail: comment.trim() })
    }
    if (checks.noVar && p.endsWith('.cs')) {
      const v = added.find(l => /(^|[\s(])var\s+[A-Za-z_@(]/.test(Rules.codePart(l)))
      if (v !== undefined) hits.push({ level: 'warn', rule: 'var', detail: v.trim() })
    }
    if (checks.noFreeFunction && p.endsWith('.ts') && !p.endsWith('.d.ts')) {
      const f = context.functionCandidates.find(l => Rules.TS_FREE_FUNCTION.test(l))
      if (f !== undefined) hits.push({ level: 'warn', rule: 'function', detail: f.trim() })
    }
    const legacy = checks.legacy
    if (legacy && context.isNewFile && Rules.isFeatureBranch(context.branch) && Project.matches(legacy.pattern, p)) {
      hits.push({ level: 'warn', rule: 'v1', detail: `new ${legacy.short ?? 'legacy'} file on a feature: new code goes in ${legacy.current}` })
    }
    return hits
  }

  static isFeatureBranch(branch: string): boolean {
    return Rules.snapshot.manifest.git.featurePrefixes.some(prefix => branch.startsWith(prefix))
  }

  static isFixBranch(branch: string): boolean {
    return Rules.snapshot.manifest.git.fixPrefixes.some(prefix => branch.startsWith(prefix))
  }

  static inspectFile(path: string, content: string, isIsolated: boolean): RuleHit[] {
    const isolation = Rules.snapshot.manifest.checks.isolation
    if (!isIsolated || !isolation) return []
    const p = Rules.normalize(path)
    const name = p.split('/').pop() ?? p
    for (const rule of isolation.rules) {
      if (!Project.matches(rule.path, p)) continue
      if (rule.skipName && Project.matches(rule.skipName, name)) continue
      if (rule.when && !Project.matches(rule.when, content)) continue
      if (!Project.matches(rule.require, content)) return [{ level: 'warn', rule: 'isolation', detail: `${name}: ${rule.message}` }]
    }
    return []
  }

  static inspectCommand(command: string, context: CommandContext): RuleHit[] {
    const hits: RuleHit[] = []
    if (Rules.snapshot.manifest.checks.aiMention) {
      const text = Rules.artefactText(command)
      if (Rules.mentionsAssistant(text)) hits.push({ level: 'error', rule: 'ai-mention', detail: Rules.firstLine(text) })
    }
    const image = Rules.snapshot.manifest.checks.integrationImage
    if (image && Project.matches(image.command, command)) {
      if (image.armFlag && context.isArm && !command.includes(image.armFlag)) {
        hits.push({ level: 'warn', rule: 'docker', detail: `arm64 host: ${image.armFlag} missing` })
      }
      if (context.schemaEditedAt > context.imageBuiltAt) {
        hits.push({ level: 'warn', rule: 'docker', detail: `schema changed since the last image: ${image.stale ?? 'rebuild it'}` })
      }
    }
    return hits
  }

  static isImageBuild(command: string): boolean {
    const image = Rules.snapshot.manifest.checks.integrationImage
    return image !== undefined && Project.matches(image.build, command)
  }

  static isSchema(path: string): boolean {
    const image = Rules.snapshot.manifest.checks.integrationImage
    return image !== undefined && Project.matches(image.schema, Rules.normalize(path))
  }

  static isHookBlock(text: string): boolean {
    return /\bhook\b/i.test(text) && /(block|deni|refus|interdit|not allowed)/i.test(text)
  }

  static verifSteps(command: string): VerifKey[] {
    return Array.from(new Set(Project.verifSteps(Rules.snapshot, command)))
  }

  static isFailure(text: string, isError: boolean): boolean {
    if (isError) return true
    const body = text.split(/\r?\n/).filter(l => !Rules.PASS_LINE.test(l)).join('\n')
    return /Exit code [1-9]|Build FAILED|\berror [A-Z]{2,4}\d{3,5}\b|Failed!\s+-\s+Failed:\s+[1-9]|✖ [1-9]\d* problems?|\b[1-9]\d* fail(ed)?\b|^FAIL\b|^--- FAIL:|error\[E\d{4}\]|npm ERR!|^ERR!|BUILD FAILURE|BUILD FAILED|^FAILED |Tests:.*\b[1-9]\d* failed|SyntaxError:|Traceback \(most recent call last\)/m.test(body)
  }

  static layer(path: string): string {
    return Project.layer(Rules.snapshot, Rules.normalize(path))
  }

  static layers(): string[] {
    const layers = [...Rules.snapshot.manifest.layers].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
    return [...layers.map(l => l.name), 'Other']
  }

  static isV1(path: string): boolean {
    const legacy = Rules.snapshot.manifest.checks.legacy
    return legacy !== undefined && Project.matches(legacy.pattern, Rules.normalize(path))
  }

  static isV2(path: string): boolean {
    const legacy = Rules.snapshot.manifest.checks.legacy
    return legacy?.modern !== undefined && Project.matches(legacy.modern, Rules.normalize(path))
  }

  static review(answer: string): ReviewCount {
    const lines = answer.split(/\r?\n/)
    let findings: { level: number; text: string }[] = lines.flatMap(l => {
      const tag = l.match(Rules.TAGGED_FINDING) ?? l.match(Rules.BOLD_FINDING)
      const level = Rules.severityLevel(tag?.[1] ?? tag?.[2] ?? '')
      if (level < 0 || tag === null) return []
      return Rules.isNegationOnly(l.slice(tag.index + tag[0].length)) ? [] : [{ level, text: Rules.cleanFinding(l) }]
    })
    if (findings.length === 0) {
      findings = lines.flatMap(l => {
        const m = l.match(Rules.LEADING_SEVERITY)
        const level = Rules.severityLevel(m?.[1] ?? '')
        return level < 0 || m === null || Rules.isNegationOnly(l.slice(m.index + m[0].length)) ? [] : [{ level, text: Rules.cleanFinding(l) }]
      })
    }
    const sorted = [...findings].sort((a, b) => a.level - b.level)
    return {
      verdict: Rules.verdict(lines),
      critical: findings.filter(f => f.level === 0).length,
      major: findings.filter(f => f.level === 1).length,
      minor: findings.filter(f => f.level === 2).length,
      highlights: sorted.slice(0, 4).map(f => f.text),
    }
  }

  static failureDetail(output: string): string {
    const msbuild = output.match(Rules.MSBUILD_ERROR)
    if (msbuild !== null) return `error ${msbuild[3] ?? ''} · ${msbuild[1] ?? ''}:${msbuild[2] ?? ''}`
    const lines = output.split(/\r?\n/).filter(l => !Rules.PASS_LINE.test(l)).map(l => l.trim())
    const coded = lines.map(l => l.match(Rules.ERROR_CODE)?.[0]).find(l => l !== undefined)
    if (coded !== undefined) return coded.slice(0, 160)
    return (lines.find(l => Rules.FAILURE_LINE.test(l)) ?? '').slice(0, 160)
  }

  static severityTag(finding: string): { tag: string; text: string } {
    const m = finding.match(/^(Critical|Critique|Blocking|Bloquant|High|Major|Majeur|Medium|Moyen|Low|Minor|Mineur|Nit)\b[\s:]*/i)
    if (m === null) return { tag: '', text: finding }
    const level = Rules.severityLevel(m[1] ?? '')
    return { tag: level === 0 ? 'C' : level === 1 ? 'M' : 'm', text: finding.slice(m[0].length) }
  }

  static workItem(branch: string): string {
    const pattern = Rules.snapshot.manifest.git.workItem
    try {
      return branch.match(new RegExp(pattern))?.[1] ?? ''
    } catch {
      return ''
    }
  }

  private static isFresh(step: StepTiming, codeEditedAt: number, now: number): boolean {
    return codeEditedAt > 0 ? step.at > codeEditedAt : now - step.at <= Rules.FRESH_WINDOW_MS
  }

  private static verdict(lines: string[]): ReviewVerdict {
    let text = ''
    const headingIndex = lines.findIndex(l => Rules.VERDICT_HEADING.test(l))
    if (headingIndex >= 0) {
      const inline = Rules.stripVerdictNoise((lines[headingIndex] ?? '').match(Rules.VERDICT_HEADING)?.[1] ?? '')
      text = inline !== '' ? inline : Rules.stripVerdictNoise(lines.slice(headingIndex + 1).find(l => l.trim() !== '') ?? '')
    } else {
      for (const l of lines) {
        const m = l.match(Rules.VERDICT_INLINE)
        if (m !== null) {
          text = Rules.stripVerdictNoise(m[1] ?? '')
          break
        }
      }
    }
    const t = text.toUpperCase()
    if (/^(NOT|NON|PAS)(?![A-Z\u00c9])/.test(t)) return 'FAIL'
    if (/^(FAILED|FAIL|CHANGES REQUIRED|REJECTED|BLOQUANT|BLOCKED)(?![A-Z\u00c9])/.test(t)) return 'FAIL'
    if (/^(WARN|WARNING|CONDITIONAL|AVEC R\u00c9SERVES)(?![A-Z\u00c9])/.test(t)) return 'WARN'
    if (/^(PASSED|PASS|OK|APPROVED)(?![A-Z\u00c9])|^[✓✔]/.test(t)) return 'PASS'
    return ''
  }

  private static isNegationOnly(remainder: string): boolean {
    return Rules.NEGATION_ONLY.test(remainder.replace(/^[\s:*\-–—\]]+/, '').trim())
  }

  private static stripVerdictNoise(text: string): string {
    return text.replace(/^[\s:*\-–—]+/, '').trim()
  }

  private static severityLevel(tag: string): number {
    if (/^(critical|critique|blocking|bloquant)$/i.test(tag)) return 0
    if (/^(high|major|majeur)$/i.test(tag)) return 1
    if (/^(medium|moyen|low|minor|mineur|nit)$/i.test(tag)) return 2
    return -1
  }

  private static cleanFinding(line: string): string {
    return line
      .trim()
      .replace(/^([-*•]|\d+[.)])\s*/, '')
      .replace(/\*\*/g, '')
      .replace(/[\[\]]/g, '')
  }

  private static readonly SLASH_COMMENT = /\.(cs|ts|tsx|js|jsx|mjs|cjs|go|rs|java|kt|kts|swift|scala|dart|php|c|cc|cpp|h|hpp|m|groovy|css|scss|less)$/
  private static readonly HASH_COMMENT = /\.(py|rb|sh|bash|zsh|ps1|r|pl|ex|exs|nim|toml)$/

  private static isComment(path: string, line: string): boolean {
    const t = line.trim()
    if (path.endsWith('.html') || path.endsWith('.vue') || path.endsWith('.svelte')) {
      if (t.includes('<!--')) return true
      if (path.endsWith('.html')) return false
    }
    if (path.endsWith('.sql')) {
      if (/TINYINT/i.test(t)) return false
      return t.startsWith('--') || t.startsWith('/*') || /\s--\s/.test(Rules.codePart(line, "'"))
    }
    if (Rules.HASH_COMMENT.test(path)) {
      if (/^#!|^#\s*(type:|noqa|pylint:|-\*-|region|endregion)/.test(t)) return false
      if (t.startsWith('#')) return true
      const at = Rules.codePart(line).search(/\s#\s/)
      if (at < 0) return false
      return !/^\s#\s*(type:|noqa|pylint:|pragma|fmt:)/.test(line.slice(at))
    }
    if (!Rules.SLASH_COMMENT.test(path) && !/\.(vue|svelte)$/.test(path)) return false
    if (/^\/\/\s*(Arrange|Act|Assert|Given|When|Then)\b/.test(t)) return false
    if (/\.(ts|tsx)$/.test(path) && /^\/\/\s*-{3,}/.test(t)) return false
    if (/^\/\/\s*(eslint-|@ts-|prettier-|nolint|go:|#region|#endregion|swiftlint:|ktlint-)/.test(t)) return false
    if (t.startsWith('//') || t.startsWith('/*') || t.startsWith('*/')) return true
    const code = Rules.codePart(line)
    return /(^|[^:])\/\/\s|\/\*/.test(code)
  }

  private static codePart(line: string, quote = '"'): string {
    const quotes = quote === '"' ? ['"', "'", '`'] : [quote]
    let open = ''
    let isEscaped = false
    let out = ''
    for (const ch of line) {
      if (open !== '') {
        if (isEscaped) isEscaped = false
        else if (ch === '\\' && open !== "'" ) isEscaped = true
        else if (ch === open) open = ''
        out += ' '
        continue
      }
      if (quotes.includes(ch)) {
        open = ch
        out += ' '
        continue
      }
      out += ch
    }
    return out
  }

  private static mentionsAssistant(text: string): boolean {
    const cleaned = text.replace(Rules.TECHNICAL_TOKENS, ' ')
    if (Rules.FORBIDDEN_ATTRIBUTION.test(cleaned) || Rules.MODEL_ATTRIBUTION.test(cleaned)) return true
    return Rules.snapshot.manifest.hooks.blockModelNames === true && Rules.ASSISTANT_NAMES.test(cleaned)
  }

  private static artefactText(command: string): string {
    try {
      const { segments, docs } = Rules.shellSegments(command)
      const texts: string[] = []
      let isArtefact = false
      for (const raw of segments) {
        const words = [...raw]
        while (words.length > 0 && /^\w+=/.test(words[0] ?? '')) words.shift()
        const tool = words.shift()
        if (tool === 'git') {
          const found = Rules.gitTexts(words)
          if (found !== undefined) {
            isArtefact = true
            texts.push(...found)
          }
        } else if (tool === 'gh' || tool === 'glab' || tool === 'az') {
          if (!Rules.REVIEW_REQUEST.test(words.slice(0, 2).join(' '))) continue
          isArtefact = true
          texts.push(...Rules.flagValues(words, Rules.REQUEST_FLAGS))
        }
      }
      return (isArtefact ? [...texts, ...docs] : texts).join('\n')
    } catch {
      return ''
    }
  }

  private static gitTexts(args: string[]): string[] | undefined {
    const rest = [...args]
    while (rest.length > 0 && rest[0]?.startsWith('-')) rest.splice(0, rest[0] === '-C' || rest[0] === '-c' ? 2 : 1)
    const sub = rest.shift()
    if (sub === 'commit' || sub === 'tag') return Rules.flagValues(rest, Rules.MESSAGE_FLAGS)
    if (sub === 'checkout' || sub === 'switch') {
      const i = rest.findIndex(w => ['-b', '-B', '-c', '-C'].includes(w))
      const name = i >= 0 ? rest[i + 1] : undefined
      return name === undefined ? undefined : [name]
    }
    if (sub === 'branch') {
      if (rest.some(w => w.startsWith('-') && !['-f', '--force', '-t', '--track'].includes(w))) return undefined
      const names = rest.filter(w => !w.startsWith('-'))
      return names.length === 0 ? undefined : names
    }
    return undefined
  }

  private static flagValues(words: string[], flags: readonly string[]): string[] {
    const values: string[] = []
    for (let i = 0; i < words.length; i++) {
      const w = words[i] ?? ''
      const eq = w.indexOf('=')
      if (w.startsWith('--') && eq > 0 && flags.includes(w.slice(0, eq))) values.push(w.slice(eq + 1))
      else if (flags.includes(w) && words[i + 1] !== undefined) values.push(words[++i] ?? '')
      else if (/^-[A-Za-z]*m$/.test(w) && flags.includes('-m') && words[i + 1] !== undefined) values.push(words[++i] ?? '')
      else if (/^-m.+/.test(w) && flags.includes('-m')) values.push(w.slice(2))
    }
    return values
  }

  private static shellSegments(command: string): { segments: string[][]; docs: string[] } {
    const docs: string[] = []
    const source = command.replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n([\s\S]*?)\n\s*\2\s*(?=\n|$)/g, (_all, _q, _tag, body: string) => {
      docs.push(body)
      return '\n'
    })
    const segments: string[][] = []
    let words: string[] = []
    let word = ''
    let isWord = false
    let quote = ''
    const endWord = (): void => {
      if (isWord) words.push(word)
      word = ''
      isWord = false
    }
    const endSegment = (): void => {
      endWord()
      if (words.length > 0) segments.push(words)
      words = []
    }
    for (let i = 0; i < source.length; i++) {
      const ch = source[i] ?? ''
      if (quote !== '') {
        if (ch === quote) quote = ''
        else if (ch === '\\' && quote === '"' && i + 1 < source.length) word += source[++i] ?? ''
        else word += ch
      } else if (ch === '"' || ch === "'") {
        quote = ch
        isWord = true
      } else if (ch === '\\' && i + 1 < source.length) {
        word += source[++i] ?? ''
        isWord = true
      } else if (/\s/.test(ch) && ch !== '\n') endWord()
      else if (ch === '\n' || ch === ';' || ch === '&' || ch === '|') endSegment()
      else {
        word += ch
        isWord = true
      }
    }
    endSegment()
    return { segments, docs }
  }

  static normalize(path: string): string {
    const p = path.replace(/\\/g, '/')
    if (Rules.root !== '' && p.startsWith(`${Rules.root}/`)) return p.slice(Rules.root.length + 1)
    const roots = Rules.snapshot.manifest.code.roots
    if (roots !== '') {
      try {
        const anchor = p.match(new RegExp(`(^|/)(${roots})`))
        if (anchor) return p.slice(anchor.index + (anchor[1]?.length ?? 0))
      } catch {
        return p
      }
    }
    return p.replace(/^\.\//, '')
  }

  private static isOutsideCode(path: string): boolean {
    return /(^|\/)\.claude\/|\.md$|\.json$|\.ya?ml$/.test(path) || !Project.matches(Rules.snapshot.manifest.code.extensions, path)
  }

  private static firstLine(text: string): string {
    return (text.split(/\r?\n/)[0] ?? '').slice(0, 160)
  }
}
