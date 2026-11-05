# Roadmap

Each phase is releasable on its own, ships with its tests, passes `claude plugin validate plugin` and `claude plugin test plugin`, and keeps the repository rules (static classes, zero comments, fail open, English on disk). Phases 1 to 5 make the feature usable; 6 to 8 deepen it.

## Phase 1: Core (pure classes, no engine wiring)

No user-visible change, so no README or CHANGELOG entry yet. Everything is pure and tested without the engine.

### Files and owners

| Wave | Owner | Files |
|---|---|---|
| 1 | panel-expert A | `plugin/hooks/signature/paths.ts`, `settings.ts`, `redactor.ts`, `vocabulary.ts`, `format-version.ts` |
| 1 | panel-expert B | `plugin/hooks/signature/cases.ts`, `tag-index.ts`, `ranker.ts`, `tagger.ts`, `merger.ts` |
| 2 | test-expert A | `plugin/tests/signature-paths.test.ts`, `signature-settings.test.ts`, `signature-redactor.test.ts`, `signature-vocabulary.test.ts` |
| 2 | test-expert B | `plugin/tests/signature-cases.test.ts`, `signature-index.test.ts`, `signature-ranker.test.ts`, `signature-tagger.test.ts`, `signature-merger.test.ts`, `plugin/tests/fixtures/signature.ts` |

### Contracts (exact signatures; both experts code against them)

