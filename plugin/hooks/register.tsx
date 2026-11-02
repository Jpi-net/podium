import { atom, read, update } from 'claude-code'
import type {
  AgentInfo,
  Atom,
  Elements,
  FsEntry,
  FsStat,
  ProcessRunInit,
  ProcessRunResult,
  Register,
  RenderElement,
  Timer,
  ToastOptions,
  UiBlitArgs,
  UiBlitResult,
  UiNotifyResult,
} from 'claude-code'

import type {
  FlowAgent,
  FlowAlert,
  FlowContext,
  FlowEvent,
  FlowEventKind,
  FlowMain,
  FlowReview,
  FlowStatus,
  FlowTab,
  FlowUsage,
  FlowVerif,
  FlowVerifStep,
  FlowView,
  HistoryMode,
  RuleId,
  VerifKey,
  VerifStatus,
} from '../types'
import { Accessories } from './accessories'
import { Canvas, type Encoded, type Point, type RenderMode, type Rgb } from './canvas'
import { WeatherFx } from './weather'
import { Effects, type Ambience, type Celebration, type CelebrationKind, type Holiday, type TimeOfDay } from './effects'
import { Project, type AgentDef, type CommandDef, type Manifest, type ProjectSnapshot, type RoleId } from './project'
import { Robots } from './robots'
import { Rules, type RuleHit } from './rules'
import { Scene, type GraphLabel, type GraphResult, type ToolKind } from './scene'
import { Theme } from './theme'

type Ui = Elements['terminal']
type Loose = Record<string, unknown>
type Pending = { keys: VerifKey[]; at: number; path: string; agentId: string; isBackground: boolean; previous: string; isNewFile: boolean; command: string; gitBefore: string; before: Partial<FlowVerif> }
type BackgroundVerif = { keys: VerifKey[]; agentId: string; at: number; command: string }
type TaskNotification = { taskId: string; status: string; body: string; outputFile: string }
type PhaseState = 'pending' | 'running' | 'done' | 'failed'
type PhaseStat = { name: string; total: number; finished: number; state: PhaseState }
type HeaderPart = { text: string; color: Rgb }
type GraphCache = { key: string; result: GraphResult }
type Change<T> = (change: (value: T) => T) => Promise<T>
type Io = {
  agents: Change<FlowAgent[]>
  events: Change<FlowEvent[]>
  alerts: Change<FlowAlert[]>
  usage: Change<FlowUsage[]>
  reviews: Change<FlowReview[]>
  verif: Change<FlowVerif>
  main: Change<FlowMain>
  context: Change<FlowContext>
  view: Change<FlowView>
  readAlerts: () => Promise<FlowAlert[]>
  readVerif: () => Promise<FlowVerif>
  toast: (text: string, options?: ToastOptions) => void
  notify: (text: string, title: string) => Promise<UiNotifyResult>
  snapshot: () => Promise<Snapshot>
  status: (text: string | undefined) => void
  storeGet: (key: string) => Promise<unknown>
  storeSet: (key: string, value: unknown) => Promise<void>
  run: (argv: readonly string[], init?: ProcessRunInit) => Promise<ProcessRunResult>
  now: () => Promise<number>
  list: (path: string) => Promise<FsEntry[]>
  read: (path: string) => Promise<string>
  stat: (path: string) => Promise<FsStat>
  commands: () => Promise<CommandDef[]>
  fill: (text: string) => Promise<void>
  agentList: () => Promise<AgentInfo[]>
  blit: (args: UiBlitArgs) => Promise<UiBlitResult>
  every: (ms: number, fn: () => void) => Timer
  open: () => Promise<boolean>
  invalidate: () => void
  termProgram: () => Promise<string | undefined>
  term: () => Promise<string | undefined>
}

const PANE = 'maestro-stage'

const agentsAtom = atom({ plugin: 'maestro', key: 'agents' } as const, [], { shape: 'agents-1' })
const eventsAtom = atom({ plugin: 'maestro', key: 'events' } as const, [], { shape: 'events-1' })
const alertsAtom = atom({ plugin: 'maestro', key: 'alerts' } as const, [], { shape: 'alerts-1' })
const usageAtom = atom({ plugin: 'maestro', key: 'usage' } as const, [], { shape: 'usage-1' })
const reviewsAtom = atom({ plugin: 'maestro', key: 'reviews' } as const, [], { shape: 'reviews-2' })
const accessoryAtom = atom({ plugin: 'maestro', key: 'accessory' } as const, '', { shape: 'accessory-1' })
const verifAtom = atom(
  { plugin: 'maestro', key: 'verif' } as const,
  {
    build: { status: 'idle', at: 0, durationMs: 0, detail: '', agentId: '' },
    format: { status: 'idle', at: 0, durationMs: 0, detail: '', agentId: '' },
    lint: { status: 'idle', at: 0, durationMs: 0, detail: '', agentId: '' },
    unit: { status: 'idle', at: 0, durationMs: 0, detail: '', agentId: '' },
    integ: { status: 'idle', at: 0, durationMs: 0, detail: '', agentId: '' },
    front: { status: 'idle', at: 0, durationMs: 0, detail: '', agentId: '' },
    e2e: { status: 'idle', at: 0, durationMs: 0, detail: '', agentId: '' },
  },
  { shape: 'verif-3' },
)
const mainAtom = atom(
  { plugin: 'maestro', key: 'main' } as const,
  { tool: '', toolCount: 0, isBusy: false, busySince: 0, model: '' },
  { shape: 'main-1' },
)
const contextAtom = atom(
  { plugin: 'maestro', key: 'context' } as const,
  {
    branch: '',
    wi: '',
    base: 'master',
    fetchAgeMs: -1,
    ahead: 0,
    behind: 0,
    changes: 0,
    layers: [],
    relatedBranches: [],
    v1Files: 0,
    v2Files: 0,
    hasEspaces: false,
    isArm: false,
    workMs: 0,
    sessionWorkMs: 0,
    schemaEditedAt: 0,
    imageBuiltAt: 0,
    codeEditedAt: 0,
    editsSinceVerif: 0,
    refreshedAt: 0,
    staleCommitAt: 0,
  },
  { shape: 'context-4' },
)
const viewAtom = atom(
  { plugin: 'maestro', key: 'view' } as const,
  { tab: 'flux', mode: 'journal', filter: 'essential', isWhyShown: false, isReplaying: false, replaySpeed: 8, isClosed: false },
  { shape: 'view-5' },
)

class Runtime {
  static frame = 0
  static epoch = 0
  static lastTickAt = 0
  static layoutAt = 0
  static lastBlitAt = 0
  static fps = 60
  static fpsLimit = 60
  static runStartedAt = 0
  static slowTicks = 0
  static ticker: Timer | undefined
  static tickMs = 0
  static retargetAt = 0
  static mode: 'graph' | 'lanes' | 'none' = 'none'
  static columns = 0
  static rows = 0
  static agents: FlowAgent[] = []
  static events: FlowEvent[] = []
  static main: FlowMain = { tool: '', toolCount: 0, isBusy: false, busySince: 0, model: '' }
  static view: FlowView = { tab: 'flux', mode: 'journal', filter: 'essential', isWhyShown: false, isReplaying: false, replaySpeed: 8, isClosed: false }
  static context: FlowContext | undefined
  static replayAt = 0
  static replayFrom = 0
  static replayTo = 0
  static pulses = new Map<string, number>()
  static pending = new Map<string, Pending>()
  static backgroundVerifs = new Map<string, BackgroundVerif>()
  static gitDir = ''
  static models = new Map<string, string>()
  static project: ProjectSnapshot = Project.resolve(undefined, [], [], false)
  static cwd = ''
  static timers: Timer[] = []
  static lastActivity = 0
  static sessionWorkMs = 0
  static wiSessionMs = 0
  static wiBase = 0
  static wi = ''
  static seq = 0
  static isTicking = false
  static isRefreshing = false
  static queue: Promise<void> = Promise.resolve()
  static buffer: FlowEvent[] = []
  static isFlushScheduled = false
  static denies = 0
  static invalidatedAt = 0
  static terminalSince = new Map<string, number>()
  static renderMode: RenderMode = 'quad'
  static isRenderForced = false
  static scrollOffset = 0
  static isPlaced = false
  static isWanted = false
  static openAttempts = 0
  static missingSince = new Map<string, number>()
  static ports: Io | undefined
  static positions = new Map<string, Point>()
  static isDisco = false
  static celebrations: Celebration[] = []
  static toolMilestone = 0
  static stageKey = ''
  static stageInvalidatedAt = 0
  static openAgent: (agentId: string) => void = () => undefined
  static lastCelebratedKey = ''
  static lastStamp = 0
  static editedFiles = new Map<string, number>()
  static graphCache: GraphCache | undefined
  static isNotifying = true
  static lastNotifyAt = 0
  static combo = 0
  static comboAt = 0

  static get io(): Io {
    if (!Runtime.ports) throw new Error('maestro: engine ports are not ready')
    return Runtime.ports
  }
}

class Flow {
  static readonly FRAME_MS = 80
  static readonly DEFAULT_FPS = 60
  static readonly MIN_FPS = 10
  static readonly MAX_FPS = 60
  static readonly FPS_STEP = 10
  static readonly GUARD_MIN_FPS = 20
  static readonly AMBIENT_FPS = 20
  static readonly IDLE_FPS = 4
  static readonly RETARGET_MIN_MS = 500
  static readonly SLOW_RATIO = 0.7
  static readonly SLOW_TICKS = 20
  static readonly MAX_TICK_GAP_MS = 250
  static readonly IDLE_GAP_MS = 5 * 60_000
  static readonly MAX_EVENTS = 500
  static readonly MAX_OPEN_ATTEMPTS = 40
  static readonly ORPHAN_MS = 5 * 60_000
  static readonly MAX_ALERTS = 200
  static readonly LIVE_WINDOW_MS = 30 * 60_000
  static readonly SPEEDS = [4, 8, 16, 32, 64]
  static get VERIF_LABELS(): Record<VerifKey, string> {
    const labels = {} as Record<VerifKey, string>
    for (const k of Rules.STEP_ORDER) labels[k] = Rules.verifLabel(k)
    return labels
  }
  static readonly CONTEXT_REFRESH_MS = 15_000
  static readonly BACKGROUND_EXPIRY_MS = 30 * 60_000
  static readonly FETCH_STALE_MS = 24 * 3_600_000
  static readonly BEHIND_WARN = 30
  static readonly STAGE_INVALIDATE_MS = 400
  static readonly MILESTONES = [100, 250, 500, 1000]
  static readonly NOTIFY_GAP_MS = 60_000
  static readonly COMBOS = [4, 6]
  static readonly COMBO_REARM_MS = 10 * 60_000
  static readonly OUTPUT_TAIL_BYTES = 40_000
  static readonly OUTPUT_TAIL_LINES = 200
  static readonly GIT_TREE_COMMAND = /\bgit\s+(merge|pull|rebase|stash\s+(pop|apply)|reset|checkout|switch|cherry-pick)\b/
  static readonly TABS: { id: FlowTab; label: string; short: string; hotkey: string }[] = [
    { id: 'flux', label: 'Flow', short: 'Flow', hotkey: '1' },
    { id: 'livraison', label: 'Delivery', short: 'Deliv.', hotkey: '2' },
    { id: 'historique', label: 'History', short: 'Hist.', hotkey: '3' },
    { id: 'contexte', label: 'Context', short: 'Ctx', hotkey: '4' },
    { id: 'commandes', label: 'Tools', short: 'Tools', hotkey: '5' },
  ]
  static readonly ALIASES: Record<string, { tab: FlowTab; mode?: HistoryMode }> = {
    flow: { tab: 'flux' },
    delivery: { tab: 'livraison' },
    rules: { tab: 'livraison' },
    history: { tab: 'historique' },
    journal: { tab: 'historique', mode: 'journal' },
    timeline: { tab: 'historique', mode: 'couloirs' },
    lanes: { tab: 'historique', mode: 'couloirs' },
    context: { tab: 'contexte' },
    commands: { tab: 'commandes' },
    tools: { tab: 'commandes' },
  }
  static readonly FILTERS = ['essential', 'errors', 'all']
  static readonly SKILL = 'maestro:setup'
  static readonly RUN_FALLBACK_MS = 30 * 60_000

  static field(e: unknown, name: string): string {
    const v = (e as Loose)[name]
    return typeof v === 'string' ? v : ''
  }

  static describe(e: unknown): string {
    const tool = Flow.field(e, 'tool')
    switch (tool) {
      case 'Edit':
      case 'Write':
      case 'Read':
      case 'MultiEdit':
      case 'NotebookEdit':
        return `${tool} ${Theme.basename(Flow.field(e, 'file_path') || Flow.field(e, 'notebook_path'))}`
      case 'Bash':
        return `$ ${(Flow.field(e, 'command').split(/\r?\n/)[0] ?? '').slice(0, 90)}`
      case 'Grep':
      case 'Glob':
        return `${tool} ${Flow.field(e, 'pattern')}`
      case 'Agent':
        return `Agent ${Flow.field(e, 'subagent_type') || 'general-purpose'} · ${Flow.field(e, 'description')}`
      case 'WebSearch':
        return `WebSearch ${Flow.field(e, 'query')}`
      case 'WebFetch':
        return `WebFetch ${Flow.field(e, 'url')}`
      case 'Skill':
        return `Skill ${Flow.field(e, 'skill')}`
      default:
        return tool
    }
  }

  static tabOf(tab: string): { tab: FlowTab; mode?: HistoryMode } {
    const known = Flow.TABS.find(t => t.id === tab)
    if (known) return { tab: known.id }
    return Flow.ALIASES[tab] ?? { tab: 'flux' }
  }

  static agentName(agentId: string): string {
    if (agentId === '') return 'main'
    return Runtime.agents.find(a => a.id === agentId)?.type ?? agentId.slice(0, 8)
  }

  static agentModel(agentId: string): string {
    if (agentId === '') return Runtime.main.model
    return Runtime.agents.find(a => a.id === agentId)?.model ?? ''
  }

  static async setAgents(change: (list: FlowAgent[]) => FlowAgent[]): Promise<void> {
    Runtime.agents = await Runtime.io.agents(change)
  }

  static async setMain(change: (main: FlowMain) => FlowMain): Promise<void> {
    Runtime.main = await Runtime.io.main(change)
  }

  static async setView(change: (view: FlowView) => FlowView): Promise<void> {
    Runtime.view = await Runtime.io.view(change)
  }

  static async setContext(change: (context: FlowContext) => FlowContext): Promise<void> {
    Runtime.context = await Runtime.io.context(change)
  }

  static enqueue(task: () => Promise<void>): Promise<void> {
    Runtime.queue = Runtime.queue.then(task).catch(() => undefined)
    return Runtime.queue
  }

  static async pushEvent(agentId: string, kind: FlowEventKind, label: string, isError: boolean): Promise<void> {
    const at = Date.now()
    Runtime.buffer.push({ id: at * 100 + (Runtime.seq++ % 100), at, agentId, kind, label: label.slice(0, 140), isError })
    if (Runtime.isFlushScheduled) return
    Runtime.isFlushScheduled = true
    await Promise.resolve()
    Runtime.isFlushScheduled = false
    const batch = Runtime.buffer
    Runtime.buffer = []
    if (batch.length === 0) return
    try {
      Runtime.events = await Runtime.io.events(list => [...list, ...batch].slice(-Flow.MAX_EVENTS))
    } catch {
      return
    }
  }

  static prepare(e: unknown): Pending {
    const tool = Flow.field(e, 'tool')
    const command = tool === 'Bash' ? Flow.field(e, 'command') : ''
    return {
      keys: command !== '' ? Rules.verifSteps(command) : [],
      at: Flow.stamp(),
      path: tool === 'Edit' || tool === 'Write' || tool === 'MultiEdit' ? Flow.field(e, 'file_path') : '',
      agentId: Flow.field(e, 'agentId'),
      isBackground: (e as Loose)['run_in_background'] === true,
      previous: '',
      isNewFile: false,
      command,
      gitBefore: '',
      before: {},
    }
  }

  static isTreeCommand(pending: Pending): boolean {
    return Flow.GIT_TREE_COMMAND.test(pending.command)
  }

  static async treeState(): Promise<string> {
    const [head, status] = await Promise.all([Flow.git(['rev-parse', 'HEAD']), Flow.git(['status', '--porcelain'])])
    return `${head}\n${status}`
  }

  static async raise(hits: RuleHit[], file: string, agentId: string): Promise<void> {
    if (hits.length === 0) return
    const at = Date.now()
    const fresh: FlowAlert[] = []
    await Runtime.io.alerts(list => {
      fresh.length = 0
      const added = hits
        .filter(hit => !list.some(a => a.rule === hit.rule && a.file === file && a.agentId === agentId && a.detail === hit.detail))
        .map((hit, i): FlowAlert => ({ id: `${at}-${i}-${hit.rule}`, at, level: hit.level, rule: hit.rule, file, agentId, detail: hit.detail.slice(0, 240) }))
      fresh.push(...added)
      return [...list, ...added].slice(-Flow.MAX_ALERTS)
    })
    for (const alert of fresh) {
      await Flow.pushEvent(agentId, 'alert', `${Rules.label(alert.rule)} · ${Theme.basename(file)}`, alert.level === 'error')
      if (alert.level === 'error') {
        void Runtime.io.toast(`maestro ✗ ${Rules.label(alert.rule)} · ${Theme.basename(file) || alert.detail}`, { timeoutMs: 6000 })
      }
    }
    await Flow.publishStatus()
  }

  static async publishStatus(): Promise<void> {
    const alerts = await Runtime.io.readAlerts()
    const running = Runtime.agents.filter(a => a.status === 'running').length
    const errors = alerts.filter(a => a.level === 'error').length
    const warns = alerts.length - errors
    if (running === 0 && alerts.length === 0) {
      Runtime.io.status(undefined)
      return
    }
    const parts = [running > 0 ? `◆ ${running} active agent${running > 1 ? 's' : ''}` : '◇ idle']
    if (errors > 0) parts.push(`✗ ${errors} error${errors > 1 ? 's' : ''}`)
    if (warns > 0) parts.push(`! ${warns} alert${warns > 1 ? 's' : ''}`)
    Runtime.io.status(`Maestro · ${parts.join(' · ')}`)
  }

  static celebrate(kind: CelebrationKind, text: string): void {
    Runtime.celebrations = [...Runtime.celebrations, { kind, at: Date.now() }].slice(-10)
    Runtime.io.toast(text, { timeoutMs: 5000 })
  }

