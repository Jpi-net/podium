# Git, commits and pull requests

{{#IF_AI_RULE}}
## Absolute rule
- NO reference to Claude, AI, an assistant, a model name, "Generated with", `Co-Authored-By` or 🤖 in commit messages, branch names, PR titles, PR descriptions, code or comments. A hook enforces it; never work around it.
{{/IF_AI_RULE}}

## Branches
- Base branch: `{{BASE_BRANCH}}`. Protected (no direct commit or push): {{PROTECTED_BRANCHES}}.
- Feature: `{{FEATURE_BRANCH}}` from `origin/{{BASE_BRANCH}}`.
- Fix: `{{FIX_BRANCH}}` from `origin/{{BASE_BRANCH}}`.
- Always `git fetch origin` first when a remote exists. On an existing shared branch: `git pull --no-rebase` before working.
{{#IF_GENESIS}}

## Bootstrap (new repository)
- Without any commit yet, the first commit (project skeleton or setup) goes on `{{BASE_BRANCH}}`: the hooks allow it only while the repository has no commit.
- The user creates the remote repository and does the first push of `{{BASE_BRANCH}}`; after that, every change goes through a work branch and a pull request.
- Until a remote exists, branch from the local `{{BASE_BRANCH}}` instead of `origin/{{BASE_BRANCH}}`.
{{/IF_GENESIS}}

## Commits
- Format: {{COMMIT_FORMAT}}
- Granularity:
  - Narrow change (one or two layers, about 10 files or fewer): ONE commit, tests included.
  - Feature or multi-layer change: one commit per layer, in dependency order, tests last or with their layer as the team prefers.
  - Each commit must build. If a split would break the build, merge the adjacent layers.
- Never `--no-verify`. Never amend or rewrite pushed commits. Never force-push.

## Pull requests
- Target: `{{BASE_BRANCH}}`.
- Format: {{PR_FORMAT}}
{{#IF_DRAFT_PR}}
- Always created as a **draft**: the user reviews and publishes it. A hook enforces it.
{{/IF_DRAFT_PR}}
- Link the work item or issue when there is one.
- Reviewers are added by the user or by the host's policies.

## Never
- Commit secrets, local configuration, scratch files or unrelated changes.
- Delete remote branches, reset shared work, or bypass git hooks.
