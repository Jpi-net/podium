# The vision: how a project set up by maestro works

Every generated file must serve these principles. When a choice is unclear, pick the option that serves them best.

## 1. The main thread orchestrates, it does not implement

- The main conversation plans, delegates, integrates and talks to the user.
- It writes production code only for trivial glue when no expert owns the file.
- It keeps a checklist of phases and reports one short line per phase.
- Long flows (feature, fix) persist a flow file in `.claude/flows/<branch>.md` (plan, partition, checked phases) so a context compaction or a new session resumes at the first unchecked phase.

## 2. Model tiers

| Tier | Model | Role | Examples |
|---|---|---|---|
| Think | Opus (high effort) | Design, root cause, review | architect, debugger, code-reviewer, security-reviewer |
| Implement | Sonnet (medium effort) | Write code and tests in one partition | one expert per layer, test-expert, doc-writer, devops |
| Mechanical | Haiku (low effort) | Run commands, report exactly | verifier (lint-runner), git-writer, generators |

Escalate to a stronger model only on a second attempt (diagnosis that did not reproduce, plan rejected as wrong). An economical budget moves Think to Sonnet.

## 3. Parallel experts on disjoint partitions

- The architect assigns every file to exactly one expert. No file appears twice.
- Each implementer prompt has a `## Partition` section listing its files; the ownership hook rejects edits outside it.
- Experts of one wave are launched in a single message (several Agent calls).
- Dependencies are expressed as waves (contracts/domain first, the rest next). A test file is in the wave after its subject under test.
- Generated files belong to their generator only, never edited by hand.
- An expert that needs a change outside its partition reports it under "Open issues"; the orchestrator assigns it to the owner in the next round.

## 4. Plan before code, validated by the user

- Nothing is written before the user validates the plan (feature) or the diagnosis (fix).
- Open questions go in one AskUserQuestion call, recommended option first.
- Business rules are never guessed.

## 5. Verification equals CI

- A read-only verifier runs exactly the commands CI runs, with the same flags (warnings as errors when CI does it).
- Build once, then run tests without rebuilding.
- Auto-fixers run once, explicitly, never silently.
- Red checks go back to the owning expert with the exact error; at most 3 rounds, then stop and report.

## 6. Reviews in parallel with verification

- code-reviewer always; security-reviewer when the diff touches access, input, auth, persistence, configuration or public endpoints; doc-writer when documented things change.
- Reviewers report verified findings only, ranked Blocking > Major > Minor, with the exact fix.
- Recurring findings feed `.claude/review-learnings.md`, read by the experts.

## 7. A fix starts with a failing test (or, without tests, a reproduced failure)

- The debugger finds the root cause with evidence (file:line, failing input, data path).
- A test that fails for the expected reason is written first; if it passes, the diagnosis is wrong.
- A project without a test runner replays an exact reproduction scenario instead, until a runner is added; the rule is only proposed as recommended when tests exist.
- The fix is minimal, no opportunistic refactoring.

## 8. Clean history

- Branch per change from the base branch; never commit on protected branches.
- One commit for a narrow change; one commit per layer for a feature, each commit builds.
- Pull requests are created as drafts when the rule is enabled: the human publishes them.
- Commit and PR formats are written once in a git-workflow rule and referenced, never restated.
- Optional rule (recommended): no AI or assistant mention in any git or PR artifact.

## 9. Domain first (optional, for domain-rich projects)

Aggregates, value objects, invariants and their tests before persistence, API and front.

## 10. Context is loaded on demand

- `CLAUDE.md` stays short: language, non-negotiable rules, rule index, workflow, command cheat sheet.
- Details live in `.claude/rules/*.md` with `paths:` front matter so they load only when matching files are touched.
- Subagents read the relevant rule files explicitly before acting.
- Subagent outputs follow a compact output contract; never ask for file dumps.

## 11. Guard rails are hooks, not hopes

- Dangerous commands (force push, reset --hard, recursive deletes outside build folders, printing secrets) are denied by a hook.
- Commit, branch and PR text is checked by a hook when the corresponding rules are enabled.
- Edits are checked after the fact (comments, debug output left, focused tests, generated files).
- The session start injects the branch, base, ahead/behind, merge state and any flow in progress.
- Hooks read their configuration from `.claude/maestro.json`, so updating the manifest updates the behaviour.

## 12. Names are free, roles are stable

Commands can be named anything. The manifest maps each role (feature, fix, review…) to the command that fills it, so tools (the maestro panel, the hooks) work whatever the names.
