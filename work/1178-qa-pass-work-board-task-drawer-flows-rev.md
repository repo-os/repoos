---
id: "1178"
title: "QA pass: Work board task drawer flows (review, changes, logs, close-out) desktop and mobile"
type: bug
status: done
priority: p2
area: web
merged_commit: 904ad2ddaf3cc46f4401c5fca10359568a60e4f4
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-work-board-task-drawer-flows-rev
created_at: "2026-11-18T05:56:51Z"
updated_at: "2026-11-18T08:08:31Z"
last_close_out_gate_ms: 203360
last_close_out_gate_at: "2026-11-18T08:08:25.379Z"
review_passes: 2
handoff_signal_retry_count: 2
close_out_repair_count: 1
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
- 2026-11-18T06:18:27Z · status active→review
- 2026-11-18T06:18:28Z · message_queued at 2026-11-18T06:18:28.017Z
- 2026-11-18T06:18:28Z · note: shots: skipped — the diff (3 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-18T06:19:07Z · note: review pass 1: good to go
- 2026-11-18T06:55:58Z · status review→active
- 2026-11-18T06:55:58Z · note: close-out repair: gate-failure
- 2026-11-18T06:56:01Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-18T07:01:06Z · message_queued at 2026-11-18T07:01:06.549Z
- 2026-11-18T07:06:18Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-11-18T07:06:19Z · note: handoff requested (cli)
- 2026-11-18T07:07:11Z · message_queued at 2026-11-18T07:07:11.213Z
- 2026-11-18T07:07:11Z · handoff failed · task-file handoff failed at check · repoos check failed: ui-smoke — $ bun scripts/ui-smoke.mjs
- 2026-11-18T07:22:17Z · message_overdue: still queued after 60m without being delivered
- 2026-11-18T07:28:38Z · message_overdue: still queued after 60m without being delivered
- 2026-11-18T07:32:17Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-18T07:38:25Z · message_delivered: 3 message(s)
- 2026-11-18T07:38:27Z · CTO action: restart-stalled-agent (resume) · agent crashed or was interrupted mid-turn — task-file handoff failed at check · repoos check failed: ui-smoke — $ bun scripts/ui-smoke.mjs
- 2026-11-18T07:40:50Z · status active→review
- 2026-11-18T07:40:52Z · note: shots: skipped — the diff (4 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-18T07:43:26Z · note: review pass 2: good to go
- 2026-11-18T07:43:31Z · message_queued at 2026-11-18T07:43:31.065Z
- 2026-11-18T08:08:25Z · close-out gate completed in 203s
- 2026-11-18T08:08:31Z · status done→done, release:success
