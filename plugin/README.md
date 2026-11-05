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

Only when you enable [Signature](#signature-opt-in), it also runs `git rev-parse --show-toplevel`, `git config --get remote.origin.url` and `git ls-files`, to know which repository and stack a session belongs to.

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

**It writes nothing else, unless you enable Signature**: then it writes only under `~/.claude/podium/` (or `$CLAUDE_CONFIG_DIR/podium/`): your settings choices and the journal of recorded signals (see [Signature](#signature-opt-in)). The plugin cannot delete files, so `erase` empties them; you can delete the folder by hand.

**Nothing leaves the machine**: no network access, no telemetry. Podium has no server. If you enable learning, masked excerpts of your own sessions and of commits authored with your email address are sent to Claude through your own session and plan, as the opt-in screen says and [Signature](#what-is-sent-to-claude) lists; nothing goes anywhere else.

**Events it hooks.** The panel only observes Claude Code: it never changes, blocks or answers anything but its own two commands.

| Event | What Podium does |
|---|---|
| `session.start` | registers `/podium` and `/podium-stage`, loads the project's `.claude/`, opens the panel |
| `command.run` for `/podium` and `/podium-stage` only | answers its own commands; other commands are not touched |
| `tool.call`, `agent.spawn`, `turn.complete`, `prompt.submit` | records what happened to draw the flow, then passes the event on unchanged; with Signature enabled, also notes the masked decisions it lists below |
| `session.end` | with Signature enabled, writes the signals of the session to the journal, then passes the event on unchanged |
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

`/podium-stage [flow|delivery|history|context|tools|signature]` opens the panel; keys `1` to `6` switch views when it has focus.

The panel opens by itself only in a project that has a `.claude/podium.json` (after `/podium`). Anywhere else it stays closed until you run `/podium-stage`, so installing the plugin for every project adds nothing to repositories that do not use it. Closing it keeps it closed for the session.

1. **Flow**: phase strip, a pixel-art office where the orchestrator sits at its desk and each subagent works as a colleague at a desk of its own (outfit in the colour of its role, a role prop, typing while it works, a thumbs up when it is done), wired to a network switch on the rug by pixel-art cables (one port LED per colleague; dotted grey when idle, in the role colour with data packets when active, flashing on a tool call; they unroll when a colleague arrives and unplug when it leaves); what blocks (a failing verification with its error excerpt, a failed review, broken rules), running and finished agents, delivery state.
2. **Delivery**: ready-to-deliver verdict and ordered to-do list, verification steps, reviews and findings, broken rules (`h` explains, `x` clears), commits per layer, branches of the work item.
3. **History**: filtered journal, or swimlanes with replay.
4. **Context**: branch and base, warnings, time spent on the work item, tokens per model.
5. **Tools**: the next recommended step with the project command that does it, then every command of the session grouped by project, plugins and MCP, each with its role; clicking one puts it in the prompt. Also the project's agents with their model and phase.

6. **Signature** (opt-in, off by default): see [Signature](#signature-opt-in).

Other arguments: `accessory [name|list]` (the avatar wears a random accessory each session, among 41), `quad|half|auto`, `fps <10-60>`, `recap`, `notify on|off`, `reset`, `disco`.

The panel only observes: it never blocks or changes a tool call.

### Effects

The scene reacts to the work: rain on the office window under a grey sky while verification fails, a rainbow outside when it turns green, a sky that follows the time of day, and seasonal and event decor (indoors and behind the glass).

## Signature (opt-in)

Signature lets Podium learn how you decide, build and care about security, from your sessions and from your own commits. It is **off by default**: until you choose, nothing is recorded.

While you have not chosen, a new interactive session introduces it at most once every 24 hours: if the panel is open it switches to the **Signature** tab (key `6`) and shows the opt-in screen, otherwise a toast says "Podium can learn how you work. Open /podium-stage signature to choose." You can open the tab yourself at any time with `/podium-stage signature`. The screen says what is recorded, what never is, where it is stored and what is sent to Claude, and gives one switch per capability:

- learn from my sessions;
- read the history of the repositories I open;
- learn in the background when idle;
- bring my profile into every session.

Choose **Enable**, **Not now** (it does not introduce itself again for 7 days) or **Never ask** (`/podium-stage signature on` changes your mind later).

### What is recorded

From interactive sessions in a folder that is not excluded, once you enable it:

- your prompts, masked, cut to their first 400 characters (for a slash command, only its arguments), with their length and language (French, English or other), and whether they look like a correction or follow an interruption;
- your answers to Claude's questions: the question and its options, the one you chose or your own words, masked;
- plans you accept or refuse: an excerpt of the plan (first 1500 characters, masked), your feedback (masked) and whether you edited it;
- interruptions;
- Claude's last reply, masked and cut to 600 characters, only when your next prompt corrects it or follows an interruption;
- which subagent types and models are used;
- the project the session belongs to: its folder name, a short hash of its git remote (not the remote itself) and up to three main stack tags.

Masking replaces secrets before anything is written: private keys, tokens and API keys, passwords and secret values, credentials in URLs, email addresses, your home folder path, and long opaque blobs.

### What is never recorded

File contents, tool outputs, diffs, shell command lines (only the slash command name is kept), images and attachments, the prompts of subagents, and Claude's own replies. The exceptions, all masked: the questions it asks you, the plans you accept or refuse, and its last reply, cut to 600 characters, only when your next prompt corrects it or follows an interruption. Sessions started without a terminal conversation (`claude -p`, SDK runs) are never recorded. Nothing is recorded while Signature is paused or declined.

### How it learns

Recording is only the first step. Podium then asks Claude to summarise what it recorded into a profile: traits grouped by lens (security, architecture, robustness, testing, git, developer experience, product), each with a confidence, plus the concrete cases behind them.

- **When:** with *learn in the background when idle* on (the default switch), after about 10 minutes without activity, when there is enough new material (20 or more new signals, or a repository whose history is not read yet). `/podium-stage signature learn-now` runs it at once.
- **Through your own session:** the requests go to Claude through your Claude Code session and your plan, with the model `sonnet` by default. Podium has no server and sends nothing anywhere else.
- **Budget:** by default at most 2 background runs and 300,000 tokens a day, and at most 120,000 tokens in one run. After a failed run it waits 1 hour, then 4, then 24 before trying again in the background. `learn-now` and `rebuild` skip the runs-per-day limit and the wait, but not the daily token limit. The `learning` block of `settings.json` (`runsPerDay`, `tokensPerDay`, `idleMinutes`, `model`) holds these values.
- **Notification:** when a run finds something new and notifications are on (`/podium-stage notify on`), a toast says "Signature learned N new things about how you work."
- **Stopping:** `pause`, `off`, `Never ask` and `erase` stop learning, in every Claude Code window: each run re-reads your choice before every request, so nothing more is sent. They also stop precedents, hints and recall. `erase` is refused while a run is in progress ("A learning run is in progress; try again in a moment."); try again when it ends.

### What is sent to Claude

Only while learning runs, only masked, and nothing beyond this list:

- **Session episodes:** the masked signals recorded in your journal (prompts, answers to questions, plans, interruptions), grouped into short episodes.
- **Excerpts of commits authored with your email address** (when you chose *read the history of the repositories I open*): for each selected commit, its subject and message body (masked, shortened), up to six changed file paths with line counts, and a masked, shortened excerpt of the diff. Only commits whose author email matches one of your identities are read (anyone can author a commit with your address, so this is a match on the email, not proof it is you). The identities come from `identities` in `settings.json`, or else from `git config user.email` of the repository. Without an identity the repository is skipped and the tab shows "(no identity)". Merge commits are not read.
- **Left out of commits:** files that look like keys, credentials or environment files, lock files, minified, generated or vendored files and binaries. Secrets in the text that is sent are masked, and the repository's own diff converters are not run (`--no-textconv`).

Podium reads history only from the repository of the current session and from the ones you add with `/podium-stage learn <path>`, and skips excluded folders and folders with a `.podium-private` file. It runs only read-only git commands for this.

### How it brings your profile to Claude

Once Signature is on and has learned something, it uses the profile in every interactive session, in any project that is not excluded. This is controlled by four settings under `apply` in `settings.json` (`section`, `context`, `hints`, `proxy`); the opt-in screen's switch "Bring my profile into every session" sets all four together.

- **A profile section in the system prompt** (`apply.section`): a short block, at most 2,500 characters, titled "How this developer works (Podium Signature)". It has one line per lens (security, architecture, robustness, testing, git, developer experience, product) with only the traits you kept (**Keep** in the Signature tab) that apply to the project's stack, then your blind spots. Observed traits stay in the tab's **To review** list until you keep them; while none is kept, the tab says "Keep traits to bring them into your sessions." It states that the project's `CLAUDE.md`, rules and manifest override it and that it never lowers a safety measure. It is read once when a session starts (and after `/clear`) and does not change during the conversation.
- **Precedents with your prompts** (`apply.context`): when your prompt resembles past decisions, Podium attaches up to three of them, taken from what it learned in the current project, plus global or stack-wide ones, never from another project, (and at most two blind-spot reminders) to the prompt as extra context, under "Developer precedents (Podium Signature; project instructions override these)". You do not see them in the conversation; Claude does. Only prompts you type yourself get precedents: not slash commands, prompts starting with `!`, or automatic messages.
- **A hint under Claude's questions** (`apply.hints`): when Claude asks you a question with options and the profile has a clear precedent, a line says `Signature: you usually choose "<option>"`. It never answers for you. Once at least 10 questions were predicted, the tab shows a **Fidelity** figure: the share of your choices that matched the hint.
- **A `recall` tool** (`apply.section` or `apply.proxy`): Claude can ask for your past decisions on a situation (`mcp__podium__recall`) before a choice with real alternatives. It returns up to 20 cases, each with its evidence count, and only reads what Signature stored.
- **The `developer-proxy` agent** (`apply.proxy`, `podium:developer-proxy`): a read-only agent that stands in for you. Ask Claude to run it before you validate a plan, before a decision with real alternatives, or as an extra reviewer. It checks each decision against your cases and answers with a verdict (would accept, would adjust, would refuse), the cases it relies on, your blind spots the plan does not cover, and the decisions with no precedent. It never invents a preference without a case.

Anything that looks like markup, code, links, shell commands or text addressed to a model stays stored but is never brought into a session.

Precedents, hints and the recall tool only run while Signature is on and the folder is not excluded. `pause` and `off` stop them at once; the profile section is removed from the next session or after `/clear`, because it is fixed for the conversation.

### The Signature tab

Once enabled the tab shows: the learning status (on, learning with its step, or paused, with the last run and the next one), the profile counts (traits, how many you confirmed, cases, new ones), what was recorded this session, the tokens used today, the fidelity of the hints once there are enough, the storage, the repositories with their state, one line per lens with a strength bar and its blind spot, and a **To review** list.

- **To review:** new traits wait for you, five at a time. **Keep** confirms a trait and brings it into your sessions; **Not me** rejects it.
- **Buttons:** **Pause** / **Resume**, **Learn now**, **Learn from another repository...** (fills your prompt with `/podium-stage learn `) and **Erase...**.

### Where it is stored

On your machine, under `~/.claude/podium/` (or `$CLAUDE_CONFIG_DIR/podium/`): your choices in `settings.json`, one journal file per session in `journal/`, and what was learned (profile, cases, index, learning state). Nothing is written into your projects, and Signature refuses to write through a symbolic link that would lead outside that folder. The files get your system's default permissions; on a computer shared with other accounts, restrict the folder (for example `chmod 700 ~/.claude/podium`).

### Keep a folder out

- Add an empty `.podium-private` file to a folder. Podium looks for it in the session's folder and in each parent up to the git root (only in the session's folder when it is not in a git repository).
- Or run `/podium-stage signature exclude <folder>`; `include <folder>` undoes it. The folder must be an absolute path or start with `~` (for example `~/clients`); a relative path is refused. It can be a pattern (`*` inside a folder name, `**` across folders).

The tab says when the current folder is excluded and why. An exclusion saved in `settings.json` that is not an absolute path is ignored, and the tab lists it.

### Pause, erase

- `/podium-stage signature pause` stops recording and keeps what is stored; `resume` starts again. Once enabled, the tab also has **Pause** / **Resume** and **Erase…** buttons, and shows what was recorded this session and how much is stored.
- `/podium-stage signature erase` empties everything Signature stored, including your settings, and sets your choice to declined. It asks you to repeat the same command (or press **Erase…** again) within 30 seconds. The plugin cannot delete files, so the files stay as empty files; delete the `podium` folder by hand to remove them.

### Commands

| Command | Effect |
| --- | --- |
| `/podium-stage signature` | open the Signature tab |
| `/podium-stage signature on` / `off` | enable with the switches as set on the tab, or decline (off) |
| `/podium-stage signature pause` / `resume` | stop or restart recording, data kept |
| `/podium-stage signature exclude <folder>` / `include <folder>` | never record in a folder (absolute or `~` path), or lift that |
| `/podium-stage signature learn-now` | learn now from what was recorded and from the history |
| `/podium-stage learn <path>` | also learn from the history of another local repository (a folder, not a URL; the current repository is refused, it is read automatically) |
| `/podium-stage signature rebuild` | rebuild the index and the profile |
| `/podium-stage signature forget <trait id>` / `forget #<case number>` | reject a trait or a case |
| `/podium-stage signature erase` | empty everything stored (repeat to confirm; refused while learning runs) |

These commands, and `on`, `off`, `pause`, `resume`, `exclude` and `include`, only run when you type them yourself: if Claude tries one, the answer is "Run this command yourself."

See [PRIVACY.md](https://github.com/Jpi-net/podium/blob/main/PRIVACY.md) for the full policy.

## Develop

See [CONTRIBUTING.md](https://github.com/Jpi-net/podium/blob/main/CONTRIBUTING.md).

```bash
claude --plugin-dir . --debug    # run with the plugin loaded from the clone
claude plugin validate .
claude plugin test .
```

## License

[MIT](https://github.com/Jpi-net/podium/blob/main/LICENSE)
