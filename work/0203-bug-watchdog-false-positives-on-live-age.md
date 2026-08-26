---
id: "0203"
title: "bug: watchdog false-positives on live agents and dumps uncommitted work back to ready"
type: bug
status: draft
priority: p1
area: core
assigned_to: ai
created_by: ""
branch: ""
model_override: default
created_at: "2026-08-14T17:06:20Z"
updated_at: "2026-08-26T05:51:29Z"
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

- [x] Watchdog does not surface a task whose agent is alive and producing output.
- [x] Uncommitted in-flight work in a surfaced task lands in `review`, never `ready` (autoTransitionTarget already did this pre-fix; unchanged).
- [ ] A dead/stalled agent escalates to `needs_input` with a reason when it cannot proceed autonomously (unchanged by this fix — out of scope, the existing #0156 fallback covers it).
- [ ] Activity log clearly distinguishes watchdog actions from agent behavior (unchanged — out of scope for this fix).
- [x] `repoos check` green.

## Fix landed (2026-08-15, commit 6873c1bf)

Root cause confirmed: `runner.isRunning(taskId)` is a plain in-memory Map — empty after every server restart, with no record of which PID belonged to which task (#0214). Reproduced live the same day: #0212 and #0215 both bounced active→ready at the identical second, right at the default 5-minute staleness threshold, immediately after this machine's control-plane server had been reload-churning heavily.

Added `hasRecentWorktreeActivity()` in `src/server/task-watchdog.ts`: checks the task's actual worktree for a file modified within the staleness window before surfacing. File mtimes live on disk, not server memory, so a restart can't erase them — the durable signal the registry can't provide. Bounded scan (2000 files), skips `.git`/`node_modules`. Wired into `isStuck()` as a bypass checked only once the Activity-log staleness check would otherwise fire, so the common case pays nothing extra.

24 tests in `task-watchdog.test.ts`, including two reproducing the exact false-positive (empty registry + fresh worktree file → not surfaced) and a regression guard (empty registry + genuinely stale worktree → still surfaced).

**Landed as a direct hotfix on main** (user-authorized, urgent — this bug was actively blocking "start work" across the board), not through the normal task-branch pipeline. No worktree/branch exists for this task, so this board entry stays `ready` rather than `done` — `/done` requires both `review` status and an existing branch, neither of which apply here. Worth noting as a real gap: there is currently no API path to correctly close out a task that was fixed by direct hotfix commit outside the branch flow.

The remaining two unchecked acceptance criteria (needs_input escalation reason, Activity log watchdog-vs-agent distinction) are pre-existing scope this fix did not touch — worth a follow-up if still wanted, but they were not part of the false-positive bug this task was actually filed against.

## Activity

- 2026-08-14T17:06:20Z · created · unknown
- 2026-08-15T05:59:33Z · status inbox→ready
- 2026-08-15T11:59:08Z · body
- 2026-08-15T16:16:06Z · status ready→draft
- 2026-08-25T15:03:30Z · model_override
