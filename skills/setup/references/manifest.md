# `.claude/maestro.json`

The manifest is the contract between this skill, the generated hooks and the maestro panel. The panel's source of truth is the `Manifest` type in the plugin's `hooks/project.ts`; this page mirrors it. The panel ignores keys it does not know, so the `hooks` section below (read only by the generated hooks) is safe.

All regex fields are JavaScript regular expression sources (no slashes, backslashes escaped for JSON) tested against paths relative to the repository root with `/` separators, or against command lines.

## Fields

| Field | Type | Meaning |
|---|---|---|
| `version` | `1` | format version; anything else is ignored by the panel |
| `name` | string | project name |
| `stage` | `"none"` \| `"genesis"` \| `"full"` | `genesis`: starter setup for an empty project; `full`: setup for an existing code base |
| `language.conversation` | string | language the commands talk to the user in (`""` = follow the user) |
| `language.artifacts` | string | language of files, identifiers, commits, logs (default `"en"`) |
| `versioned` | boolean | `.claude/` is committed with the project (`false`: listed in `.git/info/exclude`) |
| `roles` | object | role → command name without slash. Roles: `setup`, `kickoff`, `stack`, `foundations`, `feature`, `fix`, `investigate`, `faq`, `review`, `comments`, `deliver`, `merge`, `upgrade`, `environment` |
| `phases` | `{ id?, name, short, agents[] }[]` | how the panel groups agents into flow phases, in order. `id` ∈ `plan`, `experts`, `verify`, `review`, `deliver` tells the panel what the phase is; `name` and `short` are free interface labels (any language) |
| `reviewers` | `{ agent, label, short }[]` | review agents whose verdict the panel tracks |
| `verification` | `{ step, label, patterns[], optional? }[]` | `step` ∈ `build`, `format`, `lint`, `unit`, `integ`, `front`, `e2e`; `patterns` are regexes matching the real commands; `optional` steps are only required when run |
| `layers` | `{ name, pattern }[]` | first matching pattern names the layer of a path (commit-per-layer view) |
| `code.roots` | regex | paths considered source code (`""` = everything not ignored) |
| `code.extensions` | regex | source file extensions |
| `code.ignore` | regex | paths never considered source |
| `generated` | regex | generated files that must never be edited by hand |
| `checks` | object | optional rules, see below |
| `git.base` | string | base branch (`main`, `master`, `develop`…) |
| `git.featurePrefixes` | string[] | branch prefixes of features |
| `git.fixPrefixes` | string[] | branch prefixes of fixes |
| `git.support` | regex | long-lived maintenance branches (`""` if none) |
| `git.workItem` | regex | first capture group extracts the work item / issue id from a branch name |
| `theme` | string | panel decoration theme (`""` = none, see Advanced options) |
| `generatedFiles` | object | path → sha256 of each file as written by the last `/maestro` run; never contains the manifest itself |

### `checks`

