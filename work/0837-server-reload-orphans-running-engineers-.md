---
id: "0837"
title: "Server reload orphans running engineers: adopt or stop them (one writer per worktree)"
type: bug
status: review
priority: p2
area: server
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/server-reload-orphans-running-engineers-
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-18T16:14:35Z"
updated_at: "2026-10-18T18:14:43Z"
review_rounds: 2
review_passes: 2
last_check_failure: "repoos check at 2026-10-18T17:35:38.265Z: repoos check failed: ◆ Check plan"
---
## Problem
After a RepoOS server reload, previously running `cursor-agent` engineer processes survive with `ppid=1` (orphaned, 2026-10-18: #0830 and #0832). The new server does not own them, so their handoff and exit signals are lost, the task can sit "active" for an hour with no progress, and a second engineer is started in the same worktree, giving two writers. That caused a post-handoff WIP checkpoint commit on #0832 that blocked its Move to done.

## Desired UX
On startup (and after a reload) the server reconciles agent processes for active tasks: an engineer process it can positively identify for a task worktree is either adopted (re-attached to the runner state so its exit and handoff are tracked) or stopped cleanly before a replacement is started. Never start a second engineer in a worktree that has a live one. Never kill by name; use recorded PIDs/process groups.

## Acceptance criteria
- Test: orphaned engineer pid recorded for a task is detected after a simulated reload and adopted or stopped; a replacement is not started while it is alive.
- Test: unrelated processes are never touched.
- Task activity records "adopted"/"stopped orphaned engineer pid N".
- docs/agent-run-operations.md updated.

## Notes for AI
Related: #0834 (post-handoff checkpoint recovery), watchdog and CTO restart paths. Source: driver incident 2026-10-18.

## Activity

- 2026-10-18T16:14:35Z · created · njachowski@gmail.com
- 2026-10-18T16:57:53Z · status inbox→ready
- 2026-10-18T16:57:58Z · cli_override, model_override
- 2026-10-18T16:57:59Z · status ready→active, branch
- 2026-10-18T17:04:00Z · body
- 2026-10-18T17:06:25Z · body
- 2026-10-18T17:15:47Z · handoff failed · remote validation failed: test failure: tests/agent-concurrency.test.ts > agent start concurrency cap > queues starts beyond maxConcurrentAgents and drains them as slots free, tests/agent-concurrency.test.ts > agent start concurrency cap > a queued task cannot be double-started while waiting for a slot on thinkpad — fix it in the feature branch and re-run the gate
- 2026-10-18T17:20:50Z · CTO action: restart-stalled-agent (resume) · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/agent-concurrency.test.ts > agent start concurrency cap > queues starts beyond maxConcurrentAgents and drains them as slots free, tests/agent-concurrency.test.ts > agent start concurrency cap > a queued task cannot be double-started while waiting for a slot on thinkpad — fix it in the feature branch and re-run the gate
- 2026-10-18T17:21:29Z · message_queued at 2026-10-18T17:21:29.526Z
- 2026-10-18T17:22:22Z · body
- 2026-10-18T17:24:27Z · body
- 2026-10-18T17:35:34Z · message_delivered: 1 message(s)
- 2026-10-18T17:41:34Z · body
- 2026-10-18T17:50:26Z · status active→review
- 2026-10-18T17:50:28Z · note: shots: skipped — the diff (8 changed paths) touches no capture target's globs — no UI change to capture
- 2026-10-18T17:51:34Z · note: review pass 1: needs some work
- 2026-10-18T17:51:37Z · status review→active
- 2026-10-18T17:55:10Z · body
- 2026-10-18T18:03:34Z · status active→review
- 2026-10-18T18:03:36Z · note: shots: skipped — the diff (9 changed paths) touches no capture target's globs — no UI change to capture
- 2026-10-18T18:04:28Z · note: review pass 2: needs some work
- 2026-10-18T18:04:31Z · status review→active
- 2026-10-18T18:07:02Z · body
- 2026-10-18T18:14:43Z · status active→review
