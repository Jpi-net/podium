# Genesis: an empty project

The repository has no source code yet. You do not create the project. You create the `.claude/` that lets Claude Code drive its creation step by step with the user.

## Understand (light)

- Git must exist (`git init` done by the user or with their agreement). Hosting does not matter. A repository without any commit is the normal starting point: the hooks allow the first (bootstrap) commit on the base branch, and the user does the first push.
- Capture the one-line intent if the user gives one, otherwise the README's first line: it becomes `{{SEED_INTENT}}` in the kickoff command. Do not run the kickoff yourself.
- Ask the preferences of Step 1 of the skill. The decisions without a question (project name, `CLAUDE.md` location, commit format and branch prefixes, command names) are shown in the proposal with their defaults: conventional commits, `feat/` and `fix/` branches, trunk-based with short-lived branches, default command names `kickoff`, `stack`, `foundations`, `feat`.

## What to generate

| File | From template | Notes |
|---|---|---|
| `CLAUDE.md` (location from the proposal) | `CLAUDE.md` | stage genesis (`IF_GENESIS`): no layer rules yet; the workflow section explains kickoff → stack → foundations → feature and that `/maestro` must run again once the stack is chosen; the cheat sheet uses the genesis sentence of `templates/README.md` |
| `.claude/rules/git-workflow.md` | `rules/git-workflow.md` | conventions from the proposal, with the Bootstrap section |
| `.claude/agents/product.md` | `agents/product.md` | runs the kickoff interview, writes `docs/product/brief.md` |
| `.claude/agents/architect.md` | `agents/architect.md` | genesis variant: compares options, drafts ADRs, stack decision contract |
| `.claude/agents/app-expert.md` | `agents/app-expert.md` | owns the application code and its tests until the layer experts exist |
| `.claude/agents/devops.md` | `agents/devops.md` | git, CI/CD, release, environments |
| `.claude/agents/code-reviewer.md` | `agents/code-reviewer.md` | generic until rules per layer exist (`{{REVIEW_CHECKLIST}}`: correctness and the brief's acceptance criteria) |
| `.claude/skills/<kickoff>/SKILL.md` | `skills/kickoff.md` | what, who, ideas, constraints, success criteria, scope v1 |
| `.claude/skills/<stack>/SKILL.md` | `skills/stack.md` | 2-3 options per layer with trade-offs, recommendation, ADR per decision |
| `.claude/skills/<foundations>/SKILL.md` | `skills/foundations.md` | repository structure, branching, tests, CI/CD, versioning and release, environments up to production, docs |
| `.claude/skills/<feature>/SKILL.md` | `skills/feature.md` | generic feature flow (plan, validate, implement, verify, review, commit) |
| hooks | `hooks/*` | `lib`, `session-start`, `guard-bash`, `guard-git`, `guard-ownership`, `stop-check` (post-edit and user-prompt come with the full setup) |
| `.claude/settings.json` | `settings.json.tmpl` | only the hooks above are wired; read-only git permissions; no `{{ALLOW_COMMANDS}}` line yet |
| `.claude/.gitignore` | `gitignore.tmpl` | when `.claude/` is versioned |
| `.claude/maestro.json` | manifest | see the genesis example of `references/manifest.md` |

Manifest essentials for genesis:
- `stage: "genesis"`, roles `kickoff`, `stack`, `foundations`, `feature` (plus `setup`).
- `phases`: `plan` (product, architect, Plan), `experts` (app-expert, devops), `review` (code-reviewer). No `verify` or `deliver` phase yet.
- `hooks.partitions`: product → `^docs/product/`, devops → pipelines, containers, infrastructure, app-expert → everything else outside `docs/` and `.claude/`.
- `hooks.commitPattern` from the chosen convention (conventional commits by default); `hooks.prDraft` from the Step 1 choice.
- `checks`: only what the user enabled, plus `partition` and `hooks`.

## Where decisions are recorded (written later by those commands, not by you)

- `docs/product/brief.md`: the kickoff output.
- `docs/adr/NNNN-<title>.md`: one ADR per technical decision (context, options with trade-offs, decision, consequences).
- `docs/foundations.md`: the conventions chosen by the foundations command and the exact build, format, lint and test commands.

## The handover to full

The foundations command ends by telling the user to run `/maestro` again. On that run the manifest says `genesis` and code exists, so the skill audits the new code base and generates the full setup (layer experts, layer rules, verifier, delivery chain), keeping the starter commands that are still useful. `app-expert` is replaced by the layer experts (ask before deleting it).
