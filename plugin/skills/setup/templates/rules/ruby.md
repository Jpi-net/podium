---
paths:
  - "{{LAYER_PATHS}}"
---
# {{LAYER}} (Ruby example: adapt every line to the repository)

## Stack
- Ruby version from `.ruby-version` / `Gemfile`; framework as observed (Rails, Hanami, Sinatra, none).

## Conventions
- RuboCop config from `.rubocop.yml` is the style; offences are fixed, not disabled inline.
- Rails: business logic in the place the code base uses (models, service objects, concerns); migrations are reversible; no logic in views.
- No monkey patching outside the observed initializers.
- Background jobs idempotent and retry-safe.

## Tests
- RSpec or Minitest as observed; factories or fixtures as observed.
- One test: `bundle exec rspec spec/path/to_spec.rb:LINE` (or `bin/rails test test/path_test.rb:LINE`).

## Commands
```bash
{{LAYER_COMMANDS}}
```
