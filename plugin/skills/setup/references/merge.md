# Writing without destroying the user's work

The user may have edited any generated file since the last run, or may have a `.claude/` written by hand. Your job is to improve it, never to erase it.

## Classify every target file

Compute the current sha256 (`shasum -a 256 <file>` or `sha256sum <file>`; on Windows `certutil -hashfile <file> SHA256` or PowerShell `(Get-FileHash <file>).Hash.ToLower()`) and compare with `generatedFiles[<path>]` from the manifest (empty on a first run).

| Situation | Action |
|---|---|
| File does not exist | create |
| Recorded hash equals current hash (untouched since generated) | update in place |
| No recorded hash, file exists (hand-written) | merge: keep every rule, command and decision the team wrote; add what is missing; show the diff and ask |
| Recorded hash differs from current hash (user edited it) | merge the new template content into the user's version; show the diff and ask |
| The proposal drops the file | ask before deleting; default is keep |

## Merge rules

- Content written by the team wins over template content when they conflict; mention the conflict to the user.
- Front matter: keep the user's `model`, `tools`, `color`, `effort` unless the proposal explicitly changes them and the user validated it.
- `settings.json`: merge arrays (`permissions.allow`, `permissions.deny`, hooks per event) by value, never drop user entries. Keep user `env` values.
- `CLAUDE.md`: keep the user's sections; insert missing sections (language, non-negotiable rules, rule index, workflow, command cheat sheet) at their natural place.
- Hooks: if the user has a hook with the same responsibility, keep theirs and wire ours only when it adds something; never run two hooks that deny the same thing with different messages.
- Skills renamed by the user: find them by the role recorded in the manifest, not by folder name.

## Show diffs

Group the diffs by file, short, in one message. Ask once with AskUserQuestion: apply all / review file by file / cancel.

## The manifest itself

`.claude/maestro.json` is never listed in `generatedFiles` (it cannot hold its own hash). On an update:
- keep every value the user changed by hand (a renamed command in `roles`, an added verification pattern, a partition, a check switched off) unless the validated proposal explicitly changes it;
- add the new keys and the new roles, phases, reviewers, layers and partitions;
- remove an entry only when the matching file was removed with the user's agreement;
- show the manifest diff with the other diffs.

## `.claude/.gitignore`

Versioned setup only: create it from `templates/gitignore.tmpl`, or add the missing lines to the existing one.

## After writing

Recompute the sha256 of every file written or merged (except the manifest) and store it in `generatedFiles`. Files the user declined keep their old hash (or none).

## Genesis → full

The starter files (kickoff, stack, foundations skills, product agent) stay if the user still wants them; the full setup adds the layer experts, rules per layer, the verifier, the delivery chain. Record the move by setting `stage` to `full`.
