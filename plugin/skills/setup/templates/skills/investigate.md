---
name: {{CMD_INVESTIGATE}}
description: Investigates a bug and returns an evidence-based explanation (root cause, data path, origin of the regression, reproduction, fix options) without changing any code. Use when the user types /{{CMD_INVESTIGATE}}, or describes a bug or pastes an error and asks to understand it rather than fix it.
argument-hint: "<work item id | bug description> [stack trace]"
---

# /{{CMD_INVESTIGATE}}: bug explanation, no fix

Read-only on the repository: no edit, no branch switch, no commit. Throwaway scripts only in the scratchpad. Answer in {{CONVERSATION_LANGUAGE}}.

## Phase 1: Context
1. Work item if an id is given: {{WORK_ITEM_READ}}.
2. Launch `debugger` with the symptom, the work item content, the pasted traces, the branch, and the mission: root cause with evidence, data path end to end, origin commit, impacted branches or versions, cheap local reproduction, the failing test (or, without a test runner, the replayable scenario) that would prove it, 1-3 fix options, siblings with the same defect, confidence.

## Phase 2: Gaps
Low confidence because only the user knows a fact: ask with AskUserQuestion (one call, recommended option first), then relaunch `debugger` with its previous report and the answers.

## Phase 3: Report
```
## Symptom
## Root cause          (file:line, why, origin commit)
## Data path
## Evidence
## Impacted versions
## Reproduction         (test or scenario)
## Fix options          (recommended first)
## Same defect elsewhere
## Confidence
```
End with one line: `/{{CMD_FIX}} <id>` reuses this diagnosis.
