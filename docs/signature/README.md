# Signature: Podium learns how the developer works

Status: design, accepted for implementation. Engine reference: Claude Code plugin engine build 2.1.318 (`claude-code` types); every engine capability named in these documents was checked against that build's declarations.

## The idea

Code is cheap now. What a developer brings is judgment: how they prompt, which option they pick when Claude offers several, how they shape an architecture, how much attention they pay to security and where, how they choose a stack. Signature captures that judgment on the developer's own machine, distils it into a profile and a base of decision cases, and brings it to every project they open, so that Claude plans, proposes and decides the way they would.

Podium already configures a project (`.claude/`, `podium.json`: the score). Signature configures the developer (`~/.claude/podium/`: the conductor's signature).

## Documents

| File | Content |
|---|---|
| [principles.md](principles.md) | The decisions that shape everything else (ADR style), with the alternatives rejected |
| [architecture.md](architecture.md) | Components, data flow, engine capabilities used, module layout, ports |
| [data-model.md](data-model.md) | Directory layout, every file's schema, the base vocabulary, size budgets, versioning |
| [capture.md](capture.md) | Signals recorded from sessions, how each is extracted, redaction, exclusions |
| [learning.md](learning.md) | Background distillation, repository history research, profile synthesis, budgets, locks, rebuild |
| [retrieval.md](retrieval.md) | Tags, scoring, fast and deep paths, the `recall` tool |
| [application.md](application.md) | How the profile reaches Claude: system prompt section, prompt context, proxy agent, question hints, `/podium` |
| [panel.md](panel.md) | Opt-in screen, Signature tab, commands |
| [privacy-security.md](privacy-security.md) | Threat model, consent, what leaves the machine, rule changes, review checklist |
| [roadmap.md](roadmap.md) | Phases, file partitions, tests, commits, acceptance criteria, risks |

## Glossary

| Term | Meaning |
|---|---|
| Signal | One raw event recorded from a session (a prompt, an answer to a question, a plan accepted or refused, an interruption) |
| Journal | The append-only files of signals, per session, purged once distilled |
| Case | One decision: situation, options, choice, reason, tags, evidence. The durable asset |
| Trait | One statement of the profile ("validates input at boundaries"), derived from cases |
| Lens | A domain of attention: security, architecture, testing, performance, git, dx, product |
| Blind spot | A lens or concept the developer consistently does not look at; reminded, never copied |
| Vocabulary | The controlled list of tags, with facets, aliases, parents and path patterns |
| Fast path | Retrieval in code only, at each prompt, without a model call |
| Deep path | Retrieval where Claude tags the situation and reranks the candidates (proxy agent, `recall` tool) |
| Fidelity | Share of the developer's answers that Signature predicted correctly |

## What the developer does

1. Updates Podium. The panel shows the opt-in screen once.
2. Chooses what to enable. Everything else is automatic.
3. Optionally reviews new traits in the Signature tab (never blocking).
4. Optionally types `/podium-stage learn <path>` (or presses the panel button that fills it) to learn from another repository. This is the only manual learning action.
