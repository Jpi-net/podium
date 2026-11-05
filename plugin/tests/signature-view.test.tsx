import { expect, test } from 'claude-code/testing'
import { Signature, type SignatureDraft, type SignatureViewState } from '../hooks/signature/signature'
import { SignatureView, type SignatureActions } from '../hooks/signature/view'

type Node = { type: string, props: Record<string, unknown>, children: unknown[] }

type Drawn = { nodes: Node[], text: string, buttons: Node[] }

class ViewFixture {
  static calls: string[] = []

  static state(partial: Partial<SignatureViewState> = {}): SignatureViewState {
    return { ...Signature.empty(), ...partial }
  }

  static enabled(partial: Partial<SignatureViewState> = {}): SignatureViewState {
    return ViewFixture.state({
      consent: 'enabled',
      signals: 12,
      buffered: 3,
      storage: { indexBytes: 2048, casesBytes: 10, journalBytes: 2 * 1024 * 1024, emptyFiles: 2 },
      ...partial
    })
  }

  static actions(): SignatureActions {
    const calls = ViewFixture.calls
    return {
      toggle: (key: keyof SignatureDraft) => void calls.push(`toggle ${key}`),
      enable: () => void calls.push('enable'),
      notNow: () => void calls.push('notNow'),
      never: () => void calls.push('never'),
      pause: () => void calls.push('pause'),
      resume: () => void calls.push('resume'),
      erase: () => void calls.push('erase'),
      learnNow: () => void calls.push('learnNow'),
      learnFrom: () => void calls.push('learnFrom'),
      keep: (id: string) => void calls.push(`keep ${id}`),
      reject: (id: string) => void calls.push(`reject ${id}`)
    }
  }

  static draw(state: SignatureViewState, width = 80): Drawn {
    ViewFixture.calls = []
    const scope = globalThis as unknown as { h: unknown }
    const original = scope.h
    scope.h = (type: string, props: Record<string, unknown> | null, ...children: unknown[]): Node => ({ type, props: props ?? {}, children: children.flat(Infinity) })
    try {
      const elements = SignatureView.render({ Text: 'Text', Box: 'Box', Button: 'Button' } as never, width, state, ViewFixture.actions()) as unknown as Node[]
      const nodes: Node[] = []
      ViewFixture.collect(elements, nodes)
      const lines = elements.map((element) => ViewFixture.text(element))
      return { nodes, text: lines.join('\n'), buttons: nodes.filter((node) => node.type === 'Button') }
    } finally {
      scope.h = original
    }
  }

  static collect(value: unknown, out: Node[]): void {
    if (Array.isArray(value)) {
      for (const item of value) ViewFixture.collect(item, out)
      return
    }
    if (typeof value !== 'object' || value === null) return
    const node = value as Node
    out.push(node)
    ViewFixture.collect(node.children, out)
  }

  static text(value: unknown): string {
    if (typeof value === 'string') return value
    if (Array.isArray(value)) return value.map((item) => ViewFixture.text(item)).join('')
    if (typeof value === 'object' && value !== null) return ViewFixture.text((value as Node).children)
    return ''
  }

  static button(drawn: Drawn, key: string): Node {
    const found = drawn.buttons.find((node) => node.props.key === key)
    if (!found) throw new Error(`no button ${key}`)
    return found
  }

  static press(drawn: Drawn, key: string): void {
    const handler = ViewFixture.button(drawn, key).props.onPress
    if (typeof handler !== 'function') throw new Error(`button ${key} has no handler`)
    handler()
  }

  static labels(drawn: Drawn): string[] {
    return drawn.buttons.map((node) => ViewFixture.text(node))
  }
}

test('the opt-in view shows what Signature learns and where it stores it', () => {
  // Act
  const drawn = ViewFixture.draw(ViewFixture.state())

  // Assert
  expect(drawn.text).toContain('Teach Claude how you work')
  expect(drawn.text).toContain('It records')
  expect(drawn.text).toContain('~/.claude/podium on this machine')
})

