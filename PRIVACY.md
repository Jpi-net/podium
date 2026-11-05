# Privacy policy

Last updated: 5 November 2026

Podium is an open-source Claude Code plugin published by Julien Pierlot. This policy describes what the plugin does with data.

## What Podium collects

Nothing. Podium has no server, no account, no analytics and no telemetry. It never sends data off your machine, and its author receives nothing from it.

## What Podium reads and stores on your machine

Everything below stays on your computer.

- **The `/podium-stage` panel** reads the session events that Claude Code gives plugins (tool calls, subagents, prompts, turn results) to draw the flow, your project's `.claude/` folder, and the output of read-only `git` commands and `uname -m`. It stores its own settings (frame rate, notifications, avatar accessory, time spent per work item) in Claude Code's local plugin store.
- **The `/podium:setup` skill** reads your repository to propose a setup, and writes only `.claude/`, optionally `CLAUDE.md` and `.git/info/exclude`, after you validate its proposal.
- **The hooks it generates** run locally in your project. The only command that may reach a network is the work-item command you configure yourself (for example `gh issue view {id}`, which uses your own GitHub CLI login); its output is cached in your repository's `.git/podium-work-items` folder.

The exact list of commands, files and settings is in the plugin's [README, "Permissions and data"](https://github.com/Jpi-net/podium/blob/main/plugin/README.md#permissions-and-data).

## Signature (opt-in)

Signature is off by default. Until you enable it on the opt-in screen (`/podium-stage signature`), nothing below happens.

- **What is recorded** from your interactive Claude Code sessions: your prompts (masked and shortened), your answers to Claude's questions, plans you accept or refuse, interruptions, the subagent types and models used, and the project of the session (its folder name, a short hash of its git remote and up to three stack tags).
- **Masked before writing**: private keys, tokens and API keys, passwords and secret values, credentials in URLs, email addresses, your home folder path and long opaque blobs.
- **Never recorded**: file contents, tool outputs, diffs, shell command lines, images and attachments, subagent prompts, Claude's own replies (the exceptions, all masked: the questions it asks you, the plans you accept or refuse, and its last reply cut to 600 characters, only when your next prompt corrects it or follows an interruption). Sessions run without a conversation (`claude -p`, SDK) are never recorded.
- **Stored** only on your machine, under `~/.claude/podium/` (or `$CLAUDE_CONFIG_DIR/podium/`). Nothing is written into your projects. The files get your system's default permissions; on a computer shared with other accounts, restrict the folder (for example `chmod 700 ~/.claude/podium`).
- **Excluded** folders: add a `.podium-private` file to a folder (looked for up to the git root), or run `/podium-stage signature exclude <folder>`. Nothing is recorded there.
- **Paused or erased**: `/podium-stage signature pause` stops recording; `/podium-stage signature erase` empties everything stored. The plugin cannot delete files, so erase leaves empty files; delete the folder by hand to remove them.
- **Sent**: Podium sends nothing to its author or to any Podium server. When learning is enabled (the "learn in the background" switch, or `/podium-stage signature learn-now`), masked excerpts are sent to Claude through your own Claude Code session, billed to your own plan and capped (by default 2 background runs and 300,000 tokens a day), like any other request in that session. What is sent: masked episodes from your recorded sessions and, if you chose to read history, excerpts of commits authored with your email address only (subject, message, a few file paths and a shortened diff, masked; files that look like keys, credentials, environment files, lock files, generated files and binaries are left out, and the repository's own diff converters are not run). Pause, off or erase in any Claude Code window stop learning in every window, because each run re-reads your choice before every request.
- **Applied to your sessions**: when Signature has learned a profile, a short profile section, the precedents that match a prompt and the answers of the `recall` tool and of the `developer-proxy` agent become part of the conversation sent to Claude, like a `CLAUDE.md` file, through your own Claude Code session. They are built from what is stored on your machine, and nothing else leaves it. Pause or off stops precedents and recall at once, and the profile section from the next session or after `/clear`.

## Claude and Anthropic

Podium runs inside Claude Code. What Claude Code and Anthropic do with your conversations is governed by Anthropic's own terms and privacy policy, not by this plugin.

## Contact

Questions or concerns: open an issue at https://github.com/Jpi-net/podium/issues, or follow [SECURITY.md](SECURITY.md) to report a vulnerability privately.
