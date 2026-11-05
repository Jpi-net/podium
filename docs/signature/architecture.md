# Architecture

## Overview

```
                      ┌──────────────────────── plugin/hooks/register.tsx (existing hooks) ───────────────────────┐
 engine events ─────▶ │ session.start  prompt.submit  tool.call  agent.spawn  turn.complete  session.end           │
                      │ prompt.compose  agent.offer  command.run (/podium-stage signature …)  ui.render (tab 6)    │
                      └──────────────┬─────────────────────────────────────────────────────────────┬──────────────┘
                                     │ Signature facade (plugin/hooks/signature/signature.ts)       │
              ┌──────────────────────┼──────────────────────────┬──────────────────────────────────┼─────────────┐
              ▼                      ▼                          ▼                                  ▼             ▼
       SignalExtractor          Journal                    Learner                           Recall         Profile
       (engine input →          (buffer, flush per         (idle runs: journal and           (fast path,    (section text,
        Signal, redacted)        session file)              history → cases → traits)         recall tool)   question hints)
                                     │                          │                                  │             │
                                     ▼                          ▼                                  ▼             ▼
                              ┌──────────────── SignatureStore over FsPort: <config>/podium/ ─────────────────────┐
                              │ settings.json  state.json  journal/  cases/  index.json  profile.json  archive/   │
                              └───────────────────────────────────────────────────────────────────────────────────┘
```

## Engine capabilities used (verified on build 2.1.318)

| Need | Capability | Notes |
|---|---|---|
| Profile in the system prompt | `on('prompt.compose')`: add a section `{ id: 'podium:signature', scope: 'session' }` | The text must stay identical for the whole thread (changing it loses the prompt cache): computed once at `session.start`, frozen in memory |
| Precedents with each prompt | `on('prompt.submit')`: `next({ ...e, context: [...(e.context ?? []), block] })` | Invisible to the user; attached on the way down, before `next` |
| Answers to Claude's questions | `on('tool.call')` with `e.tool === 'AskUserQuestion'`: `const ran = await next(e)`; `ran.result.answers`, `ran.result.questions`, `ran.result.response`, `ran.result.afkTimeoutMs` | An answer with `afkTimeoutMs` set was auto-resolved: not a decision, ignored |
| Plan accepted or refused | `tool.call` `ExitPlanMode`: `ran.deny` or `ran.isError` means refused (the refusal text is the feedback), otherwise accepted; `ran.result.planWasEdited` | Verified by a test against recorded results in phase 2 |
| Interruptions | `turn.complete` `reason: 'aborted'` | The next user prompt is then tagged as a correction candidate |
| Hint under a question dialog | `$.ui.notice(tool_use_id, text)` before `next(e)` | One line under the open dialog; removed by core when the call resolves |
| Background model calls | `$.model.complete({ model, system, prompt, maxTokens, timeoutMs, effort })` | Session's own client and credentials; resolves `isAnswered` or a `reason`, never rejects on provider errors; `usage` used for the budget; not counted in the session's cost total, so Signature keeps its own counter |
| Prompt caching of the long extraction contract | `system: [{ text: CONTRACT, cache: true }]` | Vocabulary and contract first and marked; batch content after |
| Files | `$.fs.read` (4 MiB per read), `$.fs.write` (whole content, creates directories), `$.fs.list`, `$.fs.exists`, `$.fs.stat` | No append: the journal is buffered and written per session file; shards stay far below 4 MiB |
| Git history | `$.process.run(['git', ...], { cwd, timeoutMs })` | Read-only commands only (`log`, `show`, `config --get`, `rev-parse`); stdout capped at 4 MiB, so history is paged with `--skip` and `-n` |
| Timers | `$.clock.every`, `$.clock.after` | Idle detection, journal flush |
| Session id | `$.session.id()` | Journal file name |
| Proxy agent | `plugin/agents/developer-proxy.md`, kept from the model by `on('agent.offer')` returning `{ isOffered: false }` while Signature is off | Agent type `podium:developer-proxy` |
| Recall tool | `$.tool.register({ name: 'recall', ..., isDeferred: false })` in `session.start` when enabled; served by `on('tool.call', { tool: 'mcp__podium__recall' })` | Description fixed for the session |
| Home directory | `$.env.get('CLAUDE_CONFIG_DIR')`, else `$.env.get('HOME')` or `$.env.get('USERPROFILE')` + `/.claude` | Resolved once at `session.start` |
| Settings across sessions | files under the data directory (not `$.store`, which is capped at 4 MiB for the whole plugin and already holds panel settings) | `settings.json` is human-readable and exportable |

