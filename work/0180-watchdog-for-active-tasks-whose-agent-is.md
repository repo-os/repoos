---
id: "0180"
title: Watchdog for active tasks whose agent is dead or stalled
type: bug
status: done
priority: p1
area: server
assigned_to: ai
created_by: ""
branch: feat/watchdog-for-active-tasks-whose-agent-is
created_at: "2026-08-13T16:53:53Z"
updated_at: "2026-08-14T07:29:46Z"
---
## Problem

Tasks can sit `active` indefinitely after their implementing agent has silently stopped. Observed live (2026-08-13):

- #0075 and #0172 were `active` for ~2h with no live agent process and no commits; both got flagged `needsInput: true` and just stopped.
- #0172s agent claimed "implementation is complete, all acceptance criteria met" but NEVER COMMITTED — the entire feature (122 lines) sat uncommitted in the worktree. Only manual intervention (commit + check + review) rescued it.
- #0153 and #0168 fix-agents went idle mid-turn without leaving the task in review.

There is no mechanism that detects a task whose agent session is dead/stalled and either nudges it, records why it stopped, or surfaces it. The task stays `active` and invisible until a human notices.

## Fix

Add a watchdog over `active` tasks (see #0112 AgentSupervisor / task-watchdog.ts for existing scaffolding) that:

1. Detects active tasks whose agent session has no live process and no recent step/output for a threshold (e.g. N minutes).
2. On detection: record an explicit reason in the task transcript (agent exited / crashed / never started), and either
   a. emit an event/notification (so the board surfaces it), and/or
   b. auto-transition the task to a visible state (e.g. `review` if work is committed, `ready` if not) — configurable.
3. Guards: never fire while the server itself is mid-reload, and never mark a task whose agent is legitimately paused.

## Acceptance

1. Kill a tasks agent process while it is mid-turn; within the threshold the task leaves the silent-`active` state and shows why.
2. An active task whose agent never started is surfaced, not left silent.
3. `repoos check` passes.

## Activity

- 2026-08-13T16:53:53Z · created · unknown
- 2026-08-13T16:54:02Z · status inbox→ready
- 2026-08-13T17:41:14Z · status ready→active, branch
- 2026-08-14T03:33:13Z · status active→review
- 2026-08-14T07:29:46Z · status review→done, release:success
