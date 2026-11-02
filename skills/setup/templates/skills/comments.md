---
name: {{CMD_COMMENTS}}
description: Processes the review comments of one of the user's pull requests - fetches the open threads, proposes an action per comment, applies the validated fixes through the experts, verifies, and drafts the replies for the user to post. Never writes to the git host. Use when the user types /{{CMD_COMMENTS}}.
argument-hint: "<pr id>"
disable-model-invocation: true
---

# /{{CMD_COMMENTS}}: handle review feedback

Talk to the user in {{CONVERSATION_LANGUAGE}}. The git host is read-only for you: never post, resolve or vote.

## Phase 1: Fetch
The PR and its open comment threads with the host CLI (`gh pr view --comments`, `gh api`, `az repos pr`, `glab mr`). Check out the PR branch (`git pull --no-rebase` if it exists locally).

## Phase 2: Triage (user validation required)
One line per comment: what it asks, valid or not (with a one-line reason), proposed action (fix, explain, defer). Validate with AskUserQuestion.

## Phase 3: Fix
Group the validated fixes by owner; launch the experts in parallel on disjoint files.

## Phase 4: Verify and commit
Invoke `{{CMD_DELIVER}}` in update mode (no new PR): verification, a review of the changed files, one commit addressing the review.

## Phase 5: Replies
Draft one reply per comment in the team's language (what changed, or why not), ready to paste.
