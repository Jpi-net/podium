---
paths:
  - "README.md"
  - "CHANGELOG.md"
  - "CONTRIBUTING.md"
  - "SECURITY.md"
  - ".claude-plugin/**"
  - ".github/**"
  - "assets/**"
---
# Docs, release, plugin manifests and CI

## Structure
- `README.md`: what `/maestro` and `/maestro-stage` do, for users. `CONTRIBUTING.md`: develop, checks, layout table, conventions. `SECURITY.md`: reporting. All owned by doc-writer.
- `CHANGELOG.md`: Keep a Changelog 1.1.0 + SemVer. `## [Unreleased]` on top, then `## [x.y.z] - YYYY-MM-DD`, sections `### Added`, `### Changed`, `### Fixed`, `### Removed`, link refs at the bottom.
- `assets/icon.png`: 1024x1024 pixel art, referenced by `plugin.json` (`"icon"`).
- `.claude-plugin/plugin.json`: name, `version` (single source of the version), description, author, `icon`, `types` (`./types/index.d.ts`). `.claude-plugin/marketplace.json`: makes the repository installable as a marketplace (no version field). `.claude-plugin/types/` is engine output, gitignored, never edited. Owned by devops.
- `.github/workflows/ci.yml` (one `check` job, `contents: read`, Node 22, installs `@anthropic-ai/claude-code`), `.github/pull_request_template.md`, `.github/ISSUE_TEMPLATE/` (`bug_report.yml`, `feature_request.yml`, `config.yml`). Owned by devops.

## Conventions
- User-facing text is English, written for the user of the plugin: what they see, not how the code does it (see the `[Unreleased]` entries).
- README and CHANGELOG `[Unreleased]` are updated in the same change whenever behaviour, commands, the panel or manifest keys change.
- CI runs exactly the commands below with the same flags; CONTRIBUTING lists the same checks. Change them together.
- Never document a command that is not in this file or in CI.

## Release
1. Bump `version` in `.claude-plugin/plugin.json` (SemVer).
2. Move `[Unreleased]` to `## [x.y.z] - YYYY-MM-DD` in `CHANGELOG.md`, open a new empty `[Unreleased]`, update the link refs.
3. Run `claude plugin validate . --profile directory --strict` and `claude plugin test .`.
4. Commit `Release x.y.z`, tag `vx.y.z`, push `main` and the tag.
5. `gh release create vx.y.z` with the changelog section as notes.
Never move a published tag.

## Commands (from the repository root)
```bash
claude plugin validate .
claude plugin validate . --profile directory --strict
claude plugin test .
for f in skills/setup/templates/hooks/*.mjs; do node --check "$f"; done
```

## Pitfalls
- A broken `icon` or `types` path in `plugin.json` fails `claude plugin validate .`.
- The Anthropic plugin directory checks (`--profile directory --strict`) are not run by CI: run them before every release.
