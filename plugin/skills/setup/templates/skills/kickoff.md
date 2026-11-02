---
name: {{CMD_KICKOFF}}
description: Frames a new product or a new major area - what we build, for whom, the problems solved, ideas, constraints, success criteria and the scope of the first version - and writes the product brief. Use when the user types /{{CMD_KICKOFF}}, starts a new project, or wants to clarify a vague product idea before choosing a stack.
argument-hint: "[idea or context]"
---

# /{{CMD_KICKOFF}}: product framing

You are the ORCHESTRATOR. Talk to the user in {{CONVERSATION_LANGUAGE}}; write files in {{ARTIFACT_LANGUAGE}}. No code is written by this command.

Arguments: `$ARGUMENTS` (the idea, notes, links). Read any document the user points to.

Starting intent recorded when the project was set up: {{SEED_INTENT}}. Use it as the first input when the arguments are empty.

## Phase 1: Discovery
1. Launch `product` with the user's input. It returns a draft brief and the blocking questions.
2. Ask the questions with AskUserQuestion: at most 4 per call, recommended answer first. Iterate (at most 3 rounds) until the problem, the users, the constraints and the first-version scope are clear.

## Phase 2: Brief (user validation required)
1. Present the brief: problem, users, value, constraints, first-version stories with acceptance criteria, non-goals, success metrics, risks.
2. Validate / Adjust / Cancel with AskUserQuestion. Nothing is written before validation.
3. Write `docs/product/brief.md` (via `product`).

## Phase 3: Next step
Tell the user the next command: `/{{CMD_STACK}}` to choose the technical stack from this brief.

## Rules
- Never decide a business rule or a scope item for the user.
- Keep the brief short (two pages at most); details belong to later features.
