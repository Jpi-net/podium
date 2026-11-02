---
paths:
  - "{{LAYER_PATHS}}"
---
# {{LAYER}} ({{LAYER_STACK}})

Write only facts of this repository: real paths, real commands, the patterns the code actually uses. Delete any section with nothing specific to say.

## Stack
- Language and version, framework and version, key libraries (with the version the lockfile or project file pins).

## Structure
- Folder layout and what goes where (cite one real path per folder).
- Dependency direction between modules or layers; what must never import what.

## Conventions
- Naming (files, types, functions, tests), as observed and as enforced by the linter.
- Error handling and logging pattern (cite a reference file).
- Typing, nullability, async rules.
{{#IF_ZERO_COMMENTS}}
- Zero comments in new code, except the allowed markers: {{COMMENT_ALLOW}}.
{{/IF_ZERO_COMMENTS}}

## Reference implementations
- `path/to/file`: why it is the model to mirror.

## Tests
- Framework, folder, naming, how to run one test, how to run the layer's tests.

## Commands (from {{LAYER_ROOT}})
```bash
{{LAYER_COMMANDS}}
```

## Pitfalls
- Things that broke before or that CI rejects (warnings as errors, format check, generated files).
