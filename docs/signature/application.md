# Application

How the profile reaches Claude, automatically, in every project, once Signature is enabled.

## 1. System prompt section (`apply.section`)

`on('prompt.compose')`: `const r = await next(e)`, then `{ sections: [...r.sections, SECTION] }` when the frozen text is not empty.

`SECTION = { id: 'podium:signature', scope: 'session', text }`, text built at `session.start` (and after `/clear`) by `Profile.section(profile, { stack, projectId }, hasRecall)` and never changed during the thread (see `architecture.md`: a changed section loses the prompt cache, and the engine keeps a thread's recorded prompt anyway). Consequence: pausing or declining stops the precedents, the hints and the recall tool at once, and removes the section from the next session or after `/clear`.

Content, at most 2,500 characters, English:

```
# How this developer works (Podium Signature)
Learned from their own sessions and commits. The project's CLAUDE.md, rules and manifest override everything here. Never lower a safety measure because of this profile.

Security: validates every value that crosses a boundary and falls back to a default; denies secrets by default.
Architecture: static classes, strict dependency direction, no build step when avoidable.
Git: imperative commit subjects without type prefix; no AI attribution.
Decisions: prefers fewer commands and automatic behaviour behind one explicit opt-in.
Working style: plans first and validates plans, not files; talks in French, writes everything on disk in English.

Blind spots to cover for them: input size limits; denial of service.

Use the recall tool (mcp__podium__recall) before a decision with real alternatives.
```

Selection: only traits with status `confirmed` (the developer kept them in the tab), not `defaultCovered`, whose statement is quotable and safe; scope global, or a stack or project scope whose stack matches the session's stack. Observed traits never enter the system prompt, whatever their confidence: a synthesis steered by stored text could otherwise attach an instruction-like statement to legitimate cases and reach every project unreviewed. They wait in the tab's review list; the tab says "Keep traits to bring them into your sessions." when none is kept yet; not `defaultCovered`; scope global, or a stack or project scope whose stack matches the session's stack (traits carry no project id, so a project-scoped trait is applied wherever the same stack is used); ordered by lens (fixed order: security, architecture, robustness, testing, git, dx, product, others), then confidence; one line per lens joining up to three statements; blind spots on their own line; cut at the limit on a line boundary.

## 2. Precedents with each prompt (`apply.context`)

See `retrieval.md`, Fast path. Attached as one `context` entry. Skipped for meta prompts, notifications, plugin prompts and prompts of an excluded session.

## 3. Hints under Claude's questions (`apply.hints`)

`tool.call` `AskUserQuestion`, before `next(e)`:

1. For each question: tags from `question`, `header` and option labels (`fromText`), plus the session's stack.
2. `CaseRanker.top(query, 5, 4.0)`.
3. Predict: for each option, the best `choice`-to-label similarity (word Jaccard after stopwords) among the top cases, weighted by the case score; the option with the highest product wins if it is ≥ 0.3 and at least 1.5 times the second.
4. `$.ui.notice(e.tool_use_id, 'Signature: you usually choose "<label>"')` for the first question that has a prediction (one line per dialog).
5. Keep the predictions; after `next(e)`, compare with the answers and record them in the question signals (`predicted`) and the fidelity counters.

The hint never answers for the developer. Delegated answering (P3 level `decide`) is out of scope until fidelity data justifies it (roadmap phase 8).

## 4. The proxy agent (`apply.proxy`)

`plugin/agents/developer-proxy.md`, agent type `podium:developer-proxy`:

```
---
name: developer-proxy
description: Stands in for the developer to review a plan, a proposal or a diff against how they decide (Podium Signature): which choices they would make, which they would refuse, and which of their blind spots to cover. Use before presenting a plan for validation, before a decision with real alternatives, and as an extra reviewer.
tools: mcp__podium__recall, Read, Grep, Glob
model: opus
---
```

Body (English): role (the developer's double, not a generic reviewer); method (extract the decisions in the plan; for each, call `recall` with a one-sentence situation and tags; keep only the cases that truly apply; compare); output contract:

```
Verdict: would accept | would adjust | would refuse
Decisions:
- <decision in the plan> → matches #142 (confirmed, 7×) | conflicts with #31: they would <choice> because <why>
Blind spots to cover: <reminder> (trait id)
No precedent: <decisions the profile says nothing about>
```

Rules in the body: never invent a preference without a case; cite case ids; project instructions win; never recommend lowering a safety measure.

Offer control: `on('agent.offer')` returns `{ isOffered: false }` for `podium:developer-proxy` when Signature is not enabled, `apply.proxy` is false, or the session is excluded; otherwise `next(e)`.

## 5. `/podium` setup (phase 5)

`plugin/skills/setup/SKILL.md`:

- Step 0: also read `<config>/podium/profile.json` when it exists (read-only, never copied into the project).
- Step 1: for each preference question, when a confirmed trait answers it with confidence ≥ 0.8, do not ask: show it as pre-filled ("From your Signature: English artefacts, `.claude/` committed, no AI attribution. Change?") in one line, and ask only the rest.
- Step 3: start the proposal from the developer's habits (commit format, branch prefixes, agents, model budget) and say which defaults come from the profile.
- Genesis `stack` template: propose the developer's usual stacks first with the cases that justify them (via the `recall` tool when available).
- Generated `feature`, `fix` and `review` templates: an optional step "When the agent `podium:developer-proxy` is available, run it on the plan before asking for validation, and add its verdict to the plan" (conditional block, kept only when the plugin exposes the agent; the step itself checks availability at run time so a project shared with someone without Signature still works).
- Never write anything from the profile into the project's files except choices the developer validated in the proposal.

## 6. Feeding native features (P6)

`ProfileSink` is the boundary inside `Signature`: `section()`, `context()`, `hint()`. A future native user memory becomes another sink; the panel gets a switch to choose which sinks are active.
