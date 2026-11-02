---
name: review-pr
description: Reviews a pull request on the maestro repository (correctness, class and no-comment conventions, fail-open hooks, security of generated hooks, tests, README and CHANGELOG) in an isolated worktree and returns a ranked report with ready-to-paste comments. Never posts anything and never touches the current branch. Use when the user types /review-pr or asks to review a pull request.
argument-hint: "<pr number | branch>"
---

# /review-pr: review a pull request

Talk to the user in the user's language. GitHub is read-only for you: never comment, approve or request changes.

## Phase 1: Context (in parallel)
- `gh pr view <number> --comments`: title, description (What / Why / Checks of `.github/pull_request_template.md`), source and target branches, linked issues, existing comments.
- The linked issue (`gh issue view <number>`) when there is one.

## Phase 2: Isolated checkout
```bash
git fetch origin <source> <target>
git worktree add --detach <scratchpad>/pr-<number> origin/<source>
git -C <scratchpad>/pr-<number> diff --stat origin/<target>...origin/<source>
```
For a PR from a fork, fetch `pull/<number>/head` instead of `<source>`.

## Phase 3: Reviews (one message, in parallel)
In the worktree:
- `code-reviewer` always.
- `security-reviewer` when the diff touches `plugin/skills/setup/templates/hooks/**`, `plugin/skills/setup/templates/settings.json.tmpl`, `$.process.run` / `$.fs` / `$.prompt` usage in `plugin/hooks/`, or permissions.
- `lint-runner` on the changed areas: `claude plugin validate plugin`, `claude plugin test plugin` when `plugin/hooks/`, `plugin/types/` or `plugin/tests/` changed, `node --check` on each changed `plugin/skills/setup/templates/hooks/*.mjs`.

## Phase 4: Report
Ranked findings (Blocking > Major > Minor), each with `file:line`, why, the exact fix, and a ready-to-paste comment in English. Points already raised in existing comments are not repeated. Missing Checks (no test, CHANGELOG `[Unreleased]` not updated on a behaviour change) are findings.

## Cleanup
`git worktree remove <scratchpad>/pr-<number>`.