  static notify(text: string): void {
    if (!Runtime.isNotifying) return
    const now = Date.now()
    if (Runtime.lastNotifyAt > 0 && now - Runtime.lastNotifyAt < Flow.NOTIFY_GAP_MS) return
    Runtime.lastNotifyAt = now
    void Runtime.io.notify(text, 'Maestro').catch(() => undefined)
  }

  static async setNotifying(isOn: boolean): Promise<void> {
    Runtime.isNotifying = isOn
    try {
      await Runtime.io.storeSet('notifications', isOn)
    } finally {
      Runtime.io.invalidate()
    }
  }

  static async checkCombo(): Promise<void> {
    const running = Runtime.agents.filter(a => a.status === 'running').length
    const level = Flow.COMBOS.filter(c => running >= c).pop() ?? 0
    if (level === 0) {
      Runtime.combo = 0
      return
    }
    if (level <= Runtime.combo) return
    const now = await Runtime.io.now()
    if (Runtime.combo === 0 && Runtime.comboAt > 0 && now - Runtime.comboAt < Flow.COMBO_REARM_MS) return
    if (Runtime.combo === 0) Runtime.comboAt = now
    Runtime.combo = level
    Flow.celebrate('fireworks', `Combo ×${level}: ${level} experts in parallel`)
  }

  static isCelebrating(now: number): boolean {
    return Runtime.celebrations.some(c => now - c.at < Effects.CELEBRATION_MS)
  }

  static toolTotal(): number {
    return Runtime.main.toolCount + Runtime.agents.reduce((s, a) => s + a.toolCount, 0)
  }

  static checkMilestone(): void {
    const total = Flow.toolTotal()
    const reached = Flow.MILESTONES.filter(m => total >= m && m > Runtime.toolMilestone)
    const top = reached[reached.length - 1]
    if (top === undefined) return
    Runtime.toolMilestone = top
    Flow.celebrate('fireworks', `maestro: ${top} tool calls this session, well done!`)
  }

  static checkAllGreen(verif: FlowVerif): void {
    const key = Rules.shouldCelebrate(verif, Runtime.lastCelebratedKey, Runtime.context?.codeEditedAt ?? 0, Date.now())
    if (key === undefined) return
    Runtime.lastCelebratedKey = key
    Flow.celebrate('confetti', `maestro: all green, ${key.split(',').length} verification steps passed`)
  }

  static stamp(): number {
    Runtime.lastStamp = Math.max(Date.now(), Runtime.lastStamp + 1)
    return Runtime.lastStamp
  }

  static async verifCompleted(startedAt: number): Promise<void> {
    for (const [path, at] of Array.from(Runtime.editedFiles.entries())) {
      if (at < startedAt) Runtime.editedFiles.delete(path)
    }
    const count = Runtime.editedFiles.size
    if ((Runtime.context?.editsSinceVerif ?? 0) !== count) await Flow.setContext(c => ({ ...c, editsSinceVerif: count }))
  }

  static async codeEdited(path: string): Promise<void> {
    const at = Flow.stamp()
    Runtime.editedFiles.set(path, at)
    await Flow.setContext(c => ({ ...c, codeEditedAt: at, editsSinceVerif: Runtime.editedFiles.size }))
  }

  static async treeChanged(pending: Pending): Promise<void> {
    if (pending.gitBefore === '') return
    const after = await Flow.treeState()
    if (after === pending.gitBefore) return
    const at = Flow.stamp()
    await Flow.setContext(c => ({ ...c, codeEditedAt: at }))
    void Flow.pushEvent(pending.agentId, 'verif', 'Code changed by git: verification to rerun', false)
  }

  static async warnDelivery(command: string, agentId: string): Promise<void> {
    if (!Rules.isDelivery(command)) return
    const gaps = Rules.deliveryGaps(await Runtime.io.readVerif(), Runtime.context?.codeEditedAt ?? 0, Flow.VERIF_LABELS)
    const isCommit = /\bgit\s+commit\b/.test(command)
    if (isCommit) {
      const at = gaps.length > 0 ? Date.now() : 0
      await Flow.setContext(c => ({ ...c, staleCommitAt: at }))
    }
    if (gaps.length === 0) return
    Runtime.io.toast('maestro ! Delivery with a stale verification', { timeoutMs: 6000 })
    await Flow.pushEvent(agentId, 'alert', `Delivery with a stale verification: ${gaps.slice(0, 3).join(', ')}`, false)
  }

  static touch(): void {
    const now = Date.now()
    const gap = now - Runtime.lastActivity
    if (Runtime.lastActivity > 0 && gap > 0 && gap < Flow.IDLE_GAP_MS) {
      Runtime.sessionWorkMs += gap
      Runtime.wiSessionMs += gap
    }
    Runtime.lastActivity = now
  }

  static async persistWork(): Promise<void> {
    if (Runtime.wi === '') return
    const total = Runtime.wiBase + Runtime.wiSessionMs
    try {
      await Runtime.io.storeSet(`wi-time:${Runtime.wi}`, total)
      if (Runtime.context && (Runtime.context.workMs !== total || Runtime.context.sessionWorkMs !== Runtime.sessionWorkMs)) {
        await Flow.setContext(c => ({ ...c, workMs: total, sessionWorkMs: Runtime.sessionWorkMs }))
      }
    } catch {
      return
    }
  }

  static async git(args: string[]): Promise<string> {
    try {
      const r = await Runtime.io.run(['git', '--no-optional-locks', ...args], { timeoutMs: 10_000 })
      return r.exitCode === 0 ? r.stdout.trim() : ''
    } catch {
      return ''
    }
  }

  private static pickBase(cands: { name: string; distance: number }[], branch: string, base: string): string {
    const git = Runtime.project.manifest.git
    if ((git.counterpart !== undefined && git.counterpart !== '' && branch.endsWith(git.counterpart)) || Rules.isFeatureBranch(branch)) return base
    let best = base
    let bestDistance = cands.find(c => c.name === base)?.distance ?? Number.POSITIVE_INFINITY
    for (const c of cands) {
      if (c.name === base || !Number.isFinite(c.distance)) continue
      if (c.distance < bestDistance) {
        best = c.name
        bestDistance = c.distance
      }
    }
    return best
  }

