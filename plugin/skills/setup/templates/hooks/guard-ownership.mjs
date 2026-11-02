import { isAbsolute, join, relative, sep } from 'node:path';
import { deny, pattern, projectDir, readInput, readOnlyAgents, setting } from './lib.mjs';

const input = readInput();
const agent = input.agent_type;
const filePath = input.tool_input?.file_path ?? input.tool_input?.notebook_path;

if (!agent || !filePath) {
    process.exit(0);
}

const root = projectDir();
const absolute = isAbsolute(filePath) ? filePath : join(input.cwd ?? root, filePath);
const path = relative(root, absolute).split(sep).join('/');

if (path.startsWith('..') || path.startsWith('.claude/agent-memory/')) {
    process.exit(0);
}

if (path.startsWith('.claude/')) {
    deny(`Blocked: ${agent} may not edit the agent configuration (.claude/).`);
}

if (readOnlyAgents().has(agent)) {
    deny(`Blocked: ${agent} is read-only. Report the change instead of making it.`);
}

const generated = pattern(setting('generated', ''));

if (generated && generated.test(path)) {
    deny(`Blocked: ${path} is generated. Regenerate it with its command instead of editing it.`);
}

const partitions = setting('hooks.partitions', {});
const allowed = pattern(partitions[agent] ?? '');

if (allowed && !allowed.test(path)) {
    deny(`Blocked: ${path} is outside the ${agent} partition. Do not edit it: report the needed change under "Open issues" so the orchestrator assigns it to its owner.`);
}

process.exit(0);
