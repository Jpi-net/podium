# {{PROJECT_NAME}}

{{PROJECT_SUMMARY}}

## Language

- Talk to the user in {{CONVERSATION_LANGUAGE}}: plans, questions, reports.
- Everything written to disk is in {{ARTIFACT_LANGUAGE}}: code identifiers, files, commit messages, PR titles and descriptions, logs and exception messages.

## Non-negotiable rules

{{NON_NEGOTIABLE_RULES}}

## Rules files

Path-scoped rules in `.claude/rules/` load automatically when matching files are touched. Subagents must Read the relevant ones explicitly before acting.

{{RULES_TABLE}}

## Workflow

{{#IF_GENESIS}}
This project is being created. Use the commands in this order:

1. `/{{CMD_KICKOFF}}`: what we build, for whom, ideas, constraints, scope of the first version.
2. `/{{CMD_STACK}}`: technical options per layer with trade-offs, a recommendation, one ADR per decision.
3. `/{{CMD_FOUNDATIONS}}`: repository structure, branching, tests, CI/CD, versioning and release, environments up to production, documentation.
4. `/{{CMD_FEATURE}}`: build features one by one.

Implementers while the project is being created: `app-expert` (application code and tests), `devops` (delivery chain); `product` writes the brief, `architect` the decisions.

Once the stack is chosen and the first code exists, run `/maestro` again: it audits the code base and generates the full setup (layer experts, layer rules, verification, delivery chain).
{{/IF_GENESIS}}
{{#IF_FULL}}
{{ROLE_COMMANDS}}

- The main thread orchestrates: plan (with the architect or the debugger when design or root cause matters) → experts in parallel on **disjoint file partitions** → verification by `{{VERIFIER}}` → reviews in parallel → commits. Without a command, the same orchestration applies to any non-trivial request; trivial requests (one-line edit, question) are answered directly.
- Model tiers: Opus agents think (architect, debugger, reviewers), Sonnet agents implement, Haiku agents run mechanical tasks.
- Implementers: {{EXPERTS}}.
- Reviews: {{REVIEWERS}}.
{{/IF_FULL}}

## Commands cheat sheet

{{COMMANDS_CHEATSHEET}}

## Never

- Print, copy or commit secrets; reference them by variable name only.
- Edit generated files by hand: regenerate them.
- Force-push, rewrite pushed history, or commit on {{PROTECTED_BRANCHES}}.
{{#IF_GENESIS}}
  Exception: the very first commit of an empty repository goes on the base branch (see `.claude/rules/git-workflow.md`, Bootstrap).
{{/IF_GENESIS}}
{{#IF_AI_RULE}}
- Add an AI attribution (AI co-author trailer, "Generated with", model name as author) to any commit, branch or PR. A hook enforces it; never work around it.
{{/IF_AI_RULE}}
- Put scratch files in the repository: use the session scratchpad.
