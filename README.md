# Maestro

[![CI](https://github.com/Jpi-net/maestro/actions/workflows/ci.yml/badge.svg)](https://github.com/Jpi-net/maestro/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Conduct Claude Code like an orchestra.** Maestro sets up a repository so that the main thread plans and delegates, model-tiered experts work in parallel on disjoint files, verification mirrors CI, reviews run in parallel and history stays clean. Then it shows that flow live, in a side panel.

- **`/maestro`** builds or adapts the project's `.claude/`: `CLAUDE.md`, path-scoped rules, model-tiered agents, role skills, guard hooks and settings.
- **`/maestro-stage`** opens a live side panel of the flow: agents, verification, reviews, broken rules, delivery state and every command available.

Maestro never writes your product. It only writes `.claude/`; the project is then built with Claude Code through the commands it generates.

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

Preferences are asked once: artifact language (English by default; the conversation follows yours), `.claude/` versioned or local only (`.git/info/exclude`), optional rules (no AI mention in git artifacts, zero comments, draft pull requests, a fix starts with a failing test...), and the model budget. Any git host works.

Generated hooks are Node scripts (`.mjs`) that read their settings from the manifest; a shell fallback covers machines without Node.

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
| `theme`, `hooks`, `generatedFiles` | Panel theme, generated hooks, files written by maestro |

Full format: [`skills/setup/references/manifest.md`](skills/setup/references/manifest.md).

Without a manifest the panel still works: roles are guessed from command names, phases and reviewers from the agents in `.claude/agents/`, verification from common toolchains (npm, pnpm, yarn, dotnet, cargo, go, pytest, gradle, maven, playwright, cypress).

## /maestro-stage

`/maestro-stage [flow|delivery|history|context|tools]` opens the panel; keys `1` to `5` switch views when it has focus.

1. **Flow**: phase strip, animated graph from the orchestrator to its subagents, what blocks (a failing verification with its error excerpt, a failed review, broken rules), running and finished agents, delivery state.
2. **Delivery**: ready-to-deliver verdict and ordered to-do list, verification steps, reviews and findings, broken rules (`h` explains, `x` clears), commits per layer, branches of the work item.
3. **History**: filtered journal, or swimlanes with replay.
4. **Context**: branch and base, warnings, time spent on the work item, tokens per model.
5. **Tools**: the next recommended step with the project command that does it, then every command of the session grouped by project, plugins and MCP, each with its role; clicking one puts it in the prompt. Also the project's agents with their model and phase.

Other arguments: `accessory [name|list]` (the avatar wears a random accessory each session, among 41), `quad|half|auto`, `fps <10-60>`, `recap`, `notify on|off`, `reset`, `disco`.

The panel only observes: it never blocks or changes a tool call.

### Themes

`"theme": "insurance"` in the manifest turns on insurance references: claims filed for failed agents, receipts and a PAID stamp, commission coins, branch-based decor, a data-isolation shield. Without a theme the panel keeps the generic effects: rain and an umbrella while verification fails, a rainbow when it turns green, seasonal decor.

## Develop

See [CONTRIBUTING.md](CONTRIBUTING.md).

```bash
claude --plugin-dir . --debug    # run with the plugin loaded from the clone
claude plugin validate .
claude plugin test .
```

## License

[MIT](LICENSE)
