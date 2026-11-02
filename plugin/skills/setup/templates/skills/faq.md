---
name: {{CMD_FAQ}}
description: Answers a question about the project (business rule, architecture, flow, where something lives, why it works this way) with a structured, sourced answer. Read-only. Use when the user types /{{CMD_FAQ}} or asks how, why or where something works without asking for a change.
argument-hint: "<question>"
---

# /{{CMD_FAQ}}: sourced answer

Read-only. Answer in {{CONVERSATION_LANGUAGE}}.

1. Documentation first: `docs/`, ADRs, READMEs, `.claude/rules/`.
2. Then the code: locate the entry point and follow it; for a broad question, launch 2-3 `Explore` agents in parallel (`effort: "lower"`), one per area.
3. History when "why" matters: `git log -S`, `git blame`, the PR or commit that introduced it.

Answer format:
```
## Short answer       (2-4 lines)
## Details            (how it works, step by step)
## Sources            (file:line, doc pages, commits)
## Caveats            (what you could not verify)
```
Never present a guess as a fact: say what is verified and what is inferred.
