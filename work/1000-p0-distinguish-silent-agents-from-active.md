---
id: 1000
title: "P0: distinguish silent agents from active checks and hung remote validation"
type: bug
status: review
priority: p0
area: [web, server, core]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/p0-distinguish-silent-agents-from-active
created_at: "2026-11-01T12:22:22Z"
updated_at: "2026-11-01T23:42:18Z"
last_check_failure: "repoos check at 2026-11-01T23:04:14.181Z: repoos check failed: the worktree changed while the gate was running (HEAD moved from 0a907db8 to a188b7db) — the check result no longer describes what is committed, so the handoff was refused. Nothing was lost: the change is still in the worktree. Re-run the handoff once the worktree is stable."
review_passes: 5
last_handoff_failure_fingerprint: "check|repoos check failed: check-fmt:check — Formatting failed — run `bun run fmt` to fix:"
last_handoff_failure_sha: 2fb9cde64350a418ce539aa739486dbb774b91c7
review_rounds: 2
routing_switches: 1
dev_error_count: 5
engineer_failover: "{\"cli\":\"codex\",\"model\":\"gpt-6-luna\"}"
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
"label": "Task card shows active check progress while agent is quiet",
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
- 2026-11-01T16:43:27Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-01T16:47:19Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-01T16:47:19Z · agent exited with an error (cursor) · ✗ handoff deferred — read the queued message(s) first, then request review again
- 2026-11-01T16:47:19Z · engineer crash recovery: resuming cursor + composer-2.5 (1/3 crashes in 30m) · ✗ handoff deferred — read the queued message(s) first, then request review again
- 2026-11-01T16:47:23Z · needs_input
- 2026-11-01T16:47:23Z · message_delivered: 1 message(s)
- 2026-11-01T17:00:03Z · body
- 2026-11-01T17:06:25Z · note: adopted orphaned engineer pid 96893
- 2026-11-01T17:15:12Z · body
- 2026-11-01T17:31:28Z · body
- 2026-11-01T17:42:24Z · agent exited with an error (cursor) · ActionRequiredError: Weekly usage limit reached. It resets in 2 days. Buy credits to keep going now, or upgrade your plan for more weekly usage.
- 2026-11-01T17:42:24Z · engineer crash recovery: switched cursor + composer-2.5 → codex + gpt-6-luna after 1/3 crashes in 30m · ActionRequiredError: Weekly usage limit reached. It resets in 2 days. Buy credits to keep going now, or upgrade your plan for more weekly usage.
- 2026-11-01T17:42:27Z · needs_input
- 2026-11-01T17:50:48Z · body
- 2026-11-01T17:54:06Z · body
- 2026-11-01T18:01:22Z · message_queued at 2026-11-01T18:01:22.953Z
- 2026-11-01T18:01:23Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-01T18:02:40Z · body
- 2026-11-01T18:05:44Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-01T18:05:44Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-11-01T18:05:44Z · message_delivered: 1 message(s)
- 2026-11-01T18:15:46Z · body
- 2026-11-01T18:18:13Z · cli_override, model_override
- 2026-11-01T18:18:19Z · review_cli_override
- 2026-11-01T18:18:20Z · review_cli_override
- 2026-11-01T18:18:22Z · review_model_override
- 2026-11-01T18:45:27Z · status active→review
- 2026-11-01T18:46:12Z · note: review pass 1: needs some work
- 2026-11-01T18:46:12Z · status review→active
- 2026-11-01T18:46:13Z · agent exited with an error (copilot) · error: --no-remote was removed. Use /remote off in a session; manage incoming connections in /environments.
- 2026-11-01T18:46:13Z · engineer crash recovery: surfaced instead of switching — a human-set task override (github copilot + default) is pinned, so RepoOS did not replace it (1/3 crashes in 30m)
- 2026-11-01T18:52:06Z · cli_override, model_override
- 2026-11-01T18:52:07Z · model_override
- 2026-11-01T18:52:15Z · needs_input
- 2026-11-01T18:55:45Z · note: adopted orphaned engineer pid 61755
- 2026-11-01T19:05:44Z · message_queued at 2026-11-01T19:05:44.096Z
- 2026-11-01T19:05:44Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-01T19:05:51Z · body
- 2026-11-01T19:10:44Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-01T19:17:05Z · body
- 2026-11-01T19:21:46Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-01T19:21:46Z · agent exited with an error (codex) · ✗ handoff deferred — read the queued message(s) first, then request review again
- 2026-11-01T19:31:47Z · watchdog: restarting engineer after 10m with no live process
- 2026-11-01T19:31:52Z · message_delivered: 1 message(s)
- 2026-11-01T19:32:29Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-11-01T19:32:29Z · status active→review
- 2026-11-01T19:33:04Z · note: review pass 2: needs some work
- 2026-11-01T19:33:20Z · review_cli_override, review_model_override
- 2026-11-01T19:33:43Z · status review→active
- 2026-11-01T19:34:33Z · body
- 2026-11-01T19:59:38Z · body
- 2026-11-01T20:01:17Z · watchdog: check wait escalated · waiting: waiting for a Playwright slot — position 2 (1 ahead); slot holder has made no progress for 30 minutes (no heartbeat) for 1s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-01T20:01:32Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-01T20:37:13Z · status active→review
- 2026-11-01T20:38:00Z · note: review pass 3: needs some work
- 2026-11-01T20:38:01Z · status review→active
- 2026-11-01T20:38:04Z · CTO nudge: held — remote validation is running
- 2026-11-01T20:51:33Z · body
- 2026-11-01T21:30:10Z · status active→review
- 2026-11-01T21:30:56Z · note: review pass 4: needs some work
- 2026-11-01T21:30:57Z · needs_input
- 2026-11-01T21:56:18Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (2fb9cde64) during finalization (#0734)
- 2026-11-01T22:06:03Z · status review→active
- 2026-11-01T22:06:03Z · note: send-back — returned to active for engineer follow-up
- 2026-11-01T22:06:11Z · needs_input
- 2026-11-01T22:06:12Z · message_queued at 2026-11-01T22:06:12.929Z
- 2026-11-01T22:06:52Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-11-01T22:06:53Z · status active→review
- 2026-11-01T22:06:53Z · message_delivered: 1 message(s)
- 2026-11-01T22:06:54Z · note: handoff requested (cli)
- 2026-11-01T22:10:22Z · CTO nudge: held — handoff gate is running
- 2026-11-01T22:23:25Z · handoff failed · task-file handoff failed at check · repoos check failed: check-fmt:check — Formatting failed — run `bun run fmt` to fix:
- 2026-11-01T22:35:44Z · message_queued at 2026-11-01T22:35:44.384Z
- 2026-11-01T22:35:44Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-01T22:40:44Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-01T22:41:28Z · body
- 2026-11-01T22:46:20Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-01T22:46:21Z · status active→review
- 2026-11-01T22:46:21Z · message_delivered: 1 message(s)
- 2026-11-01T22:46:22Z · note: handoff requested (cli)
- 2026-11-01T22:46:36Z · status active→review
- 2026-11-01T22:47:29Z · note: review pass 5: needs some work
- 2026-11-01T22:47:30Z · needs_input
- 2026-11-01T22:55:39Z · status review→active
- 2026-11-01T22:55:39Z · note: send-back — returned to active for engineer follow-up
- 2026-11-01T22:55:47Z · needs_input
- 2026-11-01T22:55:48Z · message_queued at 2026-11-01T22:55:48.542Z
- 2026-11-01T22:59:58Z · handoff failed · task-file handoff failed at verify · ui verification failed: a browser capture is already in flight for this task
- 2026-11-01T22:59:59Z · message_delivered: 1 message(s)
- 2026-11-01T23:00:47Z · CTO nudge: held — remote validation is running
- 2026-11-01T23:01:20Z · body
- 2026-11-01T23:04:13Z · message_queued at 2026-11-01T23:04:13.874Z
- 2026-11-01T23:05:44Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-01T23:10:49Z · CTO nudge: held — remote validation is running
- 2026-11-01T23:12:07Z · body
- 2026-11-01T23:15:19Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-01T23:15:20Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-11-01T23:15:20Z · status active→review
- 2026-11-01T23:15:20Z · message_delivered: 1 message(s)
- 2026-11-01T23:15:21Z · note: handoff requested (cli)
- 2026-11-01T23:15:49Z · CTO nudge: held — handoff gate is running
- 2026-11-01T23:31:02Z · body
- 2026-11-01T23:42:18Z · status active→review
