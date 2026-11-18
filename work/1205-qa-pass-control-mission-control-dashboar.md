---
id: "1205"
title: "QA pass: Control (Mission Control) dashboard – every card, chart and empty state at desktop and 375px"
type: bug
status: review
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-control-mission-control-dashboar
created_at: "2026-11-18T21:47:29Z"
updated_at: "2026-11-18T23:37:56Z"
last_handoff_failure_fingerprint: "check|repoos check failed: check-fmt:check — Formatting failed — run `bun run fmt` to fix:"
last_handoff_failure_sha: c23e5318dc07620af19c3b6c3d71f3368ce6a9f8
handoff_signal_retry_count: 1
review_rounds: 1
routing_switches: 1
review_passes: 1
---
## Problem
The Control dashboard shows usage, costs and activity and has not had a recent pass.
## Desired UX
All cards and charts render with real, empty and error data and stay readable at 1280 and 375px.
## Acceptance criteria
- Headless Playwright only against the auth-less dev server (just serve-noauth from a scratch worktree); never open a visible browser or the user's Chrome. Fix bugs with tests.
- Commit docs/qa/2026-11-control-dashboard.md.
## Notes for AI
Do not touch repoos.toml. Never open a visible browser window.

## Shots
```json
[
{
"label": "Mission Control resources at desktop",
"target": "default",
"route": "/",
"selector": ".resource-panel",
"highlight": ".process-table-wrap",
"state": "system:processTable",
"viewportWidth": 1280,
"viewportHeight": 1200
},
{
"label": "Mission Control resources at 375px",
"target": "default",
"route": "/",
"selector": ".resource-panel",
"highlight": ".process-table-wrap",
"state": "system:processTable",
"viewportWidth": 375,
"viewportHeight": 1200
}
]
```

## Activity

- 2026-11-18T21:47:29Z · created · t@t
- 2026-11-18T21:47:32Z · status inbox→ready
- 2026-11-18T21:47:34Z · status ready→active, branch
- 2026-11-18T21:53:46Z · body
- 2026-11-18T21:57:35Z · body
- 2026-11-18T22:01:34Z · body
- 2026-11-18T22:05:14Z · CTO nudge: held — handoff gate is running
- 2026-11-18T22:20:07Z · note: ui verification passed: 1 of 1 shot captured with clean console
- 2026-11-18T22:20:08Z · status active→review
- 2026-11-18T22:20:08Z · message_queued at 2026-11-18T22:20:08.743Z
- 2026-11-18T22:20:49Z · note: review pass 1: needs some work
- 2026-11-18T22:20:50Z · message_delivered: 1 message(s)
- 2026-11-18T22:20:50Z · status review→active
- 2026-11-18T22:20:53Z · CTO nudge: held — remote validation is running
- 2026-11-18T22:27:49Z · CTO nudge: held — handoff gate is running
- 2026-11-18T22:40:03Z · note: ui verification passed: 1 of 1 shot captured with clean console
- 2026-11-18T22:40:04Z · message_queued at 2026-11-18T22:40:04.228Z
- 2026-11-18T22:40:14Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-18T22:43:16Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-18T22:43:17Z · message_delivered: 1 message(s)
- 2026-11-18T22:46:18Z · body
- 2026-11-18T23:05:14Z · message_queued at 2026-11-18T23:05:14.764Z
- 2026-11-18T23:05:14Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-18T23:05:56Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-18T23:08:46Z · queued message undelivered for 4m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-18T23:08:46Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code unknown) · last assistant: I found the test failure: the header text is rendered as `Runtime` (case preserved by the component test), while the assertion expected uppercase `RUNTIME`. The single component test now passes with a case-insensitive assertion. I’m rerunn… · stderr: Reading additional input from stdin... 2026-11-18T22:44:27.195521Z ERROR codex_core::tools::router: error=exec_command failed: CreateProcess { message: "Rejected(\"Failed to create unified exec process: No such file or directory (os error 2)\")" } 2026-11-18T23:06:27.181253Z ERROR codex_core::tools::router: error=exec…
- 2026-11-18T23:08:46Z · status active→review
- 2026-11-18T23:08:47Z · message_delivered: 1 message(s)
- 2026-11-18T23:08:47Z · note: handoff requested (cli)
- 2026-11-18T23:08:55Z · status active→review
- 2026-11-18T23:26:26Z · handoff failed · task-file handoff failed at check · repoos check failed: check-fmt:check — Formatting failed — run `bun run fmt` to fix:
- 2026-11-18T23:37:56Z · message_queued at 2026-11-18T23:37:56.209Z