  static async defaultBase(): Promise<string> {
    if (Runtime.project.hasManifest) return Runtime.project.manifest.git.base
    const head = await Flow.git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])
    return head.replace(/^origin\//, '') || Runtime.project.manifest.git.base
  }

  static async detectBase(branch: string): Promise<string> {
    const base = await Flow.defaultBase()
    const git = Runtime.project.manifest.git
    if ((git.counterpart !== undefined && git.counterpart !== '' && branch.endsWith(git.counterpart)) || Rules.isFeatureBranch(branch)) return base
    const refs = await Flow.git(['for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin/'])
    const others = refs
      .split(/\r?\n/)
      .map(r => r.trim().replace(/^origin\//, ''))
      .filter(r => r !== '' && r !== base && r !== 'HEAD' && Project.matches(git.support, r))
    const cands = await Promise.all(
      [base, ...others].map(async name => {
        const out = await Flow.git(['rev-list', '--count', `origin/${name}..HEAD`])
        const distance = out === '' ? Number.POSITIVE_INFINITY : Number.parseInt(out, 10)
        return { name, distance: Number.isNaN(distance) ? Number.POSITIVE_INFINITY : distance }
      }),
    )
    return Flow.pickBase(cands, branch, base)
  }

  static async fetchAge(isFull: boolean): Promise<number> {
    try {
      if (isFull || Runtime.gitDir === '') Runtime.gitDir = await Flow.git(['rev-parse', '--git-common-dir'])
      if (Runtime.gitDir === '') return -1
      const stat = await Runtime.io.stat(`${Runtime.gitDir.replace(/[\\/]$/, '')}/FETCH_HEAD`)
      return stat.mtimeMs > 0 ? Math.max(0, Date.now() - stat.mtimeMs) : -1
    } catch {
      return -1
    }
  }

  static async refreshContext(isFull: boolean): Promise<void> {
    if (Runtime.isRefreshing) return
    Runtime.isRefreshing = true
    try {
      const [branch, status] = await Promise.all([Flow.git(['rev-parse', '--abbrev-ref', 'HEAD']), Flow.git(['status', '--porcelain'])])
      const previousContext = Runtime.context
      const isBranchChanged = previousContext === undefined || previousContext.branch !== branch
      const known = previousContext?.base ?? ''
      const base = isFull || isBranchChanged || known === '' ? await Flow.detectBase(branch) : known
      const [counts, fetchAgeMs] = await Promise.all([Flow.git(['rev-list', '--left-right', '--count', `origin/${base}...HEAD`]), Flow.fetchAge(isFull)])
      const [behind, ahead] = counts.split(/\s+/).map(n => Number.parseInt(n, 10) || 0)
      const paths = status
        .split(/\r?\n/)
        .filter(l => l.length > 3)
        .map(l => {
          const raw = l.slice(3)
          const target = raw.includes(' -> ') ? (raw.split(' -> ')[1] ?? raw) : raw
          return target.replace(/^"|"$/g, '')
        })
      const counter = new Map<string, number>()
      for (const p of paths) counter.set(Rules.layer(p), (counter.get(Rules.layer(p)) ?? 0) + 1)
      const layers = Rules.layers().filter(n => counter.has(n)).map(name => ({ name, count: counter.get(name) ?? 0 }))
      const wi = Rules.workItem(branch)
      const previous = Runtime.context
      const isNewBranch = previous === undefined || previous.branch !== branch
      let related = previous?.relatedBranches ?? []
      let hasEspaces = previous?.hasEspaces ?? false
      let isArm = previous?.isArm ?? false
      if (isFull || isNewBranch) {
        const isolation = Runtime.project.manifest.checks.isolation
        const [list, espaces, arch] = await Promise.all([
          wi === '' ? Promise.resolve('') : Flow.git(['branch', '-a', '--list', `*${wi}*`, '--format=%(refname:short)']),
          isolation === undefined ? Promise.resolve('') : isolation.enabledBy === undefined ? Promise.resolve('on') : Flow.git(['grep', '-l', '-m', '1', '-E', isolation.enabledBy.pattern, '--', isolation.enabledBy.path || '.']),
          Runtime.io
            .run(['uname', '-m'], { timeoutMs: 5000 })
            .then(r => r.stdout.trim())
            .catch(() => ''),
        ])
        related = Array.from(new Set(list.split(/\r?\n/).filter(b => b !== '' && b !== branch)))
        hasEspaces = espaces !== ''
        isArm = arch === 'arm64'
      }
      if (wi !== Runtime.wi) {
        await Flow.persistWork()
        Runtime.wi = wi
        Runtime.wiSessionMs = 0
        const stored = wi === '' ? 0 : await Runtime.io.storeGet(`wi-time:${wi}`)
        Runtime.wiBase = typeof stored === 'number' ? stored : 0
      }
      await Flow.setContext(c => ({
        ...c,
        branch,
        wi,
        base,
        fetchAgeMs,
        ahead: ahead ?? 0,
        behind: behind ?? 0,
        changes: paths.length,
        layers,
        relatedBranches: related,
        v1Files: paths.filter(p => Rules.isV1(p)).length,
        v2Files: paths.filter(p => Rules.isV2(p)).length,
        hasEspaces,
        isArm,
        workMs: Runtime.wiBase + Runtime.wiSessionMs,
        sessionWorkMs: Runtime.sessionWorkMs,
        refreshedAt: Date.now(),
      }))
    } catch {
      return
    } finally {
      Runtime.isRefreshing = false
    }
  }

  static async loadProject(): Promise<void> {
    const root = await Flow.safely(() => Runtime.io.list('.claude'), [])
    const raw = await Flow.readText(Project.FILE)
    let manifest: Manifest | undefined
    try {
      manifest = raw === '' ? undefined : Project.parse(JSON.parse(raw), Flow.projectName())
    } catch {
      manifest = undefined
    }
    const agents: AgentDef[] = []
    for (const entry of await Flow.safely(() => Runtime.io.list('.claude/agents'), [])) {
      const name = String((entry as unknown as Loose)['name'] ?? '')
      if (!name.endsWith('.md')) continue
      const def = Project.agentFromMarkdown(name, await Flow.readText(`.claude/agents/${name}`))
      if (def) agents.push(def)
    }
    const commands = await Flow.safely(() => Runtime.io.commands(), [])
    const local: string[] = []
    for (const folder of ['.claude/skills', '.claude/commands']) {
      for (const entry of await Flow.safely(() => Runtime.io.list(folder), [])) {
        const name = String((entry as unknown as Loose)['name'] ?? '')
        if (name === '' || name.startsWith('.')) continue
        local.push(name.replace(/\.md$/, ''))
      }
    }
    Runtime.project = Project.resolve(manifest, agents, commands, root.length > 0 || manifest !== undefined, Flow.projectName(), local)
    for (const a of agents) if (a.model) Runtime.models.set(a.name, a.model)
    Rules.configure(Runtime.project, Runtime.cwd)
    Runtime.graphCache = undefined
    Runtime.io.invalidate()
  }

  static async safely<T>(task: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await task()
    } catch {
      return fallback
    }
  }

  static projectName(): string {
    return Runtime.cwd.replace(/\\/g, '/').split('/').filter(p => p !== '').pop() ?? ''
  }

  static roleCommand(role: RoleId): string | undefined {
    return Project.command(Runtime.project, role)
  }

  static async readText(path: string): Promise<string> {
    try {
      const r = await Runtime.io.read(path)
      return typeof r === 'string' ? r : String((r as unknown as Loose)['text'] ?? '')
    } catch {
      return ''
    }
  }

  static async before(e: unknown, pending: Pending): Promise<void> {
    const agentId = pending.agentId
    const tool = Flow.field(e, 'tool')
    const label = Flow.describe(e)
    const now = pending.at
    Flow.touch()
    if (agentId !== '') {
      Runtime.pulses.set(agentId, now)
      await Flow.setAgents(list =>
        list.map(a => (a.id === agentId ? { ...a, tool: label, toolCount: a.toolCount + 1, status: 'running', endedAt: a.status === 'running' ? a.endedAt : 0 } : a)),
      )
    } else {
      await Flow.setMain(m => ({ ...m, tool: label, toolCount: m.toolCount + 1, isBusy: true, busySince: m.isBusy ? m.busySince : now }))
    }
    Flow.checkMilestone()
    void Flow.pushEvent(agentId, 'tool', label, false)

    const branch = Runtime.context?.branch ?? ''
    if (pending.path !== '') {
      const path = pending.path
      const firstPartial = (text: string, old: string): string[] => {
        const before = new Set(old.split(/\r?\n/).map(l => l.trim()))
        return text.split(/\r?\n/).slice(1).filter(l => l.trim() !== '' && !before.has(l.trim()))
      }
      let added: string[] = []
      let candidates: string[] = []
      if (tool === 'Edit') {
        added = Rules.addedLines(Flow.field(e, 'old_string'), Flow.field(e, 'new_string'))
        candidates = firstPartial(Flow.field(e, 'new_string'), Flow.field(e, 'old_string'))
      }
      if (tool === 'Write') {
        added = Rules.addedLines(pending.previous, Flow.field(e, 'content'))
        candidates = added
      }
      if (tool === 'MultiEdit') {
        const edits = (e as Loose)['edits']
        if (Array.isArray(edits)) {
          added = edits.flatMap(x => Rules.addedLines(Flow.field(x, 'old_string'), Flow.field(x, 'new_string')))
          candidates = edits.flatMap(x => firstPartial(Flow.field(x, 'new_string'), Flow.field(x, 'old_string')))
        }
      }
      const hits = Rules.inspectEdit(path, added, { branch, isNewFile: pending.isNewFile, functionCandidates: candidates })
      const owners = Runtime.agents.filter(a => a.status === 'running' && a.id !== agentId && a.files.includes(path))
      for (const owner of owners) {
        hits.push({ level: 'error', rule: 'partition', detail: `already modified by ${owner.type} (${owner.id.slice(0, 6)})` })
      }
      await Flow.raise(hits, path, agentId)
    }
    if (tool === 'Bash') {
      const command = Flow.field(e, 'command')
      const context = Runtime.context
      const hits = Rules.inspectCommand(command, {
        isArm: context?.isArm ?? false,
        schemaEditedAt: context?.schemaEditedAt ?? 0,
        imageBuiltAt: context?.imageBuiltAt ?? 0,
      })
      await Flow.raise(hits, '', agentId)
      await Flow.warnDelivery(command, agentId)
      if (pending.keys.length > 0) {
        await Runtime.io.verif(v => {
          const out = { ...v }
          for (const key of pending.keys) pending.before[key] = v[key]
          for (const key of pending.keys) out[key] = { status: 'running', at: now, durationMs: 0, detail: '', agentId: pending.agentId }
          return out
        })
        void Flow.pushEvent(agentId, 'verif', `${pending.keys.map(k => Flow.VERIF_LABELS[k]).join(', ')} started${pending.isBackground ? ' (background)' : ''}`, false)
      }
    }
  }

  static async after(e: unknown, ran: unknown, pending: Pending): Promise<void> {
    const r = ran as Loose
    const tool = Flow.field(e, 'tool')
    const deny = typeof r['deny'] === 'string' ? (r['deny'] as string) : ''
    const text = typeof r['text'] === 'string' ? (r['text'] as string) : ''
    const isError = r['isError'] === true || deny !== ''
    const isDenied = deny !== '' || (isError && !/^Exit code \d/.test(text) && Rules.isHookBlock(text.split(/\r?\n/)[0] ?? ''))
    const now = Date.now()

    if (isDenied) {
      await Flow.raise([{ level: 'warn', rule: 'hook', detail: (deny || text).split(/\r?\n/)[0] ?? '' }], pending.path, pending.agentId)
      void Flow.pushEvent(pending.agentId, 'hook', `${tool} denied`, true)
    } else if (isError) {
      void Flow.pushEvent(pending.agentId, 'tool', `${tool} failed`, true)
    }

    if (pending.keys.length > 0) {
      const result = r['result'] as Loose | undefined
      const taskId = typeof result?.['backgroundTaskId'] === 'string' ? (result['backgroundTaskId'] as string) : ''
      const isBackgrounded = pending.isBackground || taskId !== ''
      if (isBackgrounded && !isError) {
        Runtime.backgroundVerifs.set(taskId !== '' ? taskId : `synthetic-${pending.at}-${Runtime.seq++}`, {
          keys: pending.keys,
          agentId: pending.agentId,
          at: pending.at,
          command: pending.command,
        })
      }
      if (isDenied) {
        await Runtime.io.verif(v => {
          const out = { ...v }
          for (const key of pending.keys) {
            const previous = pending.before[key]
            if (previous !== undefined) out[key] = previous
          }
          return out
        })
      } else if (!isBackgrounded || isError) {
        const output = `${text}\n${typeof result?.['stdout'] === 'string' ? result['stdout'] : ''}\n${typeof result?.['stderr'] === 'string' ? result['stderr'] : ''}`
        const isKo = Rules.isFailure(output, isError)
        const detail = isKo ? Rules.failureDetail(output) : ''
        const at = Flow.stamp()
        const verif = await Runtime.io.verif(v => {
          const out = { ...v }
          for (const key of pending.keys) out[key] = { status: isKo ? 'ko' : 'ok', at, durationMs: Math.max(0, at - pending.at), detail, agentId: pending.agentId }
          return out
        })
        await Flow.verifCompleted(pending.at)
        Flow.checkAllGreen(verif)
        const names = pending.keys.map(k => Flow.VERIF_LABELS[k]).join(', ')
        void Flow.pushEvent(pending.agentId, 'verif', `${names} ${isKo ? 'failed' : 'OK'} (${Theme.duration(now - pending.at)})`, isKo)
        if (isKo) {
          void Runtime.io.toast(`maestro ✗ ${names} failed`, { timeoutMs: 6000 })
          Flow.notify(`${names} failed`)
        }
      }
    }

    if (tool === 'Bash' && !isError) {
      const command = Flow.field(e, 'command')
      if (Rules.isImageBuild(command)) await Flow.setContext(c => ({ ...c, imageBuiltAt: now }))
      if (Rules.PR_CREATE.test(command)) {
        Flow.celebrate('rocket', 'maestro: PR created, on its way to review')
        Flow.notify('PR created, on its way to review')
      }
      await Flow.treeChanged(pending)
      if (/\bgit\s+(checkout|switch|commit|merge|pull|reset|stash|rebase|cherry-pick)\b/.test(command)) void Flow.refreshContext(false)
    }

    if (pending.path !== '' && !isError) {
      const path = pending.path
      if (pending.agentId !== '') {
        await Flow.setAgents(list =>
          list.map(a => (a.id === pending.agentId && !a.files.includes(path) ? { ...a, files: [...a.files, path] } : a)),
        )
      }
      if (Rules.isSchema(path)) await Flow.setContext(c => ({ ...c, schemaEditedAt: now }))
      if (Rules.isCodePath(path)) await Flow.codeEdited(path)
      const hasEspaces = Runtime.context?.hasEspaces ?? false
      if (hasEspaces && (Runtime.project.manifest.checks.isolation?.rules ?? []).some(r => Project.matches(r.path, Rules.normalize(path)))) await Flow.raise(Rules.inspectFile(path, await Flow.readText(path), true), path, pending.agentId)
    }
  }

  static async spawned(id: string, type: string, description: string, model: string, parentId: string): Promise<void> {
    if (Runtime.agents.some(a => a.id === id)) return
    const agent: FlowAgent = {
      id,
      type,
      description,
      model: model || Runtime.models.get(type) || '',
      parentId,
      status: 'running',
      startedAt: Date.now(),
      endedAt: 0,
      tool: '',
      toolCount: 0,
      files: [],
      tokensIn: 0,
      tokensOut: 0,
    }
    await Flow.setAgents(list => (list.some(a => a.id === id) ? list : [...list, agent].slice(-120)))
    await Flow.pushEvent(parentId, 'spawn', `→ ${type} · ${description}`, false)
    await Flow.checkCombo()
    await Flow.publishStatus()
  }

  static async ended(id: string, status: FlowStatus): Promise<void> {
    const now = Date.now()
    let changed: FlowAgent | undefined
    await Flow.setAgents(list => {
      changed = undefined
      return list.map(a => {
        if (a.id !== id || a.status !== 'running') return a
        changed = a
        return { ...a, status, endedAt: now, tool: '' }
      })
    })
    Runtime.terminalSince.delete(id)
    const agent = changed
    if (!agent) return
    await Flow.checkCombo()
    const word = status === 'completed' ? 'completed' : status === 'failed' ? 'failed' : 'interrupted'
    void Flow.pushEvent(id, 'end', `${agent.type} ${word} (${Theme.duration(now - agent.startedAt)})`, status === 'failed')
    if (status === 'failed') {
      void Runtime.io.toast(`maestro ✗ ${agent.type} failed`, { timeoutMs: 6000 })
      Flow.notify(`${agent.type} failed`)
    }
    await Flow.publishStatus()
  }

  static async recordReview(id: string, answer: string): Promise<void> {
    const agent = Runtime.agents.find(a => a.id === id)
    if (!agent || !Project.isReviewer(Runtime.project, agent.type) || answer.trim() === '') return
    const review: FlowReview = { agentId: id, type: agent.type, at: Flow.stamp(), ...Rules.review(answer) }
    await Runtime.io.reviews(list => [...list.filter(r => r.agentId !== id), review].slice(-12))
    if (review.verdict === 'FAIL' || review.critical > 0) Flow.notify(`${agent.type}: ${review.verdict || 'review'}${View.reviewCounts(review) !== '' ? ` · ${View.reviewCounts(review)}` : ''}`)
  }

  private static parseTaskNotifications(text: string): TaskNotification[] {
    const found: TaskNotification[] = []
    for (const match of text.matchAll(/<task-notification>([\s\S]*?)(?:<\/task-notification>|$)/g)) {
      const block = match[1] ?? ''
      const tag = (name: string): string => new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(block)?.[1]?.trim() ?? ''
      const taskId = tag('task-id')
      if (taskId === '') continue
      found.push({ taskId, status: tag('status').toLowerCase(), body: [tag('summary'), tag('result')].filter(t => t !== '').join('\n'), outputFile: tag('output-file') })
    }
    return found
  }

  static isTaskNotification(e: unknown): boolean {
    const origin = (e as Loose)['origin'] as Loose | undefined
    return origin?.['kind'] === 'task-notification' || Flow.parseTaskNotifications(Flow.field(e, 'text')).length > 0
  }

  private static mentionsCommand(body: string, command: string): boolean {
    return command
      .split(/&&|\|\||;|\n/)
      .map(part => part.trim())
      .filter(part => part !== '' && Rules.verifSteps(part).length > 0)
      .some(part => body.includes(part) || body.includes(part.slice(0, 40)))
  }

  private static backgroundKey(notification: TaskNotification): string | undefined {
    if (Runtime.backgroundVerifs.has(notification.taskId)) return notification.taskId
    const synthetic = Array.from(Runtime.backgroundVerifs.entries()).filter(([k]) => k.startsWith('synthetic-'))
    const only = synthetic.length === 1 ? synthetic[0] : undefined
    if (only === undefined) return undefined
    return Flow.mentionsCommand(notification.body, only[1].command) ? only[0] : undefined
  }

  static async outputTail(path: string): Promise<string> {
    if (path === '') return ''
    const text = await Flow.readText(path)
    return text.slice(-Flow.OUTPUT_TAIL_BYTES).split(/\r?\n/).slice(-Flow.OUTPUT_TAIL_LINES).join('\n')
  }

  static async settleVerif(entry: BackgroundVerif, status: VerifStatus, now: number, detail = ''): Promise<FlowVerif> {
    return Runtime.io.verif(v => {
      const out = { ...v }
      for (const key of entry.keys) {
        const step = out[key]
        if (step.at === entry.at && (step.status === 'running' || status !== 'stale')) out[key] = { status, at: now, durationMs: now - entry.at, detail, agentId: entry.agentId }
      }
      return out
    })
  }

  static async resolveBackground(text: string): Promise<void> {
    const parsed = Flow.parseTaskNotifications(text)
    const notifications = parsed.length > 0 ? parsed : [{ taskId: '', status: '', body: text, outputFile: '' }]
    for (const notification of notifications) await Flow.resolveOne(notification)
  }

  private static async resolveOne(notification: TaskNotification): Promise<void> {
    const key = Flow.backgroundKey(notification)
    if (key === undefined) return
    const entry = Runtime.backgroundVerifs.get(key)
    Runtime.backgroundVerifs.delete(key)
    if (!entry) return
    const now = Date.now()
    const tail = await Flow.outputTail(notification.outputFile)
    const isKo =
      notification.status === 'failed' || notification.status === 'killed' || Rules.isFailure(notification.body, false) || (tail !== '' && Rules.isFailure(tail, false))
    const detail = isKo ? Rules.failureDetail(`${notification.body}\n${tail}`) : ''
    const verif = await Flow.settleVerif(entry, isKo ? 'ko' : 'ok', Flow.stamp(), detail)
    await Flow.verifCompleted(entry.at)
    Flow.checkAllGreen(verif)
    const names = entry.keys.map(k => Flow.VERIF_LABELS[k]).join(', ')
    void Flow.pushEvent(entry.agentId, 'verif', `Background task ${isKo ? 'failed' : 'completed'}: ${names} (${Theme.duration(now - entry.at)})`, isKo)
    if (isKo) {
      Runtime.io.toast(`maestro ✗ ${names} failed`, { timeoutMs: 6000 })
      Flow.notify(`${names} failed (background task)`)
    }
  }

  static async settleOrphans(): Promise<void> {
    try {
      const tracked = new Set(Array.from(Runtime.backgroundVerifs.values()).flatMap(entry => entry.keys))
      const verif = await Runtime.io.readVerif()
      const orphans = (Object.keys(verif) as VerifKey[]).filter(k => verif[k].status === 'running' && !tracked.has(k))
      if (orphans.length === 0) return
      await Runtime.io.verif(v => {
        const out = { ...v }
        for (const k of orphans) if (out[k].status === 'running') out[k] = { ...out[k], status: 'stale' }
        return out
      })
    } catch {
      return
    }
  }

  static async expireBackground(): Promise<void> {
    const now = Date.now()
    for (const [key, entry] of Array.from(Runtime.backgroundVerifs.entries())) {
      if (now - entry.at < Flow.BACKGROUND_EXPIRY_MS) continue
      Runtime.backgroundVerifs.delete(key)
      await Flow.settleVerif(entry, 'stale', now)
    }
    const verif = await Runtime.io.readVerif()
    const isOrphan = (Object.keys(verif) as VerifKey[]).some(k => verif[k].status === 'running' && now - verif[k].at >= Flow.BACKGROUND_EXPIRY_MS)
    if (!isOrphan) return
    await Runtime.io.verif(v => {
      const out = { ...v }
      for (const k of Object.keys(out) as VerifKey[]) {
        if (out[k].status === 'running' && now - out[k].at >= Flow.BACKGROUND_EXPIRY_MS) out[k] = { ...out[k], status: 'stale' }
      }
      return out
    })
  }

  static async completed(e: unknown): Promise<void> {
    const x = e as Loose
    const agentId = Flow.field(e, 'agentId')
    const usage = x['usage'] as Loose | undefined
    const reason = Flow.field(e, 'reason')
    const durationMs = typeof x['durationMs'] === 'number' ? (x['durationMs'] as number) : 0
    const answer = Flow.field(e, 'answer') || Flow.field(e, 'text')
    const num = (k: string): number => (usage && typeof usage[k] === 'number' ? (usage[k] as number) : 0)
    const reported = typeof usage?.['model'] === 'string' ? (usage['model'] as string) : ''
    const model = reported || Flow.agentModel(agentId)
    if (usage) {
      await Runtime.io.usage(list => {
        const found = list.find(u => u.model === model)
        const base: FlowUsage = found ?? { model, tokensIn: 0, tokensOut: 0, cacheRead: 0, cacheWrite: 0, turns: 0, durationMs: 0 }
        const next: FlowUsage = {
          ...base,
          tokensIn: base.tokensIn + num('input_tokens'),
          tokensOut: base.tokensOut + num('output_tokens'),
          cacheRead: base.cacheRead + num('cache_read_input_tokens'),
          cacheWrite: base.cacheWrite + num('cache_creation_input_tokens'),
          turns: base.turns + 1,
          durationMs: base.durationMs + durationMs,
        }
        return [...list.filter(u => u.model !== model), next]
      })
    }
    if (agentId === '') {
      await Flow.setMain(m => ({ ...m, isBusy: false, tool: '', model: model || m.model }))
      await Flow.persistWork()
      return
    }
    if (usage) {
      await Flow.setAgents(list =>
        list.map(a =>
          a.id === agentId
            ? {
                ...a,
                model: a.model || model,
                tokensIn: a.tokensIn + num('input_tokens') + num('cache_read_input_tokens') + num('cache_creation_input_tokens'),
                tokensOut: a.tokensOut + num('output_tokens'),
              }
            : a,
        ),
      )
    }
    const isAborted = x['isAborted'] === true
    const status: FlowStatus = isAborted ? 'killed' : reason === 'refusal' || reason === 'error' ? 'failed' : 'completed'
    await Flow.recordReview(agentId, answer)
    await Flow.ended(agentId, status)
  }

  static async sync(): Promise<void> {
    void Flow.ensurePane()
    try {
      const list = await Runtime.io.agentList()
      for (const info of list) {
        const known = Runtime.agents.find(a => a.id === info.id)
        if (!known) {
          if (info.status === 'completed' || info.status === 'failed' || info.status === 'killed') continue
          await Flow.spawned(info.id, info.type, info.description, '', info.parentId ?? '')
          continue
        }
        const isTerminal = info.status === 'completed' || info.status === 'failed' || info.status === 'killed'
        if (known.status !== 'running') {
          if (info.status === 'running') await Flow.setAgents(all => all.map(a => (a.id === info.id ? { ...a, status: 'running', endedAt: 0 } : a)))
          continue
        }
        if (!isTerminal) {
          Runtime.terminalSince.delete(info.id)
          continue
        }
        const since = Runtime.terminalSince.get(info.id)
        if (since === undefined) Runtime.terminalSince.set(info.id, Date.now())
        else if (Date.now() - since >= 4000) await Flow.ended(info.id, info.status as FlowStatus)
      }
      const ids = new Set(list.map(i => i.id))
      const now = Date.now()
      for (const id of Array.from(Runtime.missingSince.keys())) if (ids.has(id)) Runtime.missingSince.delete(id)
      const orphans = Runtime.agents.filter(a => {
        if (a.status !== 'running' || ids.has(a.id)) return false
        const since = Runtime.missingSince.get(a.id) ?? now
        Runtime.missingSince.set(a.id, since)
        const lastActivity = Math.max(a.startedAt, Runtime.pulses.get(a.id) ?? 0)
        return now - since >= Flow.ORPHAN_MS && now - lastActivity >= Flow.ORPHAN_MS
      })
      for (const orphan of orphans) {
        Runtime.missingSince.delete(orphan.id)
        await Flow.ended(orphan.id, 'completed')
      }
    } catch {
      return
    }
  }

  static firstAt(): number {
    const starts = [...Runtime.agents.map(a => a.startedAt), ...Runtime.events.slice(0, 1).map(e => e.at)].filter(t => t > 0)
    return starts.length > 0 ? Math.min(...starts) : Date.now() - 60_000
  }

  static isReplay(): boolean {
    return Runtime.replayAt > 0
  }

  static async detectRenderMode(): Promise<void> {
    const stored = await Runtime.io.storeGet('render-mode')
    if (stored === 'hd') await Runtime.io.storeSet('render-mode', '')
    if (stored === 'quad' || stored === 'half') {
      Runtime.renderMode = stored
      Runtime.isRenderForced = true
    } else {
      Runtime.renderMode = 'quad'
      Runtime.isRenderForced = false
    }
    Flow.restartTicker()
  }

  static async forceRenderMode(mode: RenderMode | 'auto'): Promise<void> {
    if (mode === 'auto' || mode === 'hd') {
      await Runtime.io.storeSet('render-mode', '')
      Runtime.renderMode = 'quad'
      Runtime.isRenderForced = false
    } else {
      await Runtime.io.storeSet('render-mode', mode)
      Runtime.renderMode = mode
      Runtime.isRenderForced = true
    }
    Flow.restartTicker()
    Runtime.denies = 0
    Runtime.io.invalidate()
  }

  static frameAt(at: number): number {
    return (at - Runtime.epoch) / Flow.FRAME_MS
  }

  static fpsCap(): number {
    return Flow.MAX_FPS
  }

  static activityMode(now: number): 'work' | 'ambient' | 'idle' {
    if (Flow.isAnimated(now)) return 'work'
    const isAwake = Runtime.lastActivity <= 0 || now - Runtime.lastActivity < Scene.SLEEP_AFTER_MS
    return isAwake ? 'ambient' : 'idle'
  }

  static effectiveFps(now: number = Date.now()): number {
    const mode = Flow.activityMode(now)
    const ceiling = Math.min(Runtime.fps, Flow.fpsCap())
    if (mode === 'work') return Math.min(ceiling, Runtime.fpsLimit)
    return Math.min(ceiling, mode === 'ambient' ? Flow.AMBIENT_FPS : Flow.IDLE_FPS)
  }

  static isFpsLowered(now: number = Date.now()): boolean {
    return Flow.activityMode(now) === 'work' && Runtime.fpsLimit < Math.min(Runtime.fps, Flow.fpsCap())
  }

  static tickInterval(now: number): number {
    return Math.round(1000 / Flow.effectiveFps(now))
  }

  static fpsTag(): string {
    return `${Runtime.renderMode.toUpperCase()} ${Flow.effectiveFps()}${Flow.isFpsLowered() ? '↓' : ''}`
  }

  static parseFps(value: unknown): number | undefined {
    const n = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value.trim()) : Number.NaN
    if (!Number.isInteger(n) || n < Flow.MIN_FPS || n > Flow.MAX_FPS) return undefined
    return n
  }

  static async dressUp(worn: string, isChange: boolean): Promise<string> {
    const stored = await Runtime.io.storeGet('accessories').catch(() => undefined)
    const recent = Array.isArray(stored) ? stored.filter((v): v is string => typeof v === 'string') : []
    const id = !isChange && Accessories.find(worn) ? worn : Accessories.pick(recent, Math.random())
    if (id !== worn) await Runtime.io.storeSet('accessories', Accessories.remember(recent, id)).catch(() => undefined)
    Robots.wear(id)
    Runtime.graphCache = undefined
    return id
  }

  static async loadFps(): Promise<void> {
    Runtime.fps = Flow.parseFps(await Runtime.io.storeGet('fps').catch(() => undefined)) ?? Flow.DEFAULT_FPS
    Runtime.fpsLimit = Flow.MAX_FPS
    Runtime.slowTicks = 0
  }

  static async setFps(fps: number): Promise<void> {
    Runtime.fps = fps
    Runtime.fpsLimit = Flow.MAX_FPS
    Runtime.slowTicks = 0
    await Runtime.io.storeSet('fps', fps)
    Flow.restartTicker()
    Runtime.io.invalidate()
  }

  static restartTicker(): void {
    if (!Runtime.ports) return
    Runtime.ticker?.cancel()
    Runtime.ticker = undefined
    const now = Date.now()
    Runtime.tickMs = Flow.tickInterval(now)
    Runtime.retargetAt = now
    try {
      Runtime.ticker = Runtime.io.every(Runtime.tickMs, () => void Flow.tick())
    } catch {
      Runtime.ticker = undefined
    }
  }

  static retarget(now: number): void {
    if (now - Runtime.retargetAt < Flow.RETARGET_MIN_MS) return
    if (Flow.tickInterval(now) === Runtime.tickMs) return
    Flow.restartTicker()
  }

  static measure(costMs: number, now: number): void {
    if (Flow.activityMode(now) !== 'work') {
      Runtime.slowTicks = 0
      return
    }
    const budget = 1000 / Flow.effectiveFps(now)
    if (costMs <= budget * Flow.SLOW_RATIO) {
      Runtime.slowTicks = 0
      return
    }
    Runtime.slowTicks++
    if (Runtime.slowTicks < Flow.SLOW_TICKS) return
    Runtime.slowTicks = 0
    const current = Flow.effectiveFps(now)
    if (current <= Flow.GUARD_MIN_FPS) return
    Runtime.fpsLimit = Math.max(Flow.GUARD_MIN_FPS, current - Flow.FPS_STEP)
    Flow.restartTicker()
    Runtime.io.invalidate()
  }

  static ambience(now: number, at: number): Ambience {
    const idleMs = Runtime.lastActivity > 0 ? Math.max(0, now - Runtime.lastActivity) : 0
    const isDebuggerActive = Runtime.agents.some(a => a.type === 'debugger' && a.status === 'running')
    return Effects.ambience(new Date(at), Runtime.isDisco, idleMs, isDebuggerActive, Runtime.celebrations)
  }

  static stageKey(now: number): string {
    return Runtime.agents
      .filter(a => Scene.isOnStage(a, now))
      .map(a => a.id)
      .join(',')
  }

  static cells(now: number): GraphResult {
    const isLive = !Flow.isReplay()
    const at = isLive ? now : Runtime.replayAt
    const base = {
      agents: isLive ? Runtime.agents : Scene.visibleAt(Runtime.agents, at),
      events: Runtime.events,
      main: Runtime.main,
      at,
      isLive,
      frame: Runtime.frame,
      dt: Flow.layoutDt(now),
      pulses: Runtime.pulses,
      columns: Runtime.columns,
      rows: Runtime.rows,
      mode: Runtime.renderMode,
      ambience: Flow.ambience(now, at),
      positions: Runtime.positions,
    }
    if (Runtime.mode === 'lanes') {
      const from = isLive ? Math.max(Flow.firstAt(), now - Flow.LIVE_WINDOW_MS) : Runtime.replayFrom
      const to = isLive ? now : Runtime.replayTo
      return { encoded: Scene.lanes({ ...base, from, to }), labels: [] }
    }
    return Scene.graph(base)
  }

  static layoutDt(now: number): number {
    const dt = Runtime.layoutAt > 0 ? Math.max(0, now - Runtime.layoutAt) : 0
    Runtime.layoutAt = now
    return dt
  }

  static graphKey(): string {
    return `${Runtime.frame}|${Runtime.columns}|${Runtime.rows}|${Runtime.renderMode}|${Runtime.mode}|${Runtime.view.tab}`
  }

  static cachedCells(now: number): GraphResult {
    const key = Flow.graphKey()
    const cached = Runtime.graphCache
    if (cached !== undefined && cached.key === key) return cached.result
    const result = Flow.cells(now)
    Runtime.graphCache = { key, result }
    return result
  }

  static isDormant(now: number): boolean {
    return Runtime.mode === 'none' && Runtime.view.isClosed && now - Runtime.lastActivity > Flow.IDLE_GAP_MS
  }

  static isAnimated(now: number): boolean {
    if (Flow.isReplay()) return true
    if (Runtime.main.isBusy) return true
    if (Flow.isCelebrating(now)) return true
    if (WeatherFx.isAnimated(Runtime.events, Flow.isReplay() ? Runtime.replayAt : now)) return true
    if (Scene.hasReaction(Runtime.agents, Flow.isReplay() ? Runtime.replayAt : now)) return true
    if (Runtime.isDisco) return true
    if (Runtime.agents.some(a => a.status === 'running' || Scene.isOnStage(a, now))) return true
    return false
  }

  static syncStage(now: number): void {
    if (Runtime.mode !== 'graph' || Flow.isReplay()) return
    const key = Flow.stageKey(now)
    if (key === Runtime.stageKey) return
    if (now - Runtime.stageInvalidatedAt < Flow.STAGE_INVALIDATE_MS) return
    Runtime.stageKey = key
    Runtime.stageInvalidatedAt = now
    Runtime.io.invalidate()
  }

  static async tick(): Promise<void> {
    if (Runtime.isTicking) return
    Runtime.isTicking = true
    try {
      const now = Date.now()
      const elapsed = Runtime.lastTickAt > 0 ? Math.min(Flow.MAX_TICK_GAP_MS, Math.max(0, now - Runtime.lastTickAt)) : 1000 / Flow.effectiveFps()
      Runtime.lastTickAt = now
      Flow.retarget(now)
      if (Runtime.view.isReplaying) {
        Runtime.replayAt += elapsed * Runtime.view.replaySpeed
        if (Runtime.replayAt >= Runtime.replayTo) {
          Runtime.replayAt = Runtime.replayTo
          await Flow.setView(v => ({ ...v, isReplaying: false }))
        }
      }
      Runtime.frame = Flow.frameAt(Flow.isReplay() ? Runtime.replayAt : now)
      if (Runtime.mode === 'none' || Runtime.columns === 0) return
      if (Runtime.scrollOffset > 0) return
      Flow.syncStage(now)
      Runtime.lastBlitAt = now
      const graph = Flow.cells(now)
      Flow.measure(Date.now() - now, now)
      Runtime.graphCache = { key: Flow.graphKey(), result: graph }
      const encoded = graph.encoded
      if (encoded.kind !== 'cells') return
      const result = await Runtime.io.blit({ requestId: PANE, key: Runtime.mode, cells: encoded.cells, columns: Runtime.columns, rows: Runtime.rows })
      if (result.deny) {
        Flow.onDeny()
      } else {
        Runtime.denies = 0
      }
    } catch {
      Flow.onDeny()
    } finally {
      Runtime.isTicking = false
    }
  }

  static onDeny(): void {
    Runtime.denies++
    if (Runtime.denies < 4) return
    Runtime.denies = 0
    const now = Date.now()
    if (now - Runtime.invalidatedAt < 2000) {
      Runtime.columns = 0
      return
    }
    Runtime.invalidatedAt = now
    Runtime.io.invalidate()
  }

  static phaseIndex(type: string): number {
    const i = Project.phaseIndex(Runtime.project, type)
    if (i >= 0) return i
    const experts = Runtime.project.manifest.phases.findIndex(p => Project.phaseOf(p) === 'experts')
    return experts >= 0 && type.endsWith('-expert') ? experts : -1
  }

  static currentRun(agents: FlowAgent[], now: number): FlowAgent[] {
    const since = Runtime.runStartedAt > 0 ? Runtime.runStartedAt : now - Flow.RUN_FALLBACK_MS
    return agents.filter(a => a.startedAt >= since)
  }

  static phases(agents: FlowAgent[]): PhaseStat[] {
    return Runtime.project.manifest.phases.map((p, i) => {
      const own = agents.filter(a => Flow.phaseIndex(a.type) === i)
      const running = own.filter(a => a.status === 'running').length
      const failed = own.filter(a => a.status === 'failed' || a.status === 'killed').length
      const finished = own.length - running
      const state: PhaseState = own.length === 0 ? 'pending' : failed > 0 ? 'failed' : running > 0 ? 'running' : 'done'
      return { name: p.name, total: own.length, finished, state }
    })
  }

  static maxParallel(agents: FlowAgent[], now: number): number {
    const marks = agents.flatMap(a => [
      { t: a.startedAt, d: 1 },
      { t: a.endedAt || now, d: -1 },
    ])
    marks.sort((a, b) => a.t - b.t || a.d - b.d)
    let cur = 0
    let max = 0
    for (const m of marks) {
      cur += m.d
      max = Math.max(max, cur)
    }
    return max
  }

  static activity(events: FlowEvent[], now: number, width: number, spanMs: number): number[] {
    const buckets = new Array<number>(Math.max(1, width)).fill(0)
    const size = spanMs / buckets.length
    for (const e of events) {
      const age = now - e.at
      if (age < 0 || age >= spanMs) continue
      const i = buckets.length - 1 - Math.floor(age / size)
      if (i >= 0) buckets[i] = (buckets[i] ?? 0) + 1
    }
    return buckets
  }

  static mayAutoOpen(): boolean {
    return Runtime.isWanted || Runtime.project.hasManifest
  }

  static async openPane(): Promise<boolean> {
    Runtime.isWanted = true
    if (Runtime.view.isClosed) await Flow.setView(v => ({ ...v, isClosed: false }))
    return Flow.placePane()
  }

  static async placePane(): Promise<boolean> {
    Runtime.openAttempts++
    try {
      Runtime.isPlaced = await Runtime.io.open()
    } catch {
      Runtime.isPlaced = false
    }
    return Runtime.isPlaced
  }

  static async ensurePane(): Promise<void> {
    if (Runtime.isPlaced || Runtime.view.isClosed || !Flow.mayAutoOpen() || Runtime.openAttempts >= Flow.MAX_OPEN_ATTEMPTS) return
    await Flow.placePane()
  }

  static async reset(): Promise<void> {
    Runtime.replayAt = 0
    Runtime.runStartedAt = 0
    Runtime.pulses.clear()
    Runtime.pending.clear()
    Runtime.backgroundVerifs.clear()
    Runtime.buffer = []
    await Flow.setAgents(() => [])
    Runtime.events = await Runtime.io.events(() => [])
    await Runtime.io.alerts(() => [])
    await Runtime.io.reviews(() => [])
    await Runtime.io.usage(() => [])
    await Runtime.io.verif(v => {
      const out = { ...v }
      for (const k of Object.keys(out) as VerifKey[]) out[k] = { status: 'idle', at: 0, durationMs: 0, detail: '', agentId: '' }
      return out
    })
    await Flow.setMain(m => ({ ...m, tool: '', toolCount: 0, isBusy: false }))
    Runtime.toolMilestone = 0
    Runtime.combo = 0
    Runtime.celebrations = []
    Runtime.lastCelebratedKey = ''
    Runtime.editedFiles.clear()
    Runtime.graphCache = undefined
    Runtime.comboAt = 0
    Runtime.positions.clear()
    await Flow.setView(v => ({ ...v, isReplaying: false, filter: 'essential', isWhyShown: false }))
    if (Runtime.context) await Flow.setContext(c => ({ ...c, staleCommitAt: 0, editsSinceVerif: 0 }))
    await Flow.publishStatus()
  }

  static startReplay(): void {
    Runtime.replayFrom = Flow.firstAt()
    Runtime.replayTo = Date.now()
    if (Runtime.replayAt <= 0 || Runtime.replayAt >= Runtime.replayTo) Runtime.replayAt = Runtime.replayFrom
  }
}

