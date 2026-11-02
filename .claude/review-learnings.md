# Review learnings

Recurring findings from code and security reviews. Experts read this file before implementing; reviewers append a line when the same finding appears twice.

Format: `- [area] what went wrong → what to do instead (first seen: <date>)`

- [panel tests] scene tests comparing an idle render with an active one picked up sprite changes instead of the feature under test → mask the sprite and obstacle boxes, or sample a region only the new feature draws in (first seen: 2026-11-02)
- [panel] a per-frame cache keyed by animated coordinates grew without bound → key it by agent id, rebuild when the inputs change, evict ids that left the stage (first seen: 2026-11-02)
- [panel] an early "clean summary → not a failure" return hid hard signals (Build FAILED, tsc/rustc errors, Traceback) in the same output → only filter `(pass)` lines; never return early before the hard failure patterns (first seen: 2026-11-02)
- [panel] deleting a drawing routine left its palette constants and imports behind → after removing a draw path, grep each `private static readonly` and import of the file for remaining uses (first seen: 2026-11-02)
- [panel] a hook-block detection scanned the whole command output, and test titles quoting "denied by a hook" hid a real red run → classify on the first line of the message only, never on command output (first seen: 2026-11-02)
