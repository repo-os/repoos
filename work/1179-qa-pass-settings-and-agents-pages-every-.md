---
id: "1179"
title: "QA pass: Settings and Agents pages – every control saves, validates and survives reload"
type: bug
status: review
priority: p2
area: [web, server]
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-settings-and-agents-pages-every-
created_at: "2026-11-18T06:47:46Z"
updated_at: "2026-11-18T07:43:45Z"
---
## Problem
Settings and Agents pages have many controls added over time; some may not save or validate.
## Desired UX
Each Settings tab control saves, shows validation errors clearly, and persists after reload; the Agents page shows accurate state.
## Acceptance criteria
- Drive the auth-less dev server (just serve-noauth from a worktree, never against the real repo config) through every Settings tab and the Agents page.
- Fix bugs found with tests; commit docs/qa/2026-11-settings-agents.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-18T06:47:46Z · created · t@t
- 2026-11-18T06:48:02Z · status inbox→ready
- 2026-11-18T06:48:09Z · status ready→active, branch
- 2026-11-18T07:43:45Z · status active→review
