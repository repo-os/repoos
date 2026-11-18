---
check_retry_count: 1
last_check_failure: "repoos check at 2026-11-18T21:29:29.351Z: repoos check failed: reused check inputs changed during handoff — run the check again"
id: "1203"
title: "QA pass: new-task and update flows via the CLI and UI agree – body sections, validation messages and needs-input handling"
type: bug
status: active
priority: p2
area: [web, core]
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-new-task-and-update-flows-via-th
created_at: "2026-11-18T20:47:36Z"
updated_at: "2026-11-18T21:29:29Z"
review_rounds: 1
routing_switches: 1
review_passes: 1
---
## Problem
UI and CLI task creation have different validation (needs input, required sections) and may give confusing messages.
## Desired UX
The same invalid task gets the same clear message in UI and CLI, and needs-input states are understandable.
## Acceptance criteria
- Headless Playwright only against the auth-less dev server (just serve-noauth from a scratch worktree); never open a visible browser or the user's Chrome. Fix bugs with tests.
- Commit docs/qa/2026-11-task-validation.md.
## Notes for AI
Do not touch repoos.toml. Never open a visible browser window.

## Shots
```json
[
{
"label": "New-task needs-input message",
"target": "default",
"route": "/work",
"highlight": "[role=\"status\"]",
"state": "toast:taskNeedsInput"
}
]
```

## Activity

- 2026-11-18T20:47:36Z · created · t@t
- 2026-11-18T20:47:39Z · status inbox→ready
- 2026-11-18T20:47:40Z · status ready→active, branch
- 2026-11-18T20:52:48Z · body
- 2026-11-18T20:55:11Z · body
- 2026-11-18T20:56:23Z · watchdog: check wait escalated · waiting: waiting for a Playwright slot — position 2 (1 ahead); slot holder 75497 is dead for 7s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-18T20:56:38Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-18T21:04:51Z · body
- 2026-11-18T21:06:51Z · CTO nudge: held — handoff gate is running
- 2026-11-18T21:08:00Z · note: ui verification passed: 1 shot captured with clean console
- 2026-11-18T21:08:01Z · status active→review
- 2026-11-18T21:08:01Z · message_queued at 2026-11-18T21:08:01.218Z
- 2026-11-18T21:08:27Z · note: review pass 1: needs some work
- 2026-11-18T21:08:28Z · message_delivered: 1 message(s)
- 2026-11-18T21:08:28Z · status review→active
- 2026-11-18T21:08:30Z · CTO nudge: held — remote validation is running
- 2026-11-18T21:10:32Z · body
- 2026-11-18T21:28:07Z · body
- 2026-11-18T21:29:22Z · CTO nudge: held — handoff gate is running
- 2026-11-18T21:29:26Z · message_queued at 2026-11-18T21:29:26.348Z
- 2026-11-18T21:29:29Z · message_delivered: 1 message(s)

