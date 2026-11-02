---
name: pr-comments
description: Processes the review comments of one of the user's podium pull requests - fetches the open threads with gh, proposes an action per comment, applies the validated fixes through the experts, verifies, and drafts the replies for the user to post. Never writes to GitHub. Use when the user types /pr-comments.
argument-hint: "<pr number>"
disable-model-invocation: true
---

# /pr-comments: handle review feedback

Talk to the user in the user's language. GitHub is read-only for you: never post, resolve or request changes.

## Phase 1: Fetch
The PR and its open comment threads: `gh pr view <number> --comments` and `gh api repos/Jpi-net/podium/pulls/<number>/comments` for inline threads. Check out the PR branch (`git pull --no-rebase` if it exists locally).

## Phase 2: Triage (user validation required)
One line per comment: what it asks, valid or not (with a one-line reason, citing the rule file when a convention is involved), proposed action (fix, explain, defer). Validate with AskUserQuestion.

## Phase 3: Fix
Group the validated fixes by owner (`panel-expert`, `setup-expert`, `test-expert`, `doc-writer`, `devops`); launch the experts in parallel on disjoint files.

## Phase 4: Verify and commit
Invoke `deliver` in update mode (no new PR): verification, a review of the changed files, one commit addressing the review.

## Phase 5: Replies
Draft one reply per comment in English (what changed, or why not), ready to paste.
