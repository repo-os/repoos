---
id: "1178"
title: "QA pass: Work board task drawer flows (review, changes, logs, close-out) desktop and mobile"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-work-board-task-drawer-flows-rev
created_at: "2026-11-18T05:56:51Z"
updated_at: "2026-11-18T06:17:12Z"
handoff_signal_retry_count: 1
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
- 2026-11-18T06:04:06Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: I recorded the test results and the `drawer:reviewWithBranch` fixture inspection in [the QA report](/Users/nick/code/nick/repoos-worktrees/feat/qa-pass-work-board-task-drawer-flows-rev/docs/qa/2026-11-task-drawer.md). The targeted suites p… · stderr: Reading additional input from stdin... 2026-11-18T06:02:56.818164Z ERROR codex_core::tools::router: error=apply_patch verification failed: Failed to find expected lines in /Users/nick/code/nick/repoos-worktrees/feat/qa-pass-work-board-task-drawer-flows-rev/docs/qa/2026-11-task-drawer.md: The targeted suites passed and…
- 2026-11-18T06:17:12Z · CTO nudge: held — handoff gate is running