test('the opt-in view lists four check boxes', () => {
  // Act
  const drawn = ViewFixture.draw(ViewFixture.state())

  // Assert
  const boxes = drawn.buttons.filter((node) => String(node.props.key).startsWith('sig-choice-'))
  expect(boxes).toHaveLength(4)
})

test('the opt-in check boxes show the draft values', () => {
  // Act
  const drawn = ViewFixture.draw(ViewFixture.state())

  // Assert
  expect(ViewFixture.text(ViewFixture.button(drawn, 'sig-choice-sessions'))).toContain('[x]')
  expect(ViewFixture.text(ViewFixture.button(drawn, 'sig-choice-background'))).toContain('[x]')
})

test('the opt-in view has an Enable, a Not now and a Never ask button', () => {
  // Act
  const drawn = ViewFixture.draw(ViewFixture.state())

  // Assert
  expect(ViewFixture.labels(drawn).slice(-3)).toEqual(['[ Enable ]', '[ Not now ]', '[ Never ask ]'])
})

test('pressing a check box toggles its key', () => {
  // Arrange
  const drawn = ViewFixture.draw(ViewFixture.state())

  // Act
  for (const key of ['sessions', 'history', 'background', 'apply']) ViewFixture.press(drawn, `sig-choice-${key}`)

  // Assert
  expect(ViewFixture.calls).toEqual(['toggle sessions', 'toggle history', 'toggle background', 'toggle apply'])
})

test('pressing Enable calls the enable action', () => {
  // Arrange
  const drawn = ViewFixture.draw(ViewFixture.state())

  // Act
  ViewFixture.press(drawn, 'sig-actions-0')

  // Assert
  expect(ViewFixture.calls).toEqual(['enable'])
})

test('pressing Not now calls the notNow action', () => {
  // Arrange
  const drawn = ViewFixture.draw(ViewFixture.state())

  // Act
  ViewFixture.press(drawn, 'sig-actions-1')

  // Assert
  expect(ViewFixture.calls).toEqual(['notNow'])
})

test('pressing Never ask calls the never action', () => {
  // Arrange
  const drawn = ViewFixture.draw(ViewFixture.state())

  // Act
  ViewFixture.press(drawn, 'sig-actions-2')

  // Assert
  expect(ViewFixture.calls).toEqual(['never'])
})

test('the opt-in view shows the last error', () => {
  // Act
  const drawn = ViewFixture.draw(ViewFixture.state({ lastError: 'Signature is off: no home folder was found.' }))

  // Assert
  expect(drawn.text).toContain('no home folder was found')
})

test('the enabled dashboard shows the signals and the storage', () => {
  // Act
  const drawn = ViewFixture.draw(ViewFixture.enabled())

  // Assert
  expect(drawn.text).toContain('● on')
  expect(drawn.text).toContain('12 signals this session')
  expect(drawn.text).toContain('3 waiting to be saved')
  expect(drawn.text).toContain('index 2.0 KB')
  expect(drawn.text).toContain('cases 10 B')
  expect(drawn.text).toContain('journal 2.0 MB')
  expect(drawn.text).toContain('2 empty files')
})

test('the enabled dashboard offers Pause and Erase', () => {
  // Act
  const drawn = ViewFixture.draw(ViewFixture.enabled())

  // Assert
  expect(ViewFixture.labels(drawn)).toEqual(['[ Pause ]', '[ Learn now ]', '[ Learn from another repository… ]', '[ Erase… ]'])
})

test('pressing Pause calls the pause action', () => {
  // Arrange
  const drawn = ViewFixture.draw(ViewFixture.enabled())

  // Act
  ViewFixture.press(drawn, 'sig-actions-0')

  // Assert
  expect(ViewFixture.calls).toEqual(['pause'])
})

test('pressing Erase calls the erase action', () => {
  // Arrange
  const drawn = ViewFixture.draw(ViewFixture.enabled())

  // Act
  ViewFixture.press(drawn, 'sig-actions-3')

  // Assert
  expect(ViewFixture.calls).toEqual(['erase'])
})

