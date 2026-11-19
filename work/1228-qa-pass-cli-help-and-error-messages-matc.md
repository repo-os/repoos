---
id: "1228"
title: "QA pass: CLI help and error messages match the docs and read in plain English"
type: bug
status: ready
priority: p2
area: core
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-19T11:47:39Z"
updated_at: "2026-11-19T11:47:43Z"
---
## Problem
CLI commands, flags and error messages may be out of step with user-docs/cli.md and use jargon.
## Desired UX
Every repoos command's --help matches user-docs/cli.md, and common errors say what went wrong and what to do next in plain English.
## Acceptance criteria
- Compare `repoos --help` and each command's help with user-docs/cli.md; fix mismatches and the most confusing error messages with tests.
- Read-only against any server: no ssh, no config changes, never run destructive commands.
- Commit docs/qa/2026-11-cli-help-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T11:47:39Z · created · t@t
- 2026-11-19T11:47:43Z · status inbox→ready
