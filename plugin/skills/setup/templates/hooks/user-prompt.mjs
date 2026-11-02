import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addContext, pattern, projectDir, readInput, run, setting } from './lib.mjs';

const CACHE_TTL_MS = 60 * 60 * 1000;

const input = readInput();
const prompt = input.prompt ?? '';
const roles = setting('roles', {});
const commandTemplate = setting('hooks.workItemCommand', '');
const mention = pattern(setting('hooks.workItemMention', '(?:^|[\\s(])#(\\d+)\\b'), 'g');

if (!commandTemplate || !mention || prompt.trim().startsWith('/')) {
    process.exit(0);
}

const ids = [...new Set([...prompt.matchAll(mention)].map(match => match[1]).filter(Boolean))].slice(0, 3);

if (ids.length === 0) {
    process.exit(0);
}

const cacheDir = join(tmpdir(), `work-items-${Buffer.from(projectDir()).toString('base64url').slice(-24)}`);

function summary(id) {
    const file = join(cacheDir, `${id}.txt`);

    if (existsSync(file) && Date.now() - statSync(file).mtimeMs < CACHE_TTL_MS) {
        return readFileSync(file, 'utf8');
    }

    const result = run(commandTemplate.replaceAll('{id}', id), projectDir(), 8000);

    if (!result.ok || result.output.trim() === '') {
        return null;
    }

    const text = result.output.trim().replace(/\s+/g, ' ').slice(0, 400);
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(file, text);

    return text;
}

const lines = ids.map(id => {
    const text = summary(id);

    return text ? `#${id}: ${text}` : null;
}).filter(Boolean);

if (lines.length === 0) {
    process.exit(0);
}

const hints = [
    roles.feature ? `implement: /${roles.feature} <id>` : null,
    roles.fix ? `fix: /${roles.fix} <id>` : null,
    roles.investigate ? `understand a bug: /${roles.investigate} <id>` : null,
].filter(Boolean).join('; ');

addContext('UserPromptSubmit', `Work items mentioned (summary only):\n${lines.join('\n')}${hints ? `\nIf the user asks to act on one of them and no flow is running, use the matching command (${hints}); for a question, answer directly.` : ''}`);
