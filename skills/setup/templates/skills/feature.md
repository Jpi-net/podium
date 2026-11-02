---
name: {{CMD_FEATURE}}
description: Implements a new feature end to end - branch, context, validated plan, parallel experts on disjoint files, verification, reviews, commits per layer, push and pull request. Use when the user types /{{CMD_FEATURE}}, or asks to implement a feature, a user story or a work item.
argument-hint: "<work item id | description> [context]"
---

# /{{CMD_FEATURE}}: orchestrated feature delivery

You are the ORCHESTRATOR (main thread). You plan, delegate, integrate and talk to the user in {{CONVERSATION_LANGUAGE}}. You do not write production code yourself when an expert exists for it; trivial glue edits are fine.

Arguments: `$ARGUMENTS`. A leading id is a work item / issue; the rest is the user's context, which has priority.

Keep a checklist of the phases and report progress in one short line per phase.

## Phase 1: Preparation (in parallel)
1. **Branch**: `git fetch origin`; on `{{BASE_BRANCH}}` or an unrelated clean branch, create `{{FEATURE_BRANCH}}` from `origin/{{BASE_BRANCH}}`; on a branch that already carries the id, reuse it after `git pull --no-rebase`; unrelated uncommitted changes: stop and ask.
2. **Work item**: {{WORK_ITEM_READ}}. Extract title, description, acceptance criteria, attachments.

## Phase 2: Clarification
Ambiguous scope, business rule or UI behaviour: ask with AskUserQuestion, all open questions in one call, recommended option first. Never guess a business rule.

## Phase 3: Plan (user validation required)
1. Launch `architect` with the work item, the user's context and the branch.
2. Present the plan concisely: summary, layers and files, contracts, partition, tests, commits, risks.
3. Validate / Adjust / Cancel with AskUserQuestion; iterate. Nothing is written before validation.
4. Write the flow file `.claude/flows/<branch with / replaced by __>.md` (plan, partition, phase checklist) and tick it at each phase.

## Phase 4: Implementation (parallel, partitioned)
- Launch all experts of a wave in ONE message. Each prompt: summary, shared contracts, `## Partition` (its exact files), tasks, the rule files to read, and the reminder to touch only its files and report needs outside them.
- A test file is in the wave after its subject under test.
- Cross-partition needs go to the owner in the next round. Never two agents on the same file.
{{#IF_GENESIS}}
- While the project is being created, the experts are `app-expert` (application code and its tests) and `devops` (pipelines, containers, environments).
- No remote yet (`git remote` is empty): skip `git fetch`, branch from the local `{{BASE_BRANCH}}`, and skip push and pull request in Phase 6.
{{/IF_GENESIS}}

{{#IF_FULL}}
## Phase 5 → 6: Verification, reviews, delivery
Invoke `{{CMD_DELIVER}}` with: type `feature`, the work item id, the target `{{BASE_BRANCH}}`, the validated plan.
{{/IF_FULL}}
{{#IF_GENESIS}}
## Phase 5: Verification and reviews
Run the project's build, lint and tests (see `docs/foundations.md`); launch `code-reviewer` in parallel. Fix red checks and blocking findings through the owners (3 rounds max).

## Phase 6: Delivery
Commit following `.claude/rules/git-workflow.md`. With a remote: push and open the pull request if the user wants it. Without a remote: stop after the commit and remind the user to create the remote and push. Delete the flow file.
{{/IF_GENESIS}}

## Rules
- Use the models defined in each agent file; never a generic agent when a dedicated one exists.
- Ask subagents for their output contract, never for file dumps.
{{#IF_AI_RULE}}
- No AI attribution in any git or PR artifact (see the git-workflow rule).
{{/IF_AI_RULE}}
- Three consecutive failures on the same step: stop and report the exact error and your hypothesis.