test('the paused dashboard shows Resume instead of Pause', () => {
  // Act
  const drawn = ViewFixture.draw(ViewFixture.enabled({ consent: 'paused' }))

  // Assert
  expect(drawn.text).toContain('◌ paused')
  expect(ViewFixture.labels(drawn)).toEqual(['[ Resume ]', '[ Learn now ]', '[ Learn from another repository… ]', '[ Erase… ]'])
})

test('pressing Resume calls the resume action', () => {
  // Arrange
  const drawn = ViewFixture.draw(ViewFixture.enabled({ consent: 'paused' }))

  // Act
  ViewFixture.press(drawn, 'sig-actions-0')

  // Assert
  expect(ViewFixture.calls).toEqual(['resume'])
})

test('the dashboard shows the erase confirmation when it is armed', () => {
  // Act
  const drawn = ViewFixture.draw(ViewFixture.enabled({ confirmErase: true }))

  // Assert
  expect(drawn.text).toContain('Press Erase again within 30 seconds')
})

test('the dashboard hides the erase confirmation when it is not armed', () => {
  // Act
  const drawn = ViewFixture.draw(ViewFixture.enabled({ confirmErase: false }))

  // Assert
  expect(drawn.text).not.toContain('Press Erase again')
})

test('the dashboard says why it does not learn in an excluded folder', () => {
  // Act
  const drawn = ViewFixture.draw(ViewFixture.enabled({ isExcluded: true, exclusionReason: 'excluded by /work/**' }))

  // Assert
  expect(drawn.text).toContain('Not learning here: excluded by /work/**')
})

test('the dashboard lists the ignored exclusions', () => {
  // Act
  const drawn = ViewFixture.draw(ViewFixture.enabled({ dropped: ['clients/acme'] }))

  // Assert
  expect(drawn.text).toContain('Ignored exclusions')
  expect(drawn.text).toContain('clients/acme')
})

test('the dashboard shows the last error', () => {
  // Act
  const drawn = ViewFixture.draw(ViewFixture.enabled({ lastError: 'Signature stopped: its folder is not writable.' }))

  // Assert
  expect(drawn.text).toContain('its folder is not writable')
})

test('a declined view shows the line to turn Signature on', () => {
  // Act
  const drawn = ViewFixture.draw(ViewFixture.state({ consent: 'declined' }))

  // Assert
  expect(drawn.text.replace(/\s+/g, ' ')).toContain('Signature is off.')
  expect(drawn.text.replace(/\s+/g, ' ')).toContain('/podium-stage signature on')
  expect(drawn.buttons).toEqual([])
})

test('a never view says it will not ask again and shows the turn-on line', () => {
  // Act
  const drawn = ViewFixture.draw(ViewFixture.state({ consent: 'never' }))

  // Assert
  expect(drawn.text.replace(/\s+/g, ' ')).toContain('will not ask again')
  expect(drawn.text.replace(/\s+/g, ' ')).toContain('/podium-stage signature on')
})

test('the narrow opt-in view stacks the buttons without a row box', () => {
  // Act
  const drawn = ViewFixture.draw(ViewFixture.state(), 50)

  // Assert
  expect(drawn.nodes.some((node) => node.type === 'Box')).toBe(false)
  expect(ViewFixture.labels(drawn).slice(-3)).toEqual(['[ Enable ]', '[ Not now ]', '[ Never ask ]'])
})

test('the wide opt-in view lines the buttons up in one row box', () => {
  // Act
  const drawn = ViewFixture.draw(ViewFixture.state(), 80)

  // Assert
  expect(drawn.nodes.filter((node) => node.type === 'Box')).toHaveLength(1)
})

test('the narrow dashboard draws without throwing', () => {
  // Act
  const drawn = ViewFixture.draw(ViewFixture.enabled({ isExcluded: true, exclusionReason: 'excluded by /work/**', confirmErase: true }), 40)

  // Assert
  expect(drawn.text).toContain('12 signals')
  expect(drawn.nodes.some((node) => node.type === 'Box')).toBe(false)
})

