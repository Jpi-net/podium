# Git, commits and pull requests

## No AI attribution (project choice)
- No AI attribution in commit messages, branch names, PR titles or PR descriptions: no AI `Co-Authored-By` trailer, no "Generated with/by <assistant>" line, no 🤖, no model name as an author. Naming a technology the project uses (Claude Code, the plugin engine, a model id in a test fixture) is fine. A hook enforces it; never work around it.

## Branches
- Base branch: `main`. Direct commits on `main` are the current practice; use a branch for larger work or when opening a pull request.
- Feature: `feat/<slug>` from `origin/main`.
- Fix: `fix/<slug>` from `origin/main`.
- Always `git fetch origin` first (remote `origin` is GitHub `Jpi-net/maestro`). On an existing shared branch: `git pull --no-rebase` before working.

## Commits
- Format: a short imperative subject with a capital first letter, no type prefix, no trailing period, at most 72 characters (`Seat the orchestrator at a desk in an office`); an optional body says why, wrapped at 72. Release commits: `Release x.y.z`.
- Granularity:
  - Narrow change (one or two layers, about 10 files or fewer): ONE commit, tests included.
  - Feature or multi-layer change: one commit per layer in dependency order (`plugin/types/` and `plugin/hooks/` with their `plugin/tests/`, then `plugin/skills/setup/`, then docs and manifests).
  - Each commit passes `claude plugin validate plugin` and `claude plugin test plugin`. If a split would break them, merge the adjacent layers.
- Never `--no-verify`. Never amend or rewrite pushed commits. Never force-push.

## Pull requests
- Target: `main`.
- Format: title in the commit subject style; description follows `.github/pull_request_template.md` (What / Why / Checks: validate passes, test passes, tests added or updated, README and CHANGELOG updated when behaviour changes).
- Link the GitHub issue when there is one (`gh issue view <number>` to read it).
- Reviewers are added by the user.

## Releases
- Tags are `vx.y.z` on the `Release x.y.z` commit; never move or delete a published tag. Steps in `docs-release.md`.

## Never
- Commit secrets, `.claude/settings.local.json`, `plugin/.claude-plugin/types/`, scratch preview tests or unrelated changes.
- Delete remote branches, reset shared work, or bypass git hooks.