## Module layout

All new code under `plugin/hooks/signature/`, one exported class per file, static members only, no comments (`.claude/rules/panel.md`). `register.tsx` only adds thin hooks that call the `Signature` facade, so the 3,000-line entry file grows by a few dozen lines.

| File | Class | Role | Depends on |
|---|---|---|---|
| `paths.ts` | `SignaturePaths` | Resolve the data root from env values; file names of every artefact; shard file of a case number | none |
| `settings.ts` | `SignatureSettings` | `Settings` type, defaults, `parse` (tolerant: unknown keys dropped, wrong types replaced by defaults), consent states, exclusion matching | `Glob` (in the same file as a private helper method) |
| `redactor.ts` | `Redactor` | Mask secrets, emails, credentials in URLs, home paths, long blobs; truncate | none |
| `vocabulary.ts` | `Vocabulary` | Base vocabulary data, overlay merge, `normalize`, `fromText` (alias match), `fromPaths` (path patterns), `ancestors`, `facetOf` | none |
| `cases.ts` | `Cases` | `Case` and `Trait` types, `parse` and `validate` of a model's JSON, `toLine`/`fromLines` for JSONL, id allocation | `Vocabulary` |
| `tag-index.ts` | `TagIndex` | Build from cases, add, remove, document frequency, compact meta, serialize | `Cases` |
| `ranker.ts` | `CaseRanker` | Score cases for a tag query (facet weights, IDF, parent matches, confidence, recency, scope, status), top-k | `TagIndex`, `Vocabulary` |
| `tagger.ts` | `SituationTagger` | Tags of a situation for the fast path: prompt text, mentioned paths, project stack | `Vocabulary` |
| `merger.ts` | `CaseMerger` | Dedupe, reinforce, contradict, cap evidence, archive selection | `Cases` |
| `signals.ts` | `SignalExtractor` | Engine inputs and results to `Signal` values (prompt, question, plan, interrupt, agent), redacted, correction heuristics, language guess | `Redactor` |
| `journal.ts` | `Journal` | In-memory buffer, flush to `journal/<yyyy-mm>/<session>.jsonl`, rotation at 512 KiB, pending reading with cursors | `SignaturePaths` |
| `store.ts` | `SignatureStore` | Read and write every file through `FsPort`, shards, index, profile, state, lock; compaction | all data classes |
| `history.ts` | `HistoryScanner` | Parse `git log` output, prioritise signal-rich commits, build diff excerpts, cursors per repository | `Redactor` |
| `prompts.ts` | `LearningPrompts` | The extraction and synthesis contracts sent to the model, built from the vocabulary | `Vocabulary` |
| `learner.ts` | `Learner` | One learning run: lock, budget, batches, model calls, parse, merge, write, report | everything above |
| `profile.ts` | `Profile` | Trait merge, status transitions, section text for `prompt.compose`, context block for `prompt.submit`, question hint | `Cases`, `CaseRanker` |
| `signature.ts` | `Signature` | Facade: holds the ports and the in-memory index, exposes `start`, `onPrompt`, `onToolCall`, `onTurn`, `onIdle`, `section`, `recall`, `command`, `view` | everything |
| `view.tsx` | `SignatureView` | The Signature tab and the opt-in screen, drawn from a `SignatureViewState` and the surface's elements | none (pure render) |

