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
created_at: "2026-11-01T12:22:22Z"
updated_at: "2026-11-01T14:47:29Z"
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
