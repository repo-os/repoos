---
id: "0026"
title: Add ability to delete tasks from the UI
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: "feat/0026-delete-tasks"
created_at: "2026-08-04T09:36:55Z"
updated_at: "2026-08-06T07:12:50Z"
---
## Activity

- 2026-08-04T09:36:55Z · created · unknown
- 2026-08-06T07:12:50Z · status inbox→active

## Problem

There is no way to delete a task from inside RepoOS. The server exposes only
`GET/POST /api/tasks` and `PATCH /api/tasks/:id`; `write.ts` only patches. The
only way a task disappears today is by deleting its `work/*.md` file outside the
app (filesystem, git, or an agent) — the file watcher then emits `task.deleted`
via SSE and the UI removes it from the board. Deleting real work should be
deliberate and possible from the UI, with the same live-update plumbing.

## Desired UX

- A "Delete task" action in the task drawer (danger-styled, clearly separated
  from status/save controls).
- It asks for confirmation before anything is removed (accidental deletion of a
  task file is destructive — it's the source of truth, and git is the only undo).
- On confirm: the task file is removed, the board updates live (the existing
  `task.deleted` SSE path), and the feed logs a "deleted #id" entry like the
  watcher path already does.
- Delete is also available via the CLI for symmetry (nice-to-have; see Scope).

## Acceptance criteria

- [ ] `DELETE /api/tasks/:id` endpoint that removes the task file and emits the
      existing `task.deleted` SSE event (returns 404 for unknown id, 4xx for a
      guarded failure)
- [ ] Delete button in the task drawer, danger-styled, with a confirmation step
- [ ] After delete: drawer closes, task disappears from board/dashboard counts,
      feed shows a deleted entry, other connected clients update live
- [ ] Deleting does not crash when the file is already gone (idempotent 404)
- [ ] `ros check` passes

## Notes for AI

- The plumbing mostly exists — reuse it, don't rebuild it:
  - SSE `task.deleted` is already emitted by the file watcher
    (`src/server/live-index.ts` `applyFileDelete`) and handled in the UI store
    (`src/ui-app/src/stores/repo.ts:110` — removes the task, pushes a red
    "deleted" feed entry).
  - The gap is the write side: `src/server/write.ts` has `patchTaskFile` but no
    delete helper, and `src/server/server.ts` has no `DELETE` route (see the
    task handlers around server.ts:278-339).
- New helper should `unlink` the task file (check it stays inside `work/`, mirror
  the path-guard used by `safeRepoFile`/patch), update the in-memory index, and
  emit `task.deleted`. Watch for double-emission: the file watcher may also fire
  on the same unlink — the SSE path should be idempotent (emitting deleted twice
  for one id is harmless if the store's handler is).
- Confirmation can be a small inline confirm in the drawer (danger row → "Are you
  sure? Delete / Cancel") — a full modal is fine but not required.
- Deletion is destructive with no in-app undo; git is the safety net. The confirm
  text should say the file is removed (not hidden).
- `ros check` is the green bar; it runs compiled JS from `dist/` (rebuild with
  `bun run build` before trusting output).

## Scope

- **This task**: the `DELETE /api/tasks/:id` endpoint + UI delete with confirm,
  wired through the existing `task.deleted` SSE path.
- **Defer to a SEPARATE task**: trash/undo, `ros rm` CLI command, deleting
  multiple tasks, deleting non-task files, permission prompts for AI agents
  deleting tasks.

## Related

- Completes the delete story that today only works via direct file removal.
- The UI side builds on 0021 (drawer/store) and 0022 (feed/board live updates).
