# Learning

Learning turns signals and commits into cases, and cases into traits. It runs inside the session's plugin environment with `$.model.complete`, never in the user's conversation.

## When a run starts

A run starts on idle (no `prompt.submit`, `tool.call` or `turn.complete` for `learning.idleMinutes`) when all hold:

- `consent` is `enabled` and `learning.background` is true;
- not excluded (an excluded session still never runs learning, so that nothing of it is read);
- `runsToday < learning.runsPerDay`, `tokensToday < learning.tokensPerDay`, `now >= backoffUntil`;
- there is work: at least 20 undistilled signals, or a repository with history still to research, or a synthesis due;
- the lock is free.

`/podium-stage signature learn-now` starts a run immediately, ignoring the idle wait and the daily run count (not the token budget).

A run is never awaited by a hook. It reports progress to the Signature view state and ends with one toast when `notify` is on and it learned something ("Signature learned 3 new things about how you work").

## Run steps

1. Take the lock.
2. Load settings, state, vocabulary, index (in memory already when the session is enabled).
3. Session batches (step A), up to half the run's token allowance.
4. History batches (step B), up to the rest.
5. Merge new cases (`CaseMerger`), write shards, rebuild the index.
6. Synthesis (step C) when due.
7. Vocabulary candidates (step D).
8. Archival, compaction, journal purge.
9. Update `state.json` (cursors, run entry, counters), release the lock, notify.

A run's allowance is `min(tokensPerDay - tokensToday, 120,000)`. Before each model call the learner estimates the call's input tokens as characters / 3.5 and stops when the estimate plus 4,000 output tokens would exceed what is left.

## A. Session batches

Read undistilled journal lines with the cursors of `state.json`. Group by session, then into episodes: consecutive signals of one session less than 30 minutes apart. Render each episode as compact text:

```
[episode podium · typescript,node · 2026-11-04]
prompt (fr, correction after abort): "non, garde fail open, ne bloque jamais la session"
question "Where should the profile be stored?" options: [~/.claude/podium | $.store | project .claude] recommended: 0 chose: ~/.claude/podium
plan refused: "too many skills, keep one command" excerpt: "Add /podium-learn, /podium-profile, …"
agents: architect(opus) panel-expert(sonnet)×2 test-expert(sonnet) lint-runner(haiku)
```

Batch episodes up to 24,000 characters per call.

## B. History batches

For the current repository (automatic, `capture.history`) and for repositories added with `/podium-stage learn <path>` (manual).

1. Identities: `settings.identities`, else `git config --get user.email` in that repository. Without any identity the research is skipped and the tab asks the developer to set one.
2. Inventory, paged by 500: `git log --no-merges --author=<each identity> --format=%H%x1f%aI%x1f%s%x1f%b%x1e --numstat --skip=<n> -n 500`. Parsed by `HistoryScanner.parse` (record separator `\x1e`, field separator `\x1f`, then numstat lines `added\tdeleted\tpath`).
3. Priority score per commit, highest first:

| Signal | Points |
|---|---|
| subject or body matches revert, fixup, undo, rollback, `Revert "` | 5 |
| touches security-sensitive paths (auth, crypto, permission, secret, token, guard, sanitize, validate, `.env`, `settings.json`) | 4 |
| touches `.claude/`, `CLAUDE.md`, rules, CI, dependency manifests | 4 |
| among the first 30 commits of the repository | 4 |
| a refactor: 5+ files renamed or 10+ files touched with balanced additions and deletions | 3 |
| subject mentions why (`because`, `so that`, `to avoid`, `instead of`, `pour`, `afin`) or the body is 2+ lines | 2 |
| touches tests only | 1 |
| lock files, generated files, formatting only (whitespace numstat) | -5 |

4. Selection per run: the top 60 not in `done`, plus, on the first run of a repository, its first 30 commits. Initial backlog cap: 600 selected commits per repository overall; after that, only new commits since `head` are considered.
5. Excerpt per selected commit: subject, body (redacted, 600 characters), numstat summary, and a diff from `git show --format= --unified=1 --no-color <sha> -- <at most 6 paths, highest priority first, excluding lock and generated files>` truncated to 3,000 characters and redacted.
6. Batches of up to 24,000 characters per call.

Research of an external repository (`/podium-stage learn <path>`): the path must be a local git working tree (`git -C <path> rev-parse --show-toplevel` succeeds); URLs are refused with a message asking to clone first, which keeps `$.process.run` to read-only git. The run is started immediately in the background, with its own progress line in the tab, and counts against the daily token budget.

## The extraction contract (session and history batches)

System prompt (cached block, built by `LearningPrompts.extraction(vocabulary)`):

- role: "You extract the decisions of one software developer from evidence of their work. You describe how they decide, not what the code does."
- output: one JSON object `{ "cases": [...], "candidateTags": [{ "tag", "facet", "parent", "aliases", "why" }] }` and nothing else;
- case fields and their limits (data-model.md);
- rules:
  - one case per distinct decision; a repeated decision is one case with every evidence id;
  - `situation` is general enough to recur in another project ("a hook reads a user-editable config value"), never a file name or a variable name;
  - `choice` states what the developer did; `why` only when the evidence states or clearly implies it, otherwise omit it;
  - attention facets: record what the developer looks at, when, how deep, which trade-off they accept, and a `blind-spot` case when a lens is consistently absent where it would be expected (at least three episodes or commits);
  - code written by an assistant does not show the developer's style: decide from what was kept, refused, corrected, reverted, reordered or asked for;
  - tags only from the vocabulary listed below; unknown concepts go to `candidateTags`;
  - evidence ids exactly as given in the batch (`commit:<repo>:<short sha>`, `session:<id>:<at>`);
  - never include code, secrets, personal names, emails or client names;
  - English, whatever the language of the evidence;
  - return `{ "cases": [] }` when there is nothing.
