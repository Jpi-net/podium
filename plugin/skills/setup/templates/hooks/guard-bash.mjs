import { deny, pattern, protectedBranches, readInput, segments, setting } from './lib.mjs';

const input = readInput();
const command = input.tool_input?.command ?? '';
const executed = segments(command);
const protectedNames = protectedBranches().source.replace(/^\^\(?|\)?\$$/g, '');

const SAFE_REMOVE = pattern(setting('hooks.safeRemove', ''), 'i')
    ?? /(^|[\\/])(bin|obj|node_modules|dist|build|out|target|coverage|\.next|\.turbo|\.pytest_cache|__pycache__|TestResults)[\\/]?$|^[\\/]?(private[\\/])?tmp[\\/]|scratchpad/i;
const SECRETS = pattern(setting('hooks.secrets', ''), 'i')
    ?? /(^|[\\/])\.env(\.(?!example|template|sample)[\w.-]+)?$|\.(pem|key|p12|pfx)$|(^|[\\/])secrets?[\\/]/i;

const rules = [
    [/^git\b.*\bpush\b.*(\s--force\b|\s-f\b|\s--force-with-lease\b|\s\+\S)/, 'Force push is forbidden.'],
    [new RegExp(`^git\\b.*\\bpush\\b.*\\s(\\S+:)?(${protectedNames})\\s*$`), 'Pushing directly to a protected branch is forbidden: go through a pull request.'],
    [/^git\b.*\badd\b.*\s(-f|--force)\b/, 'git add --force stages ignored files: stage explicit tracked paths instead.'],
    [/^git\b.*\breset\b.*--hard\b/, 'git reset --hard discards work: ask the user first.'],
    [/^git\b.*\bclean\b.*\s-[a-zA-Z]*f/, 'git clean -f deletes untracked files: ask the user first.'],
    [/^git\b.*\b(checkout|restore)\b.*\s(--\s+)?\.\s*$/, 'Discarding the whole working tree is forbidden: ask the user first.'],
    [/^git\b.*\bbranch\b.*\s-D\b/, 'Force-deleting a branch is forbidden: ask the user first.'],
    [/^git\b.*\bstash\b.*\b(drop|clear)\b/, 'Dropping stashes is forbidden: ask the user first.'],
    [/^git\b.*\bpush\b.*\s--delete\b|^git\b.*\bpush\b.*\s:\S/, 'Deleting a remote branch is forbidden: ask the user first.'],
    [/^docker\b.*\b(system\s+prune|volume\s+(rm|prune))\b/, 'Docker prune or volume removal destroys local data: ask the user first.'],
    [/^docker(-compose|\s+compose)\b.*\bdown\b.*(\s-v\b|--volumes\b)/, 'docker compose down -v deletes local data: ask the user first.'],
];

for (const segment of executed) {
    for (const [regex, reason] of rules) {
        if (regex.test(segment)) {
            deny(`Blocked: ${reason}`);
        }
    }

    const printer = segment.match(/^(cat|less|more|head|tail|bat|type|gc|Get-Content|strings|xxd)\b\s+(.+)$/i)?.[2];

    if (printer && printer.split(/\s+/).some(target => SECRETS.test(target.replace(/["']/g, '')))) {
        deny('Blocked: never print secrets. Reference the variable by name or export it without displaying it.');
    }

    const unixArgs = segment.match(/^rm\s+(.+)$/)?.[1] ?? '';
    const unixRemove = /(^|\s)(-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)(\s|$)/.test(unixArgs) ? unixArgs : null;
    const windowsRemove = segment.match(/^(?:Remove-Item|ri|rd|rmdir)\s+(.+)$/i)?.[1];
    const recursiveWindowsRemove = windowsRemove && /(^|\s)(-Recurse|-r|\/s)\b/i.test(windowsRemove)
        ? windowsRemove.replace(/(^|\s)(-Recurse|-Force|-r|-fo|\/s|\/q)\b/gi, ' ')
        : null;
    const removed = unixRemove ?? recursiveWindowsRemove;

    if (removed) {
        const targets = removed.trim().split(/\s+/).map(target => target.replace(/["']/g, '').replace(/[\\/]\*$/, '')).filter(target => target && !target.startsWith('-'));
        const unsafe = targets.filter(target => !SAFE_REMOVE.test(target));

        if (unsafe.length > 0) {
            deny(`Blocked: recursive delete of ${unsafe.join(', ')}. Only build output, dependency, cache and scratch folders may be deleted; ask the user for anything else.`);
        }
    }
}

await import('./guard-git.mjs');
