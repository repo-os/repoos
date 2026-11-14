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
cli_override: cursor
model_override: composer-2.5
created_at: "2026-11-14T16:14:26Z"
updated_at: "2026-11-14T17:19:08Z"
dev_error_count: 4
engineer_crash_log: "[{\"cli\":\"codex\",\"model\":\"gpt-6-luna\",\"at\":\"2026-11-14T16:48:38.797Z\",\"kind\":\"dev-error\"},{\"cli\":\"codex\",\"model\":\"gpt-6-luna\",\"at\":\"2026-11-14T16:48:42.502Z\",\"kind\":\"dev-error\"},{\"cli\":\"codex\",\"model\":\"gpt-6-luna\",\"at\":\"2026-11-14T16:48:45.917Z\",\"kind\":\"dev-error\"},{\"cli\":\"codex\",\"model\":\"gpt-6-luna\",\"at\":\"2026-11-14T16:58:57.569Z\",\"kind\":\"dev-error\"}]"
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
- 2026-11-14T16:15:39Z · held, held-reason, held-at
- 2026-11-14T16:45:20Z · released
- 2026-11-14T16:45:38Z · message_queued at 2026-11-14T16:45:38.602Z
- 2026-11-14T16:48:38Z · agent exited with an error (codex) · Failed to write file /Users/nick/code/nick/repoos-worktrees/feat/task-drawer-move-to-done-fails-instantly/src/ui-app/tests/task-drawer-landable.test.ts
- 2026-11-14T16:48:38Z · engineer crash recovery: resuming codex + gpt-6-luna (1/3 crashes in 30m) · Failed to write file /Users/nick/code/nick/repoos-worktrees/feat/task-drawer-move-to-done-fails-instantly/src/ui-app/tests/task-drawer-landable.test.ts
- 2026-11-14T16:48:39Z · needs_input
- 2026-11-14T16:48:39Z · message_delivered: 1 message(s)
- 2026-11-14T16:48:42Z · agent exited with an error (codex) · Reading additional input from stdin...
- 2026-11-14T16:48:42Z · engineer crash recovery: resuming codex + gpt-6-luna (2/3 crashes in 30m) · Reading additional input from stdin...
- 2026-11-14T16:48:43Z · needs_input
- 2026-11-14T16:48:45Z · agent exited with an error (codex) · Reading additional input from stdin...
- 2026-11-14T16:48:45Z · engineer crash recovery: surfaced instead of switching — a human-set task override (codex + gpt-6-luna) is pinned, so RepoOS did not replace it (3/3 crashes in 30m)
- 2026-11-14T16:58:53Z · watchdog: restarting engineer after 10m with no live process
- 2026-11-14T16:58:57Z · agent exited with an error (codex) · Reading additional input from stdin...
- 2026-11-14T16:58:57Z · engineer crash recovery: surfaced instead of switching — a human-set task override (codex + gpt-6-luna) is pinned, so RepoOS did not replace it (4/3 crashes in 30m)
- 2026-11-14T17:04:01Z · cli_override, model_override
- 2026-11-14T17:04:01Z · needs_input
- 2026-11-14T17:13:53Z · message_queued at 2026-11-14T17:13:53.084Z
- 2026-11-14T17:13:53Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-14T17:17:20Z · body
- 2026-11-14T17:18:53Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-14T17:19:08Z · queued message undelivered for 5m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-14T17:19:08Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 143) · last assistant: Fixing TypeScript errors in the test file. · stderr: Reading additional input from stdin... 2026-11-14T16:48:38.150688Z ERROR codex_core::tools::router: error=Exit code: 1 Wall time: 0 seconds Output: Failed to write file /Users/nick/code/nick/repoos-worktrees/feat/task-drawer-move-to-done-fails-instantly/src/ui-app/tests/task-drawer-landable.test.ts Reading additional …
- 2026-11-14T17:19:08Z · message_delivered: 1 message(s)
