---
name: {{CMD_REVIEW}}
description: Reviews a colleague's pull request (correctness, project conventions, security, tests, docs) in an isolated worktree and returns a ranked report with ready-to-paste comments. Never posts anything and never touches the current branch. Use when the user types /{{CMD_REVIEW}} or asks to review a pull request.
argument-hint: "<pr id | branch>"
---

# /{{CMD_REVIEW}}: review a pull request

Talk to the user in {{CONVERSATION_LANGUAGE}}. The git host is read-only for you: never comment, approve or vote.

## Phase 1: Context (in parallel)
- The PR title, description, source and target branches, linked work items, existing comments, with the host CLI available (`gh pr view`, `az repos pr show`, `glab mr view`); if none is available, ask the user for the source and target branches.
- The linked work item when there is one.

## Phase 2: Isolated checkout
```bash
git fetch origin <source> <target>
git worktree add --detach <scratchpad>/pr-<id> origin/<source>
git -C <scratchpad>/pr-<id> diff --stat origin/<target>...origin/<source>
```

## Phase 3: Reviews (one message, in parallel)
In the worktree: `code-reviewer` always; `security-reviewer` when the diff touches access, input, persistence, configuration or authentication; `{{VERIFIER}}` on the changed areas when the review must prove the build.

## Phase 4: Report
Ranked findings (Blocking > Major > Minor), each with `file:line`, why, the exact fix, and a ready-to-paste comment in the team's language. Points already raised in existing comments are not repeated.

## Cleanup
`git worktree remove <scratchpad>/pr-<id>`.
