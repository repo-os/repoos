---
id: "0799"
title: "Close-out: heartbeat during long gate stages so healthy runs are not shown as stalled"
type: bug
status: review
needs_input: true
needs_input_reason: dev-error
needs_input_detail: "✗ Server finalization stopped at check: server-side finalization timed out (deadline exceeded). The same worktree can be resumed and retried."
priority: p2
area: [server, web]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/close-out-heartbeat-during-long-gate-sta
created_at: "2026-10-15T11:08:11Z"
updated_at: "2026-10-15T17:09:10Z"
last_check_failure: "repoos check at 2026-10-15T12:29:59.204Z: repoos check failed: server-side finalization timed out (deadline exceeded)"
dev_error_count: 1
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

## Shots
```json
[
{
"label": "Close-out card shows the remote test-run step and elapsed time (light theme)",
"target": "default",
"route": "/work",
"highlight": "[data-test-id=\"task-card-agent-hint\"]",
"assert": [
{
"selector": "[data-test-id=\"task-card-agent-hint\"]",
"label": "card shows the current step heartbeating, not stalled",
"text": "remote tests"
}
],
"state": "closeOut:remoteTests",
"theme": "light"
},
{
"label": "Close-out card shows the remote test-run step and elapsed time (dark theme)",
"target": "default",
"route": "/work",
"highlight": "[data-test-id=\"task-card-agent-hint\"]",
"assert": [
{
"selector": "[data-test-id=\"task-card-agent-hint\"]",
"label": "card shows the current step in dark theme",
"text": "remote tests"
}
],
"state": "closeOut:remoteTests",
"theme": "dark"
}
]
```

## Activity

- 2026-10-15T11:08:11Z · created · njachowski@gmail.com
- 2026-10-15T11:10:05Z · status inbox→ready
- 2026-10-15T11:10:08Z · status ready→active, branch
- 2026-10-15T11:25:50Z · message_queued at 2026-10-15T11:25:50.722Z
- 2026-10-15T11:25:50Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-15T11:46:03Z · body
- 2026-10-15T11:47:24Z · body
- 2026-10-15T11:49:28Z · body
- 2026-10-15T11:50:34Z · body: section Shots
- 2026-10-15T12:34:29Z · agent exited with an error (opencode) · ✗ Server finalization stopped at check: server-side finalization timed out (deadline exceeded). The same worktree can be resumed and retried.
- 2026-10-15T15:23:21Z · note: handoff requested (ui-review)
- 2026-10-15T15:59:18Z · handoff failed · ui-review handoff failed at check · server-side finalization timed out (deadline exceeded)
- 2026-10-15T16:48:27Z · body
- 2026-10-15T16:59:31Z · message_queued at 2026-10-15T16:59:31.957Z
- 2026-10-15T16:59:32Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-15T17:04:52Z · body
- 2026-10-15T17:08:03Z · status active→review
- 2026-10-15T17:09:10Z · note: review pass 1: good to go
