---
id: "0925"
title: Cancelling a close-out must kill its check process tree and free its slot
type: bug
status: active
priority: p1
area: [server, core]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/cancelling-a-close-out-must-kill-its-che
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-10-22T06:32:56Z"
updated_at: "2026-10-22T08:43:02Z"
handoff_signal_retry_count: 2
engineer_stall_resume_log: "[{\"at\":\"2026-10-22T08:20:35.105Z\",\"reason\":\"clean-exit-without-handoff\"},{\"at\":\"2026-10-22T08:39:33.891Z\",\"reason\":\"clean-exit-without-handoff\"}]"
---
## Problem
POST /api/tasks/:id/done/cancel returns ok but does not stop the close-out's check process. 2026-10-22: after cancelling #0908 the 'bun src/cli/index.ts check --profile full' (pid 36175, cwd integrate/0908) kept running as an orphan (ppid 1) for 7 more minutes, still holding local check slot 1. Retrying Move to done returned 'previous close-out attempt was stopped but is still shutting down' the whole time. Also a vitest worker (pid 29031) from #0909's cancelled run stayed behind idle for 33 min. Each cancel therefore needs hand-killing by pid.

## Desired UX
Cancel signals the check's whole process group (SIGTERM, then SIGKILL after a short grace), waits for exit, releases the local check slot, deletes the job and the candidate worktree, and only then lets 'Move to done' start again. The Checks page shows 'stopping...' with the PID tree if it takes over ~10 s.

## Acceptance criteria
- Test: cancel during validating leaves no process with cwd in the candidate, frees the slot, and a following done starts attempt N+1 immediately.
- Orphaned check/vitest processes whose candidate worktree is gone are reaped on the next sweep.

## Notes for AI
Related: #0921 (dead slot holders), #0923 (gc vs running close-out), #0919 (repoos done --cancel).

## Scope addition
Also fix #0921 in the same change (dead-holder detection for local check slots: free a slot immediately when its holder pid is dead; flag a live but silent holder as wedged after 60-90 s without heartbeat and reclaim after a 2-3 min grace; surface slot holders on the Checks page and in the CLI). Do not hand off until verified and repoos check --changed main passes; run the slot/close-out tests in small groups.

## Activity

- 2026-10-22T06:32:56Z · created · njachowski@gmail.com
- 2026-10-22T07:47:39Z · body: Scope addition (added)
- 2026-10-22T07:48:36Z · status inbox→ready
- 2026-10-22T07:48:43Z · cli_override, model_override
- 2026-10-22T07:48:44Z · status ready→active, branch
- 2026-10-22T07:50:15Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-22T07:59:18Z · body
- 2026-10-22T08:05:38Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-22T08:14:22Z · body
- 2026-10-22T08:15:15Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-22T08:20:35Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 1/3 in 30m
- 2026-10-22T08:27:33Z · message_queued at 2026-10-22T08:27:33.872Z
- 2026-10-22T08:27:34Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-22T08:29:52Z · body
- 2026-10-22T08:32:23Z · body
- 2026-10-22T08:32:33Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-22T08:33:09Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-10-22T08:33:09Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-22T08:33:10Z · message_delivered: 1 message(s)
- 2026-10-22T08:33:24Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-22T08:39:33Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 2/3 in 30m
- 2026-10-22T08:43:02Z · body
