---
name: {{CMD_MERGE}}
description: Merges the base branch into the current work branch, resolves conflicts layer by layer with the owning experts, verifies, and never pushes. Use when the user types /{{CMD_MERGE}} or asks to update a branch with the latest base.
argument-hint: "[base branch]"
---

# /{{CMD_MERGE}}: bring the base into the work branch

Talk to the user in {{CONVERSATION_LANGUAGE}}. Base: `$ARGUMENTS` or `{{BASE_BRANCH}}`.

1. Clean tree required (otherwise ask). `git fetch origin`, `git pull --no-rebase` on the work branch.
2. `git merge --no-ff --no-commit origin/<base>`.
3. Conflicts: group the files by layer, launch the owning experts in parallel with both sides of each conflict and the intent of the work branch; generated files are regenerated, not merged by hand.
4. Verification on the touched areas with `{{VERIFIER}}`; reviews only on files where a conflict was resolved by hand.
5. Commit the merge (`git commit --no-edit`). Do not push: tell the user what was merged and resolved.
