# Roadmap

Each phase is releasable on its own, ships with its tests, passes `claude plugin validate plugin` and `claude plugin test plugin`, and keeps the repository rules (static classes, zero comments, fail open, English on disk). Phases 1 to 5 make the feature usable; 6 to 8 deepen it.

## Phase 1: Core (pure classes, no engine wiring)

No user-visible change, so no README or CHANGELOG entry yet. Everything is pure and tested without the engine.

### Files and owners

| Wave | Owner | Files |
|---|---|---|
| 1 | panel-expert A | `plugin/hooks/signature/paths.ts`, `settings.ts`, `redactor.ts`, `vocabulary.ts` |
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
  status: CaseStatus, isConfirmedByUser: boolean, firstSeen: string, lastSeen: string
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
export type MergeContext = { nextId: number, today: string, project: string, projectId: string, stack: string, extractor: string, vocabularyRevision: number, isProjectBatch: boolean }
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

## Phase 2: Capture, storage and the opt-in screen

| Owner | Files |
|---|---|
| panel-expert | `plugin/hooks/signature/signals.ts`, `journal.ts`, `store.ts`, `signature.ts`, `view.tsx`; hooks and tab in `plugin/hooks/register.tsx`; `plugin/types/index.d.ts` (`signature` state key) |
| test-expert | `plugin/tests/signature-signals.test.ts`, `signature-journal.test.ts`, `signature-store.test.ts`, `signature-view.test.tsx`, `register.test.tsx` additions, fixtures `MemoryFs` |
| doc-writer | `PRIVACY.md`, `plugin/README.md`, `CHANGELOG.md`, `CONTRIBUTING.md` (layout table) |
| devops | none |
| main thread | `.claude/rules/panel.md`, `.claude/CLAUDE.md` review triggers (privacy-security.md, Repository rule changes) |

Delivers: consent flow, tab with opt-in and an early dashboard (counts only), session capture to the journal, exclusions, commands `signature`, `on`, `off`, `pause`, `resume`, `exclude`, `include`, `erase`. Reviews: code-reviewer, security-reviewer, doc-writer.

## Phase 3: Learning

| Owner | Files |
|---|---|
| panel-expert | `history.ts`, `prompts.ts`, `learner.ts`, `profile.ts` (merge and synthesis parts); idle scheduling in `signature.ts` |
| test-expert | tests with `ScriptedModel` and `ScriptedGit` fixtures: full run on a fixture repository, budget stop, lock contention, backoff, corrupt files, unsafe model output |

Delivers: background runs, current-repository research, `/podium-stage learn <path>`, `learn-now`, `rebuild`, `forget`, review list in the tab, toasts. Reviews: code-reviewer, security-reviewer (prompt injection, git argv), doc-writer.

## Phase 4: Application

| Owner | Files |
|---|---|
| panel-expert | `profile.ts` (section, context, hint), `prompt.compose`, `prompt.submit` context, AskUserQuestion hint, `recall` tool, `agent.offer` in `register.tsx` / `signature.ts` |
| panel-expert (second, disjoint) | `plugin/agents/developer-proxy.md` |
| test-expert | section stability across a session, context threshold, hint prediction and fidelity counting, recall tool output, agent offer gating |

Delivers: everything in `application.md` sections 1 to 4. Measures fidelity from day one.

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
