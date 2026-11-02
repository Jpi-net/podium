---
name: {{CMD_FIX}}
description: Fixes a bug end to end - root cause with evidence, reproduction first, minimal fix, verification, reviews, commit, push and pull request. Use when the user types /{{CMD_FIX}}, or asks to fix a bug.
argument-hint: "<work item id | bug description> [stack trace]"
---

# /{{CMD_FIX}}: orchestrated bug fix

You are the ORCHESTRATOR. Talk to the user in {{CONVERSATION_LANGUAGE}}, delegate, integrate.

Arguments: `$ARGUMENTS`. A leading id is a work item / issue; the rest (and anything pasted) is the bug description, which has priority.

## Phase 1: Preparation (1 and 2 in parallel, then 3)
1. **Branch**: `git fetch origin`; `{{FIX_BRANCH}}` from `origin/{{BASE_BRANCH}}` (same reuse rules as `/{{CMD_FEATURE}}`).
2. **Work item**: {{WORK_ITEM_READ}}. Look for repro steps, environment, error messages, stack traces.
3. **Diagnosis**: reuse an `/{{CMD_INVESTIGATE}}` report from the conversation if its confidence is high; otherwise launch `debugger` (root cause with evidence, failing test, minimal fix, regression risk).

## Phase 2: Diagnosis validation
1. Present: root cause, evidence, reproduction test, proposed fix (files, layers), versioning level.
2. Low confidence: relaunch `debugger` once with its previous report before asking the user.
3. Several layers or a contract change: also run `architect` for a partitioned plan.
4. Validate / Adjust / Cancel with AskUserQuestion. Nothing is written before validation.
5. Write the flow file `.claude/flows/<branch with / replaced by __>.md` and tick it at each phase.

{{#IF_TESTS}}
## Phase 3: Failing test first
Launch `test-expert` to write the reproduction test and prove it fails for the expected reason. If it passes, the diagnosis is wrong: relaunch `debugger` with the passing test; a second miss stops the flow and both hypotheses go to the user.
{{/IF_TESTS}}
{{#IF_NO_TESTS}}
## Phase 3: Reproduction first
The project has no test runner. Replay the reproduction scenario from the diagnosis (steps, input, expected vs actual) and confirm it fails for the expected reason; it becomes the acceptance check of Phase 5. If it does not reproduce, the diagnosis is wrong: relaunch `debugger` once, then stop and report both hypotheses.
{{/IF_NO_TESTS}}

## Phase 4: Fix (partitioned)
Launch the owning experts in parallel on disjoint files. Minimal fix, no opportunistic refactoring.

## Phase 5 → 6: Verification, reviews, delivery
Invoke `{{CMD_DELIVER}}` with: type `fix`, the id, the target `{{BASE_BRANCH}}`, the diagnosis (feeds the PR sections Problem / Cause / Fix), the reproduction (test filter or scenario).

## Rules
- Never fix without a reproduced failure, except a pure configuration fix where you explain why no test applies.
{{#IF_AI_RULE}}
- No AI attribution in any git or PR artifact (see the git-workflow rule).
{{/IF_AI_RULE}}
- Three consecutive failures on the same step: stop and report.
