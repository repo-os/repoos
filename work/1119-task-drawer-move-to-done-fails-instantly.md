---
id: "1119"
title: "Task drawer Move to done fails instantly: click event is sent as the land-anyway reason"
type: feature
status: active
priority: p1
area: web
assigned_to: ai
created_by: t@t
branch: feat/task-drawer-move-to-done-fails-instantly
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-14T16:14:26Z"
updated_at: "2026-11-14T16:15:38Z"
---
## Problem
In the task drawer, clicking Move to done fails immediately with "Land anyway requires a reason of 1–1000 characters", before any close-out work starts. Cause: `src/ui-app/src/components/TaskDrawer.vue` binds the button as `@click="moveToDone"` (line about 5770), and Vue passes the click event as the first argument. `moveToDone(reason?: string)` (added by #1081 for the Land anyway override) treats the truthy event as a reason and calls `repo.completeTask(task, { landAnywayReason: <event> })`, which serialises to a non-string `landAnywayReason`; the server (`src/server/routes/tasks.ts`, done route) rejects it with a 400. Board-card Move to done (TaskCard.vue) and `repoos done` are unaffected. Present since #1081 landed, so in v0.5.83 and v0.5.84. Seen on #1117 on 2026-11-15.

## Desired UX
Move to done from the drawer works exactly like the board-card button. The Land anyway dialog is the only path that sends a reason, and only a non-empty string.

## Acceptance criteria
1. Bind the drawer button so it calls `moveToDone()` with no argument (or wrap the handler), and make `moveToDone` ignore any non-string reason; `completeTask` sends `landAnywayReason` only when it is a non-empty string.
2. Add a component test: clicking the drawer Move to done button issues a POST to `/api/tasks/:id/done` with no body or no `landAnywayReason`; and a test that the Land anyway dialog path still sends the typed reason.
3. Server: a non-string `landAnywayReason` is rejected with a clear message that names the problem (not "1–1000 characters"), covered by a test.
4. Audit other `@click` handlers in TaskDrawer.vue and neighbouring components for handlers that take an optional first parameter and are bound without parentheses; fix any with the same hazard and list them in the report.
5. `repoos check` passes.

## Notes for AI
Related: #1081 (introduced the reason parameter) and the audit that missed this. Keep the fix small; this is a hotfix-sized change that should land quickly and ship in the next release.

## Activity

- 2026-11-14T16:14:26Z · created · t@t
- 2026-11-14T16:14:29Z · cli_override, model_override
- 2026-11-14T16:14:31Z · status inbox→ready
- 2026-11-14T16:14:33Z · status ready→active, branch
- 2026-11-14T16:15:38Z · engineer stopped by request
