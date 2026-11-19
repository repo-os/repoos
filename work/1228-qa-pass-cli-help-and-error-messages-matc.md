---
id: "1228"
title: "QA pass: CLI help and error messages match the docs and read in plain English"
type: bug
status: active
priority: p2
area: core
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-cli-help-and-error-messages-matc
created_at: "2026-11-19T11:47:39Z"
updated_at: "2026-11-19T11:47:44Z"
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
- 2026-11-19T11:47:44Z · status ready→active, branch
- 2026-11-19T11:47:44Z · note: agent fallback: codex + gpt-6-luna is paused (out of usage since 2026-11-19T07:09:32.657Z: Codex hit a provider quota or rate limit. Wait for the provider limit to reset, then retry. (CLI: error: You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purcha) — using opencode + opencode-go/glm-5.3-flash
