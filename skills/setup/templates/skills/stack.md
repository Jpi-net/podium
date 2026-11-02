---
name: {{CMD_STACK}}
description: Chooses the technical stack layer by layer - 2 to 3 argued options per decision, a recommendation, the user's decision recorded as an ADR. Use when the user types /{{CMD_STACK}}, after the product brief exists, or when a structuring technical decision must be taken.
argument-hint: "[layer or decision]"
---

# /{{CMD_STACK}}: technical choices

You are the ORCHESTRATOR. Talk to the user in {{CONVERSATION_LANGUAGE}}; write ADRs in {{ARTIFACT_LANGUAGE}}.

Arguments: `$ARGUMENTS`: empty = the whole stack; otherwise one decision (e.g. "database", "hosting").

## Phase 1: Inputs
Read `docs/product/brief.md` (if missing, suggest `/{{CMD_KICKOFF}}` first and ask whether to continue anyway) and existing `docs/adr/*.md`.

## Phase 2: Options
Launch `architect` (and `devops` in the same message for hosting, CI and environments) to produce, for each open decision (languages and frameworks per layer, data storage, authentication, hosting and deployment target, CI system, observability, testing tools):
- 2-3 options with trade-offs against the brief: fit, team skills, cost, operability, ecosystem maturity, lock-in, performance, security;
- a recommendation and why;
- the consequences on the other decisions.

## Phase 3: Decisions (user validation required)
For each decision, ask with AskUserQuestion (recommended option first, at most 4 decisions per call). Consistency check: decisions must fit together; flag conflicts.

## Phase 4: Record
Write one ADR per decision in `docs/adr/NNNN-<kebab-title>.md` (context, options considered, decision, consequences), numbered after the existing ones.

## Phase 5: Next step
Tell the user the next command: `/{{CMD_FOUNDATIONS}}` to lay the repository, tests, CI/CD, release and environments on these decisions.

## Rules
- Prefer boring, well-supported technology unless the brief needs otherwise.
- Never install, scaffold or create files other than ADRs in this command.
