# Data model

## Root

`<config>/podium/`, where `<config>` is `CLAUDE_CONFIG_DIR` when set, otherwise `$HOME/.claude` (`%USERPROFILE%/.claude` on Windows). Paths are joined with `/`, which Windows accepts.

```
<config>/podium/
├── settings.json              consent and options                 written by the panel
├── state.json                 cursors, run history, budget          written by the learner
├── lock.json                  learning run lock                     written by the learner
├── vocabulary.json            the developer's overlay of tags        written by the learner and the panel
├── index.json                 tag index and compact case meta        derived (P1)
├── profile.json               traits                                 derived (P1)
├── cases/000.jsonl …          cases, 256 per shard                   the asset (P1)
├── archive/000.jsonl …        cases out of the index                 the asset (P1)
├── journal/2026-11/<session>.jsonl   raw signals                     purged after distillation
└── history/<repo-id>.json     research cursor per repository          written by the learner
```

Every JSON file has a `version` field. Before parsing or overwriting a file, the store checks `FormatVersion.isNewer(text, known)`; a reader that meets a higher major version than it knows leaves the file alone and turns Signature off for the session, saying so in the tab.

The root must be absolute (`/…`, `X:/…` or a `//server/share` UNC path; a leading `~` in `CLAUDE_CONFIG_DIR` is expanded). A relative root disables Signature, so data can never land inside a project.

## settings.json

```json
{
  "version": 1,
  "consent": "enabled",
  "capture": { "sessions": true, "history": true, "pastSessions": false },
  "apply": { "section": true, "context": true, "hints": true, "proxy": true },
  "learning": { "background": true, "model": "sonnet", "runsPerDay": 2, "tokensPerDay": 300000, "idleMinutes": 10 },
  "identities": [],
  "exclude": [],
  "notify": true,
  "halfLifeMonths": 12
}
```

| Key | Values | Default |
|---|---|---|
| `consent` | `undecided`, `enabled`, `paused`, `declined`, `never` | `undecided` |
| `capture.sessions` | record signals from live sessions | `true` |
| `capture.history` | research the history of repositories opened in Claude Code | `true` |
| `capture.pastSessions` | one-time backfill from the transcripts in `<config>/projects/` | `false` (phase 6) |
| `apply.section` | profile section in the system prompt | `true` |
| `apply.context` | precedents attached to prompts | `true` |
| `apply.hints` | "your usual choice" line under Claude's questions | `true` |
| `apply.proxy` | offer the `developer-proxy` agent | `true` |
| `learning.background` | run distillation automatically when idle; off means only on `/podium-stage signature learn-now` | `true` |
| `learning.model` | `haiku`, `sonnet`, `opus` | `sonnet` |
| `learning.runsPerDay` | 0 to 24 | 2 |
| `learning.tokensPerDay` | input plus output tokens, all runs of a day | 300,000 |
| `learning.idleMinutes` | 3 to 120 | 10 |
| `identities` | author emails whose commits are the developer's; empty means `git config --get user.email` of each repository | `[]` |
| `exclude` | glob patterns of folders never captured (`~/clients/**`) | `[]` |
| `notify` | toast when a run learned something | `true` |
| `halfLifeMonths` | recency decay | 12 |

A folder is also excluded when it or an ancestor up to the repository root contains a file named `.podium-private`.

Parsing is tolerant: unknown keys are dropped, a wrong type takes the default, a number out of range is clamped to the range (`runsPerDay` 0 to 24, `tokensPerDay` 0 to 5,000,000, `idleMinutes` 3 to 120, `halfLifeMonths` 1 to 120), a missing file means `undecided`. `exclude` keeps only absolute patterns or patterns starting with `~`.

Exclusion globs: `*` and `?` stay within a path segment, `**` crosses segments, `dir/**` matches `dir` itself and everything below, `a/**/b` matches `a/b`, a pattern that matches a folder also excludes everything inside it; matching is case-insensitive and Unicode-normalised (NFC), `~` is expanded, separators are normalised. The matcher uses no regular expression and its cost is bounded by pattern length times path length (globs capped at 256 characters, paths at 4,096), so no pattern can stall a session. `$HOME`, `${HOME}` and `%USERPROFILE%` prefixes are expanded like `~`; other relative entries are dropped and listed in the tab (`SignatureSettings.dropped`).

