# Capture

Capture runs only when `consent` is `enabled`, `capture.sessions` is true and the working directory is not excluded. It records decisions, never code.

## Signals

### Prompt

Source: `prompt.submit`, when `e.origin` is the user's own (not a plugin, not a peer, not a notification), `e.isMeta` is not set, and the text is not a task notification (`Flow.isTaskNotification`).

| Field | Extraction |
|---|---|
| `length` | characters of `e.text` |
| `language` | `fr`, `en` or `other`: share of a small stopword list per language among the words (at least 3 matches and the largest share wins) |
| `command` | `e.command.name` when the prompt runs a slash command, else `""` |
| `excerpt` | first 400 characters after redaction; for a slash command, the arguments only |
| `isCorrection` | the text starts (after spaces) with one of: `no`, `non`, `not`, `pas`, `stop`, `wait`, `attends`, `actually`, `en fait`, `instead`, `plutôt`, `rather`, `don't`, `ne `, `undo`, `revert`, `annule`, or contains `not like that`, `pas comme ça`, `I said`, `j'ai dit` |
| `afterAbort` | the previous turn of the session ended with `reason: 'aborted'` |

A correction or a prompt after an abort is the strongest session signal: the learner pairs it with the turn before it (what Claude did, from `turn.complete` text, truncated to 600 characters and redacted) to extract a `refusal` case.

### Question

Source: `tool.call` with `e.tool === 'AskUserQuestion'`, after `await next(e)`, when `ran.result` is present and `ran.result.afkTimeoutMs` is absent.

For each question in `ran.result.questions`:

| Field | Extraction |
|---|---|
| `header`, `question` | as asked, redacted, question truncated to 300 |
| `options` | labels, each truncated to 120, `(Recommended)` suffix removed |
| `recommended` | index of the option whose label ended with `(Recommended)`, else -1 |
| `chosen` | `ran.result.answers[question]` split on `, ` for multi-select, matched to labels |
| `isOther`, `other` | the answer matches no label: free text, redacted, truncated to 300 |
| `predicted` | the label Signature predicted before the dialog, if any |

Questions of kind `text` or `number` are recorded with `options: []` and the answer in `other`.

### Plan

Source: `tool.call` with `e.tool === 'ExitPlanMode'`, after `await next(e)`.

| Field | Extraction |
|---|---|
| `outcome` | `refused` when `ran.deny` is set or `ran.isError` is true, else `accepted` |
| `excerpt` | `e.plan` (input) first 1,500 characters, redacted |
| `feedback` | the deny text or the error text, 600 characters, redacted |
| `isEdited` | `ran.result.planWasEdited === true` |

### Abort

Source: `turn.complete` with `reason === 'aborted'` on the main thread (`agentId` absent). Data `{ turnId }`. Also sets the session flag read by the next prompt's `afterAbort`.

### Agent

Source: `agent.spawn`, after `next`, when not denied. Data `{ type: e.subagentType, model: r.model }`. Feeds the orchestration lens (which experts the developer relies on, which model tiers).

## Context of every signal

`session` from `$.session.id()`, `project` and `projectId` from the git root and remote (computed once per session with `git rev-parse --show-toplevel` and `git config --get remote.origin.url`), `stack` from the project's `podium.json` layers when present, else from the extensions of `git ls-files` (top three stack tags by file count, computed once per session, `git ls-files` capped at 20,000 lines).

## Redaction (`Redactor`)

Applied to every text field before it is buffered. Rules, in order:

| Rule | Pattern (summary) | Replacement |
|---|---|---|
| Private key block | `-----BEGIN [A-Z ]*PRIVATE KEY-----` to its `END` line | `<private-key>` |
| Known token prefixes | `sk-ant-…`, `sk-…` (20+), `ghp_`, `gho_`, `ghs_`, `ghu_`, `github_pat_`, `glpat-`, `xox[abpr]-`, `AKIA[0-9A-Z]{16}`, `AIza[0-9A-Za-z_-]{35}`, `npm_…` | `<token>` |
| JSON Web Token | three base64url segments starting with `eyJ` | `<token>` |
| Assignment of a secret | `(password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|client[_-]?secret|auth)\s*[:=]\s*\S+` (case-insensitive) | name kept, value `<secret>` |
| Credentials in a URL | `://user:pass@` | `://<credentials>@` |
| Secret query parameters | `[?&](token|key|sig|signature|secret|password|code)=[^&\s]+` | `=<secret>` |
| Email | RFC-lite `\S+@\S+\.\w+` | `<email>` |
| Home path | the resolved home directory prefix | `~` |
| Long blob | 40+ characters of `[A-Za-z0-9+/=_-]` without spaces | `<blob>` |
| Control characters | anything below `0x20` except newline and tab | removed |

Then truncation to the field's limit, cutting on a character boundary and appending `…`.

The redactor is conservative: a false positive costs a word, a false negative leaks a secret into a local file and later into a model call. Its tests list one positive and one negative case per rule.

## Exclusions

A session captures nothing when:

1. `consent` is not `enabled`, or `capture.sessions` is false;
2. the working directory matches a glob of `settings.exclude` (`~` expanded; `*` matches within a segment, `**` across segments; matched against the resolved real path);
3. a `.podium-private` file exists in the working directory or an ancestor up to the git root;
4. the session is non-interactive (`e.isInteractive === false` at `session.start`), which keeps `claude -p` scripts and SDK runs out.

Exclusion is decided once at `session.start` and shown in the tab ("Not learning here: excluded by ~/clients/**").

## What is never captured

Tool outputs, file contents, diffs of edits, command lines other than the slash command name, assistant messages (except the 600-character redacted text of a turn that a correction follows), images and attachments, anything of a subagent's own prompts.

## Buffering and flushing

Signals go to an in-memory buffer (at most 500; beyond, the oldest are dropped and counted). Flush, fire and forget, when the buffer holds 20 signals at `turn.complete`, on idle, and at `session.end`. A flush reads the session file (absent: empty), appends the lines and writes it back; above 512 KiB it continues in `<session>.1.jsonl`.
