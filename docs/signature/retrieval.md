# Retrieval

## Query

A query is `{ tags: string[], stack: string[], projectId: string, now: number }`. Tags are canonical (passed through `Vocabulary.normalize`).

## Score (`CaseRanker.score`)

For a case with tag set `T`, meta `[confidence, lastSeen, scope, status, stack, projectId]`, and the query's tag set `Q` expanded with ancestors `A(Q)` (each tag's parent chain, deduplicated, excluding tags already in `Q`):

```
direct  = Σ over t in Q ∩ T          of weight(facet(t)) × idf(t)
parents = Σ over p in A(Q) ∩ T       of 0.4 × weight(facet(p)) × idf(p)
          + Σ over t in Q, p in A(T) where p = t  of 0.4 × weight(facet(t)) × idf(t)
raw     = direct + parents
score   = raw × confidence × recency × scopeFactor × statusFactor
```

| Term | Value |
|---|---|
| `idf(t)` | `ln(1 + n / df(t))`, `df` from the index (unknown tag: `df = 1`) |
| `weight` | concept 3, decision 2.5, artifact 2, lens 1.5, phase 1, stack 1 |
| `recency` | `0.5 ^ (ageMonths / halfLifeMonths)`, `ageMonths` from `lastSeen` |
| `scopeFactor` | case scope project and same `projectId`: 1.3; scope project and another project: 0.5; scope stack and a shared stack: 1.15; scope stack and no shared stack: 0.6; global: 1 |
| `statusFactor` | confirmed 1, observed 0.7, stale 0.3, rejected 0 (never returned). The ranking keeps stale cases for the learner, but nothing applied to a session uses them: `Recall.applicable` excludes stale and rejected cases, cases of other projects, and cases whose text is not quotable |

Only cases sharing at least one tag or one ancestor with the query are scored (walk the postings of `Q ∪ A(Q)`). Ties: higher confidence, then newer `lastSeen`, then lower id. `top(query, k, minScore)` returns at most `k` with `score ≥ minScore`.

A query made only of `stack` and `phase` tags returns nothing: those facets describe context, not a situation, and alone they would surface every case.

## Fast path (every prompt)

`SituationTagger.tag({ text, paths, stack })`:

1. `Vocabulary.fromText(text)`: lower-case, accents folded (`é` → `e`), each alias matched on word boundaries; multi-word aliases first; at most 12 tags.
2. Paths: tokens of the text that look like paths (`[\w./-]+\.[a-z0-9]{1,6}` or containing `/`), plus none from the session (the fast path does not track open files), through `Vocabulary.fromPaths`.
3. Stack: the session's stack tags.

Then `CaseRanker.top(query, 3, 6.0)`. Nothing above the threshold: no context block (most prompts).

Context block (`Profile.contextBlock(cases)`), at most 1,200 characters:

```
Developer precedents (Podium Signature; project instructions override these):
- When a hook reads a user-editable config value, they validate it and fall back to a default; never crash (7 times, confirmed).
- When a value has the wrong type in the manifest, they ignore it with a default and show no error (4 times).
Reminder: they rarely bound input sizes; consider a maximum length.
```

The reminder line appears when a blind-spot case or trait shares a concept tag with the query. Each injected case gets `uses += 1` in memory, persisted by the next learning run (through a small `usage` map in the journal flush, kind `use`).

## Deep path: the `recall` tool

Registered at `session.start` when enabled, `isDeferred: false`, served from memory.

```
name: recall
description: Returns the developer's past decisions (Podium Signature) that match a situation, so you can propose or decide the way they would. Pass the situation in one sentence and the tags that describe it, chosen from the vocabulary below. Read the returned cases, keep the ones that truly apply, and say which you followed.
Vocabulary: <one line per facet: tag, tag, …>
input: { situation: string (required, ≤ 400), tags: string[] (≤ 12), limit: number (1 to 20, default 10) }
output: text, one block per case: "#142 (confirmed, 7×, global) Situation: … Choice: … Why: … Tags: …"
```

The tool adds `Vocabulary.fromText(situation)` to the given tags, ranks with `minScore` 2.0, reads only the shards that hold the hits (a few small files, within the 300 ms bound; no cache) and returns at most `limit` cases. The reranking is done by the calling model (the proxy agent or the main thread): no extra model call.

The description is built once at `session.start` and never changed during the session (changing a tool description loses the prompt cache).

## Index lifetime

Loaded at `session.start` into `Signature`; reloaded when `index.json` `mtimeMs` changed, checked at most once a minute before a ranking; replaced in place at the end of a run in this session. Memory: about 100 bytes per case.

## Tests that pin the behaviour

- The worked example of the design discussion (query `{config, hook, node, typescript, untrusted-input, fail-open, strict-vs-lenient}` against a fixture of 412 cases where case 142 has the listed `df`) ranks 142 first, with the score the formula gives when computed by hand in the test.
- A rejected case never appears.
- A parent match ranks below a direct match of the same tag.
- A project-scoped case of another project ranks below the same case of this project.
- A query of only stack and phase tags returns nothing.
- `fromText` matches `valider les entrées` to `untrusted-input` and does not match `pass` inside `password`.
