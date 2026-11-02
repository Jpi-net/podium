# Maestro

[![CI](https://github.com/Jpi-net/maestro/actions/workflows/ci.yml/badge.svg)](https://github.com/Jpi-net/maestro/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/Jpi-net/maestro/blob/main/LICENSE)

**Conduct Claude Code like an orchestra.** Maestro sets up a repository so that the main thread plans and delegates, model-tiered experts work in parallel on disjoint files, verification mirrors CI, reviews run in parallel and history stays clean. Then it shows that flow live, in a side panel.

- **`/maestro`** builds or adapts the project's `.claude/`: `CLAUDE.md`, path-scoped rules, model-tiered agents, role skills, guard hooks and settings.
- **`/maestro-stage`** opens a live side panel of the flow: agents, verification, reviews, broken rules, delivery state and every command available.

Maestro never writes your product. It only writes `.claude/`; the project is then built with Claude Code through the commands it generates.

## Requirements

- Claude Code with plugin support.
- `git`: `/maestro` works on a git repository; in a folder without one it offers `git init` first. Any host works (GitHub, GitLab, Azure DevOps, Bitbucket, self-hosted), as does a repository without a remote.
- Node 18 or later for the generated hooks. Without Node, `/maestro` can wire a reduced set of POSIX shell guards instead (force push, hard reset, `git clean -f`, `--no-verify`, printing `.env`); on Windows that needs Git Bash.
- Any language or stack: the audit reads the project's own build, test and lint commands rather than assuming a toolchain.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install maestro --marketplace Jpi-net/maestro
```

Answer `y` to add the marketplace, then pick a scope. From a shell:

```bash
claude plugin install maestro --marketplace Jpi-net/maestro
```

In the desktop app: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `Jpi-net/maestro`, then **Add plugin**.

## Quick start

```
/maestro                 # detects an empty or an existing project
/maestro-stage           # opens the panel
```

## /maestro

`/maestro [new|existing|update|audit] [free context]` (also `/maestro:setup`).

| Mode | What it does |
| --- | --- |
| `new` (genesis) | An empty project gets a starter `.claude/` that drives its creation: kickoff (what, for whom, constraints), stack choices (two or three argued options per layer, a recommendation, the decision recorded as an ADR), foundations (git and branching, structure, tests, CI/CD, versioning and release, environments, docs), then features. Run `/maestro` again once code exists to move to the full setup. |
| `existing` (full) | A parallel audit (layers, the real build/test/lint/format/e2e commands, CI and git flow, observed conventions, existing `.claude/`), a report, an argued proposal you validate, then a non-destructive generation: a file you edited is never overwritten without showing the diff. |
| `update` | Detects what changed (new layers, renamed commands, edited files) and proposes updates. |
| `audit` | Report and proposal only; nothing is written. |

Preferences are asked once: artifact language (English by default; the conversation follows yours), `.claude/` versioned or local only (`.git/info/exclude`), optional rules, all off unless you pick them (no AI attribution in git artifacts, zero comments, draft pull requests, a fix starts with a failing test...), and the model budget. Any git host works.

Generated hooks are Node scripts (`.mjs`) that read their settings from the manifest; a reduced shell fallback covers machines without Node (see Requirements).

### What the generated hooks do

They are plain files in your `.claude/hooks/`, shown in the proposal before anything is written, and you can read or delete them at any time.

| Hook | Effect |
| --- | --- |
| `guard-bash`, `guard-git` (before a shell command) | Refuse the command (Claude sees the reason and adapts): force push, push to a protected branch, `git reset --hard`, `git clean -f`, `git add --force`, discarding the working tree, `branch -D`, dropping stashes, deleting remote branches, `docker system prune` and volume removal, printing secret files, recursive deletes outside build, dependency, cache and scratch folders, `--no-verify`, commits on protected branches, and, only for the rules you enabled, commit messages off the format, non-draft pull requests and AI attribution. |
| `guard-ownership` (before an edit) | Refuses an edit by an agent outside its file partition, by a read-only agent, or by any subagent inside `.claude/`. |
| `post-edit` (after an edit) | Reports problems back to Claude (comments when the zero-comment rule is on, debug output, focused or skipped tests, `var`) and rewrites the edited file only to restore its original line endings and BOM. |
| `stop-check` (end of a turn) | Asks Claude to finish when conflict markers or new untracked build output remain. |
| `session-start` | Adds the branch, its base, ahead and behind counts and the flow in progress to the context. |
| `user-prompt` (only when you configure a tracker command) | Runs your `hooks.workItemCommand` (e.g. `gh issue view {id}`) when a prompt mentions `#<id>`, and adds its output to the context. |

The hooks run only local commands (`git` and the command you configure); they send nothing anywhere. The generated `settings.json` allows the read-only git commands plus `git fetch` and `git branch` (branch deletion stays guarded), and the build, test and lint commands found in your project, denies reading secret files, and raises `BASH_MAX_TIMEOUT_MS` to 30 minutes so long builds and test suites can finish.

## The manifest: `.claude/maestro.json`

Written by `/maestro`, read by the panel and by the generated hooks. Main keys:

| Key | Meaning |
| --- | --- |
| `stage` | `genesis` or `full` |
| `language`, `versioned` | Artifact language, whether `.claude/` is committed |
| `roles` | Role to command name (command names are yours to choose) |
| `phases`, `reviewers` | Agent groups of the flow, the review agents |
| `verification` | Command patterns per verification step |
| `layers`, `code`, `generated` | Path patterns of the code layers and generated files |
| `checks` | Optional rules, legacy code, data isolation, integration image |
| `git` | Base branch, branch prefixes, support branches, work item pattern |
| `hooks`, `generatedFiles` | Settings of the generated hooks, files written by maestro |

Full format: [`skills/setup/references/manifest.md`](skills/setup/references/manifest.md).

Without a manifest the panel still works: roles are guessed from command names, phases and reviewers from the agents in `.claude/agents/`, verification from common toolchains (npm, pnpm, yarn, dotnet, cargo, go, pytest, gradle, maven, playwright, cypress).

## /maestro-stage

`/maestro-stage [flow|delivery|history|context|tools]` opens the panel; keys `1` to `5` switch views when it has focus.

The panel opens by itself only in a project that has a `.claude/maestro.json` (after `/maestro`). Anywhere else it stays closed until you run `/maestro-stage`, so installing the plugin for every project adds nothing to repositories that do not use it. Closing it keeps it closed for the session.

1. **Flow**: phase strip, a pixel-art office where the orchestrator sits at its desk and each subagent works as a colleague at a desk of its own (outfit in the colour of its role, a role prop, typing while it works, a thumbs up when it is done), wired to a network switch on the rug by pixel-art cables (one port LED per colleague; dotted grey when idle, in the role colour with data packets when active, flashing on a tool call; they unroll when a colleague arrives and unplug when it leaves); what blocks (a failing verification with its error excerpt, a failed review, broken rules), running and finished agents, delivery state.
2. **Delivery**: ready-to-deliver verdict and ordered to-do list, verification steps, reviews and findings, broken rules (`h` explains, `x` clears), commits per layer, branches of the work item.
3. **History**: filtered journal, or swimlanes with replay.
4. **Context**: branch and base, warnings, time spent on the work item, tokens per model.
5. **Tools**: the next recommended step with the project command that does it, then every command of the session grouped by project, plugins and MCP, each with its role; clicking one puts it in the prompt. Also the project's agents with their model and phase.

Other arguments: `accessory [name|list]` (the avatar wears a random accessory each session, among 41), `quad|half|auto`, `fps <10-60>`, `recap`, `notify on|off`, `reset`, `disco`.

The panel only observes: it never blocks or changes a tool call.

### Effects

The scene reacts to the work: rain on the office window under a grey sky while verification fails, a rainbow outside when it turns green, a sky that follows the time of day, and seasonal and event decor (indoors and behind the glass).

## Develop

See [CONTRIBUTING.md](https://github.com/Jpi-net/maestro/blob/main/CONTRIBUTING.md).

```bash
claude --plugin-dir . --debug    # run with the plugin loaded from the clone
claude plugin validate .
claude plugin test .
```

## License

[MIT](https://github.com/Jpi-net/maestro/blob/main/LICENSE)