class View {
  static readonly TAB_HOTKEY_WIDTH = 3
  static reviewShort(type: string): string {
    return Project.reviewer(Runtime.project, type)?.short ?? type
  }

  static reviewTiny(type: string): string {
    const short = View.reviewShort(type)
    return short.length > 5 ? short.slice(0, 4) : short
  }
  static readonly EVENT_ICONS: Record<FlowEventKind, string> = { spawn: '↗', tool: '•', end: '✓', alert: '!', verif: '✓', prompt: '›', hook: '⊘' }

  static hex(c: Rgb): string {
    return Canvas.hex(c)
  }

  static width(text: string): number {
    return Array.from(text).length
  }

  static hm(at: number): string {
    return Theme.clock(at).slice(0, 5)
  }

  static picture(ui: Ui, key: string, columns: number, rows: number, encoded: Encoded): RenderElement {
    const { Box, Raster } = ui
    if (encoded.kind !== 'cells') return <Box key={key} />
    return <Raster key={key} columns={columns} rows={rows} cells={encoded.cells} />
  }

  static rule(ui: Ui, title: string, width: number, right = ''): RenderElement {
    const { Box, Text } = ui
    const label = ` ${title} `
    const shown = View.width(label) + View.width(right) + 6 <= width ? right : ''
    const fill = Math.max(2, width - 3 - View.width(label) - (shown === '' ? 0 : View.width(shown) + 1))
    return (
      <Box key={`rule-${title}`}>
        <Text color={View.hex(Theme.FAINT)}>──</Text>
        <Text color={View.hex(Theme.ACCENT)} bold>
          {label}
        </Text>
        <Text color={View.hex(Theme.FAINT)}>{'─'.repeat(fill)}</Text>
        {shown !== '' && <Text color={View.hex(Theme.MUTED)}> {shown}</Text>}
      </Box>
    )
  }

  static reviewCounts(r: { critical: number; major: number; minor: number }): string {
    if (r.critical > 0) return View.plural(r.critical, 'critical', 'critical')
    if (r.major > 0) return View.plural(r.major, 'major', 'major')
    if (r.minor > 0) return View.plural(r.minor, 'minor', 'minor')
    return ''
  }

  static plural(n: number, word: string, many = `${word}s`): string {
    return `${n} ${n > 1 ? many : word}`
  }

  static statusWord(status: FlowStatus): string {
    return status === 'running' ? 'running' : status === 'completed' ? 'completed' : status === 'failed' ? 'failed' : 'interrupted'
  }

  static staleNote(edits: number): string {
    if (edits <= 0) return 'to rerun'
    return `to rerun (${edits} ${edits > 1 ? 'files' : 'file'} modified since)`
  }

  static verdictLabel(r: FlowReview): string {
    if (r.verdict === 'PASS') return '✓ PASS'
    if (r.verdict === 'FAIL') return '✗ FAIL'
    if (r.verdict === 'WARN') return '! WARN'
    return r.critical > 0 ? '✗' : r.major > 0 ? '!' : '✓'
  }

  static verdictGlyph(r: FlowReview): string {
    if (r.verdict === 'PASS') return '✓'
    if (r.verdict === 'FAIL') return '✗'
    if (r.verdict === 'WARN') return '!'
    return r.critical > 0 ? '✗' : r.major > 0 ? '!' : '✓'
  }

  static verdictColor(r: FlowReview): Rgb {
    const glyph = View.verdictGlyph(r)
    return glyph === '✓' ? Theme.OK : glyph === '✗' ? Theme.KO : Theme.WARN
  }

  static counts(r: FlowReview): string {
    return `${r.critical}C ${r.major}M ${r.minor}m`
  }