```ts
// paths.ts
export type SignatureEnv = { claudeConfigDir: string, home: string, userProfile: string }
export type SignatureFiles = { root: string, settings: string, state: string, lock: string, vocabulary: string, index: string, profile: string, cases: string, archive: string, journal: string, history: string, exports: string }
export class SignaturePaths {
  static root(env: SignatureEnv): string
  static files(root: string): SignatureFiles
  static shardOf(id: number): number
  static shardFile(dir: string, shard: number): string
  static journalFile(root: string, at: number, session: string, part: number): string
  static historyFile(root: string, repoId: string): string
  static normalize(path: string): string
  static isInside(root: string, path: string): boolean
}

// settings.ts
export type Consent = 'undecided' | 'enabled' | 'paused' | 'declined' | 'never'
export type LearningModel = 'haiku' | 'sonnet' | 'opus'
export type Settings = {
  version: 1
  consent: Consent
  capture: { sessions: boolean, history: boolean, pastSessions: boolean }
  apply: { section: boolean, context: boolean, hints: boolean, proxy: boolean }
  learning: { background: boolean, model: LearningModel, runsPerDay: number, tokensPerDay: number, idleMinutes: number }
  identities: string[]
  exclude: string[]
  notify: boolean
  halfLifeMonths: number
}
export class SignatureSettings {
  static defaults(): Settings
  static parse(text: string): Settings
  static serialize(settings: Settings): string
  static isActive(settings: Settings): boolean
  static matches(glob: string, path: string, home: string): boolean
  static isExcluded(settings: Settings, path: string, home: string): boolean
  static dropped(text: string): string[]
}

// format-version.ts
export class FormatVersion {
  static of(text: string): number
  static isNewer(text: string, known: number): boolean
}

// redactor.ts
export class Redactor {
  static redact(text: string, home: string): string
  static truncate(text: string, max: number): string
  static clean(text: string, max: number, home: string): string
}

// vocabulary.ts
export type Facet = 'lens' | 'concept' | 'artifact' | 'stack' | 'phase' | 'decision'
export type TagDef = { facet: Facet, parent: string, aliases: readonly string[], paths: readonly string[] }
export type VocabularyData = { revision: number, tags: Readonly<Record<string, TagDef>> }
export type VocabularyOverlay = VocabularyData & { candidates: Readonly<Record<string, number>> }
export class Vocabulary {
  static readonly FACETS: readonly Facet[]
  static base(): VocabularyData
  static parseOverlay(text: string): VocabularyOverlay
  static serializeOverlay(overlay: VocabularyOverlay): string
  static merge(base: VocabularyData, overlay: VocabularyData): VocabularyData
  static isName(name: string): boolean
  static has(vocabulary: VocabularyData, tag: string): boolean
  static facetOf(vocabulary: VocabularyData, tag: string): Facet | undefined
  static fold(text: string): string
  static normalize(vocabulary: VocabularyData, tags: readonly string[]): string[]
  static ancestors(vocabulary: VocabularyData, tag: string): string[]
  static fromText(vocabulary: VocabularyData, text: string): string[]
  static fromPaths(vocabulary: VocabularyData, paths: readonly string[]): string[]
  static describe(vocabulary: VocabularyData): string
}

// cases.ts
export type Scope = 'global' | 'stack' | 'project'
export type CaseStatus = 'observed' | 'confirmed' | 'rejected' | 'stale'
export type CaseKind = 'choice' | 'habit' | 'refusal' | 'blind-spot'
export type Case = {
  id: number, situation: string, options: string[], choice: string, why: string, tags: string[]
  scope: Scope, project: string, projectId: string, projects: string[], stack: string, kind: CaseKind
  confidence: number, evidenceCount: number, evidence: string[], counterCount: number
  status: CaseStatus, statusAt: string, isConfirmedByUser: boolean, firstSeen: string, lastSeen: string
  uses: number, hits: number, defaultCovered: boolean, extractor: string, vocabulary: number
}
export type ExtractedCase = { situation: string, options: string[], choice: string, why: string, tags: string[], kind: CaseKind, evidence: string[] }
export type CandidateTag = { tag: string, facet: Facet, parent: string, aliases: string[] }
export type ParsedOutput = { cases: ExtractedCase[], candidateTags: CandidateTag[], dropped: { index: number, reason: string }[] }
export type CaseLines = { cases: Case[], superseded: number, bad: number }
export class Cases {
  static firstObject(text: string): string
  static parseModelOutput(text: string, vocabulary: VocabularyData): ParsedOutput
  static validate(raw: unknown, vocabulary: VocabularyData): { value: ExtractedCase | undefined, reason: string }
  static isUnsafe(text: string): boolean
  static confidence(evidenceCount: number, counterCount: number, projects: number, isConfirmedByUser: boolean): number
  static repositoryOf(evidence: string): string
  static fromLines(text: string): CaseLines
  static toLine(value: Case): string
  static tombstone(id: number): string
}

// tag-index.ts
export type CaseMeta = [number, number, number, number, string, string]
export type TagIndexData = { version: 1, n: number, df: Record<string, number>, postings: Record<string, number[]>, meta: Record<string, CaseMeta> }
export class TagIndex {
  static empty(): TagIndexData
  static metaOf(value: Case): CaseMeta
  static build(cases: readonly Case[]): TagIndexData
  static add(index: TagIndexData, value: Case): TagIndexData
  static remove(index: TagIndexData, id: number, tags: readonly string[]): TagIndexData
  static contains(index: TagIndexData, tag: string, id: number): boolean
  static parse(text: string): TagIndexData | undefined
  static serialize(index: TagIndexData): string
}

// ranker.ts
export type RankQuery = { tags: readonly string[], stack: readonly string[], projectId: string, now: number, halfLifeMonths: number }
export type Ranked = { id: number, score: number }
export class CaseRanker {
  static readonly WEIGHTS: Readonly<Record<Facet, number>>
  static idf(index: TagIndexData, tag: string): number
  static recency(lastSeen: number, now: number, halfLifeMonths: number): number
  static isSituational(vocabulary: VocabularyData, tags: readonly string[]): boolean
  static score(index: TagIndexData, vocabulary: VocabularyData, query: RankQuery, id: number): number
  static top(index: TagIndexData, vocabulary: VocabularyData, query: RankQuery, k: number, minScore: number): Ranked[]
}

// tagger.ts
export type Situation = { text: string, paths: readonly string[], stack: readonly string[] }
export class SituationTagger {
  static paths(text: string): string[]
  static tag(vocabulary: VocabularyData, situation: Situation): string[]
}

// merger.ts
export type MergeContext = { nextId: number, today: string, project: string, projectId: string, stack: string, extractor: string, vocabularyRevision: number, isProjectBatch: boolean, allowedEvidence: readonly string[] }
export type MergeResult = { cases: Case[], nextId: number, added: number[], reinforced: number[], contradicted: number[], dropped: number }
export class CaseMerger {
  static tagSimilarity(vocabulary: VocabularyData, a: readonly string[], b: readonly string[]): number
  static choiceSimilarity(a: string, b: string): number
  static merge(existing: readonly Case[], incoming: readonly ExtractedCase[], context: MergeContext, vocabulary: VocabularyData): MergeResult
  static value(value: Case, today: string, halfLifeMonths: number): number
  static selectForArchive(cases: readonly Case[], today: string, cap: number, halfLifeMonths: number): number[]
}
```

Semantics are those of `data-model.md`, `capture.md` (Redaction), `learning.md` (Merge, Confidence) and `retrieval.md` (Score, Fast path). Dates are `yyyy-mm-dd` strings in cases and `yyyymmdd` numbers in index meta.

### Acceptance

- All contracts implemented, no free functions, no comments.
- Tests pin: one positive and one negative case per redaction rule; settings tolerance (garbage, wrong types, out of range, missing file text `''`); glob semantics (`*`, `**`, `?`, `~`, prefix directory, Windows separators); vocabulary alias matching with accents and word boundaries, path patterns, cycle-safe ancestors, overlay validation; model output parsing with prose around the JSON, nested braces in strings, invalid cases dropped with reasons, unsafe cases dropped, tags normalised; JSONL last-line-wins and tombstones; index add/remove consistency with `build`; ranking examples of `retrieval.md`; merge table of `learning.md`; archive selection.

