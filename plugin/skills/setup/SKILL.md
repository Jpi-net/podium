---
name: setup
description: Builds or adapts the project's .claude/ setup (CLAUDE.md, path-scoped rules, model-tiered agents, role skills, guard hooks, settings, maestro.json manifest) following an orchestrated AI-engineering workflow. Use when the user types /maestro or /maestro:setup, asks to set up or optimise Claude Code for a repository, to bootstrap the .claude folder of an empty project, or to update or audit an existing maestro setup.
argument-hint: "[new|existing|update|audit] [free context]"
---

# /maestro: orchestrated .claude/ setup

You are the ORCHESTRATOR. You build the project's `.claude/` so that Claude Code can work on this repository the way the references describe: the main thread plans and delegates, model-tiered experts work in parallel on disjoint files, verification mirrors CI, reviews run in parallel, history is clean.

This skill never creates the product itself (no application code, no scaffolding of the app, no CI files). It only writes `.claude/` (plus `CLAUDE.md` at the root when the user wants it there, and one line in `.git/info/exclude` when `.claude/` is not versioned). The project is then built with Claude Code through the commands this skill generates.

The user runs this skill by typing `/maestro` (a command registered by the plugin that launches this skill, `maestro:setup`, with the same arguments). Every generated file and message refers to it as `/maestro`.

Arguments: `$ARGUMENTS`. First token may force the mode: `new` (genesis), `existing` (full), `update`, `audit` (report only, write nothing). Everything else is free context from the user.

Talk to the user in THEIR language (detect it from their messages). Everything written to disk is in the artifact language chosen in Step 1 (English by default).

Read these references when the step needs them, not all upfront:
- `references/vision.md`: the principles every generated file must embody.
- `references/catalog.md`: agents, skills, hooks and rules you can generate, and when to include each.
- `references/audit.md`: how to audit an existing repository.
- `references/genesis.md`: the starter setup for an empty project.
- `references/manifest.md`: the exact format of `.claude/maestro.json`.
- `references/merge.md`: how to write without destroying the user's work.
- `templates/README.md`: the template files and their `{{placeholders}}`.

The skill's own folder is `${CLAUDE_PLUGIN_ROOT}/skills/setup` when the variable is set; otherwise locate it with `find ~/.claude/plugins ~/.claude/mods -type d -path '*maestro*/skills/setup' 2>/dev/null | sort -V | tail -1` (on Windows without a POSIX shell: `Get-ChildItem -Recurse -Directory "$HOME/.claude/plugins" | Where-Object FullName -like '*maestro*skills*setup' | Select-Object -Last 1`). Read templates from there.

Keep a checklist of the steps and report progress to the user with one short line per step.

## Step 0: Detect the mode

Run in parallel (read-only):
- `git rev-parse --show-toplevel` (no git repository: tell the user that git must be configured and initialised first, offer `git init`, and continue only after it exists), `git log --oneline -5` (exit code 128 on a repository without commits is expected: it is a fresh repository), `git status --porcelain | head`.
- List the top level and count source files outside `.claude/`, `.git/` and dependency or build output folders (`node_modules/`, `vendor/`, `dist/`, `build/`, `out/`, `target/`, `bin/`, `obj/`, `.venv/`, `venv/`, `__pycache__/`, `Pods/`, `.gradle/`, `DerivedData/`).
- Check for `.claude/maestro.json`, `.claude/`, `CLAUDE.md`, `.claude/CLAUDE.md`.

Decide:
- **genesis**: no source code (only README, LICENSE, empty folders, maybe docs/ideas). Read `references/genesis.md`.
- **full**: source code exists and there is no manifest. Read `references/audit.md`.
- **update**: a manifest exists. If its `stage` is `genesis` and the stack is now chosen and code exists, propose the move to `full` (an audit, then the full setup that replaces the starter one). Otherwise audit what changed since `generatedFiles` was written (new layers, new commands, renamed commands, files the user edited) and propose updates.
- **audit**: run the audit of the detected mode and stop after the report.

A forced mode in the arguments wins, but say so when it contradicts what you see (forcing genesis on a repository full of code, for example).

## Step 1: Preferences (one AskUserQuestion call, at most 4 questions)

