---
paths:
  - "{{LAYER_PATHS}}"
---
# {{LAYER}} (C/C++ example: adapt every line to the repository)

## Stack
- Language standard and build system as observed (`CMakeLists.txt`, Meson, Bazel, Make); compiler flags and warnings from the build files.

## Conventions
- `clang-format` / `clang-tidy` configs from the repository are the style; warnings are fixed, not silenced.
- C++: RAII and smart pointers for ownership; no raw `new`/`delete` outside the observed allocators. C: every allocation has its owner and its free path.
- Headers self-contained with include guards or `#pragma once`, as observed.
- No undefined behaviour shortcuts; sanitizer builds (ASan, UBSan) stay green when the project has them.

## Tests
- The observed framework (GoogleTest, Catch2, CTest, Unity, cmocka).
- One test: `ctest --test-dir build -R <name>` (or the framework's filter flag).

## Commands
```bash
{{LAYER_COMMANDS}}
```
