---
id: "1178"
title: "QA pass: Work board task drawer flows (review, changes, logs, close-out) desktop and mobile"
type: bug
status: review
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-work-board-task-drawer-flows-rev
created_at: "2026-11-18T05:56:51Z"
updated_at: "2026-11-18T06:18:27Z"
---
## Problem
The task drawer is the most-used screen and has had many recent changes.
## Desired UX
Drawer tabs, actions and states (active, review, blocked, done) render and behave correctly at 1280 and 375 widths.
## Acceptance criteria
- Drive the auth-less dev server (just serve-noauth from a worktree) through drawer states using fixtures.
- Fix bugs with tests; commit docs/qa/2026-11-task-drawer.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-18T05:56:51Z · created · t@t
- 2026-11-18T05:57:12Z · status inbox→ready
- 2026-11-18T05:57:15Z · status ready→active, branch
- 2026-11-18T06:18:27Z · status active→review
