---
name: feat
description: Implements a new podium feature end to end - branch, context, validated plan, parallel experts on disjoint files (panel, setup skill, tests, docs, manifests), verification, reviews, commits per layer, push and pull request. Use when the user types /feat, or asks to implement a feature, a change or a GitHub issue.
argument-hint: "<#issue | description> [context]"
---

# /feat: orchestrated feature delivery

You are the ORCHESTRATOR (main thread). You plan, delegate, integrate and talk to the user in the user's language. You do not write production code yourself when an expert owns the file (`panel-expert`, `setup-expert`, `test-expert`, `doc-writer`, `devops`); trivial glue edits are fine.

Arguments: `$ARGUMENTS`. A leading `#<number>` is a GitHub issue; the rest is the user's context, which has priority.

Keep a checklist of the phases and report progress in one short line per phase.

## Phase 1: Preparation (in parallel)
1. **Branch**: `git fetch origin`; on `main` or an unrelated clean branch, create `feat/<slug>` from `origin/main`; on a branch that already carries the slug, reuse it after `git pull --no-rebase`; unrelated uncommitted changes: stop and ask. Direct commits on `main` are the current practice for small changes; if the user asks for that, skip the branch, the push of a branch and the pull request.
2. **Issue**: read the GitHub issue the user links (`gh issue view <number>`), otherwise ask the user for the description. Extract title, description, acceptance criteria, screenshots.

## Phase 2: Clarification
Ambiguous scope, panel behaviour (what the office shows, when), manifest key or template output: ask with AskUserQuestion, all open questions in one call, recommended option first. Never guess a rule of the generated setup.

## Phase 3: Plan (user validation required)
1. Launch `architect` with the issue, the user's context and the branch.
2. Present the plan concisely: summary, layers and files (`plugin/hooks/`, `plugin/types/index.d.ts`, `plugin/skills/setup/`, `plugin/tests/`, docs, `.claude-plugin/`), contracts (new `$.state` keys, `Manifest` type in `plugin/hooks/project.ts` and `plugin/skills/setup/references/manifest.md`, new placeholders in `plugin/skills/setup/templates/README.md`), partition, tests, commits, risks.
3. Validate / Adjust / Cancel with AskUserQuestion; iterate. Nothing is written before validation.
4. Write the flow file `.claude/flows/<branch with / replaced by __>.md` (plan, partition, phase checklist) and tick it at each phase.

## Phase 4: Implementation (parallel, partitioned)
- Launch all experts of a wave in ONE message. Each prompt: summary, shared contracts, `## Partition` (its exact files), tasks, the rule files to read (`panel-expert` → `.claude/rules/panel.md`, `setup-expert` → `.claude/rules/setup-skill.md`, `test-expert` → `.claude/rules/tests.md`, `doc-writer` and `devops` → `.claude/rules/docs-release.md`; all → `.claude/rules/git-workflow.md` and `.claude/review-learnings.md`), and the reminder to touch only its files and report needs outside them.
- `plugin/tests/**` (`test-expert`) is in the wave after the `plugin/hooks/` code it tests.
- Cross-partition needs go to the owner in the next round. Never two agents on the same file.
- Never assign `plugin/.claude-plugin/types/`: the engine writes it.

## Phase 5 → 6: Verification, reviews, delivery
Invoke `deliver` with: type `feature`, the issue number, the target `main`, the validated plan.

## Rules
- Use the models defined in each agent file; never a generic agent when a dedicated one exists.
- Ask subagents for their output contract, never for file dumps.
- No AI attribution in any git or PR artifact (see the git-workflow rule).
- Three consecutive failures on the same step: stop and report the exact error and your hypothesis.
