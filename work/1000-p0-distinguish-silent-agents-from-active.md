---
id: 1000
title: "P0: distinguish silent agents from active checks and hung remote validation"
type: bug
status: active
priority: p0
area: [web, server, core]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/p0-distinguish-silent-agents-from-active
cli_override: cursor
model_override: composer-2.5
created_at: "2026-11-01T12:22:22Z"
updated_at: "2026-11-01T16:40:46Z"
dev_error_count: 1
engineer_crash_log: "[{\"cli\":\"cursor\",\"model\":\"composer-2.5\",\"at\":\"2026-11-01T15:34:30.949Z\",\"kind\":\"dev-error\"}]"
---
## Problem
Active task cards can show STUCK · SILENT while a scoped check or remote validation is still running or waiting for a result. On 2026-11-01, #0994 showed silent while its local check log continued through the test suite (109/645 tests observed); #0998 showed silent while its engineer awaited a validation tool call and an SSH process to thinkpad remained open, even though runner status reported thinkpad idle. The current presentation conflates agent output silence, check progress, remote queue/run state, and a truly hung process. That can prompt an unsafe restart while work is still running and hides a remote validation hang when runner telemetry disagrees.

## Desired UX
Task cards show the actual phase and evidence: agent working/silent, local check step and progress, remote validation queued/running with host and elapsed time, or a stalled check with the last heartbeat and recovery action. A task is only called stuck when no engineer, check, remote run, queue wait, or heartbeat indicates legitimate progress. Restart is unavailable while a check or validation is in flight unless RepoOS safely cancels it first.

## Acceptance criteria
- Local check progress/heartbeat is reflected on the task card and suppresses the agent-silence stuck label while the check is alive and progressing.
- Remote validation queue, host, stage, elapsed time, and heartbeat are surfaced to the card and reconciled with the runner process/run status; an SSH process waiting without a registered run is identified as an abnormal state rather than healthy idle.
- A true hung run (no process progress or heartbeat past the configured threshold) is distinguished from an ordinary quiet interval and has an actionable, safe recovery path.
- Restart/pause actions cannot create a second worker or overlap validation; cancelling a check is explicit and verified before a restart.
- Cover the #0994 local-check and #0998 remote-wait cases with regression tests, including disagreements between agent output, check records, SSH process state, and runner telemetry. Keep existing sleep-aware thresholds and configured pressure/runner policy.
- Update task-card and validation-status documentation. Do not kill processes by name; use verified PIDs and RepoOS lifecycle APIs.

## Notes for AI
Read #0719/#0721 (agent output timestamp), #0678, #0799 (close-out heartbeat), #0921/#0925 (check slots/cancellation), #0993 (active task recovery), and #0999 (automatic task bookkeeping dirtying main). This is a focused UI/server observability and safe-recovery fix; preserve actual active check output and remote run state as separate signals. Screenshot attached as reproduction evidence.

## Shots
```json
[
{
"label": "Task card shows live check progress instead of stuck silent",
"target": "default",
"route": "/work",
"highlight": ".tc-hint",
"state": "checks:progress"
}
]
```

## Screenshots

![Task cards mark validation waits as stuck silent](/api/tasks/1000/attachments/att_641e1119-5965-4f51-902b-49e47c38c424.png)

## Activity

- 2026-11-01T12:22:22Z · created · njachowski@gmail.com
- 2026-11-01T12:22:23Z · screenshots
- 2026-11-01T12:22:25Z · needs_input
- 2026-11-01T12:22:43Z · body: Problem (added 1, removed 1); Desired UX (added); Desired behavior (removed)
- 2026-11-01T12:22:56Z · status inbox→ready
- 2026-11-01T12:22:56Z · note: Nick flagged the card silence misclassification as P0; screenshot and live #0994/#0998 evidence attached.
- 2026-11-01T14:47:29Z · status ready→active, needs_input, branch
- 2026-11-01T14:48:31Z · engineer stopped by request
- 2026-11-01T14:49:06Z · cli_override, model_override
- 2026-11-01T14:55:33Z · body
- 2026-11-01T15:08:11Z · message_queued at 2026-11-01T15:08:11.058Z
- 2026-11-01T15:08:11Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-01T15:12:28Z · body
- 2026-11-01T15:13:11Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-01T15:15:01Z · note: adopted orphaned engineer pid 49868
- 2026-11-01T15:16:40Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-01T15:30:18Z · body
- 2026-11-01T15:34:30Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-01T15:34:30Z · agent exited with an error (cursor) · ✗ handoff deferred — read the queued message(s) first, then request review again
- 2026-11-01T15:34:30Z · engineer crash recovery: resuming cursor + composer-2.5 (1/3 crashes in 30m) · ✗ handoff deferred — read the queued message(s) first, then request review again
- 2026-11-01T15:34:34Z · needs_input
- 2026-11-01T15:34:34Z · message_delivered: 1 message(s)
- 2026-11-01T16:28:34Z · note: adopted orphaned engineer pid 88380
- 2026-11-01T16:38:27Z · message_queued at 2026-11-01T16:38:27.629Z
- 2026-11-01T16:38:27Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-01T16:40:46Z · body
