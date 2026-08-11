---
id: "0069"
title: Surface mutation errors visibly and stop branch drift from blocking move-to-done
type: feature
status: ready
priority: p1
area: core
assigned_to: ai
created_by: ""
branch: feat/0069-visible-errors-and-done-drift
created_at: "2026-08-11T01:46:02Z"
updated_at: "2026-08-11T08:41:00Z"
---
## Activity

- 2026-08-11T01:46:02Z · created · unknown

## Problem

Two linked failures, both hit live on the self-hosted board (documented in
#0063's close-out):

1. **Failed mutations are effectively silent.** The only error surface is
   `onError` → `pushFeed` (`src/ui-app/src/stores/repo.ts:289`), a small line in
   the bottom feed panel. When the "Move to done" button failed on a merge
   conflict, the user saw **nothing** — no toast, no inline error, no button
   feedback — and concluded the button was broken. It was actually failing fast
   with HTTP 400 (`error: "merge conflict: …"`) on every click; the message was
   invisible. Any mutation (start/pause/done/message/save) has this failure mode.
2. **Branch drift silently blocks the close-out.** A review task's branch drifts
   from `main` while it sits in review (other tasks merge meanwhile). At done
   time, `completeTask` (`src/server/done.ts`) runs a plain `git merge`, which
   fails on any **source-file** conflict — `autoResolve` only covers the task
   file, `dist/`, and `screenshots/` (by design). #0063 was blocked by
   `TaskCard.vue`, #0054 by `server.ts` — both trivial "keep both sides" merges,
   but the close-out has no remedy except a human resolving in git by hand (what
   had to happen this cycle). The failure arrives late (after the merge attempt)
   and gives no actionable next step.

## Desired UX

- A failed mutation is **impossible to miss**: a dismissible, auto-hiding toast
  (red, distinct from feed entries) appears for every failed action; the feed
  keeps the history line as today.
- The **Move to done** flow, specifically, reports failure **inline in the task
  drawer**: it shows which step failed, the elapsed time, the **list of
  conflicting files**, and a plain-language next step ("main has diverged from
  this branch — sync it, resolve the conflicts, then retry").
- The problem is **prevented, not just reported**: branches stop drifting.
  When a task moves to `review`, the server syncs `main` into its branch
  automatically; if that sync conflicts, the task is marked as needing a merge
  (visible chip on the card) and the agent/human is told exactly which files.
  A **"Sync with main"** button in the review drawer lets a human do the same
  thing on demand, and the done flow runs a fast conflict **pre-flight** before
  the expensive build/check so it never wastes minutes just to fail.

## Acceptance criteria

- [ ] **Toast error surface**: `onError` (and the `!ok` branches of
      `startWork`, `pauseWork`, `completeTask`, `sendMessage`, `setStatus`,
      `createFreeformTask`) push a dismissible error toast with the message;
      toasts auto-dismiss (~6s), stack if several fire, and are click-to-close.
      Feed history entries stay. Tests cover the store.
- [ ] **Done-flow pre-flight**: before attempting the close-out, `completeTask`
      detects a non-fast-forward/conflicting merge cheaply (e.g.
      `git merge-tree` or an abortable `--no-commit` merge) and returns a
      structured `{ ok:false, conflicts: string[], drifted: true }` **without**
      running build/screenshots/check. The `/done` route
      (`src/server/server.ts:612`) surfaces `conflicts` in the error payload.
- [ ] **Inline done-failure UI**: `TaskDrawer.vue` `moveToDone` renders the
      failure inline (not only a toast): step reached, elapsed, conflicting file
      list, and the "sync + resolve + retry" guidance; the confirm state resets
      cleanly so retry is possible.
- [ ] **Auto-sync on review**: when a task transitions to `review`
      (`PATCH /api/tasks/:id`, `src/server/server.ts:547`), the server merges
      `main` into the task's branch in its worktree (same semantics as
      `mergeBranch`); on conflict it **aborts the merge** (nothing half-applied)
      and sets a new additive frontmatter flag `needs_merge: true` on BOTH task
      copies. Successful sync (or a later successful manual sync) clears it.
- [ ] **needs_merge surfacing**: modeled like `needs_input` from #0067
      (`TaskFrontmatter`/`Task` in `src/core/types.ts`, round-trips through
      `patchTaskFile`); the review card shows a small "drifted — needs merge"
      chip when set; cleared on successful sync.
- [ ] **"Sync with main" action**: a drawer action on `review` tasks (and in the
      drawer when `needs_merge` is set) that runs the main→branch sync, reports
      success or the conflict file list inline, and clears `needs_merge` on
      success. No new status — the task stays `review`.
- [ ] `repoos check` passes (build, tests incl. new ones, ui-smoke); zero new
      runtime dependencies. Keep the smoke test green (toasts mount under the
      existing WebKit probe).

## Notes for AI

- **This is the direct follow-up to a real incident.** #0063 and #0054 were both
  blocked at done by benign source conflicts; resolving required hand-merging
  `main` into each branch in their worktrees (keep both sides), rebuilding,
  regenerating screenshots, and committing — all outside any UI. Read
  `work/0063-…md` and `work/0054-…md` for the exact files (TaskCard.vue,
  server.ts) if you want the regression fixtures.
- **Don't change STATUSES or add a status.** `needs_merge` is a boolean flag
  layered on `review`, mirroring #0067's `needs_input` — same additive pattern,
  same two-copies rule (worktree copy committed, main copy edited, board reads
  main). Keep `STATUSES` in `src/core/types.ts:10` untouched.
- **Auto-sync must be safe to run on transition**: it only fires on the
  `→ review` transition, it aborts and sets `needs_merge` on conflict (never
  leaves a half-merged worktree), and it must not deadlock with a running agent
  (the task is leaving `active`; the runner may still be cleaning up — guard on
  `runner.isRunning(id)` like the done route does at `server.ts:621`).
- **Pre-flight must be fast and abort-safe**: the current merge-first flow
  already returns `conflicts` (`done.ts` `mergeBranch` result) — the ask is to
  detect drift *before* `BUILD_STEPS`/screenshots run and to return the file
  list to the UI. Reuse `mergeBranch`'s `autoResolve` semantics so generated
  files never show up as "conflicts" to the user.
- **Files to touch**: `src/core/types.ts` (flag), `src/core/git.ts` (pre-flight
  helper), `src/server/done.ts` (pre-flight + structured result),
  `src/server/server.ts` (review-transition sync + done error payload),
  `src/core/task.ts`/`src/server/write.ts` (round-trip), `src/ui-app/src/
  stores/repo.ts` (toasts + needs_merge plumbing), `src/ui-app/src/components/
  TaskDrawer.vue`, `TaskCard.vue`, `FeedPanel.vue` or a new `ToastPanel.vue`,
  tests.
- **Self-hosting rule**: rebuild + `bun run build:ui` after UI changes, keep
  `repoos serve` running, and probe: trigger a failing done (or set
  `needs_merge` on a scratch review task) and confirm the toast + chip render,
  then verify a clean done still works end-to-end (merge → build → screenshots →
  check).
- **Don't**: don't auto-merge conflicting source files without review, don't
  resolve conflicts programmatically beyond `autoResolve`, don't make
  `needs_merge` affect status transitions, don't change the done approval path
  (still the human's button), don't push toasts for successful actions.

## Scope

- **In**: toast error surface; done pre-flight; inline done-failure detail;
  auto-sync on review + `needs_merge` flag; "Sync with main" action + card chip.
- **Deferred**: auto-merge non-conflicting generated files during review sync
  (the done flow already handles this); conflict-resolution UI (an inline
  mergetool); surfacing drift for `active` tasks; per-file diff preview in the
  drawer.

## Related

- 0063 · the review task whose done close-out was blocked (primary incident)
- 0054 · the second blocked review task
- 0067 · needs_input signal for waiting-on-human (same flag + chip pattern)
- 0066 · serve auto-reload (keeps the UI that renders these toasts fresh)
- 0047 · move-to-done flow

## Activity

- 2026-08-11T03:50:58Z · status ready→active
- 2026-08-11T06:12:07Z · status active→ready
- 2026-08-11T06:12:08Z · status ready→active
- 2026-08-11T06:36:45Z · status active→ready
- 2026-08-11T06:36:57Z · status ready→active
- 2026-08-11T08:41:00Z · status active→ready
