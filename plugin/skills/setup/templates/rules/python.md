---
paths:
  - "{{LAYER_PATHS}}"
---
# {{LAYER}} (Python example: adapt every line to the repository)

## Stack
- Python version from `pyproject.toml` / `.python-version`; environment manager as used (`uv`, `poetry`, `pip-tools`, `pipenv`); never install globally.
- Linters and formatters from `pyproject.toml` (`ruff`, `black`, `mypy`, `pyright`).

## Conventions
- Type hints on every public function; the type checker in CI must pass.
- Imports sorted by the configured tool; absolute imports inside the package.
- Errors: custom exceptions per domain as the code base does; never bare `except:`.
- Framework patterns (Django, FastAPI, Flask…) from the code base: settings, dependency injection, migrations.

## Tests
- `pytest` layout and fixtures as observed (`conftest.py`); naming `test_<behaviour>`.
- One test: `pytest path/to/test_file.py::test_name -q`.

## Commands
```bash
{{LAYER_COMMANDS}}
```
