import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { git, isMidOperation, projectDir, readInput, readOnlyAgents } from './lib.mjs';

const BINARY = /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tar|jar|dll|exe|so|dylib|woff2?|ttf|xlsx|docx|pptx|mp4|mov)$/i;
const STRAY = /(^|\/)(TestResults|coverage|\.nyc_output|node_modules|dist|\.angular|\.next|\.turbo|bin|obj|target|__pycache__)\/|(^|\/)\.DS_Store$|\.(orig|rej)$/;

const input = readInput();

if (input.stop_hook_active || readOnlyAgents().has(input.agent_type)) {
    process.exit(0);
}

const cwd = projectDir();

if (git(cwd, 'rev-parse', '--git-dir') === '' || isMidOperation(cwd)) {
    process.exit(0);
}

const changed = new Set([
    ...git(cwd, 'diff', '--name-only', 'HEAD').split('\n'),
    ...git(cwd, 'ls-files', '--others', '--exclude-standard', '--directory', '--no-empty-directory').split('\n'),
].filter(Boolean));

const problems = [];

for (const file of changed) {
    const path = join(cwd, file);

    if (STRAY.test(file)) {
        problems.push(`stray ${file.endsWith('/') ? 'folder' : 'file'} ${file} (delete it or add it to .gitignore)`);
        continue;
    }

    if (!existsSync(path) || BINARY.test(file) || statSync(path).isDirectory() || statSync(path).size > 2_000_000) {
        continue;
    }

    if (/^(<{7}|>{7}) /m.test(readFileSync(path, 'utf8'))) {
        problems.push(`conflict markers left in ${file}`);
    }
}

if (problems.length > 0) {
    process.stdout.write(JSON.stringify({
        decision: 'block',
        reason: `Before finishing, fix: ${problems.slice(0, 10).join('; ')}.`,
    }));
}

process.exit(0);
