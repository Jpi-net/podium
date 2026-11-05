import type { Elements, RenderElement } from 'claude-code'

import { Canvas, type Rgb } from '../canvas'
import { Theme } from '../theme'
import type { SignatureDraft, SignatureViewState } from './signature'
import type { Sizes } from './store'

type Ui = Elements['terminal']

export type SignatureActions = {
  toggle: (key: keyof SignatureDraft) => void
  enable: () => void
  notNow: () => void
  never: () => void
  pause: () => void
  resume: () => void
  erase: () => void
  learnNow: () => void
  learnFrom: () => void
  keep: (id: string) => void
  reject: (id: string) => void
}

type Row = { label: string, text: string }

type Choice = { key: keyof SignatureDraft, label: string }

export class SignatureView {
  private static readonly NARROW = 60
  private static readonly LABEL = 13
  private static readonly TITLE = 'Teach Claude how you work'
  private static readonly INTRO = 'Podium learns how you decide, build and care about security from your sessions and commits, and brings it to every project.'
  private static readonly HOME = /^(?:\/Users\/|\/home\/|[A-Za-z]:\/Users\/)[^/]+/
  private static readonly PRIVACY: readonly Row[] = [
    { label: 'It records', text: "your prompts (masked), your answers to Claude's questions, plans you accept or refuse, and the history of repositories you open" },
    { label: 'Never', text: 'file contents, tool outputs, secrets' },
    { label: 'Sent', text: 'selected excerpts go to Claude through your own session to be summarised (uses your plan, capped)' }
  ]
  private static readonly CHOICES: readonly Choice[] = [
    { key: 'sessions', label: 'Learn from my sessions' },
    { key: 'history', label: 'Read the history of repositories I open' },
    { key: 'background', label: 'Learn in the background when idle' },
    { key: 'apply', label: 'Bring my profile into every session' }
  ]
  private static readonly EXCLUDE_HINT = 'Never learn in: add a .podium-private file to a folder, or /podium-stage signature exclude <folder>'
  private static readonly OFF_HINT = 'Turn it on with /podium-stage signature on.'
  private static readonly BAR = 9
  private static readonly REVIEW_SHOWN = 5
  private static readonly CONFIRM = 'Press Erase again within 30 seconds to erase everything Signature stored.'

  static render(ui: Ui, width: number, state: SignatureViewState, actions: SignatureActions): RenderElement[] {
    const columns = Math.max(20, Math.floor(width))
    if (state.consent === 'enabled' || state.consent === 'paused') return SignatureView.dashboard(ui, columns, state, actions)
    if (state.consent === 'declined' || state.consent === 'never') return SignatureView.off(ui, columns, state)
    return SignatureView.optIn(ui, columns, state, actions)
  }

  static shorten(root: string): string {
    const text = typeof root === 'string' ? root.replace(/\\/g, '/') : ''
    if (text === '') return '~/.claude/podium'
    return text.replace(SignatureView.HOME, '~')
  }

  static bytes(size: number): string {
    const value = typeof size === 'number' && Number.isFinite(size) && size > 0 ? size : 0
    if (value < 1024) return `${Math.round(value)} B`
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
    return `${(value / (1024 * 1024)).toFixed(1)} MB`
  }

  static wrap(text: string, width: number): string[] {
    const limit = Math.max(10, Math.floor(width))
    const lines: string[] = []
    let line = ''
    for (const word of text.split(/\s+/)) {
      if (word === '') continue
      const joined = line === '' ? word : `${line} ${word}`
      if (Array.from(joined).length <= limit || line === '') {
        line = joined
      } else {
        lines.push(line)
        line = word
      }
    }
    if (line !== '') lines.push(line)
    return lines
  }

  private static hex(color: Rgb): string {
    return Canvas.hex(color)
  }

  private static line(ui: Ui, key: string, width: number, text: string, color: Rgb, isBold = false): RenderElement {
    const { Text } = ui
    return (
      <Text key={key} color={SignatureView.hex(color)} bold={isBold}>
        {Theme.truncate(text, width)}
      </Text>
    )
  }

  private static blank(ui: Ui, key: string): RenderElement {
    const { Text } = ui
    return <Text key={key}> </Text>
  }

  private static paragraph(ui: Ui, key: string, width: number, text: string, color: Rgb, indent = 1): RenderElement[] {
    const pad = ' '.repeat(indent)
    return SignatureView.wrap(text, width - indent).map((line, index) => SignatureView.line(ui, `${key}-${index}`, width, pad + line, color))
  }

