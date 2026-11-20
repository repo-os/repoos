---
updated_at: "2026-11-20T15:23:03Z"
review_failed_report_retries: 2
id: "1276"
title: Close-out validation log should show live progress
type: feature
status: review
priority: p1
area: [server, core]
assigned_to: ai
created_by: t@t
branch: feat/close-out-validation-log-should-show-liv
cli_override: claude code
model_override: haiku
created_at: "2026-11-20T07:42:21Z"
review_rounds: 2
review_passes: 2
handoff_signal_retry_count: 2
---
## Problem
During a close-out the integration log (.repoos/logs/integration/<id>-<n>.log) is not written for the running attempt: #1258's log was last modified hours earlier while its job had been validating for ~55 minutes. Drivers and the UI cannot tell whether a close-out is running, waiting for a host slot, retrying after a timeout, or stuck. The card timer also appears to count from an earlier start.

## Desired UX
The running attempt streams its check progress to a log and to the integration-job API: current step (queued for host slot, building candidate, bundling, running tests with done/total, publishing), the host it runs on, the attempt number and when this attempt actually started. A retry after a timeout or failure is shown as a new attempt with its reason.

## Acceptance criteria
- Each attempt writes its own log file as it runs, updated at least every 30 seconds while active.
- GET /api/tasks/<id>/integration-job returns attempt, host, step and last-progress timestamp.
- The task card and drawer show the step, host and attempt; a stale progress timestamp is flagged as possibly stuck.
- Tests plus a docs update in docs/close-out-pipeline.md.

## Notes for AI
Related: #1272 (timer should count from validation start). Never touch repoos.toml.

## Activity

- 2026-11-20T07:42:21Z · created · t@t
- 2026-11-20T07:42:27Z · status inbox→ready
- 2026-11-20T07:46:53Z · cli_override, model_override
- 2026-11-20T07:46:53Z · status ready→active, branch
- 2026-11-20T09:01:37Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The close-out progress feature is implemented, but the task is **not ready to hand off**: the scoped gate is still red, so I've left the task `active` and not emitted the handoff signal. **Why the gate is red** - Three remote runs each fai… · stderr: (empty)
- 2026-11-20T09:25:20Z · body
- 2026-11-20T09:36:55Z · body
- 2026-11-20T10:01:23Z · body
- 2026-11-20T10:02:36Z · CTO nudge: held — handoff gate is running
- 2026-11-20T10:05:12Z · note: ui verification passed: 1 shot captured with clean console
- 2026-11-20T10:05:13Z · status active→review
- 2026-11-20T10:05:13Z · message_queued at 2026-11-20T10:05:13.796Z
- 2026-11-20T10:10:42Z · note: review pass 1: needs some work
- 2026-11-20T10:10:43Z · status review→active
- 2026-11-20T10:10:45Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-20T10:15:52Z · message_queued at 2026-11-20T10:15:52.688Z
- 2026-11-20T10:21:05Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-11-20T10:21:08Z · note: handoff requested (cli)
- 2026-11-20T10:22:36Z · CTO nudge: held — handoff gate is running
- 2026-11-20T10:48:38Z · note: ui verification passed: 1 shot captured with clean console
- 2026-11-20T10:48:39Z · message_queued at 2026-11-20T10:48:39.327Z
- 2026-11-20T10:48:40Z · handoff failed · task-file handoff failed at review · Engineering report draft is missing: .repoos/engineering-report-drafts/1276.md
- 2026-11-20T10:51:23Z · message_delivered: 1 message(s)
- 2026-11-20T10:53:29Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-20T11:16:19Z · body
- 2026-11-20T11:18:34Z · message_overdue: still queued after 60m without being delivered
- 2026-11-20T11:20:49Z · handoff_deferred: 2 queued message(s) must be read before review
- 2026-11-20T11:20:50Z · message_queued at 2026-11-20T11:20:50.639Z
- 2026-11-20T11:20:51Z · ↻ resuming engineer to read queued message
- 2026-11-20T11:20:51Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: Now the full scoped gate on the round-2 tree, run in the background since it takes about 20 minutes. · stderr: (empty)
- 2026-11-20T11:40:20Z · message_delivered: 3 message(s)
- 2026-11-20T12:54:42Z · body
- 2026-11-20T12:58:33Z · CTO nudge: held — handoff gate is running
- 2026-11-20T13:18:52Z · note: ui verification passed: 1 shot captured with clean console
- 2026-11-20T13:18:54Z · status active→review
- 2026-11-20T13:18:54Z · message_queued at 2026-11-20T13:18:54.663Z
- 2026-11-20T13:20:32Z · note: review pass 2: needs some work
- 2026-11-20T13:20:33Z · message_delivered: 1 message(s)
- 2026-11-20T13:20:33Z · status review→active
- 2026-11-20T13:20:36Z · CTO nudge: held — remote validation is running
- 2026-11-20T14:24:38Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — task-file handoff failed at review · Engineering report draft is missing: .repoos/engineering-report-drafts/1276.md · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-11-20T14:24:40Z · note: handoff requested (cli)
- 2026-11-20T14:24:54Z · message_queued at 2026-11-20T14:24:54.091Z
- 2026-11-20T14:24:54Z · handoff failed · task-file handoff failed at commit · git commit failed: fatal: cannot do a partial commit during a merge.
- 2026-11-20T14:25:22Z · message_delivered: 1 message(s)
- 2026-11-20T14:55:10Z · body
- 2026-11-20T14:56:14Z · CTO nudge: held — handoff gate is running
- 2026-11-20T15:22:32Z · note: ui verification passed: 2 shots captured with clean console
- 2026-11-20T15:22:36Z · status active→review
- 2026-11-20T15:22:37Z · message_queued at 2026-11-20T15:22:37.186Z
- 2026-11-20T15:22:53Z · note: review pass 3: failed — no usable report
- 2026-11-20T15:23:03Z · note: review pass 4: failed — no usable report

