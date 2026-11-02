export type FlowStatus = 'running' | 'completed' | 'failed' | 'killed'

export type FlowAgent = {
  id: string
  type: string
  description: string
  model: string
  parentId: string
  status: FlowStatus
  startedAt: number
  endedAt: number
  tool: string
  toolCount: number
  files: string[]
  tokensIn: number
  tokensOut: number
}

export type FlowEventKind = 'spawn' | 'tool' | 'end' | 'alert' | 'verif' | 'prompt' | 'hook'

export type FlowEvent = {
  id: number
  at: number
  agentId: string
  kind: FlowEventKind
  label: string
  isError: boolean
}

export type AlertLevel = 'error' | 'warn'

export type RuleId =
  | 'generated'
  | 'comment'
  | 'var'
  | 'function'
  | 'partition'
  | 'ai-mention'
  | 'hook'
  | 'v1'
  | 'isolation'
  | 'docker'

export type FlowAlert = {
  id: string
  at: number
  level: AlertLevel
  rule: RuleId
  file: string
  agentId: string
  detail: string
}

export type VerifKey = 'build' | 'format' | 'lint' | 'unit' | 'integ' | 'front' | 'e2e'

export type VerifStatus = 'idle' | 'running' | 'ok' | 'ko' | 'stale'

export type FlowVerifStep = {
  status: VerifStatus
  at: number
  durationMs: number
  detail: string
  agentId: string
}

export type FlowVerif = Record<VerifKey, FlowVerifStep>

export type FlowMain = {
  tool: string
  toolCount: number
  isBusy: boolean
  busySince: number
  model: string
}

export type FlowUsage = {
  model: string
  tokensIn: number
  tokensOut: number
  cacheRead: number
  cacheWrite: number
  turns: number
  durationMs: number
}

export type FlowReview = {
  agentId: string
  type: string
  at: number
  verdict: string
  critical: number
  major: number
  minor: number
  highlights: string[]
}

export type FlowLayer = {
  name: string
  count: number
}

export type FlowContext = {
  branch: string
  wi: string
  base: string
  fetchAgeMs: number
  ahead: number
  behind: number
  changes: number
  layers: FlowLayer[]
  relatedBranches: string[]
  v1Files: number
  v2Files: number
  hasEspaces: boolean
  isArm: boolean
  workMs: number
  sessionWorkMs: number
  schemaEditedAt: number
  imageBuiltAt: number
  codeEditedAt: number
  editsSinceVerif: number
  refreshedAt: number
  staleCommitAt: number
}

export type FlowTab = 'flux' | 'livraison' | 'historique' | 'contexte' | 'commandes'

export type HistoryMode = 'journal' | 'couloirs'

export type FlowView = {
  tab: FlowTab
  mode: HistoryMode
  filter: string
  isWhyShown: boolean
  isReplaying: boolean
  replaySpeed: number
  isClosed: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'maestro': {
      agents: Shaped<FlowAgent[]>
      events: Shaped<FlowEvent[]>
      alerts: Shaped<FlowAlert[]>
      verif: Shaped<FlowVerif>
      main: Shaped<FlowMain>
      usage: Shaped<FlowUsage[]>
      reviews: Shaped<FlowReview[]>
      context: Shaped<FlowContext>
      view: Shaped<FlowView>
      accessory: Shaped<string>
    }
  }
}