  private static row(ui: Ui, key: string, width: number, row: Row): RenderElement[] {
    const { Text } = ui
    if (width < SignatureView.NARROW) {
      return [
        SignatureView.line(ui, `${key}-label`, width, ` ${row.label}`, Theme.ACCENT, true),
        ...SignatureView.paragraph(ui, `${key}-text`, width, row.text, Theme.TEXT, 2)
      ]
    }
    const lines = SignatureView.wrap(row.text, width - SignatureView.LABEL - 1)
    return lines.map((line, index) => (
      <Text key={`${key}-${index}`}>
        <Text color={SignatureView.hex(Theme.ACCENT)} bold>
          {Theme.pad(index === 0 ? ` ${row.label}` : '', SignatureView.LABEL)}
        </Text>
        <Text color={SignatureView.hex(Theme.TEXT)}>{line}</Text>
      </Text>
    ))
  }

  private static button(ui: Ui, key: string, label: string, color: Rgb, onPress: () => void): RenderElement {
    const { Button, Text } = ui
    return (
      <Button key={key} plain onPress={onPress}>
        <Text color={SignatureView.hex(color)}>{label}</Text>
      </Button>
    )
  }

  private static buttons(ui: Ui, key: string, width: number, items: { label: string, color: Rgb, onPress: () => void }[]): RenderElement[] {
    const { Box } = ui
    const buttons = items.map((item, index) => SignatureView.button(ui, `${key}-${index}`, `[ ${item.label} ]`, item.color, item.onPress))
    if (width < SignatureView.NARROW) return buttons
    return [
      <Box key={key} columnGap={2}>
        {buttons}
      </Box>
    ]
  }

  private static optIn(ui: Ui, width: number, state: SignatureViewState, actions: SignatureActions): RenderElement[] {
    const out: RenderElement[] = []
    out.push(SignatureView.line(ui, 'sig-title', width, ` ${SignatureView.TITLE}`, Theme.ORCH, true))
    out.push(SignatureView.blank(ui, 'sig-gap-1'))
    out.push(...SignatureView.paragraph(ui, 'sig-intro', width, SignatureView.INTRO, Theme.TEXT))
    out.push(SignatureView.blank(ui, 'sig-gap-2'))
    const rows = [
      ...SignatureView.PRIVACY.slice(0, 2),
      { label: 'Stored', text: `${SignatureView.shorten(state.root)} on this machine` },
      ...SignatureView.PRIVACY.slice(2)
    ]
    rows.forEach((row, index) => out.push(...SignatureView.row(ui, `sig-row-${index}`, width, row)))
    out.push(SignatureView.blank(ui, 'sig-gap-3'))
    for (const choice of SignatureView.CHOICES) {
      const isOn = state.draft[choice.key] === true
      out.push(SignatureView.button(ui, `sig-choice-${choice.key}`, ` ${isOn ? '[x]' : '[ ]'} ${choice.label}`, isOn ? Theme.TEXT : Theme.MUTED, () => actions.toggle(choice.key)))
    }
    out.push(SignatureView.blank(ui, 'sig-gap-4'))
    out.push(...SignatureView.paragraph(ui, 'sig-exclude', width, SignatureView.EXCLUDE_HINT, Theme.MUTED))
    if (state.lastError !== '') out.push(...SignatureView.paragraph(ui, 'sig-error', width, state.lastError, Theme.KO))
    out.push(SignatureView.blank(ui, 'sig-gap-5'))
    out.push(
      ...SignatureView.buttons(ui, 'sig-actions', width, [
        { label: 'Enable', color: Theme.OK, onPress: actions.enable },
        { label: 'Not now', color: Theme.TEXT, onPress: actions.notNow },
        { label: 'Never ask', color: Theme.MUTED, onPress: actions.never }
      ])
    )
    return out
  }

  private static off(ui: Ui, width: number, state: SignatureViewState): RenderElement[] {
    const lead = state.consent === 'never' ? 'Signature is off and will not ask again.' : 'Signature is off.'
    const out: RenderElement[] = [...SignatureView.paragraph(ui, 'sig-off', width, `${lead} ${SignatureView.OFF_HINT}`, Theme.MUTED)]
    if (state.lastError !== '') out.push(...SignatureView.paragraph(ui, 'sig-off-error', width, state.lastError, Theme.KO))
    return out
  }

