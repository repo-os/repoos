---
id: "0568"
title: Surface remote runner pool errors in the UI
type: ux
status: review
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/surface-remote-runner-pool-errors-in-the
created_at: "2026-09-28T05:07:30Z"
updated_at: "2026-09-28T08:17:47Z"
---
When a remote validation run fails due to an infrastructure error (permission denied on cleanup, SSH drop, host unhealthy, etc.) the only place to see what went wrong is the raw log file under .repoos/logs/remote-validation/. This should be surfaced directly in the task UI — e.g. in the Debug tab's event list — so the user doesn't have to dig into log files to understand why MTD is stuck or why a host is being skipped. Relates to #0564 (check run observability): the per-run status chip on a task should show which host ran, what the exit code was, and any infra error message if the run failed for a non-test reason.

## Activity

- 2026-09-28T05:07:30Z · created · unknown
- 2026-09-28T05:19:37Z · status inbox→ready
- 2026-09-28T06:42:38Z · status ready→active, branch
- 2026-09-28T08:17:47Z · status active→review
