# Principles and decisions

Each decision: context, decision, alternatives rejected, consequences. They are numbered so code reviews can cite them (`P3`).

## P1. Cases are the asset, everything else is a regenerable cache

Context: models, context windows and Claude Code itself will change a lot within a few years. Whatever retrieval or injection we build today will be outdated.

Decision: three layers.

1. Sources (commits, transcripts, journal): never modified by Signature; referenced by evidence ids (commit sha, session id + timestamp), not copied.
2. Cases: written in plain natural language (`situation`, `choice`, `why`), JSONL, documented format. Readable by a human and by any future model.
3. Derived: tags, index, profile, the injected section. Deleting all of it and running `/podium-stage signature rebuild` regenerates it from layer 2.

Each case records the extractor version (`extractor`) so a better future model can re-extract from the sources and compare.

Rejected: storing only tags or embeddings (opaque, tied to today's tooling).

## P2. Tags first, no embedding model

Context: semantic search could use a local embedding model (EmbeddingGemma through Ollama). Shipping weights in the plugin breaks the no-dependency architecture, carries the Gemma Terms of Use redistribution duties and is the riskiest item for the plugin directory review.

Decision: a controlled vocabulary of tags, a deterministic score in code, and Claude reranking candidates on the deep path. A `Retriever` boundary (`CaseRanker`) keeps the door open for an opt-in local embedding backend later, chosen only if the measured missed-recall rate demands it (see `learning.md`, Metrics).

Rejected: bundled model (size, licence, review), external embedding API (data leaves the machine).

## P3. Automatic by default after one explicit opt-in

Context: the developer wants no new skills to learn and no manual routine.

Decision: one opt-in screen in the panel; capture, current-repository history research, distillation, profile synthesis and application then run automatically. Validation of traits is optional and never blocks. The only manual learning action is learning from another repository (`/podium-stage learn <path>`), because it reads something the developer is not currently working in.

Zero new skills. One agent (`developer-proxy`), one tool (`recall`), one tab, subcommands of the existing `/podium-stage`.

Rejected: a `/podium-learn` skill family (more to remember), background `claude -p` processes (the engine offers `$.model.complete` on the session's own client).

## P4. Mirror plus complement

Decision: the profile reproduces the developer's choices and also records blind spots. Blind spots are reminded ("you rarely bound input sizes"), never reproduced. A trait never lowers a safety floor: no trait may cause Claude to skip tests, disable a guard, weaken a permission or skip a review, even if observed repeatedly.

## P5. Project instructions win

Decision: the injected section states that the project's `CLAUDE.md`, rules and manifest override the profile. The profile is never written into a project's `.claude/` (it could be committed and shared with a team or a client).

## P6. Feed native features, do not compete with them

Decision: application goes through a `ProfileSink` boundary. Today one sink: the Podium section and context. When Claude Code offers a native user memory that a plugin can feed, a second sink writes there and the first can be turned off.

## P7. Redundancy pruning

Decision: periodically, for a sample of confirmed traits, ask a model the situation without the profile. When the model already makes the developer's choice by default, mark the trait `defaultCovered`: it stays in the base and leaves the injected section. Over time the injected profile shrinks to what truly distinguishes the developer.

## P8. Local, bounded, fail open

Decision: all data under `<claude config dir>/podium/`; every file bounded (see `data-model.md`, Budgets); every hook catches its own errors and continues the user's flow; a failed learning run is retried later and reported in the tab, never in the conversation.

## P9. Facets are data

Decision: lenses and facets live in the vocabulary, not in code. Adding a `product` or `risk-appetite` lens is a vocabulary edit, because the developer's role will keep moving from code choices to product and risk choices.

## P10. Recency over history

Decision: case weight decays with age (half-life 12 months, configurable). The developer of today outweighs the developer of three years ago, without erasing the history.
