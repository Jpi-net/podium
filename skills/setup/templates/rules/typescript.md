---
paths:
  - "{{LAYER_PATHS}}"
---
# {{LAYER}} (TypeScript example: adapt every line to the repository)

## Stack
- TypeScript `strict: true` (read `tsconfig.json`: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` change how code is written).
- Package manager: the one of the lockfile (`pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, `bun.lockb`); never mix.

## Conventions
- `const` by default, `let` when reassigned, never `var`.
- No `any`; `unknown` plus narrowing at boundaries; explicit return types on exported functions.
- Imports: path aliases from `tsconfig.json`; no deep relative imports across modules.
- Async: `await` every promise or mark it intentionally ignored with `void`; no floating promises.
- Errors: typed error results or custom error classes as the code base does; never swallow errors.
- Framework rules (React, Angular, Vue, Node server…) come from the code base: components, state, data fetching, routing patterns.

## Tests
- Runner from `package.json` (`vitest`, `jest`, `node:test`); files `*.spec.ts` or `*.test.ts` next to the code or under `tests/`, as observed.
- One test: `npx vitest run path/to/file.spec.ts -t "name"` (adapt to the runner).

## Commands
```bash
{{LAYER_COMMANDS}}
```
Lint with auto-fix only when asked: `npx eslint --fix <files>`.
