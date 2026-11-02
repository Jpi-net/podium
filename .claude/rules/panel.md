---
paths:
  - "hooks/**"
  - "types/**"
---
# Panel (TypeScript hooks module run by the Claude Code plugin engine)

## Stack
- TypeScript loaded directly by the Claude Code plugin engine: no package.json, no build step, no npm dependency. `hooks/hooks.json` lists the module (`./register.tsx`).
- No Node and no DOM at runtime: everything outside the module goes through `$` (`$.process.run`, `$.fs`, `$.ui`, `$.state`, `$.store`, `$.clock`). JSX compiles against the global `h`; elements come from `$.ui.resolve(e)`.
- `tsconfig.json` extends `./.claude-plugin/types/tsconfig.json`, written by the engine on load (gitignored, never edited).

## Structure
- `hooks/register.tsx`: entry point; commands, event hooks (`tool.call`, `prompt.submit`, `agent.spawn`…), the `/maestro-stage` panel. Internal classes `Runtime` (state, `Runtime.io` wrapping `$`, `Runtime.graphCache`), `Flow`, `View`, `Recap`.
- `hooks/project.ts`: the `Manifest` type and reading of `.claude/maestro.json` and the project's `.claude/`; `hooks/rules.ts`: rule checks.
- Scene: `hooks/scene.ts` composes `office.ts`, `colleagues.ts`, `robots.ts`, `weather.ts`, `night.ts`, `festive.ts`, `hats.ts`, `accessories.ts`, `effects.ts`, `avatar.ts` on a `Canvas` (`canvas.ts`), with `Raster`/`Sprite`/`Motion` (`sprite.ts`), `font.ts`, `theme.ts`.
- `types/index.d.ts`: exported flow types and `declare module 'claude-code' { interface PluginState { … } }`. Every `$.state` key is declared there; `claude plugin validate .` checks it.
- Dependency direction: `register.tsx` imports the scene and project modules; scene modules never import `register.tsx` and never touch `$`.

## Conventions
- One exported class per file, static members only, no free functions. Small exported `type` aliases above the class (`export type Room = {…}` in `office.ts`).
- Constants `private static readonly UPPER_CASE` (palettes as `Rgb` tuples, `readonly Rgb[]`); public sizes `static readonly` (`Colleagues.WIDTH`); booleans prefixed `is` (`isMe`, `isError`).
- Two-space indent, LF, no semicolons, single quotes, relative imports without extension, inline `type` imports: `import { Canvas, type Rgb } from './canvas'`.
- Errors: hooks fail open. A hook that throws is skipped by the engine; nothing may throw out of a gating hook before `next(e)`. Fire-and-forget promises end with `.catch(() => undefined)` (`Runtime.queue`, `Runtime.io.notify` in `register.tsx`); fallbacks use `try/catch` returning a default.
- `$.process.run` only with argv arrays and read-only git commands; `$.fs` reads only.
- Pixel art: `Raster`/`Sprite` or `canvas.block` aligned to quad pixels (0.5 unit wide, 1 unit tall; 1 unit = 1 terminal column; canvas height = rows * 2). Shade with `Canvas.scale(color, light)`.
- Render path: no allocation-heavy loops per frame; invalidate `Runtime.graphCache` when its inputs change.
- User-facing text is English.
- Zero comments in new code, except the allowed markers: `// Arrange`, `// Act`, `// Assert` markers in tests.

## Reference implementations
- `hooks/office.ts`: a drawing class (palette constants, `room` returning a typed layout, `back`/`desk` drawing with a light factor).
- `hooks/colleagues.ts`: sprites, deterministic looks from a seed, union types for variants.
- `hooks/rules.ts`: rule checks over the project's files.

## Tests
- Every change ships with a test in `tests/<module>.test.ts` (render tests through `register.tsx` in `.test.tsx`), owned by test-expert; see `tests.md`.
- To preview a scene, temporarily capture the canvas buffer in a scratch test; never commit it.

## Commands (from the repository root)
```bash
claude plugin validate .
claude plugin test .
claude --plugin-dir . --debug
```

## Pitfalls
- A `$.state` key not declared in `types/index.d.ts` fails `claude plugin validate .`.
- A throw in a `tool.call` or `prompt.submit` hook would block the user's session if not caught before `next(e)`.
- Half-unit coordinates are valid only on the quad grid; misaligned blocks blur the sprite.
