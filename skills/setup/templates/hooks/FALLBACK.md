# When Node is not installed

The hooks need Node 18 or later (`node --version`). Claude Code itself may run without Node, so check before wiring them.

## Preferred: install Node

Tell the user the one command for their platform (`brew install node`, `winget install OpenJS.NodeJS.LTS`, `sudo apt install nodejs`, or the version manager they already use), then wire the `.mjs` hooks.

## Fallback: shell guards only

If the user does not want Node, wire only these two shell hooks (POSIX `sh`, no dependency besides `git` and `grep`). They cover the most important guard rails; the manifest-driven checks (partitions, post-edit checks, work items) are skipped, and the user is told so. On Windows they run through the Git for Windows `sh` that Claude Code uses for hooks; a Windows machine without Git Bash gets no fallback, so recommend Node there.

`.claude/hooks/guard-bash.sh`:

```sh
#!/bin/sh
input=$(cat)
cmd=$(printf '%s' "$input" | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\(.*\)".*/\1/p' | head -1)
block() {
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Blocked: %s"}}' "$1"
  exit 0
}
printf '%s' "$cmd" | grep -Eq 'git .*push .*(--force|-f( |$)|--force-with-lease)' && block 'force push is forbidden.'
printf '%s' "$cmd" | grep -Eq 'git .*reset .*--hard' && block 'git reset --hard discards work: ask the user first.'
printf '%s' "$cmd" | grep -Eq 'git .*clean .*-[a-zA-Z]*f' && block 'git clean -f deletes untracked files: ask the user first.'
printf '%s' "$cmd" | grep -Eq 'git .*(--no-verify|commit .* -n( |$))' && block '--no-verify is forbidden.'
printf '%s' "$cmd" | grep -Eqi '(cat|head|tail|less|more) .*\.env([^.a-z]|$)' && block 'never print secrets.'
exit 0
```

`.claude/hooks/session-start.sh`:

```sh
#!/bin/sh
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null) || exit 0
changes=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"Current branch: %s. %s uncommitted change(s)."}}' "$branch" "$changes"
```

Wire them in `settings.json` with `"command": "sh \"$CLAUDE_PROJECT_DIR/.claude/hooks/guard-bash.sh\""` (PreToolUse, matcher `Bash`) and `"command": "sh \"$CLAUDE_PROJECT_DIR/.claude/hooks/session-start.sh\""` (SessionStart). On Windows without Node and without a POSIX shell, wire no hook and say so.