Rationale of the split: every class except `Signature`, `SignatureStore`, `Learner` and `HistoryScanner` is pure and tested without the engine. The four impure ones receive a `SignaturePorts` value, so tests pass an in-memory implementation.

## Ports

```ts
export type FsPort = {
  read: (path: string) => Promise<string>
  write: (path: string, text: string) => Promise<void>
  exists: (path: string) => Promise<boolean>
  list: (path: string) => Promise<{ name: string, kind: string, size: number, mtimeMs: number }[]>
}

export type ModelPort = (request: {
  model: string
  system: { text: string, cache?: boolean }[]
  prompt: string
  maxTokens: number
  timeoutMs: number
}) => Promise<{ isAnswered: boolean, text: string, reason: string, inputTokens: number, outputTokens: number }>

export type GitPort = (argv: readonly string[], cwd: string) => Promise<{ exitCode: number, stdout: string }>

export type SignaturePorts = {
  fs: FsPort
  model: ModelPort
  git: GitPort
  now: () => number
  toast: (text: string) => void
}
```

`register.tsx` builds the real ports from `$` in `session.start`. Tests use `MemoryFs`, `ScriptedModel` and `ScriptedGit` fixture classes.

## Data flow per event

| Event | Signature work | Cost on the hot path |
|---|---|---|
| `session.start` | resolve paths; read `settings.json`; if enabled and the folder is not excluded: read `index.json`, `profile.json`, vocabulary overlay; freeze the section text; register the `recall` tool; schedule history research for this repository; start the idle timer | one-off, a few file reads |
| `prompt.compose` | return the frozen section (or nothing) | none |
| `prompt.submit` (user origin, not meta, not a task notification) | record a prompt signal; tag the situation; rank; attach the context block | in-memory only, under 5 ms for 5,000 cases |
| `tool.call` AskUserQuestion | before `next`: hint via `$.ui.notice` and remember the prediction; after: record the question signal and score the prediction | in-memory |
| `tool.call` ExitPlanMode | after `next`: record a plan signal | in-memory |
| `tool.call` `mcp__podium__recall` | answer from the in-memory index plus shard reads for the hits | one to three file reads |
| `agent.spawn` | record the agent type and model | in-memory |
| `turn.complete` | mark aborted turns; flush the journal buffer when it holds 20 or more signals | one write, fire and forget |
| idle (no event for 10 minutes) | flush; if a learning run is due, start it in the background | model calls, never awaited by a user-facing hook |
| `session.end` | flush the journal | one write |

Every Signature call from a hook is wrapped so that an error is logged to the tab's last-error line and the hook continues with `next(e)` (P8).

## Concurrency

Several Claude Code sessions can run at once on one machine.

- Journal: one file per session, so no two sessions write the same file.
- Cases, index, profile, state: written only by a learning run, which holds `lock.json` (`{ owner: sessionId, expiresAt }`, 15 minutes). Taking the lock: read; if absent or expired, write ours, wait 300 ms, read again and proceed only if the owner is still ours. A crashed run's lock expires on its own.
- Readers (fast path, recall) read `index.json` at session start and reload it when its `mtimeMs` changes, checked at most once a minute.

## Failure handling

| Failure | Behaviour |
|---|---|
| Data directory not writable | Signature turns itself off for the session, the tab says why |
| Corrupt JSON in any file | its text is copied to `<name>.corrupt-<timestamp>` (the engine has no rename) and the file is rebuilt from the layer below (index from cases, profile from cases), or rewritten with defaults (settings, state) |
| A file written by a newer Podium (`version` above the known one) | left untouched; Signature turns itself off for the session and the tab says why. Only `erase` empties it, because erasing is the developer's privacy action |
| A JSONL line that does not parse | skipped and counted in the run report |
| Model call not answered | the batch stays pending; the run stops; next attempt after the backoff (1 h, 4 h, 24 h) |
| Model answer not valid JSON or failing validation | the batch is retried once with a stricter instruction, then skipped and logged |
| Git command fails or times out | the repository's research is postponed to the next session |
| Budget exhausted | the run stops cleanly; remaining work waits for the next day |
