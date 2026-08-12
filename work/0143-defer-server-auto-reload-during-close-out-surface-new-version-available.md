---
id: "0143"
title: "Defer server auto-reload during close-out; surface \"new version available\" instead"
type: feature
status: active
priority: p1
area: server
assigned_to: ai
created_by: ai
branch: feat/defer-server-auto-reload-during-close-ou
created_at: "2026-08-12T21:35:00Z"
updated_at: "2026-08-12T13:06:37Z"
---
## Problem

When a task moves to `done`, the close-out pipeline (`completeTask` in `src/server/done.ts`) merges the feature branch, runs `bun run build`, commits `dist/` and `screenshots/`, then runs `repoos check`. The `bun run build` step updates `dist/.build-info.json`, which is watched by the `ReloadManager` (`src/server/reload.ts`). The manager auto-reloads the `repoos serve` process in the middle of the pipeline, killing the server that is orchestrating the close-out.

This has caused tasks to be left in `review` even after their code was merged into `main`, because the final task-status update, worktree removal, and branch deletion could not complete. The user must then manually finish the close-out.

## Desired UX

- `repoos serve` does **not** auto-reload itself while a close-out is in progress.
- When the close-out pipeline produces a new build on disk, the server detects the new build hash, marks it as pending, and pushes an event to the web UI.
- The UI shows a persistent "New version available" button/notice (e.g., in the top bar or a toast).
- Clicking the notice triggers the reload/restart at a time chosen by the user.
- Until the user clicks it, the server continues running the current build and the UI continues working.

## Acceptance criteria

- [ ] `completeTask`/`markTaskReleased` in `src/server/done.ts` holds a server-owned close-out lock while it is running.
- [ ] The `ReloadManager` skips automatic reload while the close-out lock is held.
- [ ] After the close-out lock is released, the `ReloadManager` notices the new build hash (which changed during the pipeline) and schedules the reload.
- [ ] The UI receives an SSE event when a new build is available after close-out.
- [ ] The UI renders a clear "New version available" control that persists until the user acts on it.
- [ ] Clicking the control calls `POST /api/server/restart` and the server reloads into the new build.
- [ ] If the user ignores the notice, the existing server remains functional; no background auto-reload occurs.
- [ ] `repoos check` passes.

## Notes for AI

- Touch points: `src/server/done.ts`, `src/server/reload.ts`, `src/server/server.ts`, `src/ui-app/src/stores/repo.ts`, and the top-bar / toast UI.
- Keep the existing reload mechanism for normal development builds (`bun run build` outside close-out) so live reload still works during regular development.
- The close-out lock can be a simple flag in the runner state, or an explicit `closingOut` signal on the `ReloadManager` options.
- The server is already the sole privileged publisher; the close-out lock belongs to it, not to the UI.
- If a close-out is retried after a server restart, the new build should still be detected and the notice should still appear — the reload is not lost because the lock was gone.
- Do not change the close-out pipeline steps; only change *when* the reload is allowed to fire.

## Activity

- 2026-08-12T21:35:00Z · created · ai
- 2026-08-12T13:06:37Z · status ready→active, branch
