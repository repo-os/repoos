---
id: "1044"
title: "Post-merge summary: status and report-state edge cases (follow-up to #1041)"
type: bug
status: active
priority: p3
area: [core, web]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/post-merge-summary-status-and-report-sta
created_at: "2026-11-06T22:50:03Z"
updated_at: "2026-11-08T01:04:41Z"
last_check_failure: "repoos check at 2026-11-08T00:24:39.979Z: repoos check failed: ui verification failed: timed out waiting for the task's browser capture"
---
## Problem

#1041 landed the PM-written post-merge task summary after 14 review passes. The reviewer's last pass (14) still listed failure-path edge cases that were set aside so the feature could ship. They are all about the summary status and the committed report disagreeing, and one UI evidence gap.

## Desired UX

- A retry never reports success from an old report while the new run is still pending or after it failed.
- A summary whose status is done but whose report file is missing or unreadable shows as failed with the reason, in the CLI and in the task drawer, and is retryable.
- A failed pending-status write is surfaced, not ignored.
- A shot shows the task drawer Report pane with a rendered post-merge summary (use a state fixture), not only an engineering report.

## Acceptance criteria

- queueTaskSummary does not start a run when the pending status write fails, or fails loudly after one retry (src/server/task-summary.ts ~873-889).
- A persisted done status with a missing or unreadable summary.md resolves to failed with the reason (src/server/task-summary.ts ~276-290), and the drawer renders that error.
- The CLI and API never treat an unchanged idle or done status plus an old report as success for a new retry (src/commands/control-api.ts ~1793-1808, 1900-1907).
- A fixture-based shot of the Report pane with a summary-bearing task is declared and captured.
- Tests cover each case.

## Notes for AI

Read work/reports/1041/review-14.md (and review-12, review-13) on the 1041 branch history for the exact lines and the pattern the reviewer flagged. Check first whether #1041's final commit already fixed any of these and only do what is still open. Keep it narrow: one pass, no new failure-path classes; file anything else as a separate task.

## Shots
```json
[
{
"label": "Task drawer Report pane with post-merge summary",
"target": "default",
"route": "/work?task=9999&tab=agent",
"selector": "[data-test-id=\"task-summary\"]",
"highlight": "[data-test-id=\"task-summary\"]",
"state": "drawer:postMergeSummary"
}
]
```

## Activity

- 2026-11-06T22:50:03Z · created · njachowski@gmail.com
- 2026-11-07T06:24:31Z · status inbox→ready
- 2026-11-07T22:51:50Z · status ready→active, branch
- 2026-11-07T22:53:41Z · body
- 2026-11-07T23:01:54Z · message_queued at 2026-11-07T23:01:54.682Z
- 2026-11-07T23:01:54Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-07T23:02:23Z · body
- 2026-11-07T23:03:47Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-07T23:13:02Z · body
- 2026-11-07T23:18:47Z · CTO nudge: held — handoff gate is running
- 2026-11-07T23:20:20Z · note: ui verification failed (2 issue(s)): [missing-target] Task drawer Report pane with post-merge summary (target "default"): highlight [data-test-id="task-summary"] matched nothing on /work?task=9999&tab=agent (http://127.0.0.1:52165/work?shotState=drawer:postMergeSummary); [missing-target] Task drawer Report pane with post-merge summary (target "default"): selector [data-test-id="task-summary"] matched nothing on /work?task=9999&tab=agent (http://127.0.0.1:52165/work?shotState=drawer:postMergeSumm
- 2026-11-07T23:20:21Z · message_queued at 2026-11-07T23:20:21.071Z
- 2026-11-07T23:20:24Z · message_delivered: 1 message(s)
- 2026-11-07T23:34:11Z · body
- 2026-11-07T23:42:42Z · CTO nudge: held — handoff gate is running
- 2026-11-07T23:47:56Z · CTO nudge: held — handoff gate is running
- 2026-11-08T00:13:05Z · message_queued at 2026-11-08T00:13:05.660Z
- 2026-11-08T00:13:05Z · handoff failed · handoff recovery attempted · finalization failed
- 2026-11-08T00:13:08Z · message_delivered: 1 message(s)
- 2026-11-08T00:14:52Z · CTO nudge: held — remote validation is running
- 2026-11-08T00:21:40Z · body
- 2026-11-08T00:22:56Z · CTO nudge: held — handoff gate is running
- 2026-11-08T00:24:36Z · message_queued at 2026-11-08T00:24:36.840Z
- 2026-11-08T00:24:39Z · message_delivered: 1 message(s)
- 2026-11-08T00:26:16Z · CTO nudge: held — remote validation is running
- 2026-11-08T00:34:25Z · body
- 2026-11-08T00:38:34Z · body
- 2026-11-08T00:41:56Z · CTO nudge: held — handoff gate is running
- 2026-11-08T00:42:43Z · handoff failed · check failed after 2 automatic retries · ui verification failed: timed out waiting for the task's browser capture
- 2026-11-08T00:42:43Z · message_queued at 2026-11-08T00:42:43.593Z
- 2026-11-08T00:42:56Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-08T00:47:57Z · message_delivered: 1 message(s)
- 2026-11-08T00:47:58Z · CTO action: restart-stalled-agent (resume) · handoff recovery was attempted after an interrupted turn but finalization failed — manual intervention needed
- 2026-11-08T00:49:43Z · body
- 2026-11-08T00:52:07Z · CTO nudge: held — remote validation is running
- 2026-11-08T00:52:15Z · note: ui verification passed: 1 of 1 shot captured with clean console
- 2026-11-08T00:52:15Z · note: handoff requested (cli)
- 2026-11-08T00:52:56Z · CTO nudge: held — handoff gate is running
- 2026-11-08T01:04:41Z · message_queued at 2026-11-08T01:04:41.625Z
- 2026-11-08T01:04:41Z · handoff failed · task-file handoff failed at verify · ui verification failed: timed out waiting for the task's browser capture
- 2026-11-08T01:04:41Z · message_delivered: 1 message(s)
