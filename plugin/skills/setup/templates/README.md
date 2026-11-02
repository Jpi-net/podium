# Templates

Instantiate these files into the project's `.claude/` (and `CLAUDE.md`).

## Instantiation rules

- Replace every `{{PLACEHOLDER}}` (UPPER_CASE between double braces). Other double-brace text (Angular, Vue, Handlebars, Jinja templates quoted in a rule) is content: leave it alone.
- Conditional blocks are always on their own lines: `{{#IF_X}}` opens, `{{/IF_X}}` closes. When X applies, delete only the two marker lines; when it does not, delete the markers and everything between them. Never leave an empty numbered step: renumber the list after removing a block.
- A placeholder that has no value in this project: remove the whole line (or bullet) that contains it, unless the table below gives a fallback.
- Leftover check, after writing: `grep -rnE '\{\{[#/]?[A-Z][A-Z_]*\}\}' .claude CLAUDE.md` must print nothing.
- The templates assume the git remote is named `origin`. When the audit finds another name (`upstream`, a company name), replace `origin` with it in every generated file; without a remote, the git-workflow rule's "until a remote exists" line applies.
- `settings.json`: wire a hook only if its `.mjs` file is generated (see the blocks). Every `"command"` path in the settings must exist on disk.

| Template | Target |
|---|---|
| `CLAUDE.md` | `CLAUDE.md` or `.claude/CLAUDE.md` (decided in the proposal) |
| `settings.json.tmpl` | `.claude/settings.json` |
| `gitignore.tmpl` | `.claude/.gitignore` (only when `.claude/` is versioned) |
| `review-learnings.md` | `.claude/review-learnings.md` |
| `agents/<name>.md` | `.claude/agents/<name>.md` (`layer-expert.md` once per layer, renamed `<layer>-expert.md`; `app-expert.md` in genesis only) |
| `skills/<role>.md` | `.claude/skills/<command-name>/SKILL.md` |
| `hooks/*.mjs` | `.claude/hooks/*.mjs` (copied as is: they read the manifest). Genesis: `lib`, `session-start`, `guard-bash`, `guard-git`, `guard-ownership`, `stop-check`. Full: all of them plus `post-edit`, and `user-prompt` only when `hooks.workItemCommand` is set |
| `hooks/FALLBACK.md` | instructions when Node is missing |
| `rules/git-workflow.md` | `.claude/rules/git-workflow.md` |
| `rules/layer.md` + language example | `.claude/rules/<layer>.md` |

## Placeholders

