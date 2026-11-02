# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- The panel's orchestrator now sits at a desk in an office: the sky shows through a window with curtains, above a panelled wall and a parquet floor with a plant, a bookcase and a rug; the desk lamp lights up in the evening and at night.
- New icon: the orchestrator wired to its sub-agents.
- The empty-flow hint reads "Waiting for agents…".

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

[Unreleased]: https://github.com/Jpi-net/maestro/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/Jpi-net/maestro/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/Jpi-net/maestro/releases/tag/v0.1.0