- the vocabulary: one line per tag `tag (facet, parent): aliases`.

User prompt: the batch text.

Model: `learning.model`; `maxTokens` 4,000; `timeoutMs` 120,000; `effort` `low`.

Parsing: `Cases.parseModelOutput` takes the first balanced JSON object of the text, validates every case (drops the invalid ones with a reason), normalises tags through the vocabulary (aliases to canonical, unknown removed), sets `scope` (`project` when every evidence id belongs to one repository and the batch was project-specific, else `global` when the stack tags are absent, else `stack`), `confidence` initial 0.5 (see Confidence), `status` `observed`, `extractor`, `vocabulary`, dates.

## Merge (`CaseMerger`)

For each new case against active and archived cases:

- similarity of situations: Jaccard of tag sets (weighted: concept and decision count double);
- similarity of choices: Jaccard of lower-cased word sets of `choice` without stopwords.

| Tags | Choice | Result |
|---|---|---|
| ≥ 0.8 | ≥ 0.5 | same decision: add evidence (dedupe ids), `evidenceCount += new`, `lastSeen` = max, confidence up, archived case restored |
| ≥ 0.8 | ≤ 0.2 | contradiction: existing `counterCount += 1`; new case kept separately; if `counterCount > evidenceCount` the existing case becomes `stale` |
| otherwise | | new case, new id |

A `rejected` case never absorbs evidence: a new matching extraction is dropped, so the developer's rejection holds.

## Confidence

`confidence = clamp(0.35 + 0.15 × ln(1 + evidenceCount) + 0.1 × min(projects, 3) - 0.2 × counterCount / (evidenceCount + counterCount) + confirmedBonus, 0, 1)`, where `projects` is the number of distinct repositories in its evidence and `confirmedBonus` is 0.25 when the developer confirmed it. One commit gives about 0.55; seven commits over two projects about 0.85.

## C. Synthesis (traits)

Due when 10+ cases changed since the last synthesis, or 7 days passed, or the developer confirmed or rejected something.

Input: the current traits (id, statement, status) and, per lens, the 40 highest-value cases of that lens (situation, choice, why, tags, confidence, scope). One call per group of lenses fitting 24,000 characters.

Contract (`LearningPrompts.synthesis`): return `{ "traits": [{ "id", "lens", "facet", "statement", "scope", "stack", "cases", "isBlindSpot" }] }`; keep existing ids for the same idea; a statement is one sentence, at most 200 characters, starts with a verb in the third person ("Validates…"); never a trait that lowers a safety floor (P4); a blind-spot trait names what to remind, not what to skip.

Merge: by `id`. Confirmed and rejected statuses are kept as the developer set them; a new trait is `observed`; a trait whose cases are all stale or rejected becomes `stale`; trait confidence is the mean of its cases' confidence weighted by evidence.

## D. Vocabulary candidates

`candidateTags` counts accumulate in `vocabulary.json` `candidates`. A candidate seen in 3+ cases is added to the overlay automatically (P3), with the revision bumped, and listed in the tab as "new tag" where the developer can rename, merge into an existing tag or remove it.

## Redundancy pruning (P7)

Weekly, at most 10 confirmed traits per run, oldest-checked first: one `$.model.complete` call per trait with the situation of its best case and its options, no profile, asking which option the model would pick and why. When the model picks the developer's choice in 2 runs out of 2 (checked on two different weeks), the trait becomes `defaultCovered`.

## Metrics

| Metric | Definition | Use |
|---|---|---|
| Fidelity | hits / predictions on AskUserQuestion, last 30 days | shown in the tab |
| Precision | hits / uses on cases injected into prompts and followed by a decision in the same turn | tunes the injection threshold |
| Missed | corrections (`isCorrection` or `afterAbort`) where the extracted refusal case matches an existing case that was not injected | if it stays above 15 % of corrections, revisit retrieval (P2) |

## Past sessions backfill (phase 6, off by default)

When `capture.pastSessions` is enabled: read transcripts under `<config>/projects/*/*.jsonl` (newest first, at most 200 files, each read whole only when under 4 MiB), extract the same signals with a tolerant adapter (lines with `type` `user` or `assistant`, `tool_use` blocks of `AskUserQuestion` and `ExitPlanMode` with their `toolUseResult`), skip excluded project folders, write them as journal files of a synthetic session `backfill-<file>`, then mark the setting done. The transcript format is internal to Claude Code: the adapter fails open and reports how many lines it could read.

## Rebuild

`/podium-stage signature rebuild`: under the lock, rebuild `index.json` from `cases/`, run a synthesis, and re-normalise every case's tags to the current vocabulary. No source is read again; only the synthesis calls the model.
