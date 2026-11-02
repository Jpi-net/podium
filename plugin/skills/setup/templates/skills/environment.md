---
name: {{CMD_ENVIRONMENT}}
description: Drives the local environment of the project - status, start, health, logs of a service, reset of local data. Use when the user types /{{CMD_ENVIRONMENT}}, or when another flow needs the local stack up or its logs.
argument-hint: "[status|up|down|logs <service>|reset]"
---

# /{{CMD_ENVIRONMENT}}: local stack

Talk to the user in {{CONVERSATION_LANGUAGE}}. Commands of this project:

{{ENVIRONMENT_COMMANDS}}

- `status` (default): which services run, their health, ports.
- `up`: start what is needed, wait for health, report.
- `logs <service>`: the last relevant lines, errors first.
- `down`: stop without deleting data.
- `reset`: deletes local data: ask the user first, every time.

Never print secrets from environment files; never touch remote environments.
