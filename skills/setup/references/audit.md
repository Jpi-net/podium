# Auditing an existing repository

Goal: understand every layer well enough to generate rules, agents and commands that name the real paths, tools and conventions. Never guess a command: read it from the repository or ask.

## Launch (one message, in parallel)

Use `subagent_type: "Explore"` with `effort: "lower"`. Give each agent the repository root, its area, and the output contract below. Ask for conclusions, not file dumps. Five agents is usually enough; merge areas on small repositories.

### Agent A: layers, languages, frameworks

Look at the tree (depth 3), solution and project files (`*.sln`, `*.slnx`, `*.csproj`, `package.json` and workspaces, `pyproject.toml`, `go.mod`, `pom.xml`, `build.gradle*`, `Cargo.toml`, `composer.json`, `Gemfile`), framework config files (`angular.json`, `next.config.*`, `vite.config.*`, `nest-cli.json`, `manage.py`, `Dockerfile*`, `docker-compose*`, `*.sqlproj`, `migrations/`, `prisma/`, IaC folders).

Output:
```
## Layers   (name — path globs — language/framework/version — role)
## Generated files   (path pattern — generator command)
## Monorepo tooling   (none | nx | turbo | lerna | workspaces | ...)
```

### Agent B: real commands

Read scripts and targets: `package.json` scripts, `Makefile`, `justfile`, `Taskfile.yml`, `*.ps1`/`*.sh` at the root and in `scripts/`, the CI pipeline files (`.github/workflows/*`, `azure-pipelines*.yml`, `.azuredevops/**`, `.gitlab-ci.yml`, `Jenkinsfile`, `bitbucket-pipelines.yml`, `.circleci/`), `README` and `CONTRIBUTING`.

Output, one line per step, with the exact command and the folder to run it from, and the flags CI uses:
```
## build | format (verify mode) | lint | unit | integration | front | e2e | generate | run locally
   (verification commands only: auto-fix variants such as `lint:fix`, `--fix`, `--write` are listed separately as fixers)
## Tests: present (runner, command, where the tests live) | none
## CI-only checks (anything CI runs that no local script exposes)
## Prerequisites (runtimes, docker, env files, secrets by variable name only)
```

### Agent C: git flow

Run `git branch -a | head -50`, `git log --oneline -40`, `git log --format=%s -200 | head -200`, `git tag --sort=-creatordate | head -10`, and read PR templates (`.github/pull_request_template.md`, `.azuredevops/pull_request_template.md`), `CODEOWNERS`, commit hooks (`.husky/`, `.git/hooks/commit-msg` if not a sample, `commitlint.config.*`).

Output:
```
## Base branch and protected branches
## Branch naming (observed prefixes and examples)
## Commit message format (regex + 2 examples) and versioning (semver tags, conventional commits, release tool)
## Work item / issue reference format (regex + example), if any
## PR conventions (template, draft usage, required sections)
## Signals that PRs are reviewed (hosted remote, PR template, PR merge commits, CODEOWNERS) | none
```

### Agent D: code conventions

Sample 3 to 5 representative files per layer (the most recently changed ones: `git log --name-only --format= -50 | sort | uniq -c | sort -rn | head`). Read linters and formatters (`.editorconfig`, `.eslintrc*`, `eslint.config.*`, `.prettierrc*`, `ruff.toml`, `.golangci.yml`, `stylecop.json`, `Directory.Build.props`).

Output:
```
## Per layer: architecture pattern, naming, error handling, test framework and naming, comments density, typing rules
## Enforced by tools vs only observed (be explicit)
## File encoding (line endings and BOM as committed; mismatches with .editorconfig)
## .gitignore gaps (build output, dependency folders, OS files committed or not ignored)
## Reference implementations worth mirroring (path — why)
```

### Agent E: existing AI setup

Read `CLAUDE.md`, `.claude/**` (except `worktrees/`, `agent-memory/`), `AGENTS.md`, `.cursor/rules/**`, `.github/copilot-instructions.md`, `.windsurfrules`.

Output:
```
## Existing files (path — purpose — keep | merge | replace candidate)
## Rules already stated by the team (quote them)
## Gaps
```

## Consolidate

- Build the layer table, the command table (verified), the git conventions, the conventions per layer.
- Mark every inference "observed" vs "enforced". Rules only become hard rules when enforced by a tool or confirmed by the user.
- Anything uncertain becomes one question in the proposal step.

## Map the audit to the manifest

| Audit result | Manifest field |
|---|---|
| layers and globs | `layers` (regex per layer, most specific first), `code.roots`, `code.extensions` |
| tests present or none | `IF_TESTS` / `IF_NO_TESTS` blocks, test-expert, the failing-test rule recommendation |
| generated files | `generated` |
| real commands | `verification` (patterns that match the exact commands) |
| reviewers kept | `reviewers` |
| agents grouped by phase | `phases` |
| base branch, prefixes, work item format | `git` |
| commit format, PR draft, protected branches, partitions | `hooks` |
| optional rules accepted | `checks` |
