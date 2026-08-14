---
id: "0203"
title: "bug: watchdog false-positives on live agents and dumps uncommitted work back to ready"
type: bug
status: inbox
priority: p1
area: core
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-08-14T17:06:20Z"
updated_at: "2026-08-14T17:06:20Z"
---
## Problem

The watchdog (#0180/#0156) misclassifies and mishandles active tasks in two compounding ways:

1. **False-positive on a live agent.** On 2026-08-15 #0198 went `active` and its agent (an `opencode run`, PID 15881) launched at 12:38 AM. At 12:43 AM the watchdog surfaced it to `ready` as "agent exited without emitting the handoff signal" — but the agent was never dead: it kept running (RN state) and kept writing source files (mtimes 00:46, 00:53). The watchdog's `isStuckActiveTask` staleness check fired while the agent was actively working. Result: a `ready` task with a live agent still editing its worktree.

2. **Uncommitted work dumped back to ready.** `autoTransitionTarget` (src/server/task-watchdog.ts:145) sends a stuck task to `review` only when `worktreeStatus(...).dirty` is true, else `ready`. But when the watchdog fires mid-agent-run (case 1), the worktree can be momentarily clean and the task lands in `ready` even though the agent is about to commit real work — putting that in-flight work at risk of discard on a clean restart. The agent itself does not "pause and put the task back to ready"; the watchdog does, and it gives no flag for human help.

## Desired behavior

- The watchdog must not surface a task whose agent process is alive and actively producing output (check runner liveness/activity, not just staleness of the activity log).
- When a stuck task genuinely has no clean handoff, prefer preserving work (`review`) over `ready`, and surface a clear reason.
- If the agent is dead but the task can no longer proceed autonomously, escalate to `needs_input` (the #0156 fallback) with a reason instead of silently returning to `ready`.
- The activity entry / notification should make clear this was a watchdog action, not the agent pausing.

## Repro notes

- Watch #0198's behavior in the 2026-08-15 00:38–00:53 local window.
- Relevant code: src/server/task-watchdog.ts (`isStuckActiveTask`, `classifyDeadAgentReason`, `autoTransitionTarget`, `surfaceTask`), and the runner liveness checks in src/server/agents.ts.

## Acceptance criteria

- [ ] Watchdog does not surface a task whose agent is alive and producing output.
- [ ] Uncommitted in-flight work in a surfaced task lands in `review`, never `ready`.
- [ ] A dead/stalled agent escalates to `needs_input` with a reason when it cannot proceed autonomously.
- [ ] Activity log clearly distinguishes watchdog actions from agent behavior.
- [ ] `repoos check` green.

## Activity

- 2026-08-14T17:06:20Z · created · unknown
