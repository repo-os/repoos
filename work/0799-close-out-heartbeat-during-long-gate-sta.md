---
id: "0799"
title: "Close-out: heartbeat during long gate stages so healthy runs are not shown as stalled"
type: bug
status: active
priority: p2
area: [server, web]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/close-out-heartbeat-during-long-gate-sta
created_at: "2026-10-15T11:08:11Z"
updated_at: "2026-10-15T11:47:24Z"
---
## Problem
The close-out card shows 'stalled · no progress' for runs that are still working. #0782 added a heartbeat for the bundle upload, but other long stages report nothing while they run: the remote test run on the validation host, and the local scoped gate steps. #0790's close-out was marked stalled after about 4 minutes with no log output, then finished normally. The stall timer only resets when a stage reports progress.

## Desired UX
- Every long stage (remote test run, each local gate step) sends a heartbeat at a steady interval while it runs, with a short detail line such as the step name and elapsed time.
- 'Stalled' appears only when no heartbeat has arrived for the threshold.

## Acceptance criteria
- Test: a remote test run with no output for longer than the threshold still sends heartbeats and is not labelled stalled.
- Test: a job whose process has truly stopped (no heartbeats) is still labelled stalled.
- The card shows the current step and its elapsed time, in light and dark themes.

## Notes for AI
Start from the upload heartbeat (src/server/integration-orchestrator.ts ~2722-2750, the #0782 work) and the stall logic in src/ui-app/src/lib/integration-pipeline-ui.ts. Source: #0790 close-out, 2026-10-15.

## Activity

- 2026-10-15T11:08:11Z · created · njachowski@gmail.com
- 2026-10-15T11:10:05Z · status inbox→ready
- 2026-10-15T11:10:08Z · status ready→active, branch
- 2026-10-15T11:25:50Z · message_queued at 2026-10-15T11:25:50.722Z
- 2026-10-15T11:25:50Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-15T11:46:03Z · body
- 2026-10-15T11:47:24Z · body
