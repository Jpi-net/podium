---
name: {{CMD_UPGRADE}}
description: Upgrades dependencies that automated tools skip (major versions, framework upgrades) with breaking-change migrations, full verification and a pull request. Use when the user types /{{CMD_UPGRADE}} or asks to upgrade dependencies or a framework.
argument-hint: "[scope] [--major]"
---

# /{{CMD_UPGRADE}}: dependency upgrades

Talk to the user in {{CONVERSATION_LANGUAGE}}.

1. Inventory per ecosystem (one `Explore` agent each, in parallel): current vs latest versions, majors pending, release notes and migration guides of each major.
2. Plan (user validation required): what to upgrade now, what to defer and why, migration steps, risks.
3. Branch from `origin/{{BASE_BRANCH}}`; upgrade each ecosystem with its owning expert in parallel (disjoint manifests and lockfiles).
4. Invoke `{{CMD_DELIVER}}` with the full verification scope (every area: build, lint, all tests); it opens the pull request.
{{#IF_DRAFT_PR}}
   The pull request is created as a draft: the user reviews and publishes it.
{{/IF_DRAFT_PR}}
5. Report: upgraded, deferred, breaking changes handled, manual checks advised.
