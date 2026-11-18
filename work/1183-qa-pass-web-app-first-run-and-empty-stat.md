---
id: "1183"
title: "QA pass: web app first-run and empty states – new project, no tasks, no agents, offline server"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-web-app-first-run-and-empty-stat
created_at: "2026-11-18T10:17:38Z"
updated_at: "2026-11-18T11:17:55Z"
---
## Problem
First-run, empty and error states are rarely exercised and likely have rough edges.
## Desired UX
Empty board, no agents configured, server offline and failed-load states show clear guidance, at 1280 and 375 widths, with no console errors.
## Acceptance criteria
- Drive the auth-less dev server (just serve-noauth from a scratch worktree) and fixtures for these states; fix bugs with tests.
- Commit docs/qa/2026-11-empty-states.md.
## Notes for AI
Do not touch repoos.toml.

## Shots
```json
[
{
"label": "Empty work board guidance",
"target": "default",
"route": "/work",
"highlight": "[data-testid=\"work-empty-state\"]",
"state": "work:empty"
},
{
"label": "Work board failed-load recovery",
"target": "default",
"route": "/work",
"highlight": "[data-testid=\"work-load-error\"]",
"state": "work:failedLoad"
}
]
```

## Activity

- 2026-11-18T10:17:38Z · created · t@t
- 2026-11-18T10:17:41Z · status inbox→ready
- 2026-11-18T10:17:43Z · status ready→active, branch
- 2026-11-18T10:24:33Z · body
- 2026-11-18T10:34:51Z · message_queued at 2026-11-18T10:34:51.349Z
- 2026-11-18T10:34:51Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-18T10:35:19Z · body
- 2026-11-18T10:39:51Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-18T10:54:55Z · queued message undelivered for 20m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-18T10:54:55Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code unknown) · last assistant: The required check has checkpointed the final tree and is running its remote build and changed-path test suite now. The browser QA and doc updates are complete; I’m waiting for the gate result before handoff. · stderr: Reading additional input from stdin...
- 2026-11-18T10:54:56Z · message_delivered: 1 message(s)
- 2026-11-18T10:58:50Z · message_queued at 2026-11-18T10:58:50.074Z
- 2026-11-18T10:58:50Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-18T10:59:08Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-18T11:05:18Z · body
- 2026-11-18T11:11:25Z · queued message undelivered for 13m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-18T11:11:26Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code unknown) · last assistant: Formatting is fixed. The gate is back through the remote build and changed-path suite; its selected set is broad and test output is noisy, but the current cases are passing. · stderr: 2026-11-18T10:54:57.542500Z ERROR codex_core::util: Custom tool call output is missing for call id: call_4af0e59c46ec41b8ad326053d0f08f26 2026-11-18T10:55:01.034818Z ERROR codex_core::tools::router: error=write_stdin failed: Unknown process id 56016 2026-11-18T10:55:01.041368Z ERROR codex_core::util: Custom tool call …
- 2026-11-18T11:11:26Z · message_delivered: 1 message(s)
- 2026-11-18T11:14:51Z · message_queued at 2026-11-18T11:14:51.422Z
- 2026-11-18T11:14:51Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-18T11:17:55Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