## Signal (journal line)

```json
{ "v": 1, "at": 1762300000000, "session": "cba7…", "project": "podium", "projectId": "r9f3a1c2", "stack": ["typescript", "node"], "kind": "question", "data": { … } }
```

| `kind` | `data` |
|---|---|
| `prompt` | `{ length, language, command, excerpt, isCorrection, afterAbort }` |
| `question` | `{ header, question, options: [label], recommended: index or -1, chosen: [label], isOther, other, isMulti, predicted: label or "" }` |
| `plan` | `{ outcome: "accepted" or "refused", excerpt, feedback, isEdited }` |
| `abort` | `{ turnId }` |
| `agent` | `{ type, model }` |

`excerpt`, `question`, `other`, `feedback` pass through `Redactor` and are truncated: prompt excerpt 400 characters, plan excerpt 1,500, feedback 600. `projectId` is a 32-bit FNV-1a hash in hex of the normalised `origin` remote URL, or of the repository root path when there is no remote.

## Case (cases/NNN.jsonl line)

```json
{
  "id": 142,
  "situation": "A hook reads a regex from a user-editable manifest",
  "options": ["use it as is", "validate it and fall back to a default"],
  "choice": "validate it and fall back; never crash the hook",
  "why": "a bad manifest must not block the session",
  "tags": ["security", "untrusted-input", "fail-open", "hook", "config", "node", "implement", "strict-vs-lenient"],
  "scope": "global",
  "project": "podium",
  "projectId": "r9f3a1c2",
  "projects": ["podium", "phoenix-421"],
  "stack": "node",
  "kind": "choice",
  "confidence": 0.9,
  "evidenceCount": 7,
  "evidence": ["commit:podium:a1b2c3d", "session:cba7…:1762300000000"],
  "counterCount": 0,
  "status": "confirmed",
  "statusAt": "2026-10-28",
  "isConfirmedByUser": true,
  "firstSeen": "2026-08-12",
  "lastSeen": "2026-10-28",
  "uses": 3,
  "hits": 2,
  "defaultCovered": false,
  "extractor": "1.2026-11",
  "vocabulary": 1
}
```

| Field | Rule |
|---|---|
| `id` | integer, allocated from `state.json` `nextCaseId`; shard = `floor(id / 256)`, file `cases/<shard padded to 3>.jsonl` |
| `situation`, `choice` | required, 8 to 300 characters, English |
| `options` | 0 to 6 strings, 1 to 120 characters |
| `why` | optional, at most 300 characters |
| `tags` | 1 to 12 canonical tags; at least one `concept` or `decision` tag |
| `scope` | `global`, `stack`, `project` |
| `kind` | `choice` (picked among options), `habit` (repeated without options), `refusal` (rejected something), `blind-spot` (consistently absent attention) |
| `confidence` | 0 to 1, see `learning.md`, Confidence |
| `evidence` | at most 5, most recent first; `evidenceCount` keeps the total |
| `status` | `observed`, `confirmed`, `rejected`, `stale` |
| `statusAt` | date of the last status change; archival ages rejected and stale cases from it |
| `uses`, `hits` | times retrieved for a prediction, times the prediction matched |

A later line with the same `id` replaces the earlier one (append-and-compact, see Compaction). A line `{ "id": 142, "deleted": true }` is a tombstone.

## Trait (profile.json)

```json
{
  "version": 1,
  "updatedAt": "2026-11-05",
  "traits": [
    {
      "id": "security.validate-boundaries",
      "lens": "security",
      "facet": "what",
      "statement": "Validates every value that crosses a boundary (manifest, CLI, hook input) and falls back to a default instead of failing",
      "scope": "global",
      "stack": "",
      "confidence": 0.92,
      "cases": [142, 31, 207],
      "status": "confirmed",
      "defaultCovered": false,
      "isBlindSpot": false,
      "updatedAt": "2026-11-01"
    }
  ],
  "stats": { "predictions": 120, "hits": 98, "missed": 6 }
}
```

`facet` is one of `what`, `when`, `depth`, `tradeoff`, `blind-spot` (the five facets of attention per lens). `id` is a stable slug `<lens>.<kebab-case>`, kept across syntheses so the developer's confirmations survive.

## Vocabulary

Base vocabulary in code (`Vocabulary.BASE`), overlay in `vocabulary.json`:

