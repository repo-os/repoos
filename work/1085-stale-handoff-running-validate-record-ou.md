---
id: "1085"
title: Stale handoff 'running validate' record outlives its check and disables Move to done
type: bug
status: active
priority: p2
area: [server, web]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/stale-handoff-running-validate-record-ou
cli_override: cursor
model_override: composer-2.5
created_at: "2026-11-10T06:12:03Z"
updated_at: "2026-11-10T20:03:27Z"
review_rounds: 1
review_passes: 1
engineer_stall_resume_log: "[{\"at\":\"2026-11-10T17:47:42.870Z\",\"reason\":\"handoff-deferred\"}]"
deferred_handoff_resume_count: 1
---
## Problem
A task's handoff record can stay at `running` / step `validate` for hours after the work moved on. Seen on #1080 (handoff started 04:55Z, still "running validate" at 06:05Z even though review pass 8 was "good to go" and `repoos landable` was ready) and #1070 (same, ~30+ min). `repoos handoff-status <id>` keeps reporting running, and the board card shows "Checks · checking validate · 1h 11m" with "REVIEW PASSED · CHECKS RUNNING" and a greyed Move to done, which makes people think landing will fail.

## Likely cause
The handoff record is only cleared by the handoff pipeline finishing. When the status changes by another path (watchdog auto-surfaced the task, `repoos review again`, send-back, a review pass completing while the validate step is waiting on a serialized local check), nothing reconciles the stale record.

## Acceptance criteria
1. A handoff record that is not backed by a live check/handoff process, or whose task has since had a newer review verdict or status change, is cleared or marked `superseded`; `handoff-status` and the card then show the real state.
2. The card never shows "checks running" with an elapsed time longer than the check timeout without flagging it as stale.
3. Move to done is not disabled by a stale handoff record when `repoos landable` is ready.
4. Tests: stale running record + newer review pass; stale record with no live process.

## Notes for AI
Look at the handoff state store behind `repoos handoff-status` (src/server/handoff.ts), the watchdog (check-wait escalation) and the card state in the UI. Do not edit repoos.toml.

## Shots
```json
[
{
"label": "Active card marks stale handoff on checks line",
"target": "default",
"route": "/work?shotState=card:handoffStaleActive",
"highlight": "[data-task-id=\"9999\"] [data-test-id=\"task-card-check-progress\"]"
},
{
"label": "Review card ready after superseded handoff",
"target": "default",
"route": "/work?shotState=card:reviewLandableReady",
"highlight": "[data-task-id=\"9999\"] .tc-hint"
}
]
```

## Screenshots

![33](/api/tasks/1085/attachments/att_a0b0c8a0-ddb0-4469-85cc-ffe94a272b11.png)

## Activity

- 2026-11-10T06:12:03Z · created · njachowski@gmail.com
- 2026-11-10T06:12:03Z · screenshots
- 2026-11-10T06:12:05Z · needs_input
- 2026-11-10T13:33:39Z · status inbox→ready
- 2026-11-10T13:33:40Z · cli_override, model_override
- 2026-11-10T13:33:45Z · status ready→active, needs_input, branch
- 2026-11-10T13:49:27Z · message_queued at 2026-11-10T13:49:27.857Z
- 2026-11-10T13:49:28Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-10T13:54:27Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-10T14:04:28Z · CTO nudge: held — handoff gate is running
- 2026-11-10T17:31:10Z · CTO nudge: held — handoff gate is running
- 2026-11-10T17:31:19Z · status active→review
- 2026-11-10T17:42:35Z · note: ui verification passed: 1 shot captured with clean console
- 2026-11-10T17:42:36Z · note: review pass 1: needs some work
- 2026-11-10T17:42:37Z · message_queued at 2026-11-10T17:42:37.075Z
- 2026-11-10T17:42:37Z · note: Task body is underspecified: missing sections: Desired UX
- 2026-11-10T17:42:37Z · status review→active
- 2026-11-10T17:42:38Z · message_queued at 2026-11-10T17:42:38.035Z
- 2026-11-10T17:42:38Z · handoff failed · handoff recovery attempted · finalization failed
- 2026-11-10T17:42:40Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-10T17:47:42Z · watchdog: auto-resumed engineer to read a deferred handoff message · resume 1/3
- 2026-11-10T17:47:46Z · message_delivered: 2 message(s)
- 2026-11-10T17:49:56Z · body
- 2026-11-10T17:59:44Z · message_queued at 2026-11-10T17:59:44.908Z
- 2026-11-10T17:59:45Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-10T18:01:10Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-10T18:02:10Z · body
- 2026-11-10T18:19:49Z · body
- 2026-11-10T18:35:27Z · body
- 2026-11-10T18:58:12Z · body
- 2026-11-10T18:59:51Z · queued message undelivered for 60m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-10T18:59:52Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 143) · last assistant: no assistant message · stderr: (empty)
- 2026-11-10T18:59:54Z · note: handoff requested (cli)
- 2026-11-10T19:01:15Z · CTO nudge: held — handoff gate is running
- 2026-11-10T19:04:35Z · message_delivered: 1 message(s)
- 2026-11-10T19:09:46Z · note: ui verification failed: ui verification failed (1 issue(s)): [missing-target] Active handoff stale flag on checks line (long-running validate) (target "default"): highlight [data-task-id="9999"] .tc-status-line matched nothing on /work (http://127.0.0.1:46227/work?shotState=card%3AreviewChecksRunning)
- 2026-11-10T19:09:46Z · message_queued at 2026-11-10T19:09:46.811Z
- 2026-11-10T19:09:47Z · handoff failed · task-file handoff failed at verify · ui verification failed (1 issue(s)): [missing-target] Active handoff stale flag on checks line (long-running validate) (target "default"): highlight [data-task-id="9999"] .tc-status-line matched nothing on /work (http://127.0.0.1:46227/work?shotState=card%3AreviewChecksRunning)
- 2026-11-10T19:10:55Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-10T19:11:45Z · body
- 2026-11-10T19:41:01Z · body
- 2026-11-10T19:55:50Z · body
- 2026-11-10T20:03:26Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-10T20:03:26Z · message_queued at 2026-11-10T20:03:26.826Z
- 2026-11-10T20:03:27Z · ↻ resuming engineer to read queued message