  static ruleLabel(rule: RuleId): string {
    return Rules.label(rule).replace(/`/g, '')
  }

  static shortAgent(agentId: string): string {
    return agentId === '' ? 'orchestrator' : Flow.agentName(agentId).replace(/-expert$/, '')
  }

  static agentColor(agentId: string): Rgb {
    return agentId === '' ? Theme.ORCH : Robots.accent(Flow.agentName(agentId))
  }

  static shortPath(path: string): string {
    const p = path.replace(/\\/g, '/')
    const root = Runtime.cwd.replace(/\\/g, '/').replace(/\/+$/, '')
    const relative = root !== '' && p.startsWith(`${root}/`) ? p.slice(root.length + 1) : p
    return relative.replace(/^(?:[^/]+\/)?(?:src|tests)\/(?=[^/]+\.[^/]+\/)/, '').replace(/^[^./]+\.[^./]+\.(?=[^/]+\/)/, '')
  }

  static tailOf(value: string, width: number): string {
    const chars = Array.from(value)
    if (chars.length <= width) return value
    return `…${chars.slice(chars.length - Math.max(1, width - 1)).join('')}`
  }

  static ago(now: number, at: number): string {
    if (at <= 0) return 'never'
    const s = Math.max(0, Math.round((now - at) / 1000))
    if (s < 5) return 'just now'
    if (s < 60) return `${s} s ago`
    return `${Math.round(s / 60)} min ago`
  }

  static fetchAge(ms: number): string {
    const minutes = Math.round(ms / 60_000)
    if (minutes < 60) return `fetched ${minutes} min ago`
    const hours = Math.round(ms / 3_600_000)
    if (hours < 24) return `fetched ${hours} h ago`
    return `fetched ${Math.floor(ms / 86_400_000)} d ago`
  }

  static latestReviews(reviews: FlowReview[]): FlowReview[] {
    const seen = new Set<string>()
    return [...reviews].reverse().filter(r => {
      if (seen.has(r.type)) return false
      seen.add(r.type)
      return true
    })
  }

  static isSupportOrphan(c: FlowContext): boolean {
    const counterpart = Runtime.project.manifest.git.counterpart ?? ''
    if (counterpart === '') return false
    return Rules.isFixBranch(c.branch) && !c.branch.endsWith(counterpart) && !c.relatedBranches.some(b => b.endsWith(counterpart))
  }

  static stepNames(keys: VerifKey[], isLower: boolean): string {
    return keys.map(k => (isLower ? Flow.VERIF_LABELS[k].toLowerCase() : Flow.VERIF_LABELS[k])).join(', ')
  }

  static failedGroups(verif: FlowVerif): { keys: VerifKey[]; at: number; detail: string; agentId: string }[] {
    const groups: { keys: VerifKey[]; at: number; detail: string; agentId: string }[] = []
    for (const k of Object.keys(Flow.VERIF_LABELS) as VerifKey[]) {
      const step = verif[k]
      if (step.status !== 'ko') continue
      const group = groups.find(g => g.at === step.at)
      if (group) group.keys.push(k)
      else groups.push({ keys: [k], at: step.at, detail: step.detail, agentId: step.agentId })
    }
    return groups
  }

  static headerPhase(agents: FlowAgent[]): string {
    const run = Flow.currentRun(agents, Date.now())
    if (!run.some(a => a.status === 'running' && Flow.phaseIndex(a.type) >= 0)) return ''
    const stats = Flow.phases(run)
    const running = stats.map(p => p.state).lastIndexOf('running')
    const phase = stats[running >= 0 ? running : Math.max(0, stats.map(p => p.total > 0).lastIndexOf(true))]
    return phase === undefined ? '' : `${phase.name} ${phase.finished}/${phase.total}`
  }

  static header(ui: Ui, width: number, data: Snapshot): RenderElement {
    const { Box, Text } = ui
    const running = data.agents.filter(a => a.status === 'running').length
    const errors = data.alerts.filter(a => a.level === 'error').length
    const warns = data.alerts.length - errors
    const status: HeaderPart = running > 0 ? { text: `● ${running}`, color: Theme.OK } : { text: '○ idle', color: Theme.MUTED }
    const tail: HeaderPart[] = []
    if (errors > 0) tail.push({ text: `${tail.length === 0 ? '   ' : ' '}✗${errors}`, color: Theme.KO })
    if (warns > 0) tail.push({ text: `${tail.length === 0 ? '   ' : ' '}!${warns}`, color: Theme.WARN })
    const fps: HeaderPart[] = Flow.isFpsLowered() ? [{ text: ` ↓${Flow.effectiveFps()} fps`, color: Theme.WARN }] : []
    const right = [status, ...tail, ...fps]
    const wi = data.context.wi !== '' ? `#${data.context.wi}` : ''
    const phase = View.headerPhase(data.agents)
    const brand = View.width('◆ MAESTRO') + (Flow.isReplay() ? 8 : 0)
    const room = width - brand - View.partsWidth(right) - 3
    const variants = [[wi, phase].filter(t => t !== '').join(' · '), wi, '']
    const context = variants.find(v => (v === '' ? 0 : v.length + 2) <= room) ?? ''
    return (
      <Box justifyContent="space-between" width={width}>
        <Text>
          <Text color={View.hex(Theme.ORCH)} bold>
            ◆ MAESTRO
          </Text>
          {Flow.isReplay() && (
            <Text color={View.hex(Theme.BG_TOP)} backgroundColor={View.hex(Theme.WARN)}>
              {' '}
              REPLAY{' '}
            </Text>
          )}
          {context !== '' && <Text color={View.hex(Theme.TEXT)}>{`  ${context}`}</Text>}
        </Text>
        <Text>
          {right.map((p, i) => (
            <Text key={`hdr-${i}`} color={View.hex(p.color)}>
              {p.text}
            </Text>
          ))}
        </Text>
      </Box>
    )
  }

  static partsWidth(parts: HeaderPart[]): number {
    return parts.reduce((s, p) => s + View.width(p.text), 0)
  }

  static tabsWidth(isShort: boolean, padding: number): number {
    return Flow.TABS.reduce((s, t) => s + View.TAB_HOTKEY_WIDTH + padding + View.width(isShort ? t.short : t.label), 0) + Flow.TABS.length - 1
  }

  static tabs(ui: Ui, width: number, view: FlowView): RenderElement {
    const { Box, Button, Text } = ui
    const isShort = View.tabsWidth(false, 0) > width
    const pad = View.tabsWidth(isShort, 2) <= width ? ' ' : ''
    return (
      <Box columnGap={1}>
        {Flow.TABS.map(tab => {
          const isActive = tab.id === view.tab
          return (
            <Button key={`tab-${tab.id}`} plain hotkey={tab.hotkey} onPress={() => void Flow.setView(v => ({ ...v, tab: tab.id }))}>
              <Text color={View.hex(isActive ? Theme.BG_TOP : Theme.MUTED)} backgroundColor={isActive ? View.hex(Theme.ACCENT) : undefined} bold={isActive}>
                {`${pad}${isShort ? tab.short : tab.label}${pad}`}
              </Text>
            </Button>
          )
        })}
      </Box>
    )
  }

  static footerText(data: Snapshot): string {
    switch (data.view.tab) {
      case 'livraison':
        return data.alerts.length > 0 ? '1-5 tabs · h why · x clears the violations' : '1-5 tabs · Tab browses · Enter opens an agent'
      case 'historique':
        return data.view.mode === 'couloirs' ? '1-5 tabs · c journal · p replay · v speed · l live' : '1-5 tabs · f filter · c lanes'
      case 'contexte':
        return '1-5 tabs · r refreshes the context'
      case 'commandes':
        return '1-5 tabs · Tab browses · Enter prepares the command'
      default:
        return '1-5 tabs · Tab browses · Enter opens an agent'
    }
  }

  static footer(ui: Ui, width: number, data: Snapshot): RenderElement {
    const { Box, Text } = ui
    return (
      <Box key="footer">
        <Text key="footer-text" color={View.hex(Theme.FAINT)}>
          {Theme.truncate(View.footerText(data), width)}
        </Text>
      </Box>
    )
  }

  static phaseItems(stats: PhaseStat[], focus: number): { glyph: string; color: Rgb; label: string; short: string }[] {
    return stats.map((p, i) => {
      const isFocus = i === focus
      const count = p.state === 'running' || (isFocus && p.total > 0) ? ` ${p.finished}/${p.total}` : ''
      const glyph = p.state === 'running' ? '◉' : p.state === 'done' ? '✓' : p.state === 'failed' ? '✗' : '○'
      const color = p.state === 'running' ? Theme.ORCH : p.state === 'done' ? Theme.OK : p.state === 'failed' ? Theme.KO : Theme.FAINT
      const short = Runtime.project.manifest.phases[i]?.short ?? p.name
      return { glyph, color, label: `${glyph} ${short}${count}`, short: glyph }
    })
  }

  static phaseBar(ui: Ui, width: number, agents: FlowAgent[]): RenderElement[] {
    const { Text } = ui
    const run = Flow.currentRun(agents, Date.now())
    if (!run.some(a => Flow.phaseIndex(a.type) >= 0)) return []
    const stats = Flow.phases(run)
    const running = stats.map(p => p.state).lastIndexOf('running')
    const focus = running >= 0 ? running : Math.max(0, stats.map(p => p.total > 0).lastIndexOf(true))
    const items = View.phaseItems(stats, focus)
    const arrow = ' → '
    const fullWidth = items.reduce((s, it) => s + View.width(it.label), 0) + arrow.length * (items.length - 1)
    const compactWidth = items.reduce((s, it, i) => s + View.width(i === focus ? it.label : it.short), 0) + arrow.length * (items.length - 1)
    const mode = fullWidth <= width ? 'full' : compactWidth <= width ? 'compact' : 'focus'
    const shown = items.map((it, i) => ({ ...it, text: mode === 'compact' && i !== focus ? it.short : it.label, isShown: mode !== 'focus' || i === focus })).filter(it => it.isShown)
    return [
      <Text key="phase-bar">
        {shown.map((it, i) => (
          <Text key={`phase-${i}`}>
            {i > 0 && <Text color={View.hex(Theme.FAINT)}>{arrow}</Text>}
            <Text color={View.hex(it.color)} bold={it.glyph === '◉'}>
              {it.text}
            </Text>
          </Text>
        ))}
      </Text>,
    ]
  }

  static overlay(ui: Ui, label: GraphLabel, width: number): RenderElement {
    const { Box, Button, Text } = ui
    const text = Theme.truncate(label.isMain ? label.text.replace(/ · \?$/, '') : label.text, Math.max(1, width - label.column))
    const target = label.isMain ? 'main' : label.agentId
    if (label.isPrimary) {
      return (
        <Box key={`ov-${target}`} position="absolute" top={label.row} left={label.column}>
          <Button key={`label-${target}`} plain onPress={() => Runtime.openAgent(label.isMain ? '' : label.agentId)}>
            <Text color={View.hex(label.color)} bold>
              {text}
            </Text>
          </Button>
        </Box>
      )
    }
    return (
      <Box key={`ov-${target}-${label.row}-${label.column}`} position="absolute" top={label.row} left={label.column}>
        <Text color={View.hex(label.color)}>{text}</Text>
      </Box>
    )
  }

  static graph(ui: Ui, width: number, rows: number, result: GraphResult): RenderElement {
    const { Box } = ui
    const seen = new Set<string>()
    const labels = result.labels.filter(l => {
      const id = `${l.isPrimary ? 'p' : 's'}-${l.isMain ? 'main' : l.agentId}-${l.isPrimary ? '' : `${l.row}-${l.column}`}`
      if (seen.has(id) || l.row < 0 || l.row >= rows || l.column < 0 || l.column >= width) return false
      seen.add(id)
      return true
    })
    return (
      <Box key="graph-box" position="relative" flexDirection="column" width={width} height={rows}>
        {View.picture(ui, 'graph', width, rows, result.encoded)}
        {labels.map(l => View.overlay(ui, l, width))}
      </Box>
    )
  }

  static goto(ui: Ui, key: string, tab: FlowTab): RenderElement {
    const { Button, Text } = ui
    const hotkey = Flow.TABS.find(t => t.id === tab)?.hotkey ?? ''
    return (
      <Button key={key} plain onPress={() => void Flow.setView(v => ({ ...v, tab }))}>
        <Text color={View.hex(Theme.MUTED)}>{`›${hotkey}`}</Text>
      </Button>
    )
  }

  static linkedLine(ui: Ui, key: string, width: number, glyph: string, color: Rgb, text: string, tab: FlowTab): RenderElement {
    const { Box, Text } = ui
    return (
      <Box key={key} justifyContent="space-between" width={width}>
        <Text key={`${key}-text`} color={View.hex(color)}>
          {glyph} {Theme.truncate(text, Math.max(6, width - 6))}
        </Text>
        {View.goto(ui, `${key}-goto`, tab)}
      </Box>
    )
  }

  static todo(ui: Ui, width: number, data: Snapshot): RenderElement[] {
    const { Text } = ui
    const out: RenderElement[] = []
    for (const group of View.failedGroups(data.verif)) {
      const who = group.agentId !== '' ? `${Flow.agentName(group.agentId)} ` : ''
      out.push(
        <Text key={`todo-verif-${group.at}`} color={View.hex(Theme.KO)}>
          {Theme.truncate(`✗ ${View.stepNames(group.keys, false)} failed · ${who}${View.hm(group.at)}`, width)}
        </Text>,
      )
      if (group.detail !== '') {
        out.push(
          <Text key={`todo-verif-detail-${group.at}`} color={View.hex(Theme.MUTED)}>
            {'  '}
            {Theme.truncate(group.detail, width - 2)}
          </Text>,
        )
      }
    }
    for (const r of View.latestReviews(data.reviews).filter(r => r.verdict === 'FAIL')) {
      const name = View.reviewShort(r.type)
      const isStale = r.at < data.context.codeEditedAt
      out.push(
        View.linkedLine(ui, `todo-review-${r.agentId}`, width, '✗', Theme.KO, `Review ${name} FAIL${View.reviewCounts(r) !== '' ? `: ${View.reviewCounts(r)}` : ''}${isStale ? ' · stale' : ''}`, 'livraison'),
      )
    }
    if (data.alerts.length > 0) {
      const isError = data.alerts.some(a => a.level === 'error')
      const pairs = Array.from(new Set([...data.alerts].reverse().map(a => `${Rules.short(a.rule)} (${View.shortAgent(a.agentId)})`)))
      out.push(View.linkedLine(ui, 'todo-alerts', width, isError ? '✗' : '!', isError ? Theme.KO : Theme.WARN, `${View.plural(data.alerts.length, 'violation')}: ${pairs.join(', ')}`, 'livraison'))
    }
    if (out.length === 0) return []
    return [View.rule(ui, 'TO DO', width), ...out]
  }

  static agentRow(ui: Ui, key: string, agent: FlowAgent, nameWidth: number, width: number, now: number, frame: number): RenderElement {
    const { Button, Text } = ui
    const accent = Robots.accent(agent.type)
    const isRunning = agent.status === 'running'
    const duration = Theme.pad(Theme.duration((isRunning ? now : agent.endedAt) - agent.startedAt), 7)
    const files = isRunning && agent.files.length > 0 ? `  ${agent.files.length} f.` : ''
    const room = Math.max(4, width - 2 - nameWidth - 7 - View.width(files))
    const detail = isRunning ? agent.tool || agent.description : agent.description
    return (
      <Button key={key} plain dimColor={!isRunning} onPress={() => Runtime.openAgent(agent.id)}>
        <Text color={View.hex(Theme.statusColor(agent.status, accent))}>{Theme.statusGlyph(agent.status, frame)} </Text>
        <Text color={View.hex(isRunning ? accent : Theme.MUTED)} bold={isRunning}>
          {Theme.pad(agent.type, nameWidth)}
        </Text>
        <Text color={View.hex(Theme.MUTED)}>{duration}</Text>
        <Text color={View.hex(isRunning ? Theme.TEXT : Theme.FAINT)}>{Theme.truncate(detail, room)}</Text>
        {files !== '' && <Text color={View.hex(Theme.FAINT)}>{files}</Text>}
      </Button>
    )
  }

  static mainRow(ui: Ui, main: FlowMain, running: number, nameWidth: number, width: number, now: number): RenderElement {
    const { Button, Text } = ui
    const duration = main.isBusy ? Theme.pad(Theme.duration(now - main.busySince), 7) : ''
    const detail = main.isBusy ? main.tool || 'thinking…' : running > 0 ? `waiting for ${View.plural(running, 'agent')}` : 'waiting for the next prompt'
    return (
      <Button key="open-main" plain onPress={() => Runtime.openAgent('')}>
        <Text color={View.hex(Theme.ORCH)}>{main.isBusy ? Theme.spinner(Runtime.frame) : '◆'} </Text>
        <Text color={View.hex(Theme.ORCH)} bold>
          {Theme.pad('orchestrator', nameWidth)}
        </Text>
        {duration !== '' && <Text color={View.hex(Theme.MUTED)}>{duration}</Text>}
        <Text color={View.hex(Theme.MUTED)}>{Theme.truncate(detail, Math.max(4, width - 2 - nameWidth - View.width(duration)))}</Text>
      </Button>
    )
  }

  static nameWidth(agents: FlowAgent[]): number {
    return Math.min(18, Math.max(13, ...agents.map(a => View.width(a.type)))) + 2
  }

  static inProgress(ui: Ui, width: number, data: Snapshot, running: FlowAgent[], now: number): RenderElement[] {
    const finished = Flow.currentRun(data.agents, now)
      .filter(a => a.status !== 'running')
      .sort((a, b) => b.endedAt - a.endedAt)
      .slice(0, 3)
    const nameWidth = View.nameWidth([...running, ...finished])
    return [
      View.rule(ui, running.length > 0 ? `IN PROGRESS · ${running.length}` : 'IN PROGRESS', width),
      ...running.map((a, i) => View.agentRow(ui, `run-${a.id}`, a, nameWidth, width, now, Runtime.frame + i)),
      View.mainRow(ui, data.main, running.length, nameWidth, width, now),
      ...(finished.length > 0 ? [View.rule(ui, 'FINISHED', width), ...finished.map((a, i) => View.agentRow(ui, `done-${a.id}`, a, nameWidth, width, now, i))] : []),
    ]
  }

  static lastRun(ui: Ui, width: number, data: Snapshot, now: number): RenderElement[] {
    const { Text } = ui
    const idle = (
      <Text key="idle-hint" color={View.hex(Theme.MUTED)}>
        {Theme.truncate(View.startHint(), width)}
      </Text>
    )
    const current = Flow.currentRun(data.agents, now)
    const run = current.length > 0 ? current : data.agents
    if (run.length === 0) return [idle, ...View.commandStrip(ui, width)]
    const start = Math.min(...run.map(a => a.startedAt))
    const end = Math.max(...run.map(a => a.endedAt || now))
    const failedVerif = View.failedGroups(data.verif).length > 0
    const isFailed = failedVerif || run.some(a => a.status === 'failed' || a.status === 'killed')
    const wi = data.context.wi !== '' ? `#${data.context.wi} · ` : ''
    const summary = `${isFailed ? '✗' : '✓'} ${wi}${View.plural(run.length, 'agent')} · ${Theme.duration(end - start)} · finished at ${View.hm(end)}`
    const steps = (Object.keys(Flow.VERIF_LABELS) as VerifKey[]).filter(k => data.verif[k].status === 'ok' || data.verif[k].status === 'ko')
    const ok = steps.filter(k => data.verif[k].status === 'ok').map(k => Flow.VERIF_LABELS[k].toLowerCase())
    const ko = steps.filter(k => data.verif[k].status === 'ko').map(k => Flow.VERIF_LABELS[k].toLowerCase())
    const verifPart = steps.length === 0 ? '' : `Verif${ok.length > 0 ? ` ✓ ${ok.join(' ')}` : ''}${ko.length > 0 ? ` ✗ ${ko.join(' ')}` : ''}`
    const reviews = View.latestReviews(data.reviews).reverse()
    const reviewPart = reviews.length === 0 ? '' : `Reviews ${reviews.map(r => `${View.verdictGlyph(r)} ${View.reviewTiny(r.type)}`).join(' ')}`
    const commits = data.events.filter(e => e.kind === 'tool' && /^\$ git commit\b/.test(e.label)).length
    const pr = data.events.find(e => e.kind === 'tool' && /^\$ /.test(e.label) && Rules.PR_CREATE.test(e.label))
    const outcome = [
      commits > 0 ? View.plural(commits, 'commit') : '',
      pr ? (/--draft/.test(pr.label) ? 'draft PR created' : 'PR created') : '',
      View.isSupportOrphan(data.context) ? `! ${Runtime.project.manifest.git.counterpart ?? ''} counterpart to do` : '',
    ].filter(t => t !== '')
    const details = [[verifPart, reviewPart].filter(t => t !== '').join(' · '), outcome.join(' · ')].filter(t => t !== '')
    return [
      View.rule(ui, 'LAST ORCHESTRATION', width),
      <Text key="last-run" color={View.hex(isFailed ? Theme.KO : Theme.OK)}>
        {Theme.truncate(summary, width)}
      </Text>,
      ...details.map((d, i) => (
        <Text key={`last-run-${i}`} color={View.hex(Theme.MUTED)}>
          {'  '}
          {Theme.truncate(d, width - 2)}
        </Text>
      )),
      idle,
    ]
  }

  static deliveryHint(ui: Ui, width: number, data: Snapshot): RenderElement[] {
    if (data.agents.length === 0) return []
    const items = View.verdictItems(data)
    const blocking = items.filter(i => i.isBlocking)
    if (blocking.length === 0) return [View.linkedLine(ui, 'flux-delivery', width, '✓', Theme.OK, 'Delivery: ready', 'livraison')]
    const tags = Array.from(new Set(blocking.map(i => i.tag)))
    return [View.linkedLine(ui, 'flux-delivery', width, '◌', Theme.WARN, `Delivery: not ready · ${tags.join(', ')}`, 'livraison')]
  }

  static flux(ui: Ui, width: number, viewportRows: number, data: Snapshot): RenderElement[] {
    const now = Date.now()
    const rows = Math.max(16, Math.min(Scene.graphRows(width, viewportRows), viewportRows - 6))
    Runtime.mode = 'graph'
    Runtime.columns = width
    Runtime.rows = rows
    const result = Flow.cachedCells(now)
    Runtime.stageKey = Flow.stageKey(now)
    const running = data.agents.filter(a => a.status === 'running').sort((a, b) => a.startedAt - b.startedAt)
    const isActive = running.length > 0 || data.main.isBusy
    return [
      ...View.phaseBar(ui, width, data.agents),
      View.graph(ui, width, rows, result),
      ...View.todo(ui, width, data),
      ...(isActive ? View.inProgress(ui, width, data, running, now) : View.lastRun(ui, width, data, now)),
      ...View.deliveryHint(ui, width, data),
    ]
  }

  static verdictItems(data: Snapshot): { text: string; tag: string; isBlocking: boolean }[] {
    const c = data.context
    const items: { text: string; tag: string; isBlocking: boolean }[] = []
    for (const group of View.failedGroups(data.verif)) {
      items.push({ text: `Fix ${View.stepNames(group.keys, true)}: ${group.detail || 'see the output'}`, tag: View.stepNames(group.keys, true), isBlocking: true })
    }
    const steps = Rules.deliverySteps().filter(k => data.verif[k].status !== 'ko')
    const rerun = steps.filter(k => data.verif[k].status === 'stale' || Rules.isStale(data.verif[k], c.codeEditedAt))
    const launch = steps.filter(k => data.verif[k].status === 'idle')
    const waiting = steps.filter(k => data.verif[k].status === 'running')
    if (rerun.length > 0) {
      const why = c.editsSinceVerif > 0 ? `${View.plural(c.editsSinceVerif, 'file')} modified ${View.hm(c.codeEditedAt)}` : `code modified ${View.hm(c.codeEditedAt)}`
      items.push({ text: `Rerun ${View.stepNames(rerun, true)} (${why})`, tag: View.stepNames(rerun, true), isBlocking: true })
    }
    if (launch.length > 0) items.push({ text: `Run ${View.stepNames(launch, true)}`, tag: View.stepNames(launch, true), isBlocking: true })
    if (waiting.length > 0) items.push({ text: `Wait for ${View.stepNames(waiting, true)} (running)`, tag: View.stepNames(waiting, true), isBlocking: true })
    const reviews = View.latestReviews(data.reviews)
    for (const r of reviews.filter(r => r.verdict !== 'PASS')) {
      const name = View.reviewShort(r.type)
      const weight = r.critical > 0 ? `${View.plural(r.critical, 'critical', 'critical')} to address` : r.major > 0 ? `${View.plural(r.major, 'major', 'major')} to address` : 'to re-read'
      items.push({ text: `Review ${name} ${r.verdict || 'no verdict'}: ${weight}`, tag: 'reviews', isBlocking: true })
    }
    const stale = reviews.filter(r => r.verdict === 'PASS' && r.at < c.codeEditedAt)
    if (stale.length > 0) items.push({ text: `Redo review ${stale.map(r => View.reviewShort(r.type)).join(', ')} (code modified since)`, tag: 'reviews', isBlocking: true })
    if (reviews.length === 0) items.push({ text: 'Run the code and security reviews', tag: 'reviews', isBlocking: true })
    if (data.alerts.length > 0) {
      const isError = data.alerts.some(a => a.level === 'error')
      items.push({ text: `Address ${View.plural(data.alerts.length, 'rule violation')}`, tag: 'rules', isBlocking: isError })
    }
    if (c.staleCommitAt > 0) items.push({ text: `Commit ${View.hm(c.staleCommitAt)} made with a stale verification`, tag: 'commit', isBlocking: false })
    if (View.isSupportOrphan(c)) items.push({ text: `Support: create ${c.branch}${Runtime.project.manifest.git.counterpart ?? ''}`, tag: 'support', isBlocking: false })
    return items
  }

  static verdict(ui: Ui, width: number, data: Snapshot): RenderElement[] {
    const { Text } = ui
    const items = View.verdictItems(data)
    const isReady = !items.some(i => i.isBlocking)
    return [
      View.rule(ui, 'VERDICT', width),
      <Text key="verdict-state" color={View.hex(isReady ? Theme.OK : Theme.KO)} bold>
        {isReady ? '✓ Ready to deliver' : '✗ Not ready to deliver'}
      </Text>,
      ...items.map((item, i) => (
        <Text key={`verdict-${i}`} color={View.hex(item.isBlocking ? Theme.TEXT : Theme.WARN)}>
          {Theme.truncate(`  ${i + 1}. ${item.text}`, width)}
        </Text>
      )),
    ]
  }

  static isRequired(key: VerifKey, c: FlowContext): boolean {
    const layers = c.layers.map(l => l.name)
    if (key === 'front') return layers.includes('Front')
    if (key === 'integ') return layers.includes('Infrastructure') || layers.includes('Database')
    return false
  }

  static verifRow(ui: Ui, key: VerifKey, step: FlowVerifStep, codeEditedAt: number, width: number): RenderElement[] {
    const { Text } = ui
    const label = Theme.pad(Flow.VERIF_LABELS[key], 8)
    const isStale = Rules.isStale(step, codeEditedAt)
    const glyph = isStale ? '≈' : Theme.verifGlyph(step.status)
    const color = isStale ? Theme.WARN : Theme.verifColor(step.status)
    const timing = `${View.hm(step.at)}${step.durationMs > 0 ? ` · ${Theme.duration(step.durationMs)}` : ''}`
    const rest =
      step.status === 'idle'
        ? 'not run'
        : step.status === 'running'
          ? `running since ${View.hm(step.at)}`
          : step.status === 'stale'
            ? 'no result'
            : isStale
              ? `${View.hm(step.at)} · stale`
              : timing
    const rows = [
      <Text key={`verif-${key}`}>
        <Text color={View.hex(color)}>{glyph} </Text>
        <Text color={View.hex(Theme.TEXT)}>{label}</Text>
        {isStale && <Text color={View.hex(Theme.verifColor(step.status))}>{Theme.verifGlyph(step.status)} </Text>}
        <Text color={View.hex(step.status === 'idle' ? Theme.FAINT : Theme.MUTED)}>{Theme.truncate(rest, Math.max(4, width - 12))}</Text>
      </Text>,
    ]
    if (step.status === 'ko' && step.detail !== '') {
      rows.push(
        <Text key={`verif-detail-${key}`} color={View.hex(Theme.KO)}>
          {'  '}
          {Theme.truncate(step.detail, width - 2)}
        </Text>,
      )
    }
    return rows
  }

  static verification(ui: Ui, width: number, data: Snapshot): RenderElement[] {
    const { Text } = ui
    const c = data.context
    const optional = Rules.optionalSteps().filter(k => data.verif[k].status !== 'idle' || View.isRequired(k, c))
    const skipped = Rules.optionalSteps().filter(k => !optional.includes(k))
    const shown = [...Rules.deliverySteps(), ...optional]
    const last = Math.max(0, ...shown.map(k => data.verif[k].at))
    return [
      View.rule(ui, 'VERIFICATION', width, last > 0 ? `last ${View.hm(last)}` : ''),
      ...shown.flatMap(k => View.verifRow(ui, k, data.verif[k], c.codeEditedAt, width)),
      ...(skipped.length > 0
        ? [
            <Text key="verif-skipped" color={View.hex(Theme.FAINT)}>
              {'  '}
              {View.stepNames(skipped, false)}: not required
            </Text>,
          ]
        : []),
    ]
  }

  static reviewsSection(ui: Ui, width: number, data: Snapshot): RenderElement[] {
    const { Box, Text } = ui
    const reviews = View.latestReviews(data.reviews).reverse()
    return [
      View.rule(ui, 'REVIEWS', width),
      ...(reviews.length === 0
        ? [
            <Text key="no-review" color={View.hex(Theme.MUTED)}>
              · No review yet
            </Text>,
          ]
        : reviews.map(r => {
            const isStale = r.at < data.context.codeEditedAt
            const highlights = r.verdict === 'PASS' ? [] : r.highlights.slice(0, 2)
            return (
              <Box key={`rv-${r.agentId}`} flexDirection="column">
                <Text key={`review-${r.agentId}`}>
                  <Text color={View.hex(View.verdictColor(r))}>{View.verdictGlyph(r)} </Text>
                  <Text color={View.hex(Theme.TEXT)}>{Theme.pad(View.reviewShort(r.type), 10)}</Text>
                  <Text color={View.hex(View.verdictColor(r))} bold>
                    {Theme.pad(r.verdict || '—', 6)}
                  </Text>
                  <Text color={View.hex(Theme.MUTED)}>{View.counts(r)}</Text>
                  {isStale && <Text color={View.hex(Theme.WARN)}> · stale</Text>}
                </Text>
                {highlights.map((highlight, i) => {
                  const finding = Rules.severityTag(highlight)
                  return (
                    <Text key={`h-${r.agentId}-${i}`} color={View.hex(Theme.MUTED)}>
                      {Theme.truncate(`  › ${finding.tag !== '' ? `[${finding.tag}] ` : ''}${finding.text}`, width)}
                    </Text>
                  )
                })}
              </Box>
            )
          })),
    ]
  }

  static dismiss(alertId: string): void {
    void Runtime.io.alerts(list => list.filter(a => a.id !== alertId)).then(() => Flow.publishStatus())
  }

  static alertRows(ui: Ui, width: number, alert: FlowAlert): RenderElement {
    const { Box, Button, Text } = ui
    const isError = alert.level === 'error'
    const head = `${isError ? '✗' : '!'} ${View.ruleLabel(alert.rule)}`
    const where = alert.file !== '' ? View.shortPath(alert.file) : 'shell command'
    const whereRoom = width - View.width(head) - 3
    const agent = View.shortAgent(alert.agentId)
    const remedy = `  → ${Rules.remedy(alert.rule)}`
    const detailRoom = width - 2 - View.width(agent) - 9 - View.width(remedy) - 5
    return (
      <Box key={`alert-${alert.id}`} flexDirection="column">
        <Text key={`rule-row-${alert.id}`} color={View.hex(isError ? Theme.KO : Theme.WARN)}>
          {head}
          {whereRoom >= 8 && <Text color={View.hex(Theme.TEXT)}>{`   ${View.tailOf(where, whereRoom)}`}</Text>}
        </Text>
        <Box key={`alert-detail-${alert.id}`}>
          <Text>{'  '}</Text>
          <Button key={`alert-agent-${alert.id}`} plain onPress={() => Runtime.openAgent(alert.agentId)}>
            <Text color={View.hex(View.agentColor(alert.agentId))}>{agent}</Text>
          </Button>
          <Text color={View.hex(Theme.FAINT)}>{` ${View.hm(alert.at)}`}</Text>
          {detailRoom >= 6 && <Text color={View.hex(Theme.MUTED)}>{` · ${Theme.truncate(alert.detail, detailRoom)}`}</Text>}
          <Text color={View.hex(Theme.TEXT)}>{remedy}</Text>
          <Text>{'  '}</Text>
          <Button key={`ignore-${alert.id}`} plain dimColor onPress={() => View.dismiss(alert.id)}>
            <Text color={View.hex(Theme.MUTED)}>[x]</Text>
          </Button>
        </Box>
      </Box>
    )
  }

  static rulesSection(ui: Ui, width: number, data: Snapshot): RenderElement[] {
    const { Box, Button, Text } = ui
    const ruleIds = Rules.enabledRules()
    const broken = ruleIds.filter(id => data.alerts.some(a => a.rule === id))
    const right = data.alerts.length === 0 ? `${ruleIds.length}/${ruleIds.length} ✓` : View.plural(data.alerts.length, 'entorse')
    const shown = [...data.alerts].reverse().slice(0, 6)
    const out: RenderElement[] = [View.rule(ui, 'RULES', width, right)]
    if (data.context.hasEspaces) {
      out.push(
        <Text key="rules-espaces" color={View.hex(Theme.MUTED)}>
          · {Rules.label('isolation')}: monitored
        </Text>,
      )
    }
    if (data.alerts.length === 0) return out
    out.push(...shown.map(a => View.alertRows(ui, width, a)))
    if (data.alerts.length > shown.length) {
      out.push(
        <Text key="rules-more" color={View.hex(Theme.FAINT)}>
          {`  + ${View.plural(data.alerts.length - shown.length, 'other violation')}`}
        </Text>,
      )
    }
    out.push(
      <Box key="rules-actions" columnGap={2}>
        <Button key="clear" plain hotkey="x" onPress={() => void Runtime.io.alerts(() => []).then(() => Flow.publishStatus())}>
          <Text color={View.hex(Theme.TEXT)}>Clear all</Text>
        </Button>
        <Button key="why" plain hotkey="h" onPress={() => void Flow.setView(v => ({ ...v, isWhyShown: !v.isWhyShown }))}>
          <Text color={View.hex(Theme.TEXT)}>{data.view.isWhyShown ? 'Hide why' : 'Why'}</Text>
        </Button>
      </Box>,
    )
    if (data.view.isWhyShown) {
      out.push(
        ...broken.map(id => (
          <Box key={`why-${id}`} flexDirection="column">
            <Text color={View.hex(Theme.TEXT)} bold>
              {View.ruleLabel(id)}
            </Text>
            <Text color={View.hex(Theme.MUTED)}>
              {'  Why: '}
              {Rules.help(id).why}
            </Text>
            <Text color={View.hex(Theme.MUTED)}>
              {'  What to do: '}
              {Rules.help(id).fix}
            </Text>
          </Box>
        )),
      )
    }
    return out
  }

  static commitsSection(ui: Ui, width: number, data: Snapshot): RenderElement[] {
    const { Box, Text } = ui
    const c = data.context
    if (c.layers.length === 0) {
      return [
        View.rule(ui, 'COMMITS', width),
        <Text key="no-layer" color={View.hex(Theme.MUTED)}>
          · Clean tree, nothing to commit
        </Text>,
      ]
    }
    const isNarrow = c.changes <= 10 && c.layers.length <= 2
    const commits = isNarrow ? 1 : c.layers.length
    return [
      View.rule(ui, `COMMITS · ${View.plural(c.changes, 'file')} → ${View.plural(commits, 'commit')}`, width),
      <Box key="layers" flexWrap="wrap">
        {c.layers.map((l, i) => (
          <Text key={`ly-${l.name}`}>
            <Text color={View.hex(Theme.FAINT)}>{isNarrow ? '' : `${i + 1} `}</Text>
            <Text color={View.hex(Theme.TEXT)}>{l.name}</Text>
            <Text color={View.hex(Theme.MUTED)}>{` (${l.count})${i < c.layers.length - 1 ? ' · ' : ''}`}</Text>
          </Text>
        ))}
      </Box>,
    ]
  }

  static branchLine(ui: Ui, key: string, width: number, c: FlowContext): RenderElement {
    const { Text } = ui
    const base = ` → ${c.base || Runtime.project.manifest.git.base}`
    const counts = `  ↑${c.ahead} ↓${c.behind}`
    const room = Math.max(6, width - 2 - View.width(base) - View.width(counts))
    return (
      <Text key={key}>
        <Text color={View.hex(Theme.ACCENT)} bold>
          ⎇ {View.tailOf(c.branch || '…', room)}
        </Text>
        <Text color={View.hex(Theme.TEXT)}>{base}</Text>
        <Text color={View.hex(c.behind > Flow.BEHIND_WARN ? Theme.WARN : Theme.MUTED)}>{counts}</Text>
      </Text>
    )
  }

  static branchesSection(ui: Ui, width: number, data: Snapshot): RenderElement[] {
    const { Text } = ui
    const c = data.context
    return [
      View.rule(ui, 'BRANCHES', width),
      View.branchLine(ui, 'liv-branch', width, c),
      ...c.relatedBranches.slice(0, 3).map(b => (
        <Text key={`br-${b}`} color={View.hex(Theme.MUTED)}>
          {'⎇ '}
          {View.tailOf(b, Math.max(6, width - 2))}
        </Text>
      )),
      ...(View.isSupportOrphan(c)
        ? [
            <Text key="liv-orphan" color={View.hex(Theme.WARN)}>
              ! counterpart {Runtime.project.manifest.git.counterpart ?? ''} missing
            </Text>,
          ]
        : []),
    ]
  }

  static livraison(ui: Ui, width: number, data: Snapshot): RenderElement[] {
    Runtime.mode = 'none'
    return [
      ...View.verdict(ui, width, data),
      ...View.verification(ui, width, data),
      ...View.reviewsSection(ui, width, data),
      ...View.rulesSection(ui, width, data),
      ...View.commitsSection(ui, width, data),
      ...View.branchesSection(ui, width, data),
    ]
  }

  static legend(ui: Ui): RenderElement {
    const { Box, Text } = ui
    const kinds = Object.keys(Scene.TOOL_LABELS) as ToolKind[]
    return (
      <Box key="legend" flexWrap="wrap" columnGap={1}>
        {kinds.map(k => (
          <Text key={`lg-${k}`}>
            <Text color={View.hex(Scene.TOOL_COLORS[k])}>■ </Text>
            <Text color={View.hex(Theme.MUTED)}>{Scene.TOOL_LABELS[k]}</Text>
          </Text>
        ))}
      </Box>
    )
  }

  static merged(events: FlowEvent[]): FlowEvent[] {
    const settled = new Set<string>()
    const failures = new Map<string, number>()
    const out: FlowEvent[] = []
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i]
      if (e === undefined) continue
      if (e.kind === 'tool' && e.isError && Math.abs((failures.get(e.agentId) ?? Number.NEGATIVE_INFINITY) - e.at) < 2000) continue
      if (e.kind === 'verif' && e.isError) failures.set(e.agentId, e.at)
      if (e.kind === 'verif') {
        const isLaunch = / started( \(background\))?$/.test(e.label)
        if (isLaunch && settled.has(e.agentId)) {
          settled.delete(e.agentId)
          continue
        }
        if (!isLaunch) settled.add(e.agentId)
      }
      out.push(e)
    }
    return out.reverse()
  }

  static filterOf(view: FlowView, agents: FlowAgent[]): { current: string; next: string } {
    const filters = [...Flow.FILTERS, ...Array.from(new Set(agents.map(a => a.type)))]
    const current = filters.includes(view.filter) ? view.filter : 'essential'
    return { current, next: filters[(filters.indexOf(current) + 1) % filters.length] ?? 'essential' }
  }

  static isShown(e: FlowEvent, filter: string): boolean {
    if (filter === 'all') return true
    if (filter === 'errors') return e.isError || e.kind === 'alert' || e.kind === 'hook'
    if (filter === 'essential') return e.isError || e.kind === 'verif' || e.kind === 'alert' || e.kind === 'prompt' || e.kind === 'end' || e.kind === 'hook'
    return Flow.agentName(e.agentId) === filter
  }

  static eventLine(e: FlowEvent, data: Snapshot): { icon: string; text: string; color: Rgb } {
    const plain = e.label.replace(/ \(([^)]+)\)$/, ' · $1')
    if (e.kind === 'end') {
      const agent = data.agents.find(a => a.id === e.agentId)
      if (agent === undefined || agent.endedAt === 0) return { icon: e.isError ? '✗' : '✓', text: plain, color: e.isError ? Theme.KO : Theme.TEXT }
      const duration = Theme.duration(agent.endedAt - agent.startedAt)
      const review = View.latestReviews(data.reviews).find(r => r.agentId === agent.id)
      const tail = review ? ` · ${review.verdict || 'revue'} ${View.counts(review)}` : agent.files.length > 0 ? ` · ${View.plural(agent.files.length, 'file')}` : ''
      const isFailed = agent.status === 'failed' || agent.status === 'killed'
      return { icon: isFailed ? '✗' : '✓', text: `${isFailed ? 'failed' : 'done'} ${duration}${tail}`, color: isFailed ? Theme.KO : Theme.TEXT }
    }
    if (e.kind === 'verif') {
      const isLaunch = / started( \(background\))?$/.test(e.label)
      return { icon: isLaunch ? '◌' : e.isError ? '✗' : '✓', text: plain, color: e.isError ? Theme.KO : isLaunch ? Theme.MUTED : Theme.TEXT }
    }
    if (e.kind === 'alert') return { icon: e.isError ? '✗' : '!', text: plain, color: e.isError ? Theme.KO : Theme.WARN }
    return { icon: e.isError ? '✗' : View.EVENT_ICONS[e.kind], text: plain, color: e.isError ? Theme.KO : e.kind === 'spawn' || e.kind === 'prompt' ? Theme.TEXT : Theme.MUTED }
  }

  static historyHead(ui: Ui, width: number, data: Snapshot, right: string): RenderElement {
    const { Box, Button, Text } = ui
    const filter = View.filterOf(data.view, data.agents)
    const isLanes = data.view.mode === 'couloirs'
    return (
      <Box key="history-head" justifyContent="space-between" width={width}>
        <Box columnGap={2}>
          {!isLanes && (
            <Button key="filter" plain hotkey="f" onPress={() => void Flow.setView(v => ({ ...v, filter: filter.next }))}>
              <Text color={View.hex(Theme.TEXT)}>{filter.current}</Text>
            </Button>
          )}
          <Button key="mode" plain hotkey="c" onPress={() => void Flow.setView(v => ({ ...v, mode: v.mode === 'couloirs' ? 'journal' : 'couloirs' }))}>
            <Text color={View.hex(Theme.TEXT)}>{isLanes ? 'journal' : 'lanes'}</Text>
          </Button>
        </Box>
        <Text color={View.hex(Theme.MUTED)}>{right}</Text>
      </Box>
    )
  }

  static journal(ui: Ui, width: number, viewportRows: number, data: Snapshot): RenderElement[] {
    const { Box, Text } = ui
    Runtime.mode = 'none'
    const all = View.merged(data.events)
    const filter = View.filterOf(data.view, data.agents).current
    const events = all.filter(e => View.isShown(e, filter))
    const hidden = all.length - events.length
    const shown = events.slice(-Math.max(6, viewportRows - 6)).reverse()
    const right = `${all.length} events${hidden > 0 ? ` · ${hidden} hidden` : ''}`
    return [
      View.historyHead(ui, width, data, right),
      shown.length === 0 ? (
        <Text key="none" color={View.hex(Theme.MUTED)}>
          {all.length === 0 ? 'No events yet.' : 'Nothing to show for this filter.'}
        </Text>
      ) : (
        <Box key="events" flexDirection="column">
          {shown.map(e => {
            const line = View.eventLine(e, data)
            const name = e.agentId === '' ? 'main' : Flow.agentName(e.agentId)
            return (
              <Text key={`ev-${e.id}`}>
                <Text color={View.hex(Theme.FAINT)}>{View.hm(e.at)} </Text>
                <Text color={View.hex(View.agentColor(e.agentId))}>{Theme.pad(Theme.truncate(name, 11), 12)}</Text>
                <Text color={View.hex(line.color)}>
                  {line.icon} {Theme.truncate(line.text, Math.max(8, width - 20))}
                </Text>
              </Text>
            )
          })}
        </Box>
      ),
    ]
  }

  static couloirs(ui: Ui, width: number, data: Snapshot): RenderElement[] {
    const { Box, Button, Text } = ui
    const now = Date.now()
    const isReplay = Flow.isReplay()
    const rows = Scene.laneRows(data.agents.length)
    Runtime.mode = 'lanes'
    Runtime.columns = width
    Runtime.rows = rows
    const total = data.agents.length > 0 ? now - Flow.firstAt() : 0
    const calls = data.events.filter(e => e.kind === 'tool').length
    const speedIndex = Flow.SPEEDS.indexOf(data.view.replaySpeed)
    const nextSpeed = Flow.SPEEDS[(speedIndex + 1) % Flow.SPEEDS.length] ?? 8
    const agents = [...data.agents].sort((a, b) => a.startedAt - b.startedAt).slice(-16)
    const nameWidth = View.nameWidth(agents)
    return [
      View.historyHead(ui, width, data, `${Theme.duration(total)} · max parallelism ${Flow.maxParallel(data.agents, now)} · ${View.plural(calls, 'call')}`),
      View.legend(ui),
      <Box key="lanes-box">{View.picture(ui, 'lanes', width, rows, Flow.cachedCells(now).encoded)}</Box>,
      <Box key="replay" columnGap={2}>
        <Button
          key="play"
          plain
          hotkey="p"
          onPress={() => {
            if (!data.view.isReplaying) Flow.startReplay()
            void Flow.setView(v => ({ ...v, isReplaying: !v.isReplaying }))
          }}
        >
          <Text color={View.hex(Theme.TEXT)}>{data.view.isReplaying ? 'Pause' : isReplay ? 'Resume' : 'Replay'}</Text>
        </Button>
        <Button key="speed" plain hotkey="v" onPress={() => void Flow.setView(v => ({ ...v, replaySpeed: nextSpeed }))}>
          <Text color={View.hex(Theme.TEXT)}>{`Speed ×${data.view.replaySpeed}`}</Text>
        </Button>
        {isReplay && (
          <Button
            key="live"
            plain
            hotkey="l"
            onPress={() => {
              Runtime.replayAt = 0
              void Flow.setView(v => ({ ...v, isReplaying: false }))
            }}
          >
            <Text color={View.hex(Theme.TEXT)}>Live</Text>
          </Button>
        )}
      </Box>,
      agents.length === 0 ? (
        <Text key="chrono-empty" color={View.hex(Theme.MUTED)}>
          The lanes fill up from the first sub-agent.
        </Text>
      ) : (
        <Box key="chrono-table" flexDirection="column">
          {agents.map(a => {
            const accent = Robots.accent(a.type)
            return (
              <Button key={`chrono-${a.id}`} plain onPress={() => Runtime.openAgent(a.id)}>
                <Text color={View.hex(Theme.statusColor(a.status, accent))}>{Theme.statusGlyph(a.status, 0)} </Text>
                <Text color={View.hex(accent)}>{Theme.pad(a.type, nameWidth)}</Text>
                <Text color={View.hex(Theme.TEXT)}>{Theme.pad(Theme.duration((a.endedAt || now) - a.startedAt), 7)}</Text>
                <Text color={View.hex(Theme.MUTED)}>{Theme.pad(View.plural(a.toolCount, 'call'), 11)}</Text>
                <Text color={View.hex(Theme.FAINT)}>{`${a.files.length} f.`}</Text>
              </Button>
            )
          })}
        </Box>
      ),
    ]
  }

  static historique(ui: Ui, width: number, viewportRows: number, data: Snapshot): RenderElement[] {
    return data.view.mode === 'couloirs' ? View.couloirs(ui, width, data) : View.journal(ui, width, viewportRows, data)
  }

  static anomalies(c: FlowContext): { label: string; action: string }[] {
    const out: { label: string; action: string }[] = []
    if (c.fetchAgeMs < 0) out.push({ label: 'Never fetched', action: 'git fetch origin' })
    else if (c.fetchAgeMs > Flow.FETCH_STALE_MS) out.push({ label: 'Fetch > 24 h', action: 'git fetch origin' })
    if (c.behind > Flow.BEHIND_WARN) out.push({ label: `${c.behind} commits behind`, action: `merge ${c.base || Runtime.project.manifest.git.base}` })
    if (c.schemaEditedAt > c.imageBuiltAt) out.push({ label: `Schema modified ${View.hm(c.schemaEditedAt)}`, action: c.isArm ? 'rebuild the amd64 image' : 'rebuild the image' })
    return out
  }

  static nextStep(data: Snapshot): { text: string; role?: RoleId; command?: string } {
    const project = Runtime.project
    const cmd = (role: RoleId): string | undefined => Project.command(project, role)
    if (!project.hasClaude) return { text: 'Project without .claude/: run /maestro', role: 'setup', command: 'maestro' }
    if (data.agents.some(a => a.status === 'running')) return { text: 'Orchestration in progress' }
    const failing = (Object.keys(data.verif) as VerifKey[]).filter(k => data.verif[k].status === 'ko')
    if (failing.length > 0) {
      const role: RoleId = cmd('fix') ? 'fix' : 'investigate'
      return { text: `Verification failed (${failing.map(k => Flow.VERIF_LABELS[k]).join(', ')}): fix`, role, command: cmd(role) }
    }
    if (data.reviews.some(r => r.verdict === 'FAIL')) return { text: 'Review failed: address the findings', role: 'fix', command: cmd('fix') }
    if (project.manifest.stage === 'genesis') {
      const steps: RoleId[] = ['kickoff', 'stack', 'foundations']
      const first = steps.find(r => cmd(r) !== undefined)
      return { text: 'Project starting: scoping → technical choices → foundations, then /maestro', role: first, command: first ? cmd(first) : 'maestro' }
    }
    const verified = (['build', 'unit'] as VerifKey[]).every(k => data.verif[k].status === 'ok')
    if (data.context.changes > 0 && verified && cmd('deliver')) return { text: 'Verifications green: deliver', role: 'deliver', command: cmd('deliver') }
    if (data.context.changes > 0 && !verified) return { text: 'Changes in progress: run the verification', role: 'feature' }
    const starters = (['feature', 'fix', 'investigate'] as RoleId[]).map(r => cmd(r)).filter((c): c is string => c !== undefined)
    if (starters.length === 0) return { text: 'Nothing in progress: run /maestro to set up the project', role: 'setup', command: 'maestro' }
    return { text: `Nothing in progress: run ${starters.slice(0, 2).map(c => `/${c}`).join(' or ')}.`, role: 'feature', command: starters[0] }
  }

  static projectCommands(): (CommandDef & { role?: RoleId })[] {
    const project = Runtime.project
    const group = Project.groups(project).find(g => g.id === 'project')
    if (group) return group.commands.filter(c => !View.isOwnPanel(c.name))
    return Object.entries(project.manifest.roles)
      .filter(([, c]) => c !== undefined && c !== '' && c !== 'maestro' && !View.isOwnPanel(c))
      .map(([role, name]) => ({ name: name ?? '', description: '', source: 'user', role: role as RoleId }))
  }

  static commandStrip(ui: Ui, width: number): RenderElement[] {
    const { Box, Button, Text } = ui
    const commands = View.projectCommands()
    if (commands.length === 0) return []
    const column = Math.min(18, Math.max(...commands.map(c => View.width(c.name) + 2)))
    return [
      <Text key="strip-title" color={View.hex(Theme.FAINT)}>
        {Theme.truncate('Project commands (5: Tools for details):', width)}
      </Text>,
      ...commands.map(c => {
        const head = Theme.pad(`/${c.name}`, column)
        const about = View.firstSentence(c.description) || (c.role ? Project.ROLE_LABELS[c.role] : '')
        return (
          <Box key={`strip-${c.name}`}>
            <Button key={`strip-cmd-${c.name}`} plain onPress={() => void Runtime.io.fill(`/${c.name} `)}>
              <Text color={View.hex(Theme.ORCH)}>{head}</Text>
            </Button>
            <Text color={View.hex(Theme.MUTED)}>{` ${Theme.truncate(about, Math.max(0, width - View.width(head) - 1))}`}</Text>
          </Box>
        )
      }),
    ]
  }

  static isOwnPanel(name: string): boolean {
    return (name.split(':').pop() ?? name) === PANE
  }

  static firstSentence(text: string): string {
    const clean = text.replace(/\s+/g, ' ').trim()
    const cut = /^(.+?[.!?])(\s|$)/.exec(clean)?.[1] ?? clean
    return cut.replace(/[.]$/, '')
  }

  static startHint(): string {
    const starters = (['feature', 'fix'] as RoleId[]).map(r => Project.command(Runtime.project, r)).filter((c): c is string => c !== undefined)
    if (starters.length === 0) return Runtime.project.hasClaude ? 'Nothing in progress.' : 'Nothing in progress: run /maestro to set up the project.'
    return `Nothing in progress: run ${starters.map(c => `/${c}`).join(' or ')}.`
  }

  static stageLabel(): string {
    const p = Runtime.project
    if (!p.hasClaude) return 'no .claude/ setup'
    if (!p.hasManifest) return 'set up, no manifest (roles inferred)'
    return p.manifest.stage === 'genesis' ? 'starting (genesis)' : 'complete'
  }

  static commandes(ui: Ui, width: number, data: Snapshot): RenderElement[] {
    const { Box, Button, Text } = ui
    Runtime.mode = 'none'
    const project = Runtime.project
    const fill = (name: string): void => void Runtime.io.fill(`/${name} `)
    const out: RenderElement[] = []
    const next = View.nextStep(data)
    out.push(View.rule(ui, 'NEXT STEP', width, View.stageLabel()))
    out.push(
      next.command ? (
        <Button key="next-step" plain onPress={() => fill(next.command ?? '')}>
          <Text color={View.hex(Theme.ORCH)}>{Theme.truncate(`› ${next.text}  [/${next.command}]`, width)}</Text>
        </Button>
      ) : (
        <Text key="next-step" color={View.hex(Theme.MUTED)}>
          {Theme.truncate(`› ${next.text}`, width)}
        </Text>
      ),
    )
    const groups = Project.groups(project)
    for (const group of groups) {
      if (group.id === 'builtin') {
        out.push(
          <Text key="cmd-builtin" color={View.hex(Theme.FAINT)}>
            {Theme.truncate(`Claude Code: ${group.commands.length} built-in commands (/help)`, width)}
          </Text>,
        )
        continue
      }
      out.push(View.rule(ui, group.label.toUpperCase(), width, String(group.commands.length)))
      for (const c of group.commands) {
        const role = View.isOwnPanel(c.name) ? undefined : c.role
        const tag = role ? Project.ROLE_LABELS[role] : ''
        const head = `/${c.name}`
        const rest = Math.max(0, width - View.width(head) - (tag === '' ? 1 : View.width(tag) + 4))
        out.push(
          <Box key={`row-${group.id}-${c.name}`}>
            <Button key={`cmd-${group.id}-${c.name}`} plain onPress={() => fill(c.name)}>
              <Text color={View.hex(role ? Theme.ORCH : Theme.TEXT)}>{head}</Text>
            </Button>
            {tag !== '' && <Text color={View.hex(Theme.WARN)}>{` [${tag}]`}</Text>}
            <Text color={View.hex(Theme.MUTED)}>{` ${Theme.truncate(c.description, rest)}`}</Text>
          </Box>,
        )
      }
    }
    if (groups.length === 0) out.push(<Text key="cmd-none" color={View.hex(Theme.MUTED)}>Command list unavailable for now.</Text>)
    const missing = (Object.keys(Project.ROLE_LABELS) as RoleId[]).filter(r => r !== 'setup' && project.manifest.roles[r] === undefined)
    if (project.hasClaude && missing.length > 0) {
      out.push(
        <Text key="cmd-missing" color={View.hex(Theme.FAINT)}>
          {Theme.truncate(`Roles without a command: ${missing.map(r => Project.ROLE_LABELS[r].toLowerCase()).join(', ')}`, width)}
        </Text>,
      )
    }
    if (project.agents.length > 0) {
      out.push(View.rule(ui, 'AGENTS', width, String(project.agents.length)))
      for (const a of project.agents) {
        const phase = project.manifest.phases.find(p => p.agents.includes(a.name))?.short ?? ''
        const model = a.model === '' ? 'inherited' : a.model
        out.push(
          <Text key={`agent-${a.name}`} color={View.hex(Theme.TEXT)}>
            {Theme.truncate(`${Theme.pad(a.name, 22)} ${Theme.pad(model, 7)} ${phase}`, width)}
          </Text>,
        )
      }
    }
    return out
  }

  static contexte(ui: Ui, width: number, data: Snapshot): RenderElement[] {
    const { Box, Button, Text } = ui
    Runtime.mode = 'none'
    const now = Date.now()
    const c = data.context
    const anomalies = View.anomalies(c)
    const families = new Map<string, number>()
    for (const u of data.usage) {
      const family = Theme.family(u.model)
      const label = family === 'other' ? 'Others' : Theme.modelLabel(u.model)
      families.set(label, (families.get(label) ?? 0) + u.tokensIn + u.tokensOut + u.cacheRead + u.cacheWrite)
    }
    const tokens = Array.from(families.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([label, n]) => `${label} ${Theme.tokens(n)}`)
      .join(' · ')
    const changes = c.changes === 0 ? 'No uncommitted file' : `${View.plural(c.changes, 'file')} uncommitted`
    const fetch = c.fetchAgeMs >= 0 ? View.fetchAge(c.fetchAgeMs) : 'never fetched'
    return [
      View.branchLine(ui, 'ctx-branch', width, c),
      <Text key="ctx-changes" color={View.hex(Theme.MUTED)}>
        {Theme.truncate(`  ${changes} · ${fetch}`, width)}
      </Text>,
      View.rule(ui, 'WATCH', width),
      ...(anomalies.length === 0
        ? [
            <Text key="ctx-clean" color={View.hex(Theme.OK)}>
              ✓ Nothing to report
            </Text>,
          ]
        : anomalies.map(a => (
            <Text key={`ctx-anomaly-${a.label}`}>
              <Text color={View.hex(Theme.WARN)}>! {Theme.pad(a.label, 24)}</Text>
              <Text color={View.hex(Theme.TEXT)}>{Theme.truncate(`→ ${a.action}`, Math.max(6, width - 26))}</Text>
            </Text>
          ))),
      View.rule(ui, 'TIME AND TOKENS', width),
      <Text key="ctx-time">
        <Text color={View.hex(Theme.TEXT)}>{c.wi !== '' ? `WI #${c.wi} ` : 'No work item '}</Text>
        <Text color={View.hex(Theme.ACCENT)} bold>
          {Theme.duration(c.workMs)}
        </Text>
        <Text color={View.hex(Theme.MUTED)}> · session {Theme.duration(c.sessionWorkMs)}</Text>
      </Text>,
      <Text key="ctx-tokens" color={View.hex(tokens === '' ? Theme.FAINT : Theme.MUTED)}>
        {Theme.truncate(tokens === '' ? 'Tokens are counted at the end of each turn' : tokens, width)}
      </Text>,
      <Box key="ctx-actions">
        <Button key="ctx-refresh" plain hotkey="r" onPress={() => void Flow.refreshContext(true)}>
          <Text color={View.hex(Theme.TEXT)}>Refresh</Text>
        </Button>
        <Text color={View.hex(Theme.FAINT)}> · updated {View.ago(now, c.refreshedAt)}</Text>
      </Box>,
    ]
  }
}

