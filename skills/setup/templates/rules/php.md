---
paths:
  - "{{LAYER_PATHS}}"
---
# {{LAYER}} (PHP example: adapt every line to the repository)

## Stack
- PHP version and extensions from `composer.json` (`require.php`); framework as observed (Laravel, Symfony, none).

## Conventions
- `declare(strict_types=1);` where the code base uses it; PSR-12 or the observed formatter config (`php-cs-fixer`, `phpcs`).
- Typed properties, parameters and return types; static analysis level from `phpstan.neon` / `psalm.xml` is never lowered.
- Autoloading through Composer PSR-4 namespaces; no `require` of class files.
- Database access through the observed ORM or query builder; no string-concatenated SQL.

## Tests
- PHPUnit or Pest as observed, tests mirroring the source namespace.
- One test: `vendor/bin/phpunit --filter <TestName>` (or `vendor/bin/pest --filter <name>`).

## Commands
```bash
{{LAYER_COMMANDS}}
```