### Prerequisites carried to phase 2 (from the phase 1 security reviews)

These need the engine wiring to be exploitable, and must land before any case reaches a prompt:

1. `isUnsafe`: a positive verb (run, write, add, require, execute) is negated when any negator (never, not, no longer, dont, doesnt, hardly, seldom, rarely) appears earlier in the same clause within 64 characters, clauses cut at `. ; ! ?` only ("Never actually runs the test suite", "Do not, under any circumstances, run the tests", "Hardly ever runs the tests" must be dropped).
2. Script check: NFKD, strip combining marks, then every letter must be `[A-Za-z]` or in a short allow-list (ß æ œ ø), so Latin look-alikes ("ꜱkip", "Skıp", "teʂts") are dropped.
3. `MergeContext.allowedEvidence` becomes required and filters whenever it is an array, even empty; the learner always passes the batch's ids.
4. An evidence id counts toward at most one case per merge (or a case gains at most 5 evidence per run).
5. Overlay: cap the total number of patterns at 200; the tagger caps passed-in paths at 20.
6. `SignatureStore` writes cursors in the same step as the cases of their batch.

## Phase 2: Capture, storage and the opt-in screen

### Files and owners

| Wave | Owner | Files |
|---|---|---|
| 1 | panel-expert B | prerequisites 1 to 4 and the tagger cap: `cases.ts`, `merger.ts`, `tagger.ts` |
| 1 | panel-expert A | prerequisite 5 (overlay total cap) in `vocabulary.ts`; new `signals.ts`, `journal.ts` |
| 1 | panel-expert C | new `store.ts` |
| 2 | panel-expert D | new `signature.ts`, `view.tsx`; hooks, tab and commands in `plugin/hooks/register.tsx`; `plugin/types/index.d.ts` |
| 3 | test-expert A | `signature-signals.test.ts`, `signature-journal.test.ts`, `signature-store.test.ts`, `MemoryFs` in `fixtures/signature.ts` |
| 3 | test-expert B | prerequisite tests in the existing cases, merger, tagger, vocabulary test files; `signature-facade.test.ts`, `signature-view.test.tsx`, `register.test.tsx` additions |
| 3 | doc-writer | `PRIVACY.md`, `plugin/README.md`, `CHANGELOG.md`, `CONTRIBUTING.md` |
| 3 | main thread | `.claude/rules/panel.md`, `.claude/CLAUDE.md` (privacy-security.md, Repository rule changes) |

### Engine constraint: no delete

`$.fs` has `read`, `write`, `list`, `exists`, `stat` and no delete. Signature therefore empties files instead of deleting them: an empty file is read as absent everywhere, `erase` writes `''` to every file under the root (then `settings.json` with consent `declined`), a distilled journal file is emptied. Empty files are listed in the tab's storage line and the README tells the developer they can delete the folder by hand.

### Contracts