| Key | Type | Meaning |
|---|---|---|
| `comments` | boolean | zero comments in new code (allowed markers in `hooks.commentAllow`) |
| `noVar` | boolean | no `var` declarations (C#, JavaScript) |
| `noFreeFunction` | boolean | no function declared outside a class (TS/C# style rule) |
| `aiMention` | boolean | no AI / assistant mention in commits, branches, PRs |
| `partition` | boolean | the panel flags two agents editing the same file |
| `hooks` | boolean | the panel reports hook denials |
| `generated` | GuardText | texts shown when a generated file is edited by hand |

`legacy`, `isolation` and `integrationImage` are advanced options, described at the end of this page.

`GuardText` = `{ label?, short?, remedy?, why?, fix?, detail? }`: the wording the panel shows for that rule (`detail` replaces the alert text).

### `hooks` (read by the generated hooks only)

| Key | Type | Meaning |
|---|---|---|
| `protectedBranches` | regex | branches nobody commits or pushes to directly |
| `commitPattern` | regex | the first line of a commit message must match (`""` = no check) |
| `commitExample` | string | example shown when the pattern fails |
| `prDraft` | boolean | `gh pr create`, `az repos pr create`, `glab mr create` must request a draft |
| `commentAllow` | regex | comment lines allowed by the zero-comment rule (test markers, banners, directives) |
| `partitions` | object | implementer agent → regex of the paths it may edit |
| `readOnlyAgents` | string[] | agents that may never edit files |
| `safeRemove` | regex | paths a recursive delete may target |
| `secrets` | regex | paths whose content must never be printed |
| `workItemCommand` | string | command printing a JSON summary of a work item, `{id}` replaced (e.g. `gh issue view {id} --json number,title,state`) (`""` = none) |
| `workItemMention` | regex | how users mention a work item in a prompt (first group = id) |
| `blockModelNames` | boolean | also refuse bare model names (opus, sonnet, haiku) in git artifacts; default `false`: they are refused only with an attribution cue ("written with Opus", "Sonnet 4") |

## Example: full stage

```json
{
  "version": 1,
  "name": "shop",
  "stage": "full",
  "language": { "conversation": "", "artifacts": "en" },
  "versioned": true,
  "roles": {
    "setup": "maestro",
    "feature": "feat",
    "fix": "fix",
    "investigate": "investigate",
    "faq": "faq",
    "review": "review-pr",
    "comments": "pr-comments",
    "deliver": "deliver",
    "merge": "merge-base",
    "upgrade": "upgrade",
    "environment": "env"
  },
  "phases": [
    { "id": "plan", "name": "Plan", "short": "Plan", "agents": ["architect", "debugger", "Plan"] },
    { "id": "experts", "name": "Experts", "short": "Experts", "agents": ["api-expert", "web-expert", "db-expert", "test-expert", "devops"] },
    { "id": "verify", "name": "Verify", "short": "Verify", "agents": ["lint-runner"] },
    { "id": "review", "name": "Reviews", "short": "Reviews", "agents": ["code-reviewer", "security-reviewer", "doc-writer"] },
    { "id": "deliver", "name": "Delivery", "short": "Deliv.", "agents": ["git-writer"] }
  ],
  "reviewers": [
    { "agent": "code-reviewer", "label": "code review", "short": "code" },
    { "agent": "security-reviewer", "label": "security review", "short": "security" }
  ],
  "verification": [
    { "step": "build", "label": "build", "patterns": ["\\bpnpm\\s+(-r\\s+)?build\\b"] },
    { "step": "format", "label": "format", "patterns": ["\\bprettier\\b.*--check"] },
    { "step": "lint", "label": "lint", "patterns": ["\\bpnpm\\s+(-r\\s+)?lint(?![:\\w-])"] },
    { "step": "unit", "label": "tests", "patterns": ["\\bpnpm\\s+(-r\\s+)?test\\b", "\\bnpx\\s+vitest\\b"] },
    { "step": "e2e", "label": "E2E", "patterns": ["\\bplaywright\\s+test\\b"], "optional": true }
  ],
  "layers": [
    { "name": "Tests", "pattern": "\\.(spec|test)\\.tsx?$|^e2e/" },
    { "name": "Database", "pattern": "^packages/db/" },
    { "name": "API", "pattern": "^apps/api/" },
    { "name": "Web", "pattern": "^apps/web/" },
    { "name": "Documentation", "pattern": "^docs/|\\.md$" }
  ],
  "code": { "roots": "^(apps|packages)/", "extensions": "\\.(ts|tsx|sql)$", "ignore": "(^|/)(node_modules|dist|\\.claude)/" },
  "generated": "^packages/db/generated/",
  "checks": { "comments": false, "noVar": true, "aiMention": true, "partition": true, "hooks": true },
  "git": {
    "base": "main",
    "featurePrefixes": ["feat/"],
    "fixPrefixes": ["fix/"],
    "support": "",
    "workItem": "(?:^|/)(\\d+)-"
  },
  "theme": "",
  "hooks": {
    "protectedBranches": "^(main|release/.+)$",
    "commitPattern": "^(feat|fix|docs|refactor|test|chore|perf|build|ci)(\\([\\w-]+\\))?!?: \\S.+",
    "commitExample": "feat(api): add order cancellation",
    "prDraft": true,
    "commentAllow": "^\\s*(//|#)\\s*(Arrange|Act|Assert)\\b|eslint-disable|@ts-expect-error",
    "partitions": {
      "api-expert": "^apps/api/(?!.*\\.test\\.ts$)",
      "web-expert": "^apps/web/(?!.*\\.test\\.tsx?$)",
      "db-expert": "^packages/db/(?!generated/)",
      "test-expert": "\\.(spec|test)\\.tsx?$|^e2e/",
      "devops": "^(\\.github/|infra/|Dockerfile|docker-compose)",
      "doc-writer": "^docs/"
    },
    "readOnlyAgents": ["architect", "debugger", "code-reviewer", "security-reviewer", "lint-runner", "git-writer", "Explore", "Plan"],
    "safeRemove": "(^|/)(node_modules|dist|build|coverage|tmp|\\.turbo)/?$|scratchpad",
    "secrets": "(^|/)\\.env(\\.(?!example|template)[\\w.-]+)?$|\\.(pem|key|p12|pfx)$|(^|/)secrets?/",
    "workItemCommand": "gh issue view {id} --json number,title,state,labels",
    "workItemMention": "(?:^|[\\s(])#(\\d+)\\b"
  },
  "generatedFiles": {
    "CLAUDE.md": "<sha256>",
    ".claude/settings.json": "<sha256>"
  }
}
```

Verification patterns match verification commands only. The panel already ignores commands containing `--fix`, `:fix` or `--write`; still, write patterns that do not match fixer scripts (`lint(?![:\w-])` rather than `lint`), and do not map a single-file `npx eslint <file>` to the lint step.

## Example: genesis stage

```json
{
  "version": 1,
  "name": "my-project",
  "stage": "genesis",
  "language": { "conversation": "", "artifacts": "en" },
  "versioned": true,
  "roles": { "setup": "maestro", "kickoff": "kickoff", "stack": "stack", "foundations": "foundations", "feature": "feat" },
  "phases": [
    { "id": "plan", "name": "Plan", "short": "Plan", "agents": ["product", "architect", "Plan"] },
    { "id": "experts", "name": "Experts", "short": "Experts", "agents": ["app-expert", "devops"] },
    { "id": "review", "name": "Reviews", "short": "Reviews", "agents": ["code-reviewer"] }
  ],
  "reviewers": [{ "agent": "code-reviewer", "label": "code review", "short": "code" }],
  "layers": [{ "name": "Documentation", "pattern": "^docs/|\\.md$" }],
  "code": { "roots": "", "extensions": "\\.(ts|tsx|js|py|go|cs|java|kt|rs)$", "ignore": "(^|/)(node_modules|dist|\\.claude)/" },
  "generated": "",
  "checks": { "aiMention": true, "partition": true, "hooks": true },
  "git": { "base": "main", "featurePrefixes": ["feat/"], "fixPrefixes": ["fix/"], "support": "", "workItem": "(?:^|/)(\\d+)-" },
  "theme": "",
  "hooks": {
    "protectedBranches": "^main$",
    "commitPattern": "^(feat|fix|docs|refactor|test|chore|perf|build|ci)(\\([\\w-]+\\))?!?: \\S.+",
    "commitExample": "feat: add the first page",
    "prDraft": false,
    "partitions": {
      "product": "^docs/product/",
      "devops": "^(\\.github/|\\.gitlab-ci|azure-pipelines|infra/|deploy/|Dockerfile|docker-compose|\\.dockerignore)",
      "app-expert": "^(?!docs/|\\.claude/|\\.github/|\\.gitlab-ci|azure-pipelines|infra/|deploy/|Dockerfile|docker-compose|\\.dockerignore)"
    },
    "readOnlyAgents": ["architect", "code-reviewer", "Explore", "Plan"],
    "safeRemove": "(^|/)(node_modules|dist|build|tmp)/?$|scratchpad",
    "secrets": "(^|/)\\.env(\\.(?!example|template)[\\w.-]+)?$|\\.(pem|key)$"
  },
  "generatedFiles": {}
}
```

`prDraft` follows the Step 1 choice; `commitPattern` follows the convention chosen in the proposal (empty only when the user wants no format).

Leave `verification` out to use the panel's built-in patterns (npm/pnpm/yarn/bun, dotnet, cargo, go, pytest, maven/gradle); an empty array disables the detection. The same holds for `layers`, `phases` and `reviewers`: absent or empty `phases`/`reviewers` are inferred from `.claude/agents/`.

## Advanced options

Project-specific guards the panel can show. Generate them only when the audit finds the matching situation and the user confirms; word every text for this project.

| Key | Type | Meaning |
|---|---|---|
| `checks.legacy` | GuardText & `{ pattern, current, modern? }` | flags new files created in a legacy area (`pattern`) while working on a feature branch; `current` names where new code goes; `modern` counts files in the new area |
| `checks.isolation` | GuardText & `{ rules: ContentRule[], enabledBy?: { pattern, path } }` | content rules for a data-isolation model (tenants, organisations, owners): when a `path` matches, `when` matches the content (optional) and `require` does not, warn with `message`; `skipName` excludes file names; `enabledBy` activates the rules only when `pattern` is found under `path` (`git grep`) |
| `checks.integrationImage` | GuardText & `{ command, schema, build, armFlag?, stale? }` | warns when integration tests (`command` regex) run after `schema` files changed since the last image `build`; `armFlag` is a flag required on ARM machines; `stale` is the hint shown |
| `git.counterpart` | string | suffix of the twin branch a maintenance fix needs on the base branch (e.g. `-main`); the panel reminds it when missing |
| `theme` | string | panel decoration theme; `""` keeps the generic effects |
