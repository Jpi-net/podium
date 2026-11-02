---
name: {{CMD_DELIVER}}
description: Shared final phases of the feature and fix commands - CI-equivalent verification and reviews in one parallel wave, fix loop, commits per layer, push and pull request. Invoked by the feature, fix and comments commands.
user-invocable: false
---

# Deliver: verification + reviews, commits, push, PR

The caller supplies: type (`feature`, `fix`, `update`), the work item id if any, the target branch, the validated plan or diagnosis, the experts involved, optionally the reproduction (test filter or scenario).

Update the flow file (`.claude/flows/<branch with / replaced by __>.md`) at each phase.

## Phase 5: Verification and reviews (one wave, one message)
1. Collect the diff (`git diff --name-only origin/<target>...HEAD` plus uncommitted files) and the rule files matching the touched paths.
2. Launch in ONE message (read-only, concurrent):
   - `{{VERIFIER}}`, one per independent area when it saves time, with the commands of the areas touched (list below), the reproduction first when given;
   - `code-reviewer`: always;
{{#IF_SECURITY}}
   - `security-reviewer`: when the diff touches access rules, endpoints, input handling, persistence, configuration or authentication (otherwise say it was skipped);
{{/IF_SECURITY}}
{{#IF_DOCS}}
   - `doc-writer`: when the change adds or renames a documented module, endpoint, rule or flow (`## Partition`: the docs folder).
{{/IF_DOCS}}

Verification commands by area:

{{VERIFY_STEPS}}

3. Triage together: red checks and blocking findings go to the owning experts with the exact errors (one message, disjoint files); cheap minor findings are fixed, others listed for the user; invalid findings are dismissed with a one-line reason. Rerun only the failed checks and re-review only the changed files.
4. At most 3 rounds. Still red: stop, do not commit, report the exact errors and your hypothesis.

## Phase 6: Delivery
Formats live in `.claude/rules/git-workflow.md`: follow it, do not restate it.
1. Commit plan per the granularity rules (narrow change: one commit; feature: one commit per layer, each commit builds). Never stage secrets or unrelated files; `git status` must show nothing unexpected.
2. Write the PR description to `<scratchpad>/pr-<id>.md` following the PR format of `.claude/rules/git-workflow.md` (feature or fix variant when it defines both).
{{#IF_GIT_WRITER}}
3. Launch `{{GIT_WRITER}}` with the commit plan, the branch, the target, the PR title and the description file.
{{/IF_GIT_WRITER}}
{{#IF_NO_GIT_WRITER}}
3. Commit yourself following the plan (`git add <explicit paths>`, one `git commit` per planned commit), push the branch, then create the pull request with the host's CLI when one is configured; otherwise give the user the exact title and description to paste.
{{/IF_NO_GIT_WRITER}}
4. Delete the flow file.
5. Report: PR link, commits, verification results, findings not fixed, what needs the user's attention.
