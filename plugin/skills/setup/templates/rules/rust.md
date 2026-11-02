---
paths:
  - "{{LAYER_PATHS}}"
---
# {{LAYER}} (Rust example: adapt every line to the repository)

## Stack
- Toolchain from `rust-toolchain.toml` (or the observed edition in `Cargo.toml`); workspace members as listed in the root `Cargo.toml`.

## Conventions
- `cargo fmt` formatting and `cargo clippy` warnings are fixed, not silenced; `#[allow(...)]` only with the reason the code base accepts.
- Errors through `Result` and the error crate the code base uses (`thiserror` for libraries, `anyhow` for binaries, or as observed); no `unwrap()`/`expect()` outside tests and proven invariants.
- `unsafe` only where the code base already allows it, with the invariant stated next to it.
- Public API changes follow the crate's semver policy.

## Tests
- Unit tests in `#[cfg(test)] mod tests` next to the code, integration tests in `tests/`.
- One test: `cargo test -p <crate> <test_name>`.

## Commands
```bash
{{LAYER_COMMANDS}}
```