```ts
// signals.ts
export type SignalKind = 'prompt' | 'question' | 'plan' | 'abort' | 'agent' | 'use'
export type SignalContext = { session: string, project: string, projectId: string, stack: readonly string[], home: string, at: number }
export type Signal = { v: 1, at: number, session: string, project: string, projectId: string, stack: string[], kind: SignalKind, data: Record<string, unknown> }
export type PromptInput = { text: string, command: string, args: string, isAfterAbort: boolean }
export type QuestionInput = { questions: unknown, answers: unknown, response: unknown, afkTimeoutMs: unknown, predicted: Readonly<Record<string, string>> }
export type PlanInput = { plan: unknown, isRefused: boolean, feedback: string, isEdited: boolean }
export class SignalExtractor {
  static language(text: string): 'fr' | 'en' | 'other'
  static isCorrection(text: string): boolean
  static prompt(context: SignalContext, input: PromptInput): Signal
  static questions(context: SignalContext, input: QuestionInput): Signal[]
  static plan(context: SignalContext, input: PlanInput): Signal
  static abort(context: SignalContext, turnId: string): Signal
  static agent(context: SignalContext, type: string, model: string): Signal
  static use(context: SignalContext, caseIds: readonly number[]): Signal
  static normalizeRemote(url: string): string
  static projectId(remoteOrRoot: string): string
}

// journal.ts
export class Journal {
  static readonly MAX_BUFFER: number
  static readonly FLUSH_AT: number
  static readonly ROTATE_BYTES: number
  static push(buffer: readonly Signal[], signal: Signal): { buffer: Signal[], dropped: number }
  static lines(signals: readonly Signal[]): string
  static append(existing: string, signals: readonly Signal[]): string
  static shouldRotate(existingBytes: number, addition: string): boolean
  static parse(text: string): Signal[]
}

// store.ts
export type FsEntryLike = { name: string, kind: 'file' | 'dir' | 'other', size: number, mtimeMs: number }
export type FsPort = {
  read: (path: string) => Promise<string>
  write: (path: string, text: string) => Promise<void>
  exists: (path: string) => Promise<boolean>
  list: (path: string) => Promise<FsEntryLike[]>
  stat: (path: string) => Promise<{ kind: 'file' | 'dir' | 'other', isLink: boolean, realPath: string } | undefined>
}
export type RunEntry = { at: number, ok: boolean, tokens: number, cases: number, traits: number, note: string }
export type StoreState = { version: 1, nextCaseId: number, journal: Record<string, number>, runs: RunEntry[], day: string, tokensToday: number, runsToday: number, backoffUntil: number, lastError: string }
export type ReadResult<T> = { value: T, isNewer: boolean, isCorrupt: boolean }
export type Sizes = { indexBytes: number, casesBytes: number, journalBytes: number, emptyFiles: number }
export class SignatureStore {
  static text(fs: FsPort, path: string): Promise<string>
  static readSettings(fs: FsPort, files: SignatureFiles): Promise<ReadResult<Settings> & { dropped: string[] }>
  static writeSettings(fs: FsPort, files: SignatureFiles, settings: Settings): Promise<boolean>
  static emptyState(): StoreState
  static parseState(text: string): StoreState
  static readState(fs: FsPort, files: SignatureFiles): Promise<ReadResult<StoreState>>
  static writeState(fs: FsPort, files: SignatureFiles, state: StoreState): Promise<boolean>
  static flushJournal(fs: FsPort, root: string, session: string, at: number, signals: readonly Signal[], part: number): Promise<{ part: number, written: number }>
  static readIndex(fs: FsPort, files: SignatureFiles): Promise<ReadResult<TagIndexData | undefined>>
  static sizes(fs: FsPort, files: SignatureFiles): Promise<Sizes>
  static resolveRoot(fs: FsPort, root: string): Promise<string>
  static erase(fs: FsPort, files: SignatureFiles, realRoot: string): Promise<{ emptied: number, isComplete: boolean }>
}

// signature.ts (facade; static state like Runtime in register.tsx)
export type GitPort = (argv: readonly string[], cwd: string) => Promise<{ exitCode: number, stdout: string }>
export type SignaturePorts = { fs: FsPort, git: GitPort, now: () => number, env: (name: string) => string, toast: (text: string) => void, changed: (state: SignatureViewState) => void }
export type SignatureDraft = { sessions: boolean, history: boolean, pastSessions: boolean, background: boolean, apply: boolean }
export type SignatureViewState = { consent: Consent, draft: SignatureDraft, isExcluded: boolean, exclusionReason: string, root: string, signals: number, buffered: number, dropped: string[], storage: Sizes, confirmErase: boolean, lastError: string }
export type StartInput = { cwd: string, session: string, isInteractive: boolean }
export type PromptEvent = { text: string, command: string, args: string, isUserOrigin: boolean, isMeta: boolean, isNotification: boolean }
export class Signature {
  static start(ports: SignaturePorts, input: StartInput): Promise<void>
  static isCapturing(): boolean
  static onPrompt(event: PromptEvent): void
  static onQuestion(input: Omit<QuestionInput, 'predicted'>): void
  static onPlan(input: PlanInput): void
  static onTurn(reason: string, agentId: string, turnId: string): void
  static onAgent(type: string, model: string): void
  static flush(): Promise<void>
  static end(): Promise<void>
  static renew(session: string): Promise<void>
  static view(): SignatureViewState
  static toggle(key: keyof SignatureDraft): void
  static enable(): Promise<string>
  static notNow(): Promise<string>
  static never(): Promise<string>
  static pause(): Promise<string>
  static resume(): Promise<string>
  static decline(): Promise<string>
  static exclude(folder: string): Promise<string>
  static include(folder: string): Promise<string>
  static erase(): Promise<string>
  static command(args: string): Promise<string>
  static shouldIntroduce(now: number): boolean
}

// view.tsx
export type SignatureActions = { toggle: (key: keyof SignatureDraft) => void, enable: () => void, notNow: () => void, never: () => void, pause: () => void, resume: () => void, erase: () => void }
export class SignatureView {
  static render(ui: Ui, width: number, state: SignatureViewState, actions: SignatureActions): RenderElement[]
}
```

### Behaviour

