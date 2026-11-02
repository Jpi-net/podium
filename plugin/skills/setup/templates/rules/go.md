---
paths:
  - "{{LAYER_PATHS}}"
---
# {{LAYER}} (Go example: adapt every line to the repository)

## Stack
- Go version from `go.mod`; linters from `.golangci.yml`.

## Conventions
- `gofmt`/`goimports` formatting is mandatory.
- Errors returned, wrapped with `%w` and context; no panics in library code.
- Context (`context.Context`) first parameter of request-scoped functions, propagated.
- Package layout as observed (`cmd/`, `internal/`, `pkg/`); no import cycles; `internal/` stays internal.
- Small interfaces defined by the consumer.

## Tests
- Table-driven tests in `_test.go` files next to the code; `t.Run` sub-tests; testify only if the code base uses it.
- One test: `go test ./path/to/pkg -run TestName -v`.

## Commands
```bash
{{LAYER_COMMANDS}}
```
