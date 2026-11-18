---
id: "1184"
title: "QA pass: web app keyboard and accessibility – focus order, labels, dialogs, contrast"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-web-app-keyboard-and-accessibili
created_at: "2026-11-18T12:17:32Z"
updated_at: "2026-11-18T12:23:04Z"
---
## Problem
Keyboard and screen-reader behavior of dialogs, drawers and menus has not had a recent pass.
## Desired UX
Every dialog/drawer traps and restores focus, controls have accessible names, Escape closes overlays, and contrast passes in light and dark themes.
## Acceptance criteria
- Drive the auth-less dev server (just serve-noauth from a scratch worktree) and check Work, Settings, Releases and Agents with keyboard only; fix bugs with tests.
- Commit docs/qa/2026-11-keyboard-a11y.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-18T12:17:32Z · created · t@t
- 2026-11-18T12:17:36Z · status inbox→ready
- 2026-11-18T12:17:39Z · status ready→active, branch
- 2026-11-18T12:19:14Z · note: adopted orphaned engineer pid 52979
- 2026-11-18T12:23:04Z · body
