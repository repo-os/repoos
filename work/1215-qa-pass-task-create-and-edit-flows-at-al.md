---
id: "1215"
title: "QA pass: task create and edit flows at all screen sizes"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-task-create-and-edit-flows-at-al
created_at: "2026-11-19T03:17:33Z"
updated_at: "2026-11-19T04:41:41Z"
last_handoff_failure_fingerprint: "check|repoos check failed: staleness — src/ui-app/tests/task-create-edit-responsive.test.ts(80,38): error TS2339: Property 'exists' does not exist on type 'Omit<DOMWrapper<Element>, \"exists\">'."
last_handoff_failure_sha: 46a73bf59b37b1521b7b2c239a62594a7f55ff46
review_passes: 1
handoff_signal_retry_count: 1
---
## Problem
Task creation and editing (new task drawer, edit fields, attachments, screenshots) has not had a QA pass at phone, tablet and desktop widths.
## Desired UX
Every field, validation message and button works and is reachable at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only; never open a visible browser or steal focus.
- Exercise create, edit, depends-on, priority, area and screenshot attach using fixtures; fix layout, wording and dead controls with tests.
- Commit docs/qa/2026-11-task-create-edit-qa.md listing what was checked.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T03:17:33Z · created · t@t
- 2026-11-19T03:17:36Z · status inbox→ready
- 2026-11-19T03:17:38Z · status ready→active, branch
- 2026-11-19T03:22:19Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The tablet viewport was missing from the dependency-picker browser test. I added 768 px, so the headless WebKit test now covers 375, 768 and 1280 px. All three cases passed; the scoped run also passed 99 tests and the build. I documented t… · stderr: Reading additional input from stdin... 2026-11-19T03:22:17.880126Z ERROR codex_core::session: failed to record rollout items: thread 01a1f1cf-5f04-7233-8ce7-0db64e3e6002 not found
- 2026-11-19T03:31:10Z · body
- 2026-11-19T03:35:34Z · body
- 2026-11-19T03:37:15Z · status active→review
- 2026-11-19T03:37:15Z · message_queued at 2026-11-19T03:37:15.469Z
- 2026-11-19T03:37:15Z · note: shots: skipped — the diff (4 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-19T03:37:47Z · note: review pass 1: needs some work
- 2026-11-19T04:17:51Z · status review→active
- 2026-11-19T04:17:52Z · watchdog: restarting engineer because a queued message waited 41m with no live process
- 2026-11-19T04:17:54Z · message_delivered: 1 message(s)
- 2026-11-19T04:17:56Z · message_queued at 2026-11-19T04:17:56.321Z
- 2026-11-19T04:18:02Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-19T04:24:10Z · queued message undelivered for 6m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-19T04:24:14Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code unknown) · last assistant: The scoped check has reached remote validation and is uploading the changed tree to its runner. The run is still progressing; I’m waiting for the gate result before handing this back. · stderr: Reading additional input from stdin... 2026-11-19T04:17:59.883376Z ERROR codex_models_manager::manager: failed to refresh available models: request timed out 2026-11-19T04:22:34.887336Z ERROR codex_models_manager::manager: failed to refresh available models: request timed out
- 2026-11-19T04:24:20Z · note: handoff requested (cli)
- 2026-11-19T04:24:22Z · orphaned run process stopped · pid 46533 · ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 -o ServerAliveInterval · cpu 0s · age 1m
- 2026-11-19T04:26:36Z · message_delivered: 1 message(s)
- 2026-11-19T04:26:42Z · CTO nudge: held — handoff gate is running
- 2026-11-19T04:37:20Z · message_queued at 2026-11-19T04:37:20.535Z
- 2026-11-19T04:37:21Z · handoff failed · task-file handoff failed at check · repoos check failed: staleness — src/ui-app/tests/task-create-edit-responsive.test.ts(80,38): error TS2339: Property 'exists' does not exist on type 'Omit<DOMWrapper<Element>, "exists">'.
- 2026-11-19T04:37:51Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-19T04:41:41Z · queued message undelivered for 4m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-19T04:41:41Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code unknown) · last assistant: The responsive fixture suite now passes at 375, 768 and 1280 px. It mounts the real task drawer, verifies create and edit saves, area and priority model updates, and screenshot upload from a queued fixture; a real dependency-picker fixture… · stderr: 2026-11-19T04:40:14.064605Z ERROR codex_models_manager::manager: failed to refresh available models: request timed out
