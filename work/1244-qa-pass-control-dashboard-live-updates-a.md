---
id: "1244"
title: "QA pass: Control dashboard live updates and reconnect behavior"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-control-dashboard-live-updates-a
cli_override: claude code
model_override: haiku
created_at: "2026-11-19T20:07:32Z"
updated_at: "2026-11-19T20:28:49Z"
---
## Problem
The Control dashboard and Work board use live updates; behavior after a dropped connection, a server restart or a long idle tab has not been checked.
## Desired UX
After the server restarts or the connection drops, pages show a short plain-English reconnecting state and catch up on their own without a manual reload, at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only against fixtures and simulated disconnects; never open a visible browser.
- Fix stale-data and stuck-banner problems with tests; commit docs/qa/2026-11-live-reconnect-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T20:07:32Z · created · t@t
- 2026-11-19T20:07:36Z · status inbox→ready
- 2026-11-19T20:07:37Z · cli_override, model_override
- 2026-11-19T20:07:38Z · status ready→active, branch
- 2026-11-19T20:23:50Z · message_queued at 2026-11-19T20:23:50.257Z
- 2026-11-19T20:23:50Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-19T20:26:51Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-19T20:27:06Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code unknown) · last assistant: The scoped `repoos check` is still running on the remote runner, so I'm waiting on the monitor. Nothing is ready to hand off until it reports a pass. Where things stand: - **Fixed:** a failed board refresh after an SSE reconnect is now ret… · stderr: (empty)
- 2026-11-19T20:27:06Z · message_delivered: 1 message(s)
- 2026-11-19T20:28:49Z · message_queued at 2026-11-19T20:28:49.934Z
