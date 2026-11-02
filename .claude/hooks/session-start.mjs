import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { addContext, currentBranch, git, hasCommits, isMidOperation, pattern, projectDir, protectedBranches, setting } from './lib.mjs';

const cwd = projectDir();
const stage = setting('stage', 'none');
const roles = setting('roles', {});
const lines = [];
const isRepository = git(cwd, 'rev-parse', '--git-dir') !== '';
const branch = isRepository ? currentBranch(cwd) : '';

if (!isRepository) {
    addContext('SessionStart', `No git repository yet: run \`git init\` (or ask the user) before anything else.${stage === 'genesis' && roles.kickoff ? ` This project is being created: then start with /${roles.kickoff}.` : ''}`);
}

if (!hasCommits(cwd)) {
    const next = stage === 'genesis' && roles.kickoff ? ` This project is being created: start with /${roles.kickoff}.` : '';
    addContext('SessionStart', `Git repository initialised on branch ${branch || 'unknown'}, no commit yet. The first (bootstrap) commit may go on ${branch || 'the initial branch'}; the first push is done by the user.${next}`);
}

const base = setting('git.base', 'main');
const supportPattern = pattern(setting('git.support', ''));
const workItem = pattern(setting('git.workItem', '(?:^|/)(\\d+)-'))?.exec(branch)?.[1];
const remoteBase = git(cwd, 'rev-parse', '--verify', '--quiet', `origin/${base}`) ? `origin/${base}` : '';
const localBase = remoteBase === '' && git(cwd, 'rev-parse', '--verify', '--quiet', base) ? base : '';
const candidates = [...[remoteBase || localBase].filter(Boolean), ...(supportPattern
    ? git(cwd, 'branch', '-r', '--format=%(refname:short)').split('\n').map(name => name.trim()).filter(name => supportPattern.test(name.replace(/^origin\//, '')))
    : [])];
const nearest = candidates
    .map(name => ({ name, distance: Number(git(cwd, 'rev-list', '--count', `${name}..HEAD`) || Number.MAX_SAFE_INTEGER) }))
    .sort((left, right) => left.distance - right.distance)[0];
const counts = nearest ? git(cwd, 'rev-list', '--left-right', '--count', `${nearest.name}...HEAD`).split(/\s+/) : [];
const changes = git(cwd, 'status', '--porcelain').split('\n').filter(Boolean);
const flowFile = join(cwd, '.claude', 'flows', `${branch.replace(/\//g, '__')}.md`);

lines.push(`Current branch: ${branch}${workItem ? ` (work item #${workItem})` : ''}.`);

if (counts.length === 2 && nearest) {
    lines.push(`Base: ${nearest.name}. ${counts[1]} commit(s) ahead, ${counts[0]} behind (${nearest.name.startsWith('origin/') ? 'last fetch' : 'local base, no remote branch'}).`);
}

lines.push(changes.length > 0 ? `Working tree: ${changes.length} uncommitted change(s).` : 'Working tree clean.');

if (isMidOperation(cwd)) {
    lines.push('A merge, rebase or cherry-pick is in progress: finish it or ask before anything else.');
}

if (protectedBranches().test(branch)) {
    lines.push('Protected branch: create a work branch before committing.');
}

if (existsSync(flowFile)) {
    lines.push(`A flow is in progress on this branch: read ${flowFile} first and resume at the first unchecked phase.`);
}

if (stage === 'genesis') {
    const order = ['kickoff', 'stack', 'foundations', 'feature'].filter(role => roles[role]).map(role => `/${roles[role]}`);

    if (order.length > 0) {
        lines.push(`This project is being created. Commands in order: ${order.join(' → ')}. Once the stack is chosen and code exists, run /podium again.`);
    }
}

addContext('SessionStart', lines.join('\n'));
