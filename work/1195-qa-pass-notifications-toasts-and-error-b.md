---
last_close_out_gate_ms: 80956
last_close_out_gate_at: "2026-11-18T19:14:20.452Z"
id: "1195"
title: "QA pass: notifications, toasts and error banners across the app"
type: bug
status: review
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-notifications-toasts-and-error-b
created_at: "2026-11-18T18:47:48Z"
updated_at: "2026-11-18T19:14:20Z"
review_passes: 1
---
## Problem
Notifications and error banners are generated from many places and may be inconsistent or stale.
## Desired UX
Notifications, toasts, banners and their dismissals are clear, accessible and never stuck.
## Acceptance criteria
- Drive the auth-less dev server (just serve-noauth from a scratch worktree) with headless Playwright only; never open a visible browser or the user's Chrome. Fix bugs with tests.
- Commit docs/qa/2026-11-notifications-banners.md.
## Notes for AI
Do not touch repoos.toml. Never open a visible browser window.

## Activity

- 2026-11-18T18:47:48Z · created · t@t
- 2026-11-18T18:47:51Z · status inbox→ready
- 2026-11-18T18:47:53Z · status ready→active, branch
- 2026-11-18T18:52:42Z · body
- 2026-11-18T18:55:34Z · body
- 2026-11-18T18:59:14Z · CTO nudge: held — handoff gate is running
- 2026-11-18T19:11:44Z · note: ui verification passed: 1 shot captured with clean console
- 2026-11-18T19:11:45Z · status active→review
- 2026-11-18T19:11:45Z · message_queued at 2026-11-18T19:11:45.553Z
- 2026-11-18T19:12:10Z · note: review pass 1: good to go
- 2026-11-18T19:14:20Z · close-out gate completed in 81s

