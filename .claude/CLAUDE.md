# maestro

A Claude Code plugin. `/maestro` (the skill in `skills/setup/`) builds an orchestrated `.claude/` for any repository; `/maestro-stage` (the TypeScript hooks module in `hooks/`, run by the Claude Code plugin engine, entry `hooks/register.tsx`) draws a live pixel-art panel of the flow. No package.json and no build step: the engine loads the module directly.

## Language

- Talk to the user in the user's language: plans, questions, reports.
- Everything written to disk is in English: code identifiers, files, commit messages, PR titles and descriptions, logs, user-facing panel text.

## Non-negotiable rules

1. Code lives in classes with static members; no free functions in `hooks/` (`.claude/rules/panel.md`).
2. No comments in code, except `// Arrange`, `// Act`, `// Assert` in tests (`.claude/rules/panel.md`, `.claude/rules/tests.md`). A hook enforces it.
3. Every change ships with a test; a fix starts with a test that fails for the expected reason (`.claude/rules/tests.md`).
4. Hooks fail open: never block the user's session on an error (`.claude/rules/panel.md`, `.claude/rules/setup-skill.md`).
5. User-facing text is English; README and CHANGELOG are updated when behaviour changes (`.claude/rules/docs-release.md`).
6. Templates and generated hooks work on any stack and OS (`.claude/rules/setup-skill.md`).
7. No AI attribution in commits, branches or PRs (`.claude/rules/git-workflow.md`). A hook enforces it.

## Rules files

Path-scoped rules in `.claude/rules/` load automatically when matching files are touched. Subagents must Read the relevant ones explicitly before acting.

| Area | Rule file |
|---|---|
| Branches, commits, PRs, releases (always loaded) | `.claude/rules/git-workflow.md` |
| Panel module: `hooks/**`, `types/**` (classes, `$` APIs, fail open, quad-pixel drawing) | `.claude/rules/panel.md` |
| Tests: `tests/**` (`claude-code/testing`, Arrange/Act/Assert, fixture classes) | `.claude/rules/tests.md` |
| Setup skill: `skills/**` (templates, placeholders, Node ESM hooks, stack- and OS-neutral) | `.claude/rules/setup-skill.md` |
| Docs and release: README, CHANGELOG, CONTRIBUTING, SECURITY, `.claude-plugin/**`, `.github/**`, `assets/**` | `.claude/rules/docs-release.md` |

## Workflow

- `/feat <description>`: build a feature or change.
- `/fix <bug>`: diagnose, failing test, minimal fix.
- `/investigate <question>`: read-only analysis.
- `/faq <question>`: answer about the code base.
- `/review-pr <number>`: review a pull request.
- `/pr-comments <number>`: handle review comments.
- `/maestro`: update this setup.
- `/maestro-stage`: open the panel.

- The main thread orchestrates: plan (with the architect or the debugger when design or root cause matters) → experts in parallel on **disjoint file partitions** → verification by `lint-runner` → reviews in parallel → commits. Without a command, the same orchestration applies to any non-trivial request; trivial requests (one-line edit, question) are answered directly.
- Model tiers: Opus agents think (architect, debugger, reviewers), Sonnet agents implement, Haiku agents run mechanical tasks.
- Implementers: `panel-expert` (hooks/, types/), `setup-expert` (skills/setup/), `test-expert` (tests/), `doc-writer` (README, CHANGELOG, CONTRIBUTING, SECURITY, assets/), `devops` (.github/, .claude-plugin/, root config files).
- Reviews: `code-reviewer` always; `security-reviewer` when the diff touches `skills/setup/templates/hooks/**`, `skills/setup/templates/settings.json.tmpl`, `$.process.run` / `$.fs` / `$.prompt` usage in `hooks/`, or permissions; `doc-writer` when behaviour, commands or manifest keys change.

## Commands cheat sheet

All from the repository root:

```
claude plugin validate .                                                   # manifests, hooks module, types (CI, no flags)
claude plugin validate . --profile directory --strict                      # before a release: Anthropic plugin directory checks
claude plugin test .                                                       # all tests (CI)
for f in skills/setup/templates/hooks/*.mjs; do node --check "$f"; done    # hook template syntax (CI)
claude --plugin-dir . --debug                                              # run the plugin locally
```

## Never

- Print, copy or commit secrets; reference them by variable name only.
- Edit `.claude-plugin/types/` by hand: the engine writes it.
- Force-push, rewrite pushed history, or move a published release tag.
- Add an AI attribution (AI co-author trailer, "Generated with", model name as author) to any commit, branch or PR. A hook enforces it; never work around it.
- Put scratch files in the repository (including scene preview tests): use the session scratchpad.