class Recap {
  static text(data: Snapshot, now: number): string {
    return Recap.recap(data, now)
  }

  static answer(recap: string, copied: { isCopied: boolean; reason?: string } | undefined): string {
    if (copied?.isCopied === true) return recap
    return `Copying to the clipboard failed (${copied?.reason ?? 'error'}): recap below.\n\n${recap}`
  }

  private static recap(data: Snapshot, now: number): string {
    const c = data.context
    const lines: string[] = [
      `Maestro — ${c.wi !== '' ? `WI #${c.wi}` : 'No work item'} · ${c.branch || '…'} (vs ${c.base || Runtime.project.manifest.git.base})`,
      `Time spent: ${c.wi !== '' ? `WI #${c.wi}` : 'work item'} ${Theme.duration(c.workMs)} · session ${Theme.duration(c.sessionWorkMs)}`,
      '',
      ...Recap.agents(data.agents, now),
      '',
      ...Recap.verif(data),
      '',
      `Delivery: ${Recap.readiness(data)}`,
      '',
      ...Recap.reviews(data.reviews),
      '',
      ...Recap.layers(c),
      '',
      Recap.alerts(data.alerts),
    ]
    return lines.join('\n')
  }

  private static agents(agents: FlowAgent[], now: number): string[] {
    const sorted = [...agents].sort((a, b) => a.startedAt - b.startedAt)
    if (sorted.length === 0) return ['Agents: no sub-agent started']
    return [
      `Agents (${sorted.length}):`,
      ...sorted.map(
        a =>
          `  ${Theme.statusGlyph(a.status, 0)} ${a.type} · ${Theme.modelLabel(a.model) || '—'} · ${Theme.duration((a.endedAt || now) - a.startedAt)} · ${View.statusWord(a.status)} · ${a.description}`,
      ),
    ]
  }

