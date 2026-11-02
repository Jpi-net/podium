---
paths:
  - "tests/**"
---
# Tests (claude-code/testing, run by `claude plugin test .`)

## Stack
- `claude-code/testing` (`test`, `expect`, `mock`), run by the Claude Code plugin engine through `claude plugin test .`. No other test library, no npm dependency.

## Structure
- `tests/<module>.test.ts` per module of `hooks/` (`office.test.ts`, `colleagues.test.ts`, `rules.test.ts`, `project.test.ts`…).
- `.test.tsx` for render and engine-event tests through `hooks/register.tsx` (`register.test.tsx`, `attach.test.tsx`).
- Shared data: the `Fixtures` class in `tests/fixtures/sample-project.ts` (`Fixtures.SAMPLE_PROJECT`, a full `Manifest`).
- Imports: relative to the subject (`import { Office } from '../hooks/office'`), `import { expect, test } from 'claude-code/testing'`, engine types as `import type { … } from 'claude-code'`.

## Conventions
- Titles are behaviour sentences: `room keeps the desk above the floor on a short canvas`, `a fork of the main thread looks like the orchestrator`.
- One behaviour per test, `// Arrange`, `// Act`, `// Assert` markers; omit `// Arrange` when there is nothing to arrange.
- Helpers live in a per-file fixture class with static methods (`OfficeFixture.brightness`, `ColleagueFixture.input`, `Engine.spawn` in `register.test.tsx`); no free helper functions.
- `as never` only to pass engine inputs in render tests.
- Same style as the code: two-space indent, no semicolons, single quotes.
- A fix starts with a test that fails for the expected reason (the assertion, not a type or setup error).
- Zero comments in new code, except the allowed markers: `// Arrange`, `// Act`, `// Assert` markers in tests.

## Reference implementations
- `tests/office.test.ts`: canvas tests with a fixture class and comparative assertions (brighter, dimmer, inside bounds).
- `tests/colleagues.test.ts`: determinism and variant tests with a fixture input builder.
- `tests/register.test.tsx`: engine stubs and render tests.

## Commands (from the repository root)
```bash
claude plugin test .
```

## Pitfalls
- A scene preview test (capturing the canvas buffer) is a scratch tool: never commit it.
- Pixel-exact assertions break on any palette tweak; assert relations (positions, brightness ordering, equality of two renders) as `tests/office.test.ts` does.
- No focused or skipped tests left behind.
