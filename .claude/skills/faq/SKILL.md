---
name: faq
description: Answers a question about podium (how /podium generates a setup, a template or placeholder, a generated hook, the panel module, the manifest, why it works this way) with a structured, sourced answer. Read-only. Use when the user types /faq or asks how, why or where something works without asking for a change.
argument-hint: "<question>"
---

# /faq: sourced answer

Read-only. Answer in the user's language.

1. Documentation first: `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `plugin/skills/setup/SKILL.md`, `plugin/skills/setup/references/*.md` (vision, manifest), `plugin/skills/setup/templates/README.md`, `.claude/rules/`.
2. Then the code: locate the entry point and follow it (`plugin/hooks/register.tsx` for the panel, `plugin/skills/setup/templates/hooks/lib.mjs` for the generated hooks); for a broad question, launch 2-3 `Explore` agents in parallel (`effort: "lower"`), one per area (`plugin/hooks/`, `plugin/skills/setup/`, `plugin/tests/`).
3. History when "why" matters: `git log -S`, `git blame`, the CHANGELOG entry and the commit that introduced it.

Answer format:
```
## Short answer       (2-4 lines)
## Details            (how it works, step by step)
## Sources            (file:line, doc pages, commits)
## Caveats            (what you could not verify)
```
Never present a guess as a fact: say what is verified and what is inferred.