- `start`: resolve the root (`SignaturePaths.root` from `CLAUDE_CONFIG_DIR`, `HOME`, `USERPROFILE`); empty root, unreadable or newer settings: Signature stays off for the session with the reason in `lastError`. Read settings; when consent is `enabled` and capture is on: git root (`git rev-parse --show-toplevel`), remote (`git config --get remote.origin.url`), `projectId`, stack (extensions of `git ls-files`, capped at 20,000 lines, top three stack tags through `Vocabulary.fromPaths`); exclusion (`isExcluded`, `.podium-private` from the working directory up to the git root, non-interactive session). Each step fails open.
- Capture rules of `capture.md`; signals buffered with `Journal.push`; flush when the buffer reaches `FLUSH_AT` at a turn end, on `end`, and by a timer every 60 seconds from `register.tsx`; flush never awaited by a gating hook.
- Opt-in: `shouldIntroduce` is true once per day while consent is `undecided` and the last `notNow` is older than 7 days (`signature.introAt` and `signature.notNowAt` kept in `$.store` by register.tsx). When the panel opens and it is true, the panel opens on the Signature tab once; when the panel is not open, one toast "Podium can learn how you work. Open /podium-stage signature to choose."
- Commands `/podium-stage signature [on|off|pause|resume|exclude <folder>|include <folder>|erase]`; `erase` needs the same command twice within 30 seconds.
- Writes are confined by real paths, not only by spelling: `start` resolves the root's real path (`SignatureStore.resolveRoot`), and every write checks that the parent's real path is inside it and that the target is missing or a regular file that is not a link, because `$.fs.write` follows links.
- `/clear` keeps the process under a new session id without a `session.start`: `session.end` with reason `clear` calls `Signature.renew` with the new id.
- Signature subcommands that change state run only when the person typed them (command origin `composer`, `bridge` or `person`); bare `signature` opens the tab from anywhere.
- `register.tsx`: tab `{ id: 'signature', label: 'Signature', short: 'Sign.', hotkey: '6' }`, aliases `signature`, `profile`; `$.state` key `signature` of type `SignatureViewState` declared in `plugin/types/index.d.ts`; hooks call the facade inside `try/catch` and always continue with `next(e)`; `session.end` flushes.
- Phase 2 records only. The opt-in screen is already the final one of `panel.md` (every switch is stored for the later phases), because the stacked branches are released together once phases 2 to 4 are merged.

Delivers: `SignatureStore` that checks `FormatVersion.isNewer(text, 1)` before parsing or writing any file and refuses to touch a newer file (Signature turns itself off for the session and says why), consent flow, tab with opt-in and an early dashboard (counts only), session capture to the journal, exclusions, commands `signature`, `on`, `off`, `pause`, `resume`, `exclude`, `include`, `erase`. Reviews: code-reviewer, security-reviewer, doc-writer.

## Phase 3: Learning

### Files and owners

| Wave | Owner | Files |
|---|---|---|
| 1 | panel-expert H | new `history.ts`, `prompts.ts` |
| 1 | panel-expert P | new `profile.ts` |
| 1 | panel-expert S | `store.ts` (cases, index, profile, vocabulary overlay, history cursors, lock, journal listing and emptying, corrupt copies) |
| 1 | panel-expert A | `signals.ts` (`turn` signal) |
| 2 | panel-expert L | new `learner.ts` |
| 3 | panel-expert D | `signature.ts`, `view.tsx`, `register.tsx`, `plugin/types/index.d.ts` |
| 4 | test-experts | `signature-history.test.ts`, `signature-prompts.test.ts`, `signature-profile.test.ts`, `signature-learner.test.ts`, store/signals/facade/view/register additions, `ScriptedModel` and `ScriptedGit` fixtures |
| 4 | doc-writer | `plugin/README.md`, `PRIVACY.md`, `CHANGELOG.md` |

### Contracts

