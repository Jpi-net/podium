# Contributing

Thanks for helping. Issues and pull requests are welcome.

## Develop

Run Claude Code with the plugin loaded from your clone; it reloads when a file changes:

```bash
claude --plugin-dir /path/to/maestro --debug
```

Before opening a pull request:

```bash
claude plugin validate .
claude plugin test .
```

Type-checking: once the engine has loaded the plugin, it writes `.claude-plugin/types/` (ignored by git), and `tsc -p .` checks the hooks against the exact API of your Claude Code version.

## Layout

| Path | What it holds |
| --- | --- |
| `.claude-plugin/plugin.json` | Plugin manifest |
| `.claude-plugin/marketplace.json` | Makes the repository installable as a marketplace |
| `hooks/register.tsx` | Entry point: commands, event hooks, the `/maestro-stage` panel |
| `hooks/project.ts`, `hooks/rules.ts` | Reading `.claude/maestro.json` and the project's `.claude/`, rule checks |
| `hooks/scene.ts`, `canvas.ts`, `sprite.ts`, `font.ts`, ... | The pixel-art scene drawn in the panel |
| `skills/setup/` | The `/maestro` skill: `SKILL.md`, `references/`, `templates/` |
| `types/index.d.ts` | The contract of the values kept in session state |
| `tests/` | Tests run by `claude plugin test` |

## Conventions

- TypeScript, two-space indent, LF; code lives in classes with static members.
- Every change ships with a test.
- User-facing text is English.
- Commits: short imperative subject (`Add the gradle toolchain to verification guesses`).
