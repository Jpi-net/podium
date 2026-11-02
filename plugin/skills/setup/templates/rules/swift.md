---
paths:
  - "{{LAYER_PATHS}}"
---
# {{LAYER}} (Swift example: adapt every line to the repository)

## Stack
- Swift tools version from `Package.swift`, or the Xcode project and its deployment targets; UI framework as observed (SwiftUI, UIKit, AppKit).

## Conventions
- SwiftLint / swift-format config from the repository is the style.
- Concurrency with `async`/`await` and actors as the code base uses them; UI updates on the main actor.
- No force unwrap (`!`) or `try!` outside tests and proven invariants.
- Access control as narrow as possible (`private`, `fileprivate`, `internal`).

## Tests
- XCTest or Swift Testing as observed.
- One test: `swift test --filter <Suite>/<test>` (or `xcodebuild test -scheme <Scheme> -only-testing:<Target>/<Suite>/<test>`).

## Commands
```bash
{{LAYER_COMMANDS}}
```
