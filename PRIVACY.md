# Privacy policy

Last updated: 2 November 2026

Podium is an open-source Claude Code plugin published by Julien Pierlot. This policy describes what the plugin does with data.

## What Podium collects

Nothing. Podium has no server, no account, no analytics and no telemetry. It never sends data off your machine, and its author receives nothing from it.

## What Podium reads and stores on your machine

Everything below stays on your computer.

- **The `/podium-stage` panel** reads the session events that Claude Code gives plugins (tool calls, subagents, prompts, turn results) to draw the flow, your project's `.claude/` folder, and the output of read-only `git` commands and `uname -m`. It stores its own settings (frame rate, notifications, avatar accessory, time spent per work item) in Claude Code's local plugin store.
- **The `/podium:setup` skill** reads your repository to propose a setup, and writes only `.claude/`, optionally `CLAUDE.md` and `.git/info/exclude`, after you validate its proposal.
- **The hooks it generates** run locally in your project. The only command that may reach a network is the work-item command you configure yourself (for example `gh issue view {id}`, which uses your own GitHub CLI login); its output is cached in your repository's `.git/podium-work-items` folder.

The exact list of commands, files and settings is in the plugin's [README, "Permissions and data"](https://github.com/Jpi-net/podium/blob/main/plugin/README.md#permissions-and-data).

## Claude and Anthropic

Podium runs inside Claude Code. What Claude Code and Anthropic do with your conversations is governed by Anthropic's own terms and privacy policy, not by this plugin.

## Contact

Questions or concerns: open an issue at https://github.com/Jpi-net/podium/issues, or follow [SECURITY.md](SECURITY.md) to report a vulnerability privately.
