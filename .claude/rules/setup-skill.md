---
paths:
  - "plugin/skills/**"
---
# Setup skill (Markdown instructions and templates, Node ESM hook templates)

## Stack
- `plugin/skills/setup/SKILL.md` and `plugin/skills/setup/references/*.md`: the instructions of `/maestro` (`audit.md`, `catalog.md`, `genesis.md`, `manifest.md`, `merge.md`, `vision.md`).
- `plugin/skills/setup/templates/**`: Markdown templates instantiated into other repositories (`CLAUDE.md`, `agents/`, `plugin/skills/`, `rules/`, `settings.json.tmpl`, `gitignore.tmpl`, `review-learnings.md`).
- `plugin/skills/setup/templates/hooks/*.mjs`: Node 18+ ESM using only `node:` builtins, copied as is into `.claude/hooks/` of the target repository; `FALLBACK.md` for machines without Node.

## Structure
- `templates/README.md` is the contract of the templates: instantiation rules, the placeholder table, the conditional block table, template → target mapping. Every placeholder (UPPER_CASE between double braces) and every `#IF_X` / `/IF_X` block used in a template is documented there.
- `references/manifest.md` mirrors the `Manifest` type in `plugin/hooks/project.ts` (the source of truth, owned by panel-expert); a key changes in both.
- `references/vision.md`: the principles every generated file serves.
- `templates/hooks/lib.mjs`: shared exported functions (`readInput`, `projectDir`, `manifest`, `setting`, `pattern`, `deny`, `feedback`, `addContext`, git helpers); each hook imports from `./lib.mjs`.

## Conventions
- Templates: conditional markers stand on their own lines; a placeholder without value removes its line; lists are renumbered when a block is dropped. Double-brace text that is not UPPER_CASE (Angular, Vue, Jinja examples) is content.
- Templates work on any stack and OS: Windows and no-Node alternatives, no bash-only steps, no stack-specific assumption outside the language examples in `templates/rules/` (`typescript.md`, `dotnet.md`, `python.md`, `go.md`, `java.md`, `rust.md`, `php.md`, `ruby.md`, `swift.md`, `cpp.md`).
- Hook templates: 4-space indent, semicolons, single quotes, plain exported functions (no classes), configuration read from `.claude/maestro.json` through `setting('hooks.x', fallback)`.
- Hooks fail open: stdin or manifest parse errors fall back to `{}`; manifest regexes compile through `pattern()` (try/catch, `null` on error); refuse with `deny(reason)` (JSON `permissionDecision: 'deny'`, exit 0), give feedback with `feedback(message)` (exit 2), never by crashing.
- No network access and no data sent off the machine, except the user-configured `hooks.workItemCommand`.
- `post-edit.mjs` rewrites a file only to restore its BOM and line endings.
- User-facing text is English.
- Zero comments in new code, except the allowed markers: `// Arrange`, `// Act`, `// Assert` markers in tests.

## Reference implementations
- `plugin/skills/setup/templates/hooks/lib.mjs`: fail-open input and manifest reading, `pattern`, `deny`.
- `plugin/skills/setup/templates/hooks/guard-bash.mjs`: rules as `[regex, reason]` pairs applied per command segment, manifest overrides with built-in fallbacks.
- `plugin/skills/setup/templates/agents/layer-expert.md`: an agent template with placeholders and output contract.

## Tests
- Hook templates have no unit test runner: prove a change with `node --check` and by running the hook with sample stdin in the scratchpad (one allowed case, one refused case), for example `echo '{"tool_input":{"command":"git push --force"}}' | node plugin/skills/setup/templates/hooks/guard-bash.mjs`.
- A change to the manifest contract also needs a test in `plugin/tests/project.test.ts` (test-expert).

## Commands (from the repository root)
```bash
for f in plugin/skills/setup/templates/hooks/*.mjs; do node --check "$f"; done
claude plugin validate plugin
```

## Pitfalls
- A guard regex that matches quoted text or branch names blocks legitimate commands (fixed in 0.1.1: quoted `;`, `-n` in messages, `claude/fix-x` branches).
- A regex from the manifest with catastrophic backtracking hangs every tool call.
- A placeholder used in a template but missing from `templates/README.md` is left unresolved in generated setups.
