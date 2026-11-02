---
paths:
  - "{{LAYER_PATHS}}"
---
# {{LAYER}} (.NET example: adapt every line to the repository)

## Stack
- .NET version from `global.json` / `TargetFramework`; analyzers from `Directory.Build.props` and `.editorconfig`.
- CI builds with the flags of the pipeline (often `/p:TreatWarningsAsErrors=true`): any warning fails. Validate with the same configuration (Debug or Release) CI uses.

## Conventions
- File-scoped namespaces, one type per file, `sealed` for new classes unless designed for inheritance.
- Explicit types or `var` as `.editorconfig` dictates (enforced by `dotnet format`).
- `Async` suffix and `CancellationToken` propagation on async methods.
- Nullable reference types enabled: no `!` suppression without a reason.
- Dependency direction between projects as the solution defines it (domain has no infrastructure dependency).

## Tests
- Framework (xUnit, NUnit, MSTest) and assertion library from the test projects; naming as observed (e.g. `Method_Context_ExpectedResult`); Arrange / Act / Assert.
- One test: `dotnet test <project> --filter "FullyQualifiedName~<Class>.<Method>"`.

## Commands
```bash
{{LAYER_COMMANDS}}
```
Format check: `dotnet format <solution> --verify-no-changes --include <changed files>`.
