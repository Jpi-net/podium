---
name: investigate
description: Investigates a maestro bug (panel module, generated hooks, setup templates) and returns an evidence-based explanation (root cause, data path, origin of the regression, reproduction, fix options) without changing any code. Use when the user types /investigate, or describes a bug or pastes an error and asks to understand it rather than fix it.
argument-hint: "<#issue | bug description> [stack trace]"
---

# /investigate: bug explanation, no fix

Read-only on the repository: no edit, no branch switch, no commit. Throwaway scripts, scene previews and hook replays only in the scratchpad. Answer in the user's language.

## Phase 1: Context
1. Issue if a number is given: `gh issue view <number>`.
2. Launch `debugger` with the symptom, the issue content, the pasted traces, the branch, and the mission: root cause with evidence, data path end to end (engine event → `hooks/register.tsx` → module → `$.state` → render, or hook stdin → `.mjs` → JSON decision), origin commit, impacted releases (`git tag`, CHANGELOG), cheap local reproduction (`claude plugin test .` filter or a hook replay), the failing test in `tests/` that would prove it, 1-3 fix options, siblings with the same defect, confidence.

## Phase 2: Gaps
Low confidence because only the user knows a fact (OS, Claude Code version, the affected project's manifest): ask with AskUserQuestion (one call, recommended option first), then relaunch `debugger` with its previous report and the answers.

## Phase 3: Report
```
## Symptom
## Root cause          (file:line, why, origin commit)
## Data path
## Evidence
## Impacted versions
## Reproduction         (test or hook replay)
## Fix options          (recommended first)
## Same defect elsewhere
## Confidence
```
End with one line: `/fix <#issue | description>` reuses this diagnosis.