```ts
// history.ts
export type CommitFile = { path: string, added: number, deleted: number }
export type Commit = { sha: string, at: string, subject: string, body: string, files: CommitFile[] }
export type HistorySource = 'auto' | 'manual'
export type HistoryCursor = { version: 1, root: string, name: string, identities: string[], head: string, done: string[], scanned: number, selected: number, isComplete: boolean, source: HistorySource }
export class HistoryScanner {
  static readonly PAGE: number
  static readonly PER_RUN: number
  static readonly BACKLOG: number
  static isSha(text: string): boolean
  static isIdentity(text: string): boolean
  static repoName(root: string): string
  static logArgs(identities: readonly string[], skip: number, count: number): string[]
  static parseLog(stdout: string): Commit[]
  static isNoise(path: string): boolean
  static priority(commit: Commit, isEarly: boolean): number
  static select(commits: readonly Commit[], cursor: HistoryCursor, earliest: ReadonlySet<string>): Commit[]
  static showArgs(sha: string, paths: readonly string[]): string[]
  static excerpt(repo: string, commit: Commit, diff: string, home: string): { id: string, text: string }
  static emptyCursor(root: string, name: string, source: HistorySource): HistoryCursor
  static parseCursor(text: string): HistoryCursor | undefined
  static serializeCursor(cursor: HistoryCursor): string
  static remember(cursor: HistoryCursor, shas: readonly string[], head: string): HistoryCursor
}

// prompts.ts
export type Batch = { text: string, evidence: string[] }
export type Episode = { session: string, project: string, stack: string[], at: number, lines: string[], evidence: string[] }
export class LearningPrompts {
  static readonly CONTRACT: number
  static readonly BATCH_CHARS: number
  static extraction(vocabulary: VocabularyData): string
  static synthesis(): string
  static episodes(signals: readonly Signal[]): Episode[]
  static render(episode: Episode): string
  static batches(items: readonly { text: string, evidence: readonly string[] }[]): Batch[]
  static synthesisInput(profile: ProfileData, cases: readonly Case[]): string
  static extractor(today: string): string
}

// profile.ts
export type Facet5 = 'what' | 'when' | 'depth' | 'tradeoff' | 'blind-spot'
export type TraitStatus = 'observed' | 'confirmed' | 'rejected' | 'stale'
export type Trait = { id: string, lens: string, facet: Facet5, statement: string, scope: Scope, stack: string, confidence: number, cases: number[], status: TraitStatus, defaultCovered: boolean, isBlindSpot: boolean, updatedAt: string, isNew: boolean }
export type ProfileStats = { predictions: number, hits: number, missed: number }
export type ProfileData = { version: 1, updatedAt: string, synthesizedAt: number, changedSince: number, traits: Trait[], stats: ProfileStats }
export type LensSummary = { lens: string, strength: number, summary: string, blindSpot: string }
export class Profile {
  static readonly MAX_TRAITS: number
  static empty(): ProfileData
  static parse(text: string): ProfileData
  static serialize(profile: ProfileData): string
  static isId(text: string): boolean
  static merge(profile: ProfileData, output: string, cases: readonly Case[], today: string): { profile: ProfileData, added: number, dropped: number }
  static recompute(profile: ProfileData, cases: readonly Case[], today: string): ProfileData
  static confirm(profile: ProfileData, id: string, today: string): ProfileData
  static reject(profile: ProfileData, id: string, today: string): ProfileData
  static isDue(profile: ProfileData, now: number, isForced: boolean): boolean
  static review(profile: ProfileData): Trait[]
  static lenses(profile: ProfileData): LensSummary[]
}

// store.ts additions
export type Lock = { owner: string, expiresAt: number }
export type CaseSet = { cases: Case[], archived: Case[], bad: number }
export type JournalFile = { path: string, key: string, bytes: number }
export class SignatureStore {
  static takeLock(fs: FsPort, files: SignatureFiles, owner: string, now: number, realRoot: string, wait: (ms: number) => Promise<void>): Promise<boolean>
  static releaseLock(fs: FsPort, files: SignatureFiles, owner: string, realRoot: string): Promise<void>
  static readCases(fs: FsPort, files: SignatureFiles): Promise<CaseSet>
  static writeCases(fs: FsPort, files: SignatureFiles, cases: readonly Case[], archived: readonly Case[], realRoot: string): Promise<boolean>
  static writeIndex(fs: FsPort, files: SignatureFiles, index: TagIndexData, realRoot: string): Promise<boolean>
  static readProfile(fs: FsPort, files: SignatureFiles): Promise<ReadResult<ProfileData>>
  static writeProfile(fs: FsPort, files: SignatureFiles, profile: ProfileData, realRoot: string): Promise<boolean>
  static readOverlay(fs: FsPort, files: SignatureFiles): Promise<ReadResult<VocabularyOverlay>>
  static writeOverlay(fs: FsPort, files: SignatureFiles, overlay: VocabularyOverlay, realRoot: string): Promise<boolean>
  static readCursor(fs: FsPort, files: SignatureFiles, repoId: string): Promise<HistoryCursor | undefined>
  static writeCursor(fs: FsPort, files: SignatureFiles, repoId: string, cursor: HistoryCursor, realRoot: string): Promise<boolean>
  static journalFiles(fs: FsPort, files: SignatureFiles): Promise<JournalFile[]>
  static emptyFile(fs: FsPort, files: SignatureFiles, path: string, realRoot: string): Promise<boolean>
  static quarantine(fs: FsPort, files: SignatureFiles, path: string, text: string, now: number, realRoot: string): Promise<boolean>
}

// signals.ts addition
// SignalKind gains 'turn'; data { text } (600 characters, redacted)
static turn(context: SignalContext, text: string): Signal

// learner.ts
export type ModelRequest = { model: string, system: { text: string, cache: boolean }[], prompt: string, maxTokens: number, timeoutMs: number }
export type ModelAnswer = { isAnswered: boolean, text: string, reason: string, inputTokens: number, outputTokens: number }
export type ModelPort = (request: ModelRequest) => Promise<ModelAnswer>
export type LearnPorts = { fs: FsPort, git: GitPort, model: ModelPort, now: () => number, wait: (ms: number) => Promise<void> }
export type Repository = { root: string, name: string, id: string, source: HistorySource }
export type RunInput = { files: SignatureFiles, realRoot: string, settings: Settings, owner: string, home: string, project: string, projectId: string, stack: string, repositories: readonly Repository[], isForced: boolean, isRebuild: boolean }
export type Progress = { step: string, done: number, total: number }
export type RunReport = { isOk: boolean, tokens: number, added: number, reinforced: number, traits: number, newTraits: number, newTags: number, note: string }
export class Learner {
  static readonly RUN_TOKENS: number
  static estimate(text: string): number
  static isDue(state: StoreState, settings: Settings, now: number, pending: number, hasHistory: boolean, isForced: boolean): boolean
  static run(ports: LearnPorts, input: RunInput, progress: (value: Progress) => void): Promise<RunReport>
}
```