| Placeholder | Value |
|---|---|
| `{{PROJECT_NAME}}` | project name: the name in the main project file first (`package.json` `name`, solution or main project file name, `pyproject.toml`, `Cargo.toml`, `go.mod` module), the repository folder name as fallback |
| `{{PROJECT_SUMMARY}}` | one or two lines: what the product is, the main stack (genesis: the intent, or "a new project, stack to be chosen") |
| `{{SEED_INTENT}}` | genesis: the one-line intent the user gave (or the README's first line); fallback: "none yet" |
| `{{CONVERSATION_LANGUAGE}}` | how to talk to the user ("the user's language", or a named language) |
| `{{ARTIFACT_LANGUAGE}}` | language of code, files, commits, logs (default English) |
| `{{NON_NEGOTIABLE_RULES}}` | numbered list of the enabled rules, one line each, each pointing to its rule file |
| `{{RULES_TABLE}}` | markdown table area → rule file |
| `{{COMMANDS_CHEATSHEET}}` | full: fenced block with the verified build / test / lint commands and their folder. Genesis: the sentence "No build or test command yet: the foundations command records them in `docs/foundations.md`, and the next `/podium` run copies them here." |
| `{{ROLE_COMMANDS}}` | bullet list `/name args`: role, one line |
| `{{BASE_BRANCH}}` | base branch, bare name (`main`); templates wrap it in backticks |
| `{{PROTECTED_BRANCHES}}` | protected branches, already formatted: each name in backticks, comma separated (`` `main`, `release/*` ``); templates do NOT wrap it |
| `{{FEATURE_BRANCH}}` / `{{FIX_BRANCH}}` | branch name patterns, bare (`feat/<id>-<slug>`); templates wrap them in backticks |
| `{{COMMIT_FORMAT}}` | commit message format with an example |
| `{{PR_FORMAT}}` | PR title and description format |
| `{{EXPERTS}}` | list of implementer agents with their partition (one line each) |
| `{{REVIEWERS}}` | reviewer agents and when each runs |
| `{{VERIFIER}}` | name of the verifier agent (default `lint-runner`) |
| `{{GIT_WRITER}}` | name of the git agent (default `git-writer`) |
| `{{VERIFY_STEPS}}` | top-level bullet list (no indentation), one bullet per changed area: the exact commands in order, the folder, the CI flags |
| `{{CMD_FEATURE}}`, `{{CMD_FIX}}`, `{{CMD_INVESTIGATE}}`, `{{CMD_FAQ}}`, `{{CMD_DELIVER}}`, `{{CMD_KICKOFF}}`, `{{CMD_STACK}}`, `{{CMD_FOUNDATIONS}}`, `{{CMD_REVIEW}}`, `{{CMD_COMMENTS}}`, `{{CMD_MERGE}}`, `{{CMD_UPGRADE}}`, `{{CMD_ENVIRONMENT}}` | chosen command names (without slash) |
| `{{ENVIRONMENT_COMMANDS}}` | fenced block: start, stop, status, logs, reset commands of the local stack |
| `{{LAYER_ROOT}}`, `{{LAYER_COMMANDS}}` | folder the layer's commands run from, and the commands (build, test, lint, one test) |
| `{{COMMENT_ALLOW}}` | human list of the comment markers allowed by the zero-comment rule |
| `{{WORK_ITEM_READ}}` | how to read a work item / issue (command), or "ask the user for the description" |
| `{{ALLOW_COMMANDS}}` | zero or more lines, each `      "Bash(<cmd> *)",` WITH its trailing comma, for the verified read-only and build/test commands; no value = remove the line |
| `{{SECURITY_CHECKLIST}}` | bullets specific to the stack and the threat model found by the audit (e.g. front only: XSS through raw HTML binding, tokens in local storage, open redirects, secrets in the bundle; API: authorisation per endpoint, data isolation, injection) |
| `{{REVIEW_CHECKLIST}}` | bullets specific to the frameworks and the enforced conventions (e.g. change detection strategy, dependency injection style, async patterns, ORM pitfalls) |
| `{{AGENT_NAME}}`, `{{LAYER}}`, `{{LAYER_PATHS}}`, `{{LAYER_STACK}}`, `{{LAYER_RULES}}`, `{{LAYER_CHECKS}}` | layer expert and layer rule values |
| `{{READ_RULES}}` | the rule files an agent must read |
| `{{MODEL}}` | `opus`, `sonnet`, `haiku` (tier, see the vision) |
| `{{COLOR}}` | agent color |
| `{{GENERATOR}}` | name of the generator agent (e.g. `proxy-generator`) |
| `{{GENERATOR_COMMAND}}` | exact command that regenerates the generated files (seen in the repository) |
| `{{GENERATED_PATH}}` | path or glob of the generated files the generator owns |
| `{{GENERATOR_PREREQUISITES}}` | bullet lines of prerequisites of the generator (running service, built project); remove the line when there is none |

## Conditional blocks

| Block | Kept when |
|---|---|
| `IF_AI_RULE` | the opt-in "no AI attribution" rule is enabled |
| `IF_DRAFT_PR` | pull requests are created as drafts |
| `IF_ZERO_COMMENTS` | the zero-comment rule is enabled |
| `IF_GIT_WRITER` / `IF_NO_GIT_WRITER` | commits and PRs are delegated to the git agent / done by the orchestrator |
| `IF_SECURITY` | a security reviewer is generated |
| `IF_DOCS` | a doc writer is generated |
| `IF_DOMAIN_FIRST` | the domain-first rule is enabled |
| `IF_TESTS` / `IF_NO_TESTS` | the audit found a test runner (`tests: present`) / none (`tests: none`). Genesis: always `IF_TESTS`, the foundations add a runner |
| `IF_WORK_ITEMS` | `hooks.workItemCommand` is set (the user-prompt hook is generated) |
| `IF_GENESIS` / `IF_FULL` | stage of the setup |
