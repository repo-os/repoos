---
id: "0047"
title: Add a Move-to-done action for review tasks that merges the branch and closes the worktree
type: feature
status: done
priority: p1
area: web
assigned_to: ai
created_by: ""
branch: feat/add-a-move-to-done-action-for-review-tas
created_at: "2026-08-06T15:10:14Z"
updated_at: "2026-08-06T17:15:22Z"
---
## Activity

- 2026-08-06T15:10:14Z · created · unknown


## Problem

Closing out a reviewed task is entirely manual. The reviewer sees a task sitting
in `review` with no action affordance; moving it to `done` requires hand-rolled
git: merge the task's branch into main, rebuild `dist`, edit the task file to
`done`, delete the branch, and remove the worktree (done by hand for #0036 /
#0044). The drawer already offers "Start work"/"Pause work" for ready/active —
review tasks have nothing, so the loop stalls waiting for the implementer to do
git surgery.

## Desired UX

A task in `review` (with a `branch`) shows a primary **Move to done** button
under "move to" in the drawer. Clicking it runs the whole close-out server-side:

- merges the task's branch into main (FF when possible, merge commit otherwise),
- keeps the build fresh so `repoos check` stays green,
- moves the task to `done`,
- deletes the branch and removes the task's worktree,
- reports progress and, on any failure, leaves the task safely in `review`
  (nothing half-applied, conflicts aborted cleanly).

The reviewer never touches a terminal.

## Acceptance criteria

- [ ] New endpoint `POST /api/tasks/:id/done`:
  - 400 unless the task is `review` and has a `branch`.
  - 409 if a runner turn is in progress for the task.
  - Merges `branch` into the main checkout (`cwd` = repo root). FF when main is
    an ancestor; otherwise a merge commit. On conflict: `git merge --abort`,
    task stays `review`, worktree and branch untouched, response lists the conflicted
    files.
  - After a successful merge, runs `bun run build` and `repoos check` in the repo
    root; if either fails, the task stays `review` and the failure is reported
    (branch already merged — report that state honestly).
  - On green: set status `done` (with a `status review→done` activity entry via
    `patchTaskFile`), then delete the branch and `git worktree remove` the task's
    worktree (force if dirty — content is preserved in the merged main; tolerate
    a missing worktree). Handle the branch-already-merged and
    branch-without-worktree cases.
  - Emits the normal SSE change event so the board updates live; returns the
    updated task + a merge result summary (`{ merged, conflicts, ff, check }`).
- [ ] `git` helpers in `src/core/git.ts`: `mergeBranch` (returns conflict list or
  null), `deleteBranch`, `removeWorktree`, and an "is main an ancestor of branch"
  check — all via `execFileSync`, zero deps, mirroring the existing `git()`
  helper (4s timeout is fine; merge/build may need a longer timeout).
- [ ] Drawer: when `ui.active.status === 'review'`, render **Move to done** under
  the "move to" select (same area as Start work/Pause work), styled as a primary
  button, with a confirm step (the `confirmDelete` pattern) since it deletes the
  branch + worktree. Disabled while the flow runs, showing progress
  (merge → build → done); errors surface in the drawer and the task stays
  `review`.
- [ ] Store: `completeTask(t)` in `src/ui-app/src/stores/repo.ts` calling the new
  endpoint (mirror `startWork`'s error handling).
- [ ] `repoos check` passes; verify end-to-end by reviewing a task with a real
  branch: the button merges, closes the worktree, and the board shows `done`.

## Notes for AI

- Touch: `src/core/git.ts` (helpers), a new `src/server/done.ts` (orchestration)
  + `src/server/server.ts` (route, near the other `/api/tasks/:id/*` actions),
  `src/ui-app/src/components/TaskDrawer.vue`, `src/ui-app/src/stores/repo.ts`.
- Reuse `ensureWorktree`/`worktreeList` (git.ts) and `patchTaskFile`/`LiveIndex`
  (server) — do not reinvent. Merge/cleanup run against the MAIN checkout, never
  the worktree.
- Zero runtime dependencies. Do not touch the branch's own history (no rebase /
  rewrite) — a merge commit is acceptable when main has diverged.
- Rebuild (`bun run build`) after the merge so the staleness guard and the served
  UI reflect the merged source; note that the long-running `repoos serve` may need
  a manual restart to serve the merged build — the task does not restart it.

## Activity

- 2026-08-06T15:10:48Z · status inbox→ready
- 2026-08-06T17:09:07Z · status active→review, branch
- 2026-08-06T17:15:22Z · status review→done