```json
{ "version": 1, "revision": 3, "tags": { "idempotency": { "facet": "concept", "parent": "robustness", "aliases": ["idempotent", "safe to retry"], "paths": [] } }, "candidates": { "feature-flag": 2 } }
```

A tag: `facet` (`lens`, `concept`, `artifact`, `stack`, `phase`, `decision`), optional `parent` (another tag), `aliases` (lower-case phrases, English and French), optional `paths` (pattern sources tested against `/`-separated relative paths). Patterns are limited to a safe subset (literals, `\.`, anchors `^` `$`, `(^|/)`, at most one unquantified alternation of distinct literals, at most two `?` each after one literal character, at most one `.*`); any other source in the overlay is dropped, the overlay holds at most 200 tags and 8 patterns per tag, and only the first 200 characters of a path are tested, so a hand-edited or imported `vocabulary.json` cannot stall matching. Canonical names are lower-case kebab-case, at most 32 characters.

### Base vocabulary (version 1)

| Facet | Tags (parent in brackets) |
|---|---|
| lens | `security`, `architecture`, `testing`, `performance`, `robustness`, `dx`, `git`, `docs`, `product`, `ux`, `data`, `operations`, `accessibility`, `cost` |
| concept, security | `untrusted-input` [security], `secret-handling` [security], `authn` [security], `authz` [security], `injection` [security], `least-privilege` [security], `supply-chain` [security], `data-leak` [security], `size-limit` [security], `crypto` [security], `audit-trail` [security] |
| concept, architecture | `layering` [architecture], `boundaries` [architecture], `static-classes` [architecture], `dependency-direction` [architecture], `single-responsibility` [architecture], `no-build-step` [architecture], `extensibility` [architecture], `coupling` [architecture], `naming` [architecture], `code-style` [architecture], `no-comments` [architecture] |
| concept, robustness | `fail-open` [robustness], `fail-closed` [robustness], `error-handling` [robustness], `idempotency` [robustness], `concurrency` [robustness], `backward-compat` [robustness], `migration` [robustness], `cross-platform` [robustness] |
| concept, testing | `test-first` [testing], `regression-test` [testing], `test-structure` [testing], `fixtures` [testing], `coverage` [testing], `e2e` [testing] |
| concept, performance | `caching` [performance], `hot-path` [performance], `memory` [performance], `latency` [performance] |
| concept, git | `commit-format` [git], `commit-granularity` [git], `branching` [git], `pull-request` [git], `ai-attribution` [git], `history-safety` [git] |
| concept, dx and product | `automation` [dx], `minimal-surface` [dx], `discoverability` [dx], `defaults` [dx], `consent` [product], `scope-control` [product], `user-language` [ux], `privacy` [data] |
| artifact | `hook`, `cli`, `api`, `ui`, `db-schema`, `config`, `ci`, `dependency`, `docs-file`, `test-file`, `prompt`, `agent`, `skill`, `manifest`, `build` |
| stack | `node`, `typescript`, `javascript`, `python`, `dotnet`, `java`, `go`, `rust`, `php`, `ruby`, `swift`, `kotlin`, `react`, `vue`, `angular`, `sql`, `docker`, `shell` |
| phase | `plan`, `implement`, `review`, `release` [git], `debug`, `setup` |
| decision | `add-vs-avoid-dependency`, `strict-vs-lenient`, `build-vs-reuse`, `now-vs-later`, `generic-vs-specific`, `automatic-vs-manual`, `ask-vs-decide`, `local-vs-remote`, `simple-vs-complete` |

Text matching: tag names of the `stack`, `phase` and `decision` facets, and the artifact `build`, match through their aliases only, never by the bare name, so ordinary words ("go", "plan", "review", "build") do not tag a prompt. Decision tags have multi-word aliases only ("keep it simple", "do it later"), because single words such as "simple", "later" or "local" are too common.