### Behaviour

- Runs follow `learning.md` (Run steps A to D, budgets, Merge, Confidence, Synthesis, Vocabulary candidates, Safety floor); redundancy pruning, rebuild of extraction and past sessions backfill stay in later phases.
- A run is started by the facade only: on idle (`learning.idleMinutes` without prompt, tool call or turn), by `/podium-stage signature learn-now`, by `/podium-stage learn <path>`, and by `rebuild`. Never awaited by a hook; progress goes to the view state; one toast when it learned something and `notify` is on.
- The batch's evidence ids are passed as `allowedEvidence`; the journal cursors and the history `done` list of a batch are written in the same step as the cases that batch produced (prerequisite 6).
- `turn` signals: the facade keeps the last main-thread turn text (redacted, 600 characters) in memory and records it only when the next prompt is a correction or follows an abort, just before that prompt.
- `/podium-stage learn <path>`: the path must resolve (real path) to a git working tree (`git -C <real path> rev-parse --show-toplevel` succeeds); URLs are refused with "Clone the repository first, then pass its folder."; the research starts immediately in the background and counts against the daily budget. Only when the person typed the command.
- `forget <trait id | #case id>`: rejects a trait or a case. Review list in the tab: new traits with Keep / Not me. Review of new tags (Keep / Remove) is deferred to phase 7 with export and import; the tab says so.
- `rebuild`: under the lock, rebuild `index.json` from the cases and run a synthesis.
- Plan feedback is kept only when the tool error text starts with the engine's rejection wording (security note of phase 2); otherwise feedback is ''.
- The dashboard hint "Signature only records for now" and the README sentence about this release are replaced.

Also in phase 3: a `turn` signal carrying the main thread's redacted turn text (600 characters) recorded only when the next prompt is a correction or follows an abort, which the refusal extraction of `learning.md` pairs with that prompt (phase 2 does not record it); the dashboard hint "Signature only records for now" and the README sentence about this release replaced together.

