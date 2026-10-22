---
id: "0925"
title: Cancelling a close-out must kill its check process tree and free its slot
type: bug
status: inbox
priority: p1
area: [server, core]
assigned_to: ""
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-22T06:32:56Z"
updated_at: "2026-10-22T06:32:56Z"
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

## Activity

- 2026-10-22T06:32:56Z · created · njachowski@gmail.com
