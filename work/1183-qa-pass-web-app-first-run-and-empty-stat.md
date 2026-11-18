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
updated_at: "2026-11-18T11:53:03Z"
review_rounds: 2
routing_switches: 1
routing_escalations: 1
review_passes: 2
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
- 2026-11-18T11:17:56Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code unknown) · last assistant: The second run was interrupted before it returned a final status (the remote suite had reached the later tests). The CTO reminder appears to have canceled the long-running shell session, so I’m restarting the check and will keep reporting … · stderr: 2026-11-18T11:11:28.727529Z ERROR codex_core::util: Custom tool call output is missing for call id: call_4af0e59c46ec41b8ad326053d0f08f26 2026-11-18T11:11:28.727659Z ERROR codex_core::util: Custom tool call output is missing for call id: call_dbc768ecf49b4a038004ef5ceca2a84b 2026-11-18T11:11:31.936264Z ERROR codex_cor…
- 2026-11-18T11:17:56Z · message_delivered: 1 message(s)
- 2026-11-18T11:18:06Z · message_queued at 2026-11-18T11:18:06.648Z
- 2026-11-18T11:18:06Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-18T11:19:51Z · CTO nudge: held — handoff gate is running
- 2026-11-18T11:36:28Z · note: ui verification passed: 2 of 2 shots captured with clean console
- 2026-11-18T11:36:29Z · status active→review
- 2026-11-18T11:36:29Z · message_queued at 2026-11-18T11:36:29.417Z
- 2026-11-18T11:37:31Z · note: review pass 1: needs some work
- 2026-11-18T11:37:31Z · message_delivered: 1 message(s)
- 2026-11-18T11:37:32Z · status review→active
- 2026-11-18T11:37:34Z · CTO nudge: held — remote validation is running
- 2026-11-18T11:49:17Z · body
- 2026-11-18T11:52:12Z · note: ui verification passed: 2 of 2 shots captured with clean console
- 2026-11-18T11:52:13Z · status active→review
- 2026-11-18T11:52:13Z · message_queued at 2026-11-18T11:52:13.401Z
- 2026-11-18T11:53:00Z · note: review pass 2: needs some work
- 2026-11-18T11:53:00Z · message_delivered: 1 message(s)
- 2026-11-18T11:53:00Z · status review→active
- 2026-11-18T11:53:03Z · CTO nudge: held — remote validation is running