Phase 3 security notes carried from the phase 2 review: the keyword safety floor still keeps "Leaves the tests unrun", "Tests are optional", "Lets CI stay red" (accepted limit of a keyword check; the learner's synthesis contract must restate P4 so the model never proposes such traits); plan feedback should be kept only when the tool error matches the engine's own rejection wording, since a settings-level hook that blocks ExitPlanMode can put its own text there; the engine offers no file mode on `$.fs.write` and no hard-link count, so the time-of-check gap of the write guard is a known limit.

Delivers: background runs, current-repository research, `/podium-stage learn <path>`, `learn-now`, `rebuild`, `forget`, review list in the tab, toasts. Reviews: code-reviewer, security-reviewer (prompt injection, git argv), doc-writer.

## Phase 4: Application

### Files and owners

| Wave | Owner | Files |
|---|---|---|
| 1 | panel-expert P | `profile.ts` (section, context block, hint prediction, fidelity) |
| 1 | panel-expert R | new `recall.ts` (index and shard access for the fast path and the tool, case formatting) |
| 1 | panel-expert G | new `plugin/agents/developer-proxy.md` |
| 2 | panel-expert D | `signature.ts`, `view.tsx`, `register.tsx`, `plugin/types/index.d.ts` |
| 3 | test-experts | `signature-profile.test.ts` additions, new `signature-recall.test.ts`, facade, view, register additions |
| 3 | doc-writer | `plugin/README.md`, `PRIVACY.md`, `CHANGELOG.md` |

### Contracts

```ts
// profile.ts additions
export type SectionInput = { stack: readonly string[], projectId: string }
export type Prediction = { question: string, label: string, score: number }
export class Profile {
  static readonly SECTION_CHARS: number
  static readonly CONTEXT_CHARS: number
  static section(profile: ProfileData, input: SectionInput): string
  static contextBlock(cases: readonly Case[], blindSpots: readonly Trait[]): string
  static predict(question: string, options: readonly string[], cases: readonly { value: Case, score: number }[]): Prediction | undefined
  static record(profile: ProfileData, predicted: number, hits: number, missed: number): ProfileData
  static fidelity(profile: ProfileData): number
}

// recall.ts
export type RecallInput = { situation: string, tags: readonly string[], limit: number }
export type Recalled = { value: Case, score: number }
export class Recall {
  static readonly TOOL: string
  static readonly FAST_K: number
  static readonly FAST_MIN: number
  static readonly DEEP_MIN: number
  static description(vocabulary: VocabularyData): string
  static schema(): Record<string, unknown>
  static parseInput(raw: unknown): RecallInput | undefined
  static query(vocabulary: VocabularyData, tags: readonly string[], stack: readonly string[], projectId: string, now: number, halfLifeMonths: number): RankQuery
  static fast(index: TagIndexData, vocabulary: VocabularyData, situation: Situation, projectId: string, now: number, halfLifeMonths: number): Ranked[]
  static deep(index: TagIndexData, vocabulary: VocabularyData, input: RecallInput, stack: readonly string[], projectId: string, now: number, halfLifeMonths: number): Ranked[]
  static read(fs: FsPort, files: SignatureFiles, ids: readonly number[]): Promise<Case[]>
  static format(cases: readonly Recalled[]): string
}
```

### Behaviour

- `prompt.compose`: when consent is enabled, the session is not excluded and `apply.section` is on, add `{ id: 'podium:signature', scope: 'session', text }` after the engine's sections. The text is computed once at `session.start` from `profile.json` (and after `/clear`), never changed mid-thread; empty profile → no section. Content and selection rules: `application.md` section 1, at most `SECTION_CHARS` 2,500 characters, the precedence line first, the recall hint last only when the recall tool is registered.
- `prompt.submit`: when `apply.context` is on, tag the situation (`SituationTagger.tag` with the session stack), rank with `Recall.fast` (`FAST_K` 3, `FAST_MIN` 6.0), read the hits' shards, and attach `Profile.contextBlock` (≤ `CONTEXT_CHARS` 1,200) as one `context` entry before `next(e)`. Index loaded at start and reloaded when `index.json` mtime changed, at most once a minute. Never for meta, notification, plugin or `!` prompts or slash commands of other plugins. Bounded in time: if the shards are not read within 300 ms the prompt goes without context. Injected case ids are recorded as a `use` signal.
- `AskUserQuestion` hint (`apply.hints`): before `next(e)`, per question tag question + header + labels, `Recall.fast` with `FAST_MIN` 4.0 and k 5, `Profile.predict`; first question with a prediction gets `$.ui.notice(e.tool_use_id, 'Signature: you usually choose "<label>"')`. After `next(e)`, the predictions are compared with the answers and stored in the question signal (`predicted`); the facade adds predictions/hits to `profile.stats` at its next profile write (through the learner or a dedicated store write under the lock).
- Recall tool (`apply.proxy` or `apply.section`): registered at `session.start` with `$.tool.register({ name: 'recall', description: Recall.description(vocabulary), inputSchema: Recall.schema(), isDeferred: false })`, served by `on('tool.call', { tool: 'mcp__podium__recall' })` returning `{ result: Recall.format(...) }`; description frozen for the session. Unavailable (consent off, excluded) → the tool answers "Signature is not active in this session."
- Proxy agent: `plugin/agents/developer-proxy.md` per `application.md` section 4; `on('agent.offer')` returns `{ ...r, isOffered: false }` for `podium:developer-proxy` (match the engine's agent name form) when consent is not enabled, the session is excluded or `apply.proxy` is off.
- Fidelity: the dashboard shows "Fidelity N % of your choices predicted" when there are at least 10 predictions.
- Safety: every injected or returned text comes only from stored cases and traits (already behind `Cases.isUnsafe`); the section says the project's instructions win and that no safety measure may be lowered because of the profile.

## Phase 5: `/podium` integration

| Owner | Files |
|---|---|
| setup-expert | `plugin/skills/setup/SKILL.md`, `references/catalog.md`, templates `feature.md`, `fix.md`, `review.md`, `stack.md`, `templates/README.md` |
| doc-writer | README, CHANGELOG |

## Phase 6: Past sessions backfill

Transcript adapter, opt-in switch, tests on recorded transcript fixtures (scrubbed).

## Phase 7: Portability and re-extraction

`export --anonymous`, `import`, `reextract`, redundancy pruning (P7).

## Phase 8: Delegation (only if fidelity justifies it)

Per-lens delegation levels `ask`, `suggest`, `decide`; never for security, destructive git or spending; requires 90 % fidelity over 50 predictions in that lens.

## Commits

Per `git-workflow.md`: one commit per layer in dependency order. Phase 1: one commit for `plugin/hooks/signature/` with its `plugin/tests/` (they must pass together), preceded by the docs commit of this plan.

## Risks to watch

| Risk | Signal | Response |
|---|---|---|
| Extraction quality too low | many `observed` traits rejected in review | tighten the contract; raise the confirmation threshold |
| Context noise | precision below 50 % | raise `minScore`; restrict to confirmed cases |
| Token cost complaints | `tokensToday` often at cap | lower defaults; switch default model to `haiku` for session batches |
| Engine API change | validate fails on a new build | the facade isolates `$`; adapt `register.tsx` and ports only |
| Transcript format change | backfill reads few lines | adapter fails open; feature stays optional |