Ask only what you cannot infer. In every question the recommended option comes first and its label ends with "(Recommended)". Typical set:
1. Artifact language for files, code identifiers, commits, logs: English (Recommended) or the user's language. The conversation language follows the user automatically.
2. `.claude/` committed with the project, or local only (then `.claude/` goes to `.git/info/exclude`, never to the shared `.gitignore`). Recommended: committed by default, including a single-author repository or a repository without remote; local only is recommended only when the repository is shared with other contributors and this setup is personal to the user.
3. Optional rules to enable (multiSelect), each proposed, never imposed: no AI attribution in commits/PRs/branches (blocks AI co-author trailers and "Generated with" lines; a neutral option, not recommended by default: Claude Code's attribution stays unless the user enables it), "a fix starts with a failing test" (Recommended only when the project has a test runner; genesis: recommended, the foundations add one), draft-only pull requests (Recommended when PRs are reviewed; genesis without a remote: not recommended, propose it again when moving to full), zero comments in new code except test structure markers, one commit per layer, explicit types (no `var` where the language has it).
4. Model budget: balanced (Recommended: Opus thinks, Sonnet implements, Haiku runs mechanical tasks) or economical (Sonnet everywhere except Haiku for mechanical tasks).

When the audit finds no test runner (`tests: none`), ask one more question in Step 3, separately: add a test runner to the project now (the first feature or a dedicated task will set it up) or work with reproduction scenarios until then (Recommended for a small or prototype project).

Existing `CLAUDE.md` or rules already answer some of these: read them first and do not ask again.

## Step 2: Understand

- **genesis**: follow `references/genesis.md`, Step "Understand": what the user wants to build is NOT decided here; the generated kickoff/stack commands will do it later with Claude Code. Only capture a one-line intent if the user gives one, plus the team's habits (branching, hosting-agnostic).
- **full / update**: follow `references/audit.md`. Launch the audit agents in parallel (one message, several Agent calls, `subagent_type: "Explore"`, `effort: "lower"`), one per area, each with a compact output contract. Then consolidate.

Present the audit report to the user (in their language): layers and their paths, real commands (build, format, lint, unit, integration, front, e2e), CI and git flow observed, conventions observed, existing `.claude/` and how it will be kept.

## Step 3: Proposal (user validation required)

Build the proposal from `references/catalog.md`:
- Agents: which ones, model tier, tools, and for each implementer its exact file partition (path regex). Partitions must be disjoint; generated files belong to their generator only.
- Rules: one file per layer or concern, each with `paths:` front matter so it loads only when matching files are touched.
- Skills per role (genesis: kickoff, stack, foundations, feature; full: feature, fix, investigate, faq, review, comments, deliver, merge, upgrade, environment when relevant). Propose default names and let the user rename them; names are free.
- Hooks and what each enforces.
- Settings: permissions allow list built from the real commands, deny list for secrets.
- The verification steps and the patterns the panel will use to recognise them.
- The decisions that were not asked in Step 1, each with an explicit default the user can change: project name (default: repository folder name or the name in the main project file), `CLAUDE.md` location (default: keep the existing one; none yet: `.claude/CLAUDE.md` for a local-only setup, root `CLAUDE.md` for a shared one), commit format and branch prefixes (default: what `git log` and `git branch -a` show; nothing observable: conventional commits, `feat/` and `fix/`), commit and PR delegation (default: a `git-writer` agent when the team uses pull requests, otherwise the orchestrator commits), command names (defaults from `references/catalog.md`), the review and comments commands (included only on observable signals of reviewed pull requests: a hosted remote, a PR template, merge commits of pull requests, `CODEOWNERS`).

Ask for validation with AskUserQuestion: Validate / Adjust (specify) / Cancel. Iterate until validated. Nothing is written before validation. In `audit` mode, present the proposal and stop.

## Step 4: Generate

1. Read `references/merge.md` and apply it: for each target file, decide create / update / keep / ask. Never overwrite a file the user edited without showing the diff and asking.
2. Instantiate the templates (`templates/**`) following `templates/README.md`: fill every `{{PLACEHOLDER}}` from the audit and the validated proposal, in the artifact language; keep or drop each conditional block (markers on their own lines) and renumber lists. Leftover check: `grep -rnE '\{\{[#/]?[A-Z][A-Z_]*\}\}' .claude CLAUDE.md` prints nothing (double braces of Angular, Vue or Handlebars snippets quoted in rules are content, not placeholders).
3. Specialise, do not copy: every agent and rule must name the real paths, commands, frameworks and conventions of this repository. Generic text that could apply to any project is a defect.
4. Write the skills under `.claude/skills/<chosen-name>/SKILL.md` (the folder name is the command name).
5. Write `.claude/maestro.json` (format: `references/manifest.md`): stage, language, versioned, roles (role → chosen command name), phases (agent groups for the panel, each with its `id`), reviewers, verification patterns from the real commands, layers, code roots, generated-file pattern, enabled checks, git conventions, `hooks` section (partitions of every implementer), and `generatedFiles` with the sha256 of every file you wrote except the manifest itself (`shasum -a 256` or `sha256sum`; on Windows `certutil -hashfile <file> SHA256` or PowerShell `(Get-FileHash <file>).Hash.ToLower()`).
6. Local only: append `.claude/` to `.git/info/exclude` if not already present. Versioned: write `.claude/.gitignore` from `templates/gitignore.tmpl` (flows, agent memory, local settings stay out of git).

## Step 5: Verify (fix and re-run until clean, at most 3 rounds)

- Every JSON file parses: `node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" <file>`; without Node, `python3 -m json.tool <file>`, `jq empty <file>` or PowerShell `Get-Content <file> -Raw | ConvertFrom-Json`.
- Every `"command"` in `.claude/settings.json` points to a hook file that exists.
- Every hook passes `node --check`, then runs with sample inputs on stdin from the scratchpad:
  - an allowed case: a `git status` Bash call for PreToolUse, an edit of a source file inside its partition, `{}` for SessionStart and Stop;
  - at least one refusal case per enabled rule: force push, commit on a protected branch (in an empty repository, test it in a temporary clone in the scratchpad that has one commit), recursive delete of a source folder, printing `.env`, an edit outside a partition, a commit message with an AI attribution line (AI rule), a commit message off the format (commit pattern), a PR without `--draft` (draft rule), an added comment line (zero-comment rule).
  - an edit of a file with a BOM and of a CRLF file keeps its BOM and line endings (post-edit restores the reference style);
  - Expected outcomes: exit 0 with no output (allowed), exit 0 with a JSON `permissionDecision: "deny"` (PreToolUse refusal) or a JSON `decision: "block"` (Stop), exit 2 with a message on stderr (PostToolUse feedback). Anything else is a defect.
- Every agent and skill has valid front matter (`name`, `description`; agents also `tools`, `model`), and every skill name matches its folder.
- Every rule's `paths:` globs match at least one existing file (genesis: skip).
- No placeholder left (the grep of Step 4), no reference to another project, no personal names, no secrets.
- Node missing on the machine: generate the shell fallbacks described in `templates/hooks/FALLBACK.md` and wire them instead.

## Step 6: Report

Tell the user, in their language and briefly:
- what was created, updated, kept, and what still needs their decision;
- the commands now available with their role, in the order they will use them (genesis: kickoff → stack → foundations → feature; full: feature / fix / investigate…);
- the suggested first commit of a versioned `.claude/` (for example `chore: add the .claude setup`): the hooks accept the folder name in commit messages;
- to run `/reload-plugins` (or restart Claude Code) so new skills and hooks load, then to open `/maestro-stage`: its Tools tab (key 5) shows the project's commands by role and the next step, and its flow uses the manifest;
- in genesis: the next step is the kickoff command, then `/maestro` again once the stack is chosen and code exists.

## Rules

- Never write outside `.claude/`, the root `CLAUDE.md` (only if the user wants it at the root) and `.git/info/exclude`.
- Never commit, push or create branches; the user decides when to commit `.claude/`.
- Never print or copy secrets (`.env`, key files); reference variable names only.
- Never invent commands: every command written into a rule, agent or the manifest was seen in the repository (scripts, project files, CI) or confirmed by the user.
- When the AI-attribution rule is enabled, no generated git or PR artifact carries an AI attribution: no AI "Co-Authored-By" trailer, no "Generated with/by <assistant>" line, no model name used as an author. When it is disabled, Claude Code's default attribution is kept.
- After three failures on the same verification step, stop and report the exact error to the user.