  private static verif(data: Snapshot): string[] {
    const keys = Object.keys(Flow.VERIF_LABELS) as VerifKey[]
    return [
      'Verification:',
      ...keys.map(k => {
        const step = data.verif[k]
        if (Rules.isStale(step, data.context.codeEditedAt)) return `  ≈ ${Flow.VERIF_LABELS[k]} : ${View.staleNote(data.context.editsSinceVerif)}`
        const status = step.status === 'idle' ? 'not run' : step.status === 'running' ? 'running' : step.status === 'ok' ? 'OK' : step.status === 'stale' ? 'no result' : 'FAILED'
        return `  ${Theme.verifGlyph(step.status)} ${Flow.VERIF_LABELS[k]} : ${status}${step.durationMs > 0 ? ` (${Theme.duration(step.durationMs)})` : ''}`
      }),
    ]
  }

  private static readiness(data: Snapshot): string {
    const readiness = Rules.readiness(data.verif, data.reviews, data.context.codeEditedAt, Flow.VERIF_LABELS)
    if (readiness.state === 'ready') return '✓ Ready to deliver'
    if (readiness.state === 'reviews') return '… reviews to do'
    return `◌ Not ready yet: ${readiness.reasons.join(', ')}`
  }

  private static reviews(reviews: FlowReview[]): string[] {
    if (reviews.length === 0) return ['Reviews: no review completed']
    return [
      'Reviews:',
      ...reviews.map(r => `  ${View.verdictLabel(r)} ${r.type} · ${View.plural(r.critical, 'critical', 'critical')}, ${View.plural(r.major, 'major', 'major')}, ${View.plural(r.minor, 'minor', 'minor')}`),
    ]
  }

