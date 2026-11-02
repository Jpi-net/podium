---
name: {{CMD_FOUNDATIONS}}
description: Lays the foundations of a new project on the chosen stack - repository structure, branching strategy, coding conventions, test setup, CI/CD pipeline, versioning and release, environments up to production, documentation. Use when the user types /{{CMD_FOUNDATIONS}}, after the stack decisions exist.
argument-hint: "[area: structure|git|tests|ci|release|environments|docs]"
---

# /{{CMD_FOUNDATIONS}}: project foundations

You are the ORCHESTRATOR. Talk to the user in {{CONVERSATION_LANGUAGE}}; write files in {{ARTIFACT_LANGUAGE}}. This command creates the skeleton of the project with the user, area by area.

Arguments: `$ARGUMENTS`: empty = all areas in order; otherwise one area.

## Inputs
`docs/product/brief.md`, `docs/adr/*.md`. Missing ADRs for a needed decision: suggest `/{{CMD_STACK}}` first.

## Areas, in order (one plan, one validation, one implementation each)

1. **Structure**: folders per layer, workspace or solution files, shared configuration (editorconfig, formatter, linter) with the strictness CI will enforce.
2. **Git**: base branch, branch naming, commit convention, PR template, protected branches (to configure on the host by the user). On a repository without commits, the first (bootstrap) commit goes on the base branch (the hooks allow it); the user creates the remote and does the first push.
3. **Tests**: test frameworks per layer, one passing example test per layer, coverage command.
4. **CI/CD**: pipeline running exactly the local commands (install, build, format check, lint, tests), packaging, deployment per environment with an approval before production.
5. **Versioning and release**: version source (tags or commit convention), changelog, release command or pipeline.
6. **Environments**: local stack (one command), staging, production, configuration by environment variables, secrets by name only, rollback path.
7. **Docs**: README (run, test, release), `docs/foundations.md` recording every convention chosen here and the exact build, format, lint and test commands (the next `/maestro` run reads them).

For each area:
1. Launch `architect` (and `devops` for 2, 4, 5, 6) for a concrete plan with files and commands.
2. Present it; validate with AskUserQuestion (Validate / Adjust / Skip). Nothing is written before validation.
3. Implement on disjoint files: `app-expert` for the application skeleton, its configuration and the example tests; `devops` for pipelines, containers, release and environments. Run the commands to prove it works (build, test, lint locally).
4. Commit following `.claude/rules/git-workflow.md` when the user wants commits.

## End
Tell the user: the foundations are in place; run `/maestro` again so the AI setup is regenerated for the real code base (layer experts, layer rules, verification, delivery chain), then use `/{{CMD_FEATURE}}` for the first features.

## Rules
- Never run anything that touches shared infrastructure (deployments, remote settings, secret stores): give the user the exact steps.
- Every command written in docs or CI was run successfully once.
