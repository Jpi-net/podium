# Review learnings

Recurring findings from code and security reviews. Experts read this file before implementing; reviewers append a line when the same finding appears twice.

Format: `- [area] what went wrong → what to do instead (first seen: <date>)`

- [panel tests] scene tests comparing an idle render with an active one picked up sprite changes instead of the feature under test → mask the sprite and obstacle boxes, or sample a region only the new feature draws in (first seen: 2026-11-02)
- [panel] a per-frame cache keyed by animated coordinates grew without bound → key it by agent id, rebuild when the inputs change, evict ids that left the stage (first seen: 2026-11-02)
- [panel] an early "clean summary → not a failure" return hid hard signals (Build FAILED, tsc/rustc errors, Traceback) in the same output → only filter `(pass)` lines; never return early before the hard failure patterns (first seen: 2026-11-02)
- [panel] deleting a drawing routine left its palette constants and imports behind → after removing a draw path, grep each `private static readonly` and import of the file for remaining uses (first seen: 2026-11-02)
- [panel] a hook-block detection scanned the whole command output, and test titles quoting "denied by a hook" hid a real red run → classify on the first line of the message only, never on command output (first seen: 2026-11-02)
- [setup skill] moving files broke a home-directory glob in SKILL.md (install layout `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`, zsh nomatch) → locate folders with `find ... -path` and re-check every such path after a move (first seen: 2026-11-02)
- [setup skill] generated hooks interpolated a prompt-derived id and a file path into shell strings (`shell: true`, `$()` inside double quotes) → never build shell strings from variables: use execFileSync with an argv array, validate ids with an allow-list pattern, and keep `shell: true` only for a command the user wrote themselves (first seen: 2026-11-02)
- [panel] replacing a dynamic Proxy with an explicit wrapper class → type its consumers with a `Pick` interface so a missing method fails tsc, and test each argument shape (numbers, Points, optional Rgb) (first seen: 2026-11-02)
- [signature] text similarity dropped negations as stopwords, so opposite decisions merged as the same → keep negation tokens (no, not, never, pas, ne, sans) in word sets and test a negated pair (first seen: 2026-11-05)
- [signature] regexes over user or model text (email, JWT, glob-to-regex, overlay paths) backtracked quadratically or worse and would freeze a hook → bound quantifiers, anchor with lookbehinds, cap input length, prefer a linear matcher for globs, and add a timing test on 1 MB adversarial input (first seen: 2026-11-05)
