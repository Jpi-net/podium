# Podium

[![CI](https://github.com/Jpi-net/podium/actions/workflows/ci.yml/badge.svg)](https://github.com/Jpi-net/podium/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/Jpi-net/podium/blob/main/LICENSE)

**Conduct Claude Code like an orchestra.** Podium sets up a repository so that the main thread plans and delegates, model-tiered experts work in parallel on disjoint files, verification mirrors CI, reviews run in parallel and history stays clean. Then it shows that flow live, in a side panel.

- **`/podium`** builds or adapts the project's `.claude/`: `CLAUDE.md`, path-scoped rules, model-tiered agents, role skills, guard hooks and settings.
- **`/podium-stage`** opens a live side panel of the flow: agents, verification, reviews, broken rules, delivery state and every command available.

Podium never writes your product. It only writes `.claude/`; the project is then built with Claude Code through the commands it generates.

## Requirements

- Claude Code with plugin support.
- `git`: `/podium` works on a git repository; in a folder without one it offers `git init` first. Any host works (GitHub, GitLab, Azure DevOps, Bitbucket, self-hosted), as does a repository without a remote.
- Node 18 or later for the generated hooks. Without Node, `/podium` can wire a reduced set of POSIX shell guards instead (force push, hard reset, `git clean -f`, `--no-verify`, printing `.env`); on Windows that needs Git Bash.
- Any language or stack: the audit reads the project's own build, test and lint commands rather than assuming a toolchain.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install podium --marketplace Jpi-net/podium
```

Answer `y` to add the marketplace, then pick a scope. From a shell:

```bash
claude plugin install podium --marketplace Jpi-net/podium
```

In the desktop app: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `Jpi-net/podium`, then **Add plugin**.

## Permissions and data

**The panel (`/podium-stage`)** runs only these local commands, never anything else:

- `git --no-optional-locks` with `rev-parse` (HEAD, branch name, git dir), `status --porcelain`, `rev-list --count` and `--left-right --count` against `origin/<base>`, `symbolic-ref refs/remotes/origin/HEAD`, `for-each-ref refs/remotes/origin/`, `branch -a --list`, and `grep -l` (only when the project manifest enables a data-isolation check);
- `uname -m`, to know the CPU architecture.

It never runs a git command that writes, fetches or pushes.

It reads:

- the project's `.claude/` folder (`podium.json`, agents, skills, commands), and the legacy `.claude/maestro.json` when `podium.json` is missing;
- the output file of a background task that Claude Code reports, to show its last lines;
- the session's command and agent lists, to show the Tools tab;
- the `FETCH_HEAD` timestamp;
- the files Claude edits, to check the project's rules;
- the environment variables `TERM` and `TERM_PROGRAM`;
- the session events Claude Code gives plugins (tool calls, subagents, prompts, turn results), to draw the flow.

`/podium-stage recap` copies a text summary to your clipboard. The Tools tab buttons fill your prompt with `/<command> ` and you send it.

It sends desktop notifications when they are enabled (`/podium-stage notify off` turns them off).

It stores its own settings (fps, notifications, accessory, time per work item) in Claude Code's plugin store.

**Nothing leaves the machine**: no network access, no telemetry.

**Events it hooks.** The panel only observes Claude Code: it never changes, blocks or answers anything but its own two commands.

| Event | What Podium does |
|---|---|
| `session.start` | registers `/podium` and `/podium-stage`, loads the project's `.claude/`, opens the panel |
| `command.run` for `/podium` and `/podium-stage` only | answers its own commands; other commands are not touched |
| `tool.call`, `agent.spawn`, `turn.complete`, `prompt.submit` | records what happened to draw the flow, then passes the event on unchanged |
| `session.attach`, `ui.close` | places or forgets the panel, then passes the event on unchanged |
| `ui.render` for its own panel | draws the panel |

**`/podium`** is a shortcut: it runs the plugin's own skill `/podium:setup` with the same arguments. If that cannot start, it fills your prompt with `/podium:setup <arguments>` and you decide whether to send it.

**`/podium:setup`** writes only `.claude/`, optionally `CLAUDE.md` and `.git/info/exclude`, after you validate its proposal. See [What the generated hooks do](#what-the-generated-hooks-do).

## Quick start

```
/podium                 # detects an empty or an existing project
/podium-stage           # opens the panel
```

## /podium

`/podium [new|existing|update|audit] [free context]` (also `/podium:setup`).

| Mode | What it does |
| --- | --- |
| `new` (genesis) | An empty project gets a starter `.claude/` that drives its creation: kickoff (what, for whom, constraints), stack choices (two or three argued options per layer, a recommendation, the decision recorded as an ADR), foundations (git and branching, structure, tests, CI/CD, versioning and release, environments, docs), then features. Run `/podium` again once code exists to move to the full setup. |
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
| `post-edit` (after an edit) | Reports problems back to Claude (comments when the zero-comment rule is on, debug output, focused or skipped tests, `var`) and rewrites the edited file only to restore its original line endings and BOM. It also runs `node --check` on edited `.claude/*.mjs` files (no shell). |
| `stop-check` (end of a turn) | Asks Claude to finish when conflict markers or new untracked build output remain. |
| `session-start` | Adds the branch, its base, ahead and behind counts and the flow in progress to the context. |
| `user-prompt` (only when you configure a tracker command) | Runs your `hooks.workItemCommand` (e.g. `gh issue view {id}`) when a prompt mentions `#<id>`, and adds its output to the context. The id must match `^\w[\w.-]{0,63}$`; the command runs through your shell and its output is cached in the repository's git folder (`.git/podium-work-items`). |

The hooks run only local commands (`git`, `node --check` and the command you configure); they send nothing anywhere. The example `gh issue view {id}` uses your own GitHub CLI login. The generated `settings.json` allows the read-only git commands plus `git fetch` and `git branch` (branch deletion stays guarded), and the build, test and lint commands found in your project, denies reading secret files, and raises `BASH_MAX_TIMEOUT_MS` to 30 minutes so long builds and test suites can finish.

## The manifest: `.claude/podium.json`

Written by `/podium`, read by the panel and by the generated hooks. Main keys:

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
| `hooks`, `generatedFiles` | Settings of the generated hooks, files written by podium |

Full format: [`skills/setup/references/manifest.md`](skills/setup/references/manifest.md).

Without a manifest the panel still works: roles are guessed from command names, phases and reviewers from the agents in `.claude/agents/`, verification from common toolchains (npm, pnpm, yarn, dotnet, cargo, go, pytest, gradle, maven, playwright, cypress).

## /podium-stage

`/podium-stage [flow|delivery|history|context|tools]` opens the panel; keys `1` to `5` switch views when it has focus.

The panel opens by itself only in a project that has a `.claude/podium.json` (after `/podium`). Anywhere else it stays closed until you run `/podium-stage`, so installing the plugin for every project adds nothing to repositories that do not use it. Closing it keeps it closed for the session.

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

See [CONTRIBUTING.md](https://github.com/Jpi-net/podium/blob/main/CONTRIBUTING.md).

```bash
claude --plugin-dir . --debug    # run with the plugin loaded from the clone
claude plugin validate .
claude plugin test .
```

## License

[MIT](https://github.com/Jpi-net/podium/blob/main/LICENSE)
