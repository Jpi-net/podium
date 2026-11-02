---
paths:
  - "{{LAYER_PATHS}}"
---
# {{LAYER}} (Java / Kotlin example: adapt every line to the repository)

## Stack
- JDK version from the build file and toolchain; build tool (Maven `pom.xml` or Gradle `build.gradle(.kts)` with the wrapper `./gradlew` / `./mvnw`); always use the wrapper.
- Static analysis as configured (Checkstyle, SpotBugs, ktlint, detekt, Spotless).

## Conventions
- Package structure as observed (by feature or by layer); dependency direction respected.
- Immutability by default (records, `final`, Kotlin `val`); nullability annotations or Kotlin null safety as used.
- Framework patterns (Spring Boot, Quarkus, Micronaut…) from the code base: configuration, dependency injection, transactions, validation.
- Exceptions: domain exceptions mapped at the boundary as the code base does.

## Tests
- JUnit 5 with the assertion and mocking libraries in use; naming as observed; integration tests with the existing setup (Testcontainers, slices).
- One test: `./gradlew test --tests "<Class>.<method>"` or `./mvnw -Dtest=<Class>#<method> test`.

## Commands
```bash
{{LAYER_COMMANDS}}
```