  private static storage(sizes: Sizes): string {
    const empty = sizes.emptyFiles === 1 ? '1 empty file' : `${sizes.emptyFiles} empty files`
    return `index ${SignatureView.bytes(sizes.indexBytes)} · cases ${SignatureView.bytes(sizes.casesBytes)} · journal ${SignatureView.bytes(sizes.journalBytes)} · ${empty}`
  }

  static ago(now: number, at: number): string {
    if (typeof at !== 'number' || at <= 0) return 'never'
    const minutes = Math.max(0, Math.floor((now - at) / 60_000))
    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes} min ago`
    if (minutes < 60 * 24) return `${Math.floor(minutes / 60)} h ago`
    return `${Math.floor(minutes / (60 * 24))} d ago`
  }

  static bar(strength: number): string {
    const value = typeof strength === 'number' && Number.isFinite(strength) ? Math.min(1, Math.max(0, strength)) : 0
    const filled = Math.round(value * SignatureView.BAR)
    return '█'.repeat(filled) + '░'.repeat(SignatureView.BAR - filled)
  }

  static tokens(count: number): string {
    const value = typeof count === 'number' && Number.isFinite(count) && count > 0 ? count : 0
    return value < 1000 ? String(Math.round(value)) : `${(value / 1000).toFixed(1)} k`
  }

  private static status(state: SignatureViewState, now: number): string {
    const learning = state.learning
    if (state.consent === 'paused') return '◌ paused'
    if (learning.isRunning) {
      const progress = learning.total > 0 ? ` ${learning.done}/${learning.total}` : ''
      return `● learning (${learning.step === '' ? 'starting' : learning.step}${progress})`
    }
    const next = learning.nextRunHint === '' ? '' : ` · next ${learning.nextRunHint}`
    return `● on · last run ${SignatureView.ago(now, learning.lastRunAt)}${next}`
  }

  private static lenses(ui: Ui, width: number, state: SignatureViewState): RenderElement[] {
    const out: RenderElement[] = []
    const names = state.lenses.map((item) => SignatureView.title(item.lens))
    const pad = Math.min(14, Math.max(...names.map((name) => name.length), 0) + 2)
    state.lenses.forEach((item, index) => {
      const name = names[index] ?? ''
      const bar = SignatureView.bar(item.strength)
      if (width < SignatureView.NARROW) {
        out.push(SignatureView.line(ui, `sig-lens-${index}`, width, ` ${name} ${bar}`, Theme.TEXT))
        return
      }
      out.push(SignatureView.line(ui, `sig-lens-${index}`, width, ` ${Theme.pad(name, pad)}${bar}  ${item.summary}`, Theme.TEXT))
      if (item.blindSpot !== '') out.push(SignatureView.line(ui, `sig-blind-${index}`, width, ` ${' '.repeat(pad)}blind spot: ${item.blindSpot}`, Theme.MUTED))
    })
    return out
  }

  private static title(lens: string): string {
    return lens === '' ? '' : lens.charAt(0).toUpperCase() + lens.slice(1)
  }

  private static review(ui: Ui, width: number, state: SignatureViewState, actions: SignatureActions): RenderElement[] {
    const out: RenderElement[] = []
    const shown = state.review.slice(0, SignatureView.REVIEW_SHOWN)
    for (const item of shown) {
      out.push(...SignatureView.paragraph(ui, `sig-review-${item.id}`, width, `${SignatureView.title(item.lens)}: ${item.statement}`, Theme.TEXT))
      out.push(
        ...SignatureView.buttons(ui, `sig-review-actions-${item.id}`, width, [
          { label: '✓ Keep', color: Theme.OK, onPress: () => actions.keep(item.id) },
          { label: '✗ Not me', color: Theme.MUTED, onPress: () => actions.reject(item.id) }
        ])
      )
    }
    if (state.review.length > shown.length) {
      out.push(SignatureView.line(ui, 'sig-review-more', width, ` +${state.review.length - shown.length} more to review`, Theme.MUTED))
    }
    return out
  }

  private static repositories(state: SignatureViewState): string {
    const marks: Record<string, string> = { done: '✓', learning: '…', pending: '·', excluded: '(excluded)', 'no-identity': '(no identity)' }
    return state.repositories.map((item) => `${item.name} ${marks[item.state] ?? ''}`.trim()).join('  ')
  }

  private static dashboard(ui: Ui, width: number, state: SignatureViewState, actions: SignatureActions): RenderElement[] {
    const { Text } = ui
    const now = Date.now()
    const isPaused = state.consent === 'paused'
    const out: RenderElement[] = []
    const label = (text: string): string => Theme.pad(` ${text}`, SignatureView.LABEL)
    out.push(
      <Text key="sig-status">
        <Text color={SignatureView.hex(Theme.ACCENT)} bold>
          {label('Learning')}
        </Text>
        <Text color={SignatureView.hex(isPaused ? Theme.WARN : Theme.OK)}>{Theme.truncate(SignatureView.status(state, now), Math.max(10, width - SignatureView.LABEL))}</Text>
      </Text>
    )
    const counts = state.counts
    out.push(
      SignatureView.line(ui, 'sig-profile', width, `${label('Profile')}${counts.traits} traits (${counts.confirmed} confirmed) · ${counts.cases} cases · ${counts.newTraits} new`, Theme.TEXT)
    )
    out.push(SignatureView.line(ui, 'sig-signals', width, `${label('Recorded')}${state.signals} signals this session · ${state.buffered} waiting to be saved`, Theme.TEXT))
    out.push(SignatureView.line(ui, 'sig-tokens', width, `${label('Today')}${SignatureView.tokens(state.tokensToday)} tokens used`, Theme.MUTED))
    out.push(SignatureView.line(ui, 'sig-storage', width, `${label('Storage')}${SignatureView.storage(state.storage)}`, Theme.MUTED))
    if (state.repositories.length > 0) {
      out.push(SignatureView.line(ui, 'sig-repos', width, `${label('Repositories')}${SignatureView.repositories(state)}`, Theme.TEXT))
    }
    if (state.lenses.length > 0) {
      out.push(SignatureView.blank(ui, 'sig-gap-lenses'))
      out.push(...SignatureView.lenses(ui, width, state))
    }
    if (state.review.length > 0) {
      out.push(SignatureView.blank(ui, 'sig-gap-review'))
      out.push(SignatureView.line(ui, 'sig-review-title', width, ` To review (${state.review.length})`, Theme.ACCENT, true))
      out.push(...SignatureView.review(ui, width, state, actions))
    }
    if (state.learning.lastError !== '' && !state.learning.isRunning) {
      out.push(...SignatureView.paragraph(ui, 'sig-learn-error', width, `Last run: ${state.learning.lastError}`, Theme.WARN))
    }
    if (state.lost > 0) {
      out.push(SignatureView.line(ui, 'sig-lost', width, ` ${state.lost} signals were dropped because the buffer was full.`, Theme.WARN))
    }
    if (state.isExcluded) {
      out.push(...SignatureView.paragraph(ui, 'sig-excluded', width, `Not learning here: ${state.exclusionReason}`, Theme.WARN))
    }
    if (state.dropped.length > 0) {
      out.push(...SignatureView.paragraph(ui, 'sig-dropped', width, `Ignored exclusions (not an absolute path): ${state.dropped.join(', ')}`, Theme.WARN))
    }
    if (state.lastError !== '') out.push(...SignatureView.paragraph(ui, 'sig-error', width, state.lastError, Theme.KO))
    out.push(SignatureView.blank(ui, 'sig-gap-1'))
    out.push(
      ...SignatureView.buttons(ui, 'sig-actions', width, [
        isPaused ? { label: 'Resume', color: Theme.OK, onPress: actions.resume } : { label: 'Pause', color: Theme.TEXT, onPress: actions.pause },
        { label: 'Learn now', color: Theme.TEXT, onPress: actions.learnNow },
        { label: 'Learn from another repository…', color: Theme.TEXT, onPress: actions.learnFrom },
        { label: 'Erase…', color: Theme.KO, onPress: actions.erase }
      ])
    )
    const isConfirming = state.confirmErase && (state.confirmUntil <= 0 || Date.now() < state.confirmUntil)
    if (isConfirming) out.push(...SignatureView.paragraph(ui, 'sig-confirm', width, SignatureView.CONFIRM, Theme.WARN))
    out.push(SignatureView.blank(ui, 'sig-gap-2'))
    out.push(...SignatureView.paragraph(ui, 'sig-hint', width, 'Skip a folder with /podium-stage signature exclude <folder>. Tag suggestions are not reviewable here yet.', Theme.FAINT))
    return out
  }
}
