---
name: fix
description: Fixes a podium bug end to end (panel, generated hooks, setup templates) - root cause with evidence, failing test first with claude plugin test, minimal fix, verification, reviews, commit, push and pull request. Use when the user types /fix, or asks to fix a bug.
argument-hint: "<#issue | bug description> [stack trace]"
---

# /fix: orchestrated bug fix

You are the ORCHESTRATOR. Talk to the user in the user's language, delegate, integrate.

Arguments: `$ARGUMENTS`. A leading `#<number>` is a GitHub issue; the rest (and anything pasted: engine debug output from `claude --plugin-dir plugin --debug`, hook stdin, panel screenshot) is the bug description, which has priority.

## Phase 1: Preparation (1 and 2 in parallel, then 3)
1. **Branch**: `git fetch origin`; `fix/<slug>` from `origin/main` (same reuse rules as `/feat`).
2. **Issue**: read the GitHub issue the user links (`gh issue view <number>`), otherwise ask the user for the description. Look for repro steps, OS, Claude Code version, error messages, the manifest (`.claude/podium.json`) of the affected project.
3. **Diagnosis**: reuse an `/investigate` report from the conversation if its confidence is high; otherwise launch `debugger` (root cause with evidence, failing test, minimal fix, regression risk).

## Phase 2: Diagnosis validation
1. Present: root cause, evidence, reproduction test, proposed fix (files, layers), versioning level (patch or minor in CHANGELOG `[Unreleased]`).
2. Low confidence: relaunch `debugger` once with its previous report before asking the user.
3. Several layers or a contract change (`$.state` keys, `Manifest` type, a template placeholder): also run `architect` for a partitioned plan.
4. Validate / Adjust / Cancel with AskUserQuestion. Nothing is written before validation.
5. Write the flow file `.claude/flows/<branch with / replaced by __>.md` and tick it at each phase.

## Phase 3: Failing test first
Launch `test-expert` to write the reproduction test in `plugin/tests/` and prove with `claude plugin test plugin` that it fails for the expected reason. If it passes, the diagnosis is wrong: relaunch `debugger` with the passing test; a second miss stops the flow and both hypotheses go to the user. A bug in `plugin/skills/setup/templates/hooks/*.mjs` is reproduced by running the hook with the failing stdin input in the scratchpad.

## Phase 4: Fix (partitioned)
Launch the owning experts (`panel-expert`, `setup-expert`, `devops`) in parallel on disjoint files. Minimal fix, no opportunistic refactoring.

## Phase 5 → 6: Verification, reviews, delivery
Invoke `deliver` with: type `fix`, the issue number, the target `main`, the diagnosis (feeds the PR sections What / Why), the reproduction (test title or hook input).

## Rules
- Never fix without a reproduced failure, except a pure manifest or CI configuration fix where you explain why no test applies.
- No AI attribution in any git or PR artifact (see the git-workflow rule).
- Three consecutive failures on the same step: stop and report.
