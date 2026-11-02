---
name: deliver
description: Shared final phases of /feat, /fix and /pr-comments on podium - CI-equivalent verification (claude plugin validate, claude plugin test, node --check on hook templates) and reviews in one parallel wave, fix loop, commits per layer, push and pull request with gh. Invoked by the feat, fix and pr-comments commands.
user-invocable: false
---

# Deliver: verification + reviews, commits, push, PR

The caller supplies: type (`feature`, `fix`, `update`), the issue number if any, the target branch (`main`), the validated plan or diagnosis, the experts involved, optionally the reproduction (test title or hook input).

Update the flow file (`.claude/flows/<branch with / replaced by __>.md`) at each phase.

## Phase 5: Verification and reviews (one wave, one message)
1. Collect the diff (`git diff --name-only origin/main...HEAD` plus uncommitted files) and the rule files matching the touched paths (`.claude/rules/panel.md`, `tests.md`, `setup-skill.md`, `docs-release.md`).
2. Launch in ONE message (read-only, concurrent):
   - `lint-runner`, one per independent area when it saves time, with the commands of the areas touched (list below), the reproduction first when given;
   - `code-reviewer`: always;
   - `security-reviewer`: when the diff touches `plugin/skills/setup/templates/hooks/**`, `plugin/skills/setup/templates/settings.json.tmpl`, `$.process.run` / `$.fs` / `$.prompt` usage in `plugin/hooks/`, or permissions (otherwise say it was skipped);
   - `doc-writer`: when the change alters behaviour, a command or a manifest key (`## Partition`: `README.md`, `CHANGELOG.md`; `plugin/skills/setup/references/manifest.md` stays with `setup-expert`).

Verification commands by area (all from the repository root, CI runs them without extra flags):

- Any change: `claude plugin validate plugin`; before a release add `--profile directory --strict`.
- `plugin/hooks/`, `plugin/types/`, `plugin/tests/`: `claude plugin test plugin`.
- `plugin/skills/setup/templates/hooks/*.mjs`: `for f in plugin/skills/setup/templates/hooks/*.mjs; do node --check "$f"; done`, then run the changed hook with sample stdin inputs in the scratchpad (allowed case and refusal case).

3. Triage together: red checks and blocking findings go to the owning experts with the exact errors (one message, disjoint files); cheap minor findings are fixed, others listed for the user; invalid findings are dismissed with a one-line reason. Rerun only the failed checks and re-review only the changed files. Recurring findings go to `.claude/review-learnings.md`.
4. At most 3 rounds. Still red: stop, do not commit, report the exact errors and your hypothesis.

## Phase 6: Delivery
Formats live in `.claude/rules/git-workflow.md`: follow it, do not restate it.
1. Commit plan per the granularity rules (narrow change: one commit; feature: one commit per layer, panel, setup skill, tests, docs, manifests and CI, each commit passing `claude plugin validate plugin`). Never stage secrets, `plugin/.claude-plugin/types/`, scratch preview tests or unrelated files; `git status` must show nothing unexpected.
2. Write the PR description to `<scratchpad>/pr-<branch>.md` following `.github/pull_request_template.md` (What / Why / Checks) and the PR format of `.claude/rules/git-workflow.md`.
3. Commit yourself following the plan (`git add <explicit paths>`, one `git commit` per planned commit), `git push -u origin <branch>`, then `gh pr create --base main --title "<title>" --body-file <scratchpad>/pr-<branch>.md`. When the user chose a direct commit on `main`, push `main` and skip the pull request.
4. Delete the flow file.
5. Report: PR link, commits, verification results, findings not fixed, what needs the user's attention.