  private static layers(c: FlowContext): string[] {
    if (c.layers.length === 0) return ['Modified files: clean working tree']
    return [`Modified files by layer (${View.plural(c.changes, 'file')}):`, ...c.layers.map((l, i) => `  ${i + 1}. ${l.name} : ${l.count}`)]
  }

  private static alerts(alerts: FlowAlert[]): string {
    if (alerts.length === 0) return 'Alerts: none, the repo rules are respected'
    const errors = alerts.filter(a => a.level === 'error').length
    const counts = new Map<RuleId, number>()
    for (const a of alerts) counts.set(a.rule, (counts.get(a.rule) ?? 0) + 1)
    const detail = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([rule, n]) => `${Rules.label(rule)} ×${n}`)
      .join(', ')
    return `Alerts: ${View.plural(alerts.length, 'alert')} (${View.plural(errors, 'error')}, ${View.plural(alerts.length - errors, 'warning')}) · ${detail}`
  }
}

type Snapshot = {
  agents: FlowAgent[]
  events: FlowEvent[]
  alerts: FlowAlert[]
  verif: FlowVerif
  main: FlowMain
  usage: FlowUsage[]
  reviews: FlowReview[]
  context: FlowContext
  view: FlowView
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    Runtime.cwd = e.cwd
    for (const t of Runtime.timers) t.cancel()
    Runtime.timers = []
    Runtime.ticker?.cancel()
    Runtime.ticker = undefined
    Runtime.epoch = Date.now()
    Runtime.frame = 0
    Runtime.lastTickAt = 0
    Runtime.tickMs = 0
    Runtime.layoutAt = 0
    Runtime.lastBlitAt = 0
    Runtime.isWanted = false
    await $.command.register({
      name: 'maestro-stage',
      description: 'Live side panel of the agents (tabs: flow, delivery, history, context, tools; reset to clear)',
      argumentHint: '[flow|delivery|history|context|tools|recap|accessory [name|list]|notify on|notify off|reset|disco|quad|half|auto|fps <10-60>]',
    })
    await $.command.register({
      name: 'maestro',
      description: 'Builds or adapts the project .claude/ setup (agents, skills, hooks, rules) following the orchestrator vision',
      argumentHint: '[new|existing|update|audit]',
    })
    Runtime.ports = {
      agents: change => update($, agentsAtom, change),
      events: change => update($, eventsAtom, change),
      alerts: change => update($, alertsAtom, change),
      usage: change => update($, usageAtom, change),
      reviews: change => update($, reviewsAtom, change),
      verif: change => update($, verifAtom, change),
      main: change => update($, mainAtom, change),
      context: change => update($, contextAtom, change),
      view: change => update($, viewAtom, change),
      readAlerts: () => read($, alertsAtom),
      readVerif: () => read($, verifAtom),
      toast: (text, options) => void $.ui.toast(text, options),
      notify: (text, title) => $.ui.notify(text, { title }),
      snapshot: async () => ({
        agents: await read($, agentsAtom),
        events: await read($, eventsAtom),
        alerts: await read($, alertsAtom),
        verif: await read($, verifAtom),
        main: await read($, mainAtom),
        usage: await read($, usageAtom),
        reviews: await read($, reviewsAtom),
        context: await read($, contextAtom),
        view: await read($, viewAtom),
      }),
      status: text => $.ui.status(text),
      storeGet: key => $.store.get(key),
      storeSet: (key, value) => $.store.set(key, value),
      run: (argv, init) => $.process.run(argv, init),
      now: () => $.clock.now().catch(() => Date.now()),
      list: path => $.fs.list(path),
      read: path => $.fs.read(path),
      stat: path => $.fs.stat(path),
      commands: async () => (await $.command.list()).map(c => ({ name: c.name, description: c.description, source: c.source, plugin: c.plugin })),
      fill: async text => {
        await $.prompt.fill({ text })
      },
      agentList: () => $.agent.list(),
      blit: args => $.ui.blit(args),
      every: (ms, fn) => $.clock.every(ms, fn),
      open: () => $.ui.open({ id: PANE, title: 'Maestro', backgroundColor: Theme.BACKDROP, columns: 84 }).then(r => r.isPlaced),
      invalidate: () => $.ui.invalidate('ui.render'),
      termProgram: () => $.env.get('TERM_PROGRAM'),
      term: () => $.env.get('TERM'),
    }
    Runtime.agents = await read($, agentsAtom)
    Runtime.events = await read($, eventsAtom)
    Runtime.main = await read($, mainAtom)
    Runtime.view = await read($, viewAtom)
    Runtime.context = await read($, contextAtom)
    await Flow.settleOrphans()
    Runtime.toolMilestone = Flow.MILESTONES.filter(m => m <= Flow.toolTotal()).pop() ?? 0
    Runtime.combo = 0
    Runtime.comboAt = 0
    Runtime.graphCache = undefined
    Runtime.lastNotifyAt = 0
    Runtime.isNotifying = (await $.store.get('notifications').catch(() => undefined)) !== false
    await Flow.loadFps()
    const worn = await Flow.dressUp(await read($, accessoryAtom), false)
    await update($, accessoryAtom, () => worn)
    await Flow.detectRenderMode()
    await Flow.loadProject()
    void Flow.refreshContext(true)
    try {
      Runtime.timers.push(
        $.clock.every(2000, () => {
          void Flow.sync()
          void Flow.enqueue(() => Flow.expireBackground())
        }),
      )
      Runtime.timers.push(
        $.clock.every(Flow.CONTEXT_REFRESH_MS, () => {
          if (!Flow.isDormant(Date.now())) void Flow.refreshContext(false)
        }),
      )
      Runtime.timers.push($.clock.every(30_000, () => void Flow.persistWork()))
    } catch {
      Runtime.timers = []
    }
    if (!Runtime.view.isClosed && Flow.mayAutoOpen()) void Flow.placePane()
    return next(e)
  })

  on('command.run', { command: 'maestro' }, async ($, e) => {
    const args = e.args.trim()
    const line = `/${Flow.SKILL}${args === '' ? '' : ` ${args}`}`
    $.clock.after(50, () => {
      void $.command.run({ command: Flow.SKILL, args }).catch(() => $.prompt.submit({ text: line }))
    })
    return { text: `Maestro${args === '' ? '' : ` (${args})`}: launching ${line}` }
  })

  on('command.run', { command: 'maestro-stage' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'hd') {
      await Flow.forceRenderMode('hd')
      await Flow.openPane()
      return { text: 'HD mode was removed: pixel rendering is smoother.' }
    }
    if (arg === 'quad' || arg === 'half' || arg === 'auto') {
      await Flow.forceRenderMode(arg)
      await Flow.openPane()
      return { text: `Maestro: ${arg === 'auto' ? `automatic (${Runtime.renderMode})` : arg} rendering.` }
    }
    if (arg === 'fps' || arg.startsWith('fps ')) {
      const wanted = arg.slice('fps'.length).trim()
      if (wanted === '') return { text: `Maestro: ${Flow.effectiveFps()} fps (max ${Runtime.fps}, ${Runtime.renderMode.toUpperCase()}).` }
      const fps = Flow.parseFps(wanted)
      if (fps === undefined) return { text: `Maestro: fps expected between ${Flow.MIN_FPS} and ${Flow.MAX_FPS}.` }
      await Flow.setFps(fps)
      const capped = Flow.fpsCap() < fps ? ` (capped at ${Flow.fpsCap()} in ${Runtime.renderMode.toUpperCase()})` : ''
      return { text: `Maestro: ${fps} fps max${capped}.` }
    }
    if (arg === 'recap') {
      await Flow.refreshContext(false)
      const recap = Recap.text(await Runtime.io.snapshot(), Date.now())
      const copied = await $.ui.copy({ text: recap }).catch(() => undefined)
      return { text: Recap.answer(recap, copied) }
    }
    if (arg === 'notify' || arg.startsWith('notify ')) {
      const wanted = arg.slice('notify'.length).trim()
      const isOn = wanted === 'on' ? true : wanted === 'off' ? false : !Runtime.isNotifying
      await Flow.setNotifying(isOn)
      return { text: `Maestro: notifications ${isOn ? 'enabled' : 'disabled'}.` }
    }
    if (arg === 'reset') {
      await Flow.enqueue(() => Flow.reset())
      return { text: 'Maestro reset.' }
    }
    if (arg === 'accessory' || arg.startsWith('accessory ')) {
      const wanted = arg.slice('accessory'.length).trim()
      const names = Accessories.ALL.map(a => a.id).join(', ')
      if (wanted === 'list') return { text: `Maestro: ${Accessories.ALL.length} accessories (${names}).` }
      const target = wanted === '' ? undefined : Accessories.find(wanted)
      if (wanted !== '' && target === undefined) return { text: `Maestro: unknown accessory. Available: ${names}.` }
      if (target) Robots.wear(target.id)
      const id = target ? target.id : await Flow.dressUp(Robots.wearing(), true)
      await update($, accessoryAtom, () => id)
      Runtime.graphCache = undefined
      Runtime.io.invalidate()
      return { text: `Maestro: ${Accessories.find(id)?.label ?? id} for this session.` }
    }
    if (arg === 'disco') {
      Runtime.isDisco = !Runtime.isDisco
      Runtime.io.toast(`maestro: disco mode ${Runtime.isDisco ? 'on' : 'off'}`, { timeoutMs: 4000 })
      Runtime.io.invalidate()
      return { text: `Maestro: disco mode ${Runtime.isDisco ? 'on' : 'off'}.` }
    }
    const alias = Flow.ALIASES[arg]
    const tab = alias === undefined ? undefined : Flow.TABS.find(t => t.id === alias.tab)
    if (alias !== undefined) await Flow.setView(v => ({ ...v, tab: alias.tab, mode: alias.mode ?? v.mode }))
    const isPlaced = await Flow.openPane()
    return { text: isPlaced ? `Maestro opened${tab ? ` on the ${tab.label} tab` : ''}.` : 'Maestro is waiting for a wider terminal to place itself.' }
  })

  on('tool.call', async ($, e, next) => {
    const pending = Flow.prepare(e)
    if (e.tool === 'Write' && pending.path !== '') {
      pending.previous = await Flow.readText(pending.path)
      pending.isNewFile = pending.previous === ''
    }
    if (e.tool === 'Bash' && Flow.isTreeCommand(pending)) pending.gitBefore = await Flow.treeState()
    void Flow.enqueue(() => Flow.before(e, pending))
    const ran = await next(e)
    await Flow.enqueue(() => Flow.after(e, ran, pending))
    if (/(^|[\\/])\.claude[\\/]/.test(pending.path)) void Flow.loadProject()
    return ran
  })

  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    if (!r.deny && r.agentId) {
      const agentId = r.agentId
      await Flow.enqueue(() => Flow.spawned(agentId, e.subagentType, e.description, r.model, e.parentAgentId ?? ''))
    }
    return r
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    await Flow.enqueue(() => Flow.completed(e))
    return r
  })

  on('prompt.submit', async ($, e, next) => {
    if (!Runtime.isPlaced && !Runtime.view.isClosed && Flow.mayAutoOpen() && e.isMeta !== true && !Flow.isTaskNotification(e)) {
      try {
        const opened = await $.ui.open({ id: PANE, title: 'Maestro', backgroundColor: Theme.BACKDROP, columns: 84 })
        Runtime.isPlaced = opened.isPlaced
      } catch {
        Runtime.isPlaced = false
      }
    }
    if (Flow.isTaskNotification(e)) {
      const text = e.text
      void Flow.enqueue(() => Flow.resolveBackground(text))
      return next(e)
    }
    if (e.command === undefined) {
      Flow.touch()
      const now = Date.now()
      Runtime.runStartedAt = now
      void Flow.enqueue(async () => {
        await Flow.setMain(m => ({ ...m, isBusy: true, busySince: m.isBusy ? m.busySince : now }))
        void Flow.pushEvent('', 'prompt', 'New prompt', false)
      })
    }
    return next(e)
  })

  on('session.attach', async ($, e, next) => {
    const r = await next(e)
    if (e.surface === 'terminal' && !Runtime.view.isClosed && !Runtime.isPlaced && Flow.mayAutoOpen()) {
      Runtime.openAttempts = 0
      void Flow.placePane()
    }
    return r
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) {
      Runtime.mode = 'none'
      Runtime.columns = 0
      Runtime.isPlaced = false
      if (e.origin.kind === 'person') void Flow.enqueue(() => Flow.setView(v => ({ ...v, isClosed: true })))
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const data: Snapshot = {
      agents: await read($, agentsAtom),
      events: await read($, eventsAtom),
      alerts: await read($, alertsAtom),
      verif: await read($, verifAtom),
      main: await read($, mainAtom),
      usage: await read($, usageAtom),
      reviews: await read($, reviewsAtom),
      context: await read($, contextAtom),
      view: await read($, viewAtom),
    }
    Runtime.agents = data.agents
    Runtime.events = data.events
    Runtime.main = data.main
    Runtime.view = data.view
    Runtime.context = data.context
    Runtime.openAgent = agentId => void (agentId === '' ? $.ui.view({}) : $.ui.view({ agentId }))

    if (e.surface !== 'terminal') {
      const { Box, Text } = $.ui.resolve(e)
      return (
        <Box flexDirection="column">
          <Text bold>Maestro</Text>
          {data.agents.slice(-12).map(a => (
            <Text key={a.id}>
              {Theme.statusGlyph(a.status, 0)} {a.type} · {a.description}
            </Text>
          ))}
        </Box>
      )
    }

    const ui = $.ui.resolve(e)
    const { Box } = ui
    const width = Math.max(30, Math.min(250, e.props.bodyColumns))
    const scroll = (e.props as { scroll?: { offset: number; bodyRows: number } }).scroll
    Runtime.scrollOffset = scroll?.offset ?? 0
    const viewportRows = scroll && scroll.bodyRows > 0 ? scroll.bodyRows : (e.viewport?.rows ?? 40)
    const resolved = Flow.tabOf(data.view.tab)
    const view: FlowView = { ...data.view, tab: resolved.tab, mode: resolved.mode ?? data.view.mode }
    const shown: Snapshot = { ...data, view }
    const body =
      view.tab === 'historique'
        ? View.historique(ui, width, viewportRows, shown)
        : view.tab === 'livraison'
          ? View.livraison(ui, width, shown)
          : view.tab === 'contexte'
            ? View.contexte(ui, width, shown)
            : view.tab === 'commandes'
              ? View.commandes(ui, width, shown)
              : View.flux(ui, width, viewportRows, shown)
    const isFocused = (e.props as { isFocused?: boolean }).isFocused === true

    return (
      <Box flexDirection="column" width={width}>
        {View.header(ui, width, shown)}
        {View.tabs(ui, width, view)}
        <Box flexDirection="column">{body}</Box>
        {isFocused && View.footer(ui, width, shown)}
      </Box>
    )
  })
}
