---
id: "0685"
title: Small papercuts from a long agent-driven run
type: chore
status: inbox
needs_input: true
needs_input_reason: underspecified
needs_input_detail: "missing sections: Desired UX"
priority: p3
area: server
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-10-05T16:58:52Z"
updated_at: "2026-10-05T16:58:53Z"
---
## Problem

A list of low-severity items; fix together or split as convenient:
1. Tasks flagged `needs input: underspecified, missing sections: Desired UX` for non-UI tasks and repos that do not use RepoOS's headings; required sections are undocumented. Make "Desired UX" optional for non-UI areas and document the section rules.
2. After Move to done, `queuePosition` showed 4, 5, 6 with only one or two other jobs queued (looks inflated; unverified).
3. After an auto-fix round starts, the previous review text still shows as the current review until a new one lands; mark it superseded.
4. `repoos service list` shows a freshly installed and started service as `disabled ... auto-start no`; clarify enabled vs running vs auto-start.
5. No CLI to delete a task: the UI button calls `DELETE /api/tasks/:id`. Add `repoos rm <id>` (confirmation flag) using the same code path (verified: the API commits the removal).
6. The Agents page Test button: 8 s timeout and truncated 4 KB error (see board-agents task).
7. Document `autoEngineeringMode` plainly: event-driven (task reaches review, dependency merged, startup, config change), respects `dependsOn`, skips needsInput/archived, caps at `maxActiveTasks`, and asks the PM agent (an LLM call, recorded as a dispatch session) which ready tasks to start.
8. Idempotent `/start` on an already-running task correctly answers "already running" (good; keep).

## Acceptance criteria

- Each item fixed or explicitly declined with a reason in the task activity; tests where behaviour changes. `repoos check` passes.

## Notes for AI

Evidence comes from building a real 30-task project (opex, a Vue + Bun + Postgres app) with cheap agents on one laptop over ~9 hours. Read `AGENTS.md` first. Never hand-edit work/*.md; use RepoOS commands or APIs. Verify any claim you rely on against the current source before changing behaviour. Where a related task exists it is listed under "See also"; coordinate rather than duplicate.

## Activity

- 2026-10-05T16:58:52Z · created · unknown
- 2026-10-05T16:58:53Z · needs_input