test('a very small width draws without throwing', () => {
  // Act
  const drawn = ViewFixture.draw(ViewFixture.state(), 5)

  // Assert
  expect(drawn.buttons.length).toBeGreaterThan(0)
})

test('bytes formats sizes in B, KB and MB', () => {
  // Assert
  expect(SignatureView.bytes(0)).toBe('0 B')
  expect(SignatureView.bytes(1536)).toBe('1.5 KB')
  expect(SignatureView.bytes(3 * 1024 * 1024)).toBe('3.0 MB')
  expect(SignatureView.bytes(Number.NaN)).toBe('0 B')
})

test('wrap breaks a sentence at the given width without cutting words', () => {
  // Act
  const lines = SignatureView.wrap('one two three four five', 10)

  // Assert
  expect(lines).toEqual(['one two', 'three four', 'five'])
})

test('the Stored row shows the given root shortened to the home folder', () => {
  // Act
  const drawn = ViewFixture.draw(ViewFixture.state({ root: '/Users/j/.claude/podium' }))

  // Assert
  expect(drawn.text.replace(/\s+/g, ' ')).toContain('~/.claude/podium on this machine')
  expect(drawn.text).not.toContain('/Users/j')
})

test('the Stored row falls back to the default root when none is given', () => {
  // Act
  const drawn = ViewFixture.draw(ViewFixture.state({ root: '' }))

  // Assert
  expect(drawn.text.replace(/\s+/g, ' ')).toContain('~/.claude/podium on this machine')
})

test('shorten leaves a root outside a home folder as it is', () => {
  // Assert
  expect(SignatureView.shorten('/srv/podium')).toBe('/srv/podium')
})

test('the confirmation is hidden after the confirm deadline', () => {
  // Act
  const drawn = ViewFixture.draw(ViewFixture.enabled({ confirmErase: true, confirmUntil: Date.now() - 1000 }))

  // Assert
  expect(drawn.text).not.toContain('Press Erase again')
})

test('the confirmation shows before the confirm deadline', () => {
  // Act
  const drawn = ViewFixture.draw(ViewFixture.enabled({ confirmErase: true, confirmUntil: Date.now() + 60_000 }))

  // Assert
  expect(drawn.text).toContain('Press Erase again')
})

test('the dashboard warns about signals dropped because the buffer was full', () => {
  // Act
  const drawn = ViewFixture.draw(ViewFixture.enabled({ lost: 4 }))

  // Assert
  expect(drawn.text).toContain('4 signals were dropped because the buffer was full')
})

test('the dashboard shows no lost warning when nothing was dropped', () => {
  // Act
  const drawn = ViewFixture.draw(ViewFixture.enabled({ lost: 0 }))

  // Assert
  expect(drawn.text).not.toContain('were dropped')
})

test('the dashboard status shows the running step and its progress', () => {
  // Act
  const drawn = ViewFixture.draw(ViewFixture.enabled({ learning: { ...Signature.empty().learning, isRunning: true, step: 'extracting', done: 2, total: 5 } }))

  // Assert
  expect(drawn.text).toContain('● learning (extracting 2/5)')
})

test('the dashboard status shows starting when the step is not known yet', () => {
  // Act
  const drawn = ViewFixture.draw(ViewFixture.enabled({ learning: { ...Signature.empty().learning, isRunning: true } }))

  // Assert
  expect(drawn.text).toContain('● learning (starting)')
})

test('the dashboard status shows never for a first run and the next run hint', () => {
  // Act
  const drawn = ViewFixture.draw(ViewFixture.enabled({ learning: { ...Signature.empty().learning, lastRunAt: 0, nextRunHint: 'when idle' } }))

  // Assert
  expect(drawn.text).toContain('● on · last run never · next when idle')
})

