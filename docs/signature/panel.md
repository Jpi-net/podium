# Panel: opt-in screen, Signature tab, commands

## Tab

New entry in `Flow.TABS`: `{ id: 'signature', label: 'Signature', short: 'Sign.', hotkey: '6' }`, aliases `signature`, `profile`, `learn` in `Flow.ALIASES`. Rendered by `SignatureView.render(ui, state, width)`; actions go through `Signature` methods.

View state (`$.state` key `signature`, declared in `plugin/types/index.d.ts`):

```ts
export type SignatureViewState = {
  consent: 'undecided' | 'enabled' | 'paused' | 'declined' | 'never'
  draft: { sessions: boolean, history: boolean, pastSessions: boolean, background: boolean, apply: boolean }
  isExcluded: boolean
  exclusionReason: string
  learning: { isRunning: boolean, step: string, done: number, total: number, lastRunAt: number, lastError: string, nextRunHint: string }
  counts: { traits: number, confirmed: number, cases: number, newTraits: number, newTags: number }
  fidelity: { predictions: number, hits: number }
  lenses: { lens: string, strength: number, summary: string, blindSpot: string }[]
  review: { id: string, statement: string, lens: string, confidence: number }[]
  repositories: { name: string, state: 'done' | 'learning' | 'pending' | 'excluded' | 'no-identity' }[]
  storage: { indexBytes: number, casesBytes: number, journalBytes: number }
  tokensToday: number
  confirmErase: boolean
}
```

## Opt-in screen (consent `undecided`)

Shown in the Signature tab. When consent is `undecided` the first time the panel opens after the update, the panel opens on this tab once (stored as `signature.introShown` in `$.store`). When the panel is not open, one toast at `session.start` per day at most: "Podium can learn how you work. Open /podium-stage signature to choose." `never` stops the toast and the auto-open.

```
 Teach Claude how you work

 Podium learns how you decide, build and care about security
 from your sessions and commits, and brings it to every project.

 It records   your prompts (masked), your answers to Claude's
              questions, plans you accept or refuse, and the
              history of repositories you open
 Never        file contents, tool outputs, secrets
 Stored       ~/.claude/podium on this machine
 Sent         selected excerpts go to Claude through your own
              session to be summarised (uses your plan, capped)

 [x] Learn from my sessions
 [x] Read the history of repositories I open
 [ ] Read my past Claude Code sessions once
 [x] Learn in the background when idle
 [x] Bring my profile into every session

 Never learn in: add a .podium-private file to a folder,
 or /podium-stage signature exclude <folder>

 [ Enable ]  [ Not now ]  [ Never ask ]
```

The check boxes are `Button`s toggling `draft`. `Enable` writes `settings.json` from the draft (`apply` true sets all four `apply.*`), sets consent `enabled`, and starts the session's Signature immediately (no restart): history research is scheduled, the section takes effect from the next thread (a new session or after `/clear`), which the screen says. `Not now`: consent stays `undecided`, no toast for 7 days. `Never ask`: consent `never`.

## Dashboard (consent `enabled` or `paused`)

```
 Learning   ● on · last run 2 h ago · next when idle      [ Pause ]
 Profile    48 traits (41 confirmed) · 312 cases · 3 new  [ Review ]
 Fidelity   82 % of your choices predicted (30 days)

 Security      ███████░░  validates input at boundaries; fail open
               blind spot: input size limits
 Architecture  ████████░  static classes; strict layers
 Git           █████████  imperative subjects; no AI attribution
 …

 Here         podium · learning history 120/600
 Repositories podium ✓  phoenix-421 ✓  Diffwright (excluded)
 Today        48 k tokens of 300 k · storage 1.4 MB

 [ Learn from another repository… ]  [ Learn now ]  [ Export ]  [ Erase… ]
```

- `strength` per lens: mean confidence of its confirmed and observed traits, drawn as 9 cells.
- `Review` switches the body to the review list: each new trait with `[ ✓ Keep ]` `[ ✗ Not me ]`; each new tag with `[ Keep ]` `[ Remove ]`. Decisions are written to `profile.json` / `vocabulary.json` immediately (small writes under the lock; if the lock is held, queued and retried on the next idle tick).
- `Learn from another repository…` fills the prompt with `/podium-stage learn ` (`$.prompt.fill`, mode `replace`), so the developer types the path and sends it.
- `Erase…` asks for a second press (`confirmErase`), then deletes the data directory content except `settings.json`, whose consent becomes `declined`.
- `Pause` sets consent `paused`: no capture, no learning, no application; data kept. `Resume` sets it back.
- Narrow panel (fewer than 60 columns): lens lines collapse to `Security ███████░░`, buttons wrap.

## Commands (subcommands of `/podium-stage`)

| Command | Effect |
|---|---|
| `/podium-stage signature` | open the tab |
| `/podium-stage signature on` / `off` | enable with the current draft / decline |
| `/podium-stage signature pause` / `resume` | pause / resume |
| `/podium-stage learn <path>` | research another local repository's history (the only manual learning action) |
| `/podium-stage signature learn-now` | start a learning run now |
| `/podium-stage signature exclude <folder>` / `include <folder>` | edit `settings.exclude` |
| `/podium-stage signature forget <trait id or #case>` | reject a trait or a case |
| `/podium-stage signature export <file>` | write `{ settings without identities, vocabulary overlay, profile, cases }` as one JSON file; with `--anonymous`, project names and evidence ids removed |
| `/podium-stage signature import <file>` | merge an export (phase 7) |
| `/podium-stage signature rebuild` | rebuild index and profile |
| `/podium-stage signature erase` | same as the Erase button, with confirmation through a second identical command within 30 seconds |

`argumentHint` of `/podium-stage` gains `signature [on|off|pause|resume|learn-now|exclude|include|forget|export|rebuild|erase]|learn <path>`.

Every command answers with one line of text (`{ text }`), in English.
