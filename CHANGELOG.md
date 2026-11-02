# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.3] - 2026-11-02

### Changed

- The published plugin now contains only the plugin itself (plugin/): the repository's development setup, CI and project files are no longer shipped to users.

## [0.1.2] - 2026-11-02

### Changed

- The panel's orchestrator now sits at a desk in an office: the sky shows through a window with curtains, above a panelled wall and a parquet floor with a plant, a bookcase and a rug; the desk lamp lights up in the evening and at night.
- Subagents are now office colleagues instead of robots: each sits at a desk in the room (front row by the main desk, then a back row against the window), wears the colour of its role with a role prop or headgear, types while it works and gives a thumbs up when it is done; a fork of the main thread looks like the orchestrator. Labels no longer overlap.
- Pixel-art network cables replace the blurry cables of the old robot scene: a switch on the rug in front of the orchestrator's desk has one port LED per colleague, and each colleague's cable runs along the floor in its own lane (or chains from its neighbour on short panels), never crossing another, and climbs the desk leg to the laptop. Idle agents get a dotted grey cable; active ones a two-tone cable in the role colour with data packets travelling to the colleague. A tool call flashes the cable and its socket LEDs in the tool colour and sends a packet back. The cable unrolls when a colleague arrives and unplugs and falls when it leaves. Parent-to-child agent links are cables too.
- The office has a real window: outdoor effects (sun, moon, clouds, leaves, petals, snow piling on the outer sill, hearts, fireworks, rockets) stay behind the glass. Rain runs down the glass under a grey sky (no more umbrella indoors) and a rainbow appears outside when a failed verification turns green. The day sky is bright blue, orange at dawn and sunset, starry at night.
- Indoor decor for events: Easter eggs on the rug, a lily-of-the-valley vase on May 1st, the national flag on the desk, frost on the window corners in winter, a black cat on the sill and a broken mirror on Friday the 13th, disco light spots and a mirror ball hanging from the ceiling. Party confetti stays behind the avatar.
- Colleagues keep their seat when another agent leaves, and a leaving colleague vanishes into the network switch.
- New icon: the orchestrator wired to its sub-agents.
- The empty-flow hint reads "Waiting for agents…".

### Fixed

- A passing run whose test names mention failures is no longer shown as failed.
- A failed review shows its most severe findings (for example "FAIL: 1 major").
- AI-mention alerts only flag real attribution in commit and PR text, like the generated hook.
- Quoting a verification command in a message no longer counts as running it, and `test:e2e` scripts map to the e2e step.
- A verification command denied by a hook leaves its step unchanged.
- Background verifications left running before a reload are marked stale.
- `/maestro-stage reset` clears everything.
- Layout on narrow panels, and labels no longer cover the avatar.

## [0.1.1] - 2026-11-02

### Changed

- The panel opens by itself only in projects that have a `.claude/maestro.json`; elsewhere it waits for `/maestro-stage`.
- The "no AI attribution" rule of `/maestro` is a neutral opt-in, off by default; Claude Code's attribution stays unless the user enables it.
- `/maestro` works across more stacks and systems: Windows and no-Node alternatives, rule examples for Rust, PHP, Ruby, Swift and C++, wider build-output exclusions.

### Fixed

- Generated guard hooks: quoted `;` or `-n` in a commit message, human `Co-authored-by` trailers, words like "LLM" and branches like `claude/fix-x` are no longer blocked; `rm -R` and `--recursive` are now caught; stray-file checks only look at untracked files; debug-statement checks only run on code files.

### Removed

- The `insurance` panel theme.

## [0.1.0] - 2026-11-02

### Added

- `/maestro` (`/maestro:setup`): builds, updates or audits a project's `.claude/` setup, from an empty repository (genesis) or an existing codebase (full).
- `/maestro-stage`: live side panel with five views (flow, delivery, history, context, tools), driven by `.claude/maestro.json`.
- Panel effects tied to verification, seasonal decor, 41 avatar accessories.

[Unreleased]: https://github.com/Jpi-net/maestro/compare/v0.1.3...HEAD
[0.1.3]: https://github.com/Jpi-net/maestro/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/Jpi-net/maestro/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/Jpi-net/maestro/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/Jpi-net/maestro/releases/tag/v0.1.0