test('the dashboard status shows how long ago the last run was', () => {
  // Act
  const drawn = ViewFixture.draw(ViewFixture.enabled({ learning: { ...Signature.empty().learning, lastRunAt: Date.now() - 5 * 60_000 } }))

  // Assert
  expect(drawn.text).toContain('last run 5 min ago')
})

test('the dashboard shows the last run error when nothing is running', () => {
  // Act
  const drawn = ViewFixture.draw(ViewFixture.enabled({ learning: { ...Signature.empty().learning, lastError: 'model: stopped' } }))

  // Assert
  expect(drawn.text).toContain('Last run: model: stopped')
})

test('the dashboard hides the last run error while a run is in progress', () => {
  // Act
  const drawn = ViewFixture.draw(ViewFixture.enabled({ learning: { ...Signature.empty().learning, isRunning: true, lastError: 'model: stopped' } }))

  // Assert
  expect(drawn.text).not.toContain('Last run:')
})

test('the dashboard shows the profile counts and the tokens used today', () => {
  // Act
  const drawn = ViewFixture.draw(ViewFixture.enabled({ counts: { traits: 12, confirmed: 3, cases: 40, newTraits: 2 }, tokensToday: 2500 }))

  // Assert
  expect(drawn.text).toContain('12 traits (3 confirmed) · 40 cases · 2 new')
  expect(drawn.text).toContain('2.5 k tokens used')
})

test('a lens is drawn with its strength bar, summary and blind spot', () => {
  // Arrange
  const lenses = [{ lens: 'security', strength: 0.5, summary: 'Validates input', blindSpot: 'size limits' }]

  // Act
  const drawn = ViewFixture.draw(ViewFixture.enabled({ lenses }))

  // Assert
  expect(drawn.text).toContain('Security')
  expect(drawn.text).toContain('█████░░░░')
  expect(drawn.text).toContain('Validates input')
  expect(drawn.text).toContain('blind spot: size limits')
})

test('a lens on a narrow width shows only its name and bar', () => {
  // Arrange
  const lenses = [{ lens: 'security', strength: 1, summary: 'Validates input', blindSpot: 'size limits' }]

  // Act
  const drawn = ViewFixture.draw(ViewFixture.enabled({ lenses }), 50)

  // Assert
  expect(drawn.text).toContain('Security █████████')
  expect(drawn.text).not.toContain('Validates input')
  expect(drawn.text).not.toContain('blind spot')
})

test('the review list shows a statement with Keep and Not me buttons', () => {
  // Arrange
  const review = [{ id: 'security.validate', statement: 'Validates every input', lens: 'security', confidence: 0.8 }]

  // Act
  const drawn = ViewFixture.draw(ViewFixture.enabled({ review }))

  // Assert
  expect(drawn.text).toContain('To review (1)')
  expect(drawn.text).toContain('Security: Validates every input')
  expect(ViewFixture.labels(drawn)).toContain('[ ✓ Keep ]')
  expect(ViewFixture.labels(drawn)).toContain('[ ✗ Not me ]')
})

test('pressing Keep calls keep with the trait id', () => {
  // Arrange
  const review = [{ id: 'security.validate', statement: 'Validates every input', lens: 'security', confidence: 0.8 }]
  const drawn = ViewFixture.draw(ViewFixture.enabled({ review }))

  // Act
  ViewFixture.press(drawn, 'sig-review-actions-security.validate-0')

  // Assert
  expect(ViewFixture.calls).toEqual(['keep security.validate'])
})

test('pressing Not me calls reject with the trait id', () => {
  // Arrange
  const review = [{ id: 'security.validate', statement: 'Validates every input', lens: 'security', confidence: 0.8 }]
  const drawn = ViewFixture.draw(ViewFixture.enabled({ review }))

  // Act
  ViewFixture.press(drawn, 'sig-review-actions-security.validate-1')

  // Assert
  expect(ViewFixture.calls).toEqual(['reject security.validate'])
})