Path patterns of version 1 (artifact and stack): `hook` `(^|/)hooks?/`, `ci` `(^|/)\.github/workflows/|(^|/)\.gitlab-ci`, `config` `\.(json|ya?ml|toml|ini)$|(^|/)\.env`, `docs-file` `\.md$`, `test-file` `(^|/)tests?/|\.(test|spec)\.`, `dependency` `(^|/)(package(-lock)?\.json|requirements\.txt|pyproject\.toml|go\.mod|Cargo\.toml|.*\.csproj|Gemfile|composer\.json)$`, `db-schema` `(^|/)migrations?/|\.sql$`, `agent` `(^|/)\.claude/agents/`, `skill` `(^|/)skills?/.*SKILL\.md$`, `manifest` `(^|/)(plugin|marketplace|podium)\.json$`, `typescript` `\.tsx?$`, `javascript` `\.(m|c)?jsx?$`, `python` `\.py$`, `dotnet` `\.(cs|fs|csproj|sln)$`, `java` `\.java$`, `go` `\.go$`, `rust` `\.rs$`, `php` `\.php$`, `ruby` `\.rb$`, `swift` `\.swift$`, `kotlin` `\.kts?$`, `sql` `\.sql$`, `docker` `(^|/)(Dockerfile|docker-compose\.ya?ml)$`, `shell` `\.(sh|bash|zsh|ps1)$`, `react` `\.(jsx|tsx)$`, `vue` `\.vue$`.

Aliases of version 1 are listed in `Vocabulary.BASE` in code; each tag has between one and eight, including French forms for the most common (`sécurité`, `valider`, `secret`, `test`, `commit`, `dépendance`, `architecture`, `performance`, `erreur`).

## index.json

```json
{ "version": 1, "n": 412, "df": { "untrusted-input": 3 }, "postings": { "untrusted-input": [142, 31, 207] }, "meta": { "142": [0.9, 20261028, 2, 1, "node", "r9f3a1c2"] } }
```

`meta`: `[confidence, lastSeen as yyyymmdd, scope (0 global, 1 stack, 2 project), status (0 rejected, 1 observed, 2 confirmed, 3 stale), stack, projectId]`. No text. Rebuilt from `cases/` when missing or corrupt.

## state.json

```json
{ "version": 1, "nextCaseId": 413, "journal": { "2026-11/cba7….jsonl": 128 }, "runs": [{ "at": 1762300000000, "ok": true, "tokens": 48211, "cases": 6, "traits": 2, "note": "" }], "day": "2026-11-05", "tokensToday": 48211, "runsToday": 1, "backoffUntil": 0, "lastError": "" }
```

`journal` maps a file to the number of lines already distilled. `runs` keeps the last 30 entries.

## history/<repo-id>.json

```json
{ "version": 1, "root": "/Users/…/podium", "name": "podium", "identities": ["…"], "head": "67a1b34", "done": ["a1b2c3d", "…"], "scanned": 214, "selected": 61, "isComplete": false, "source": "auto" }
```

`done` keeps the shas already sent to the model (at most 2,000, oldest dropped). `source` is `auto` (the current repository) or `manual` (`/podium-stage learn`).

## Budgets

| File | Bound | How it is kept |
|---|---|---|
| `index.json` | 500 KiB | at most 5,000 active cases |
| a shard | 256 cases, about 250 KiB | numbering |
| `cases/` | 6 MiB | active cap, archival, compaction |
| `profile.json` | 200 traits, about 100 KiB | lowest-confidence observed traits dropped first |
| a journal file | 512 KiB | rotation to `<session>.1.jsonl` |
| `journal/` | 10 MiB | distilled files deleted; undistilled files older than 60 days deleted |
| `archive/` | 6 MiB | oldest archived cases deleted |
| `history/` | 200 KiB per repository | `done` capped |

## Compaction

A shard is rewritten (only the last line per id, no tombstones) when more than 30 % of its lines are superseded, at the end of a learning run, under the lock.

## Archival and the active cap

At the end of a run: cases `rejected` for more than 30 days, `stale` for more than 180 days (both counted from `statusAt`), or beyond the 5,000 active cap (lowest `value = confidence × recency × (1 + hits)` first) move to `archive/`. An archived case comes back when a new extraction matches it (`merger.ts`).

## Versioning and migration

- File `version`: major format. A reader handles its own version and every lower one with a migration in the same class (`Cases.migrate`, `SignatureSettings.migrate`).
- Case `vocabulary`: the vocabulary revision used to tag it. When the overlay revision changes (a tag renamed or merged), the next run rewrites the affected tags; no model call needed.
- Case `extractor`: `<contract major>.<yyyy-mm>`. `/podium-stage signature rebuild` re-derives index and profile; `/podium-stage signature reextract` (phase 7) replays the sources with the current extractor.
