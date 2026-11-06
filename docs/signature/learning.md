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
4. History batches (step B), up to the rest minus the synthesis reserve.
5. Merge new cases (`CaseMerger`), write shards, rebuild the index.
6. Synthesis (step C) when due.
7. Vocabulary candidates (step D).
8. Archival, compaction, journal purge.
9. Update `state.json` (run entry, counters), release the lock, notify.

The journal and history cursors of a batch are written in the same step as the cases that batch produced (step 5), so an interrupted run can never send the same evidence twice.

A run's allowance is `min(tokensPerDay - tokensToday, 120,000)`. Before each model call the learner estimates the call's input tokens as characters / 3.5 and stops when the estimate plus 4,000 output tokens would exceed what is left.

When the allowance is at least 40,000 tokens, history batches leave a reserve of 20,000 tokens for synthesis (step C), so traits are still produced while history remains. A smaller allowance has no reserve: history may use all of it, because a reserve would leave little or no room for history; synthesis then only runs if enough is left, so a `tokensPerDay` under 40,000 may delay traits until history is read. Below about 12,000 tokens a full batch does not fit at all. Known limit: the estimate counts each non-ASCII character as one token, so a batch of mostly non-Latin text can exceed the room left just above the threshold (an allowance up to about 49,000) and wait there until the allowance is larger. Unused tokens are not spent; the daily and per-run limits are unchanged.

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

Parsing: `Cases.parseModelOutput` reads at most 64 KiB, takes the first balanced `{…}` span of the text that parses as a JSON object, keeps at most 40 cases (the rest dropped with reason `cap`), merges identical cases of one output by uniting their evidence, drops a case containing letters outside the Latin script (reason `script`: cases are English by contract; this removes look-alikes from other alphabets, not Latin look-alikes or ASCII tricks, which remain an inherent limit of a keyword check), validates every case (drops the invalid ones with a reason), normalises tags through the vocabulary (aliases to canonical, unknown removed), sets `scope` (`project` when every evidence id belongs to one repository and the batch was project-specific, else `global` when the stack tags are absent, else `stack`), `confidence` initial 0.5 (see Confidence), `status` `observed`, `extractor`, `vocabulary`, dates.

## Safety floor (`Cases.isUnsafe`)

Model output derived from commit messages may carry injected instructions. Every case is checked on its situation, choice, reason and each option, separately and together, after NFKC normalisation, removal of default-ignorable characters (zero-width, variation selectors, fillers), folding of Cyrillic and Greek look-alikes to Latin and accent folding:

- a weakening verb with any suffix (skip, disable, deactivate, bypass, remove, ignore, weaken, silence, mute, override, delete, drop, omit, circumvent, stop running, turn off, switch off, comment out, and French désactiver, contourner, sauter, supprimer), or `without`, anywhere in the same field as a safeguard word with any suffix (test, guard, hook, review, permission, check, lint, validation, security, CI, pre-commit, coverage, type check, verification, assert);
- a negated positive verb next to a safeguard ("Never runs the test suite", "no longer requires review");
- flags anywhere: `--no-verify`, `commit -n`, `push -f`, `--force` with push, `HUSKY=0`, `[skip ci]`, `xit`, `.skip(`, `.only(`, bypass-permissions modes, `dangerously`;
- a verb is not a weakening only when one of the one or two words directly before it, with no punctuation in between, is a verb-governing negation (never, don't, do not, does not, must not, should not, refuses to, jamais, ne): "Never skip the tests before a release" is kept, while "No time, so skip the tests" and "Don't hesitate to skip the tests" are dropped;
- a `refusal` or `blind-spot` case whose choice names a safeguard at all is dropped (a planted "refuses to run tests").

Every check is linear: negation looks only at the 64 characters before each verb.

A dropped case is reported with the reason `unsafe`.

## Merge (`CaseMerger`)

For each new case against active and archived cases:

- similarity of situations: Jaccard of tag sets (weighted: concept and decision count double);
- similarity of choices: Jaccard of folded word sets of `choice` without stopwords and words of two letters or fewer, except negations (for example `no`, `not`, `never`, `ne`, `pas`, `sans`, `without`, `dont`, `aucun`, `jamais`), which are always kept. Polarity is computed per word: a word directly after a negation (stopwords skipped) is negated, and the similarity is multiplied by 0.2 only when one side negates a word that the other side states without negation. So "validate" and "do not validate" never merge, "Prefer tabs, not spaces" and "Prefer spaces, not tabs" are opposite, while a restatement with an extra clause ("Keep tests next to the source, never in a separate folder") still reinforces "Keep tests next to the source". Identical choices score 1.

| Tags | Choice | Result |
|---|---|---|
| ≥ 0.8 | ≥ 0.5 | same decision: add evidence, `evidenceCount +=` the ids never seen for this case (an id counts once per case, across the run and the stored evidence), `lastSeen` = max, confidence up, archived case restored |
| ≥ 0.8 | ≤ 0.2 and opposed polarity (one choice negates a word the other states) | contradiction: existing `counterCount += 1`, at most once per existing case per merge; new case kept separately; if `counterCount > evidenceCount` the existing case becomes `stale`, unless the developer confirmed it. The contradiction is applied to every opposite case even when the incoming case reinforces another one, so repeated opposite evidence ages the old decision out |
| otherwise | | new case, new id (an unrelated choice with the same tags never counts as a contradiction) |

A `rejected` case never absorbs evidence: a new matching extraction is dropped, so the developer's rejection holds. A case the developer confirmed is never made stale automatically; restored, it returns to `confirmed`.

Evidence must belong to the batch: the learner passes the ids it put in the batch (`MergeContext.allowedEvidence`), any other id is removed, and a case left without evidence is dropped. A model cannot invent commits or sessions to raise a case's confidence. Within one merge an id counts once per case; across runs, the journal cursors and the `done` list of each repository guarantee that a signal or a commit is sent to the model only once, so a case keeps only its five latest ids without being counted twice. A future `reextract` must reset the counts it recomputes instead of adding to them.

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