test('the review list shows five traits and counts the rest', () => {
  // Arrange
  const review = Array.from({ length: 7 }, (_, index) => ({ id: `testing.t${index}`, statement: `Statement number ${index}`, lens: 'testing', confidence: 0.5 }))

  // Act
  const drawn = ViewFixture.draw(ViewFixture.enabled({ review }))

  // Assert
  expect(drawn.text).toContain('+2 more to review')
  expect(drawn.text).not.toContain('Statement number 5')
})

test('repositories are drawn with a mark for their state', () => {
  // Arrange
  const repositories = [
    { name: 'alpha', state: 'done' as const },
    { name: 'beta', state: 'learning' as const },
    { name: 'gamma', state: 'pending' as const },
    { name: 'delta', state: 'excluded' as const },
    { name: 'omega', state: 'no-identity' as const }
  ]

  // Act
  const drawn = ViewFixture.draw(ViewFixture.enabled({ repositories }), 120)

  // Assert
  expect(drawn.text).toContain('alpha ✓  beta …  gamma ·  delta (excluded)  omega (no identity)')
})

test('pressing Learn now calls the learnNow action', () => {
  // Arrange
  const drawn = ViewFixture.draw(ViewFixture.enabled())

  // Act
  ViewFixture.press(drawn, 'sig-actions-1')

  // Assert
  expect(ViewFixture.calls).toEqual(['learnNow'])
})

test('pressing Learn from another repository calls the learnFrom action', () => {
  // Arrange
  const drawn = ViewFixture.draw(ViewFixture.enabled())

  // Act
  ViewFixture.press(drawn, 'sig-actions-2')

  // Assert
  expect(ViewFixture.calls).toEqual(['learnFrom'])
})

test('ago, bar and tokens format their values', () => {
  // Assert
  expect(SignatureView.ago(10 * 60_000, 0)).toBe('never')
  expect(SignatureView.ago(10 * 60_000, 10 * 60_000)).toBe('just now')
  expect(SignatureView.ago(3 * 3_600_000 + 1000, 1000)).toBe('3 h ago')
  expect(SignatureView.bar(0)).toBe('░░░░░░░░░')
  expect(SignatureView.bar(2)).toBe('█████████')
  expect(SignatureView.tokens(999)).toBe('999')
  expect(SignatureView.tokens(12_345)).toBe('12.3 k')
})

test('the fidelity line is hidden below ten predictions', () => {
  // Act
  const drawn = ViewFixture.draw(ViewFixture.enabled({ fidelity: { predictions: 9, hits: 9 } }))

  // Assert
  expect(drawn.text).not.toContain('Fidelity')
})

test('the fidelity line shows the percentage from ten predictions', () => {
  // Act
  const drawn = ViewFixture.draw(ViewFixture.enabled({ fidelity: { predictions: 10, hits: 7 } }))

  // Assert
  expect(drawn.text).toContain('Fidelity')
  expect(drawn.text).toContain('70 % of your choices predicted')
})

test('the fidelity percentage is rounded', () => {
  // Act
  const drawn = ViewFixture.draw(ViewFixture.enabled({ fidelity: { predictions: 30, hits: 20 } }))

  // Assert
  expect(drawn.text).toContain('67 % of your choices predicted')
})

test('the opt-in view tells what Signature brings into Claude', () => {
  // Act
  const drawn = ViewFixture.draw(ViewFixture.state())

  // Assert
  const text = drawn.text.replace(/\s+/g, ' ')
  expect(text).toContain('Brings')
  expect(text).toContain("a short profile into Claude's instructions")
  expect(text).toContain('a stand-in reviewer agent')
})

test('the dashboard shows the keep hint when the section is empty', () => {
  // Act
  const drawn = ViewFixture.draw(ViewFixture.enabled({ isSectionEmpty: true }))

  // Assert
  expect(drawn.text).toContain('Keep traits to bring them into your sessions.')
})

test('the dashboard hides the keep hint when the section is not empty', () => {
  // Act
  const drawn = ViewFixture.draw(ViewFixture.enabled({ isSectionEmpty: false }))

  // Assert
  expect(drawn.text).not.toContain('Keep traits to bring them')
})
