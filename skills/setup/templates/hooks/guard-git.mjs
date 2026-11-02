import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { currentBranch, deny, git, hasCommits, invokes, isMidOperation, mentionsAssistant, pattern, protectedBranches, readInput, setting } from './lib.mjs';

const input = readInput();
const command = input.tool_input?.command ?? '';
const cwd = input.cwd ?? process.cwd();

const PR_CREATE = /^(gh\s+pr\s+create|az\s+repos\s+pr\s+create|glab\s+mr\s+create)\b/;
const PR_EDIT = /^(gh\s+pr\s+edit|az\s+repos\s+pr\s+update|glab\s+mr\s+update)\b/;

const isCommit = invokes(command, /^git\b.*\bcommit\b/);
const isPrCreate = invokes(command, PR_CREATE);
const isPrCommand = isPrCreate || invokes(command, PR_EDIT);
const isBranchCommand = invokes(command, /^git\b.*\b(checkout\s+-[bB]|switch\s+-[cC]|branch\s+(?!-[dD])\S|push)\b/);

if (!isCommit && !isPrCommand && !isBranchCommand) {
    process.exit(0);
}

const targetDir = command.match(/\bgit\s+-C\s+(["']?)([^\s"']+)\1/)?.[2];
const targetRoot = git(targetDir ? (isAbsolute(targetDir) ? targetDir : join(cwd, targetDir)) : cwd, 'rev-parse', '--show-toplevel');

if (!isPrCommand && /[\\/]\.claude$/.test(targetRoot)) {
    process.exit(0);
}

const referencedFiles = [...command.matchAll(/(?:\s-F\s*|\s--file[=\s]|\s--body-file[=\s]|\s--description-file[=\s]|@|\$\(\s*cat\s+)(["']?)([^\s'")]+)\1/g)]
    .map(match => (isAbsolute(match[2]) ? match[2] : join(cwd, match[2])))
    .filter(path => existsSync(path));

if (setting('checks.aiMention', false)) {
    const scanned = [command, ...referencedFiles.map(path => readFileSync(path, 'utf8'))].join('\n');

    if (mentionsAssistant(scanned)) {
        deny('Blocked: this project opted out of AI attribution in git artifacts, and the commit, branch or PR text carries one (an AI "Co-Authored-By" trailer, "Generated with/by <assistant>", "AI-generated" or a model name). Remove it (see .claude/rules/git-workflow.md).');
    }
}

if (invokes(command, /^git\b.*(\s--no-verify\b|\bcommit\b.*\s-[a-zA-Z]*n[a-zA-Z]*\b)/)) {
    deny('Blocked: --no-verify is forbidden. Fix what the git hook reports instead.');
}

if (isCommit) {
    const branch = currentBranch(cwd);
    const isBootstrap = !hasCommits(cwd);

    if (!isBootstrap && protectedBranches().test(branch)) {
        deny(`Blocked: never commit directly on "${branch}". Create a work branch first (see .claude/rules/git-workflow.md).`);
    }

    const commitPattern = pattern(setting('hooks.commitPattern', ''));

    if (commitPattern && !isMidOperation(cwd) && !/\bcommit\b[^|;&]*--no-edit\b/.test(command)) {
        const heredoc = command.match(/<<-?\s*'?"?(\w+)'?"?\s*\n([\s\S]*?)\n\s*\1/);
        const inline = command.match(/\s-m\s+(["'])([\s\S]*?)\1/);
        const fileMessage = referencedFiles.length > 0 ? readFileSync(referencedFiles[0], 'utf8') : null;
        const inlineMessage = inline && !inline[2].trim().startsWith('$(') ? inline[2] : null;
        const message = heredoc?.[2] ?? inlineMessage ?? fileMessage;

        if (message) {
            const firstLine = message.trim().split('\n')[0].trim();

            if (!commitPattern.test(firstLine)) {
                const example = setting('hooks.commitExample', '');
                deny(`Blocked: the commit message does not follow the project format${example ? ` (example: "${example}")` : ''}. Got: "${firstLine}". See .claude/rules/git-workflow.md.`);
            }
        }
    }
}

if (isPrCreate && setting('hooks.prDraft', false) && !/\s--draft(\s+true)?\b/.test(command)) {
    deny('Blocked: pull requests are always created as drafts (--draft). The user publishes them after review.');
}

process.exit(0);
