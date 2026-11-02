import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

let cachedInput;
let cachedManifest;

export function readInput() {
    if (cachedInput === undefined) {
        try {
            cachedInput = JSON.parse(readFileSync(0, 'utf8'));
        } catch {
            cachedInput = {};
        }
    }

    return cachedInput;
}

export function projectDir() {
    const input = readInput();

    return process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();
}

export function manifest() {
    if (cachedManifest === undefined) {
        try {
            cachedManifest = JSON.parse(readFileSync(join(projectDir(), '.claude', 'maestro.json'), 'utf8'));
        } catch {
            cachedManifest = {};
        }
    }

    return cachedManifest;
}

export function setting(path, fallback) {
    const value = path.split('.').reduce((node, key) => (node && typeof node === 'object' ? node[key] : undefined), manifest());

    return value === undefined || value === null ? fallback : value;
}

export function pattern(source, flags = '') {
    if (typeof source !== 'string' || source === '') {
        return null;
    }

    try {
        return new RegExp(source, flags);
    } catch {
        return null;
    }
}

export function deny(reason) {
    process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: reason,
        },
    }));
    process.exit(0);
}

export function feedback(message) {
    process.stderr.write(message);
    process.exit(2);
}

export function addContext(eventName, text) {
    process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
            hookEventName: eventName,
            additionalContext: text,
        },
    }));
    process.exit(0);
}

export function gitRaw(cwd, ...args) {
    try {
        return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
    } catch {
        return '';
    }
}

export function git(cwd, ...args) {
    return gitRaw(cwd, ...args).trim();
}

export function currentBranch(cwd) {
    return git(cwd, 'symbolic-ref', '--quiet', '--short', 'HEAD') || git(cwd, 'rev-parse', '--abbrev-ref', 'HEAD');
}

export function hasCommits(cwd) {
    return git(cwd, 'rev-parse', '--verify', '--quiet', 'HEAD') !== '';
}

export const IS_WINDOWS = process.platform === 'win32';

export function run(command, cwd, timeout = 10000) {
    try {
        return { ok: true, output: execFileSync(command, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout, shell: true, windowsHide: true }) };
    } catch (error) {
        return { ok: false, output: `${error.stdout ?? ''}${error.stderr ?? ''}`.trim() };
    }
}

function maskQuoted(quoted) {
    const inner = quoted.slice(1, -1);

    if (quoted.startsWith('"') && /\$\(|`/.test(inner)) {
        return quoted;
    }

    return /[\s;|&<>`]/.test(inner) ? `${quoted[0]}?${quoted[0]}` : quoted;
}

export function segments(command) {
    return command
        .replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2\s*(?=\n|$)/g, '\n')
        .replace(/"(?:[^"\\]|\\[\s\S])*"|'[^']*'/g, maskQuoted)
        .split(/&&|\|\||[;|\n]|\$\(|`/)
        .map(segment => segment.trim().replace(/^\(+/, '').replace(/^(\w+=\S*\s+)+/, '').replace(/^(sudo|time|command)\s+/, ''))
        .filter(Boolean);
}

export function invokes(command, regex) {
    return segments(command).some(segment => regex.test(segment));
}

const ASSISTANTS = String.raw`claude(?:\s+code)?|anthropic|chatgpt|openai|gpt-?\d|copilot|gemini|codeium|an?\s+(?:ai|llm)(?:\s+assistant)?|ai|llm`;

export const FORBIDDEN_ATTRIBUTION = new RegExp([
    String.raw`co-authored-by:[^\n]*\b(?:${ASSISTANTS}|assistant|noreply@anthropic\.com)\b`,
    String.raw`\b(?:generated|written|authored|created|made|produced|assisted|drafted)\s+(?:with|by|using)\s+(?:\S+\s+){0,2}[\[(*_"'\`]*(?:${ASSISTANTS})\b`,
    String.raw`\bAI[- ](?:generated|assisted|written)\b`,
    '🤖',
].join('|'), 'i');

const ASSISTANT_NAMES = /\b(claude|anthropic|chatgpt|copilot|llm|opus|sonnet|haiku)\b/i;
const MODEL_ATTRIBUTION = /\b(written|authored|created|made|produced|generated|assisted|drafted|co-?authored)\s+(with|by|using)\s+(\S+\s+){0,2}(opus|sonnet|haiku)\b|\b(opus|sonnet|haiku)[\s-]+\d/i;
const TECHNICAL_TOKENS = /(?:[A-Za-z]:)?[\w.\\/~-]*?[\\/](?:claude-[\w-]+|\.claude)[\\/][^\s'")]*|(?:^|[\s(`'"])\.claude\b\/?|\$\{?(?:CLAUDE_PROJECT_DIR|CLAUDE_PLUGIN_ROOT|TMPDIR|TEMP|TMP)\}?|%(?:TEMP|TMP)%/g;

export function mentionsAssistant(text) {
    const cleaned = text.replace(TECHNICAL_TOKENS, ' ');

    if (FORBIDDEN_ATTRIBUTION.test(cleaned) || MODEL_ATTRIBUTION.test(cleaned)) {
        return true;
    }

    return setting('hooks.blockModelNames', false) === true && ASSISTANT_NAMES.test(cleaned);
}

export const DEFAULT_READ_ONLY = ['architect', 'debugger', 'code-reviewer', 'security-reviewer', 'lint-runner', 'git-writer', 'Explore', 'Plan'];

export function readOnlyAgents() {
    const configured = setting('hooks.readOnlyAgents', null);

    return new Set(Array.isArray(configured) ? configured : DEFAULT_READ_ONLY);
}

export function protectedBranches() {
    const base = setting('git.base', 'main');
    const configured = pattern(setting('hooks.protectedBranches', ''));

    return configured ?? new RegExp(`^(${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|main|master)$`);
}

export function isMidOperation(cwd) {
    const gitDir = git(cwd, 'rev-parse', '--absolute-git-dir');

    return gitDir !== '' && ['MERGE_HEAD', 'rebase-merge', 'rebase-apply', 'CHERRY_PICK_HEAD'].some(name => existsSync(join(gitDir, name)));
}
