---
id: "0054"
title: Preview a review task's worktree UI on its own port
type: feature
status: ready
priority: p1
area: web
assigned_to: ai
created_by: ""
branch: feat/preview-task-worktree-ui
created_at: "2026-08-06T17:57:47Z"
updated_at: "2026-08-10T22:24:09Z"
---
## Problem

When a task is in `review`, the human reviewer has no way to see that version
of the UI. The board server is single-rooted at the main checkout, and each
review task lives in its own worktree with its own `src/`, built `dist/`, and
`work/`. Reviewing (and manually testing before "Move to done") currently
requires manually finding the worktree, running a server there on a free port,
and keeping track of it yourself. The result is that move-to-done is a blind
click and review feedback is given without ever seeing the actual build.

## Desired UX

A review (or active) task's drawer offers a **Preview** affordance — a button
near the spec tabs and the "Move to done" row. Clicking it starts a server
rooted at that task's worktree on its **own port** and shows a clickable
`http://127.0.0.1:<port>` link (opens in a new tab) plus a "Stop preview"
control. Multiple tasks can be previewed at once, each on a different port.
Previews are **read-only** and die automatically when the task leaves
review/active or when the main server shuts down — no orphan `repoos serve`
processes left behind.

## Acceptance criteria

- [ ] `POST /api/tasks/:id/preview` starts a server rooted at the task's
      worktree on an ephemeral (OS-assigned) port and returns
      `{ port, url }`; returns 400 if the task has no branch or its worktree
      doesn't exist, or if the task is not `active`/`review`.
- [ ] `POST /api/tasks/:id/preview/stop` (or `DELETE`) stops it and frees the
      port; idempotent (stopping a stopped preview is a no-op success).
- [ ] `GET /api/tasks/:id` includes `preview: { port, url, startedAt } | null`;
      the SSE feed emits a `preview` event on start/stop so the drawer updates
      without a reload.
- [ ] Preview processes are killed when the task transitions out of
      `active`/`review` (done, ready, paused), when the task is deleted, and on
      main-server shutdown (SIGTERM/SIGINT). Boot-time cleanup removes previews
      orphaned by a crashed main server.
- [ ] The preview serves the **worktree's own** UI + API (its own `work/`
      board) — i.e. the task's version. It is strictly read-only with respect
      to the main checkout and never receives authoritative status edits.
- [ ] Port allocation is always ephemeral — never a hardcoded range.
- [ ] UI: drawer shows a Preview button with disabled state when no branch or
      worktree exists, then the link + Stop after start; failures surface in
      the feed via the normal error path.
- [ ] Stale `dist/` in the worktree is rebuilt before serving (reuse the
      existing staleness check), so the preview always shows current code.
- [ ] `repoos check` passes; zero new runtime dependencies.

## Notes for AI

- The server core already serves any root (`startServer({ root, host, port })`),
  used by the screenshot fixture in `scripts/capture-screenshots.mjs` and
  `src/commands/screenshots.ts`. Check whether the `serve` CLI takes a root
  override (`repoos serve --root <path>`); if not, add one or spawn via the
  server entrypoint with the worktree as cwd. Do not invent a fixed port range.
- Resolve the worktree from the task's `branch` via
  `git worktree list --porcelain` in the core — never by string concatenation —
  and 400 if it's missing.
- Keep a preview registry in the main server: `Map<taskId, { port, pid, url,
  startedAt }>`. Reap entries where the transition logic already lives
  (`src/server/write.ts`/`patchTaskFile` for status changes,
  `src/server/done.ts` for done, delete route in `src/server/server.ts`) and in
  the shutdown handler. Do not poll for lifecycle.
- Per-task ports were previously avoided for *status sync* (status must reach
  the main copy so the board reflects review immediately). This feature is
  orthogonal: the preview is a read-only window into the worktree. Do NOT
  change the status-sync design or let the preview server handle status edits.
- UI is a single-file Vue SPA (`src/ui-app/`); add the preview control to
  TaskDrawer near the existing tabs and the review/done row, following the
  existing API/SSE patterns (`src/ui-app/src/api.ts`, SSE event handling).
- Scope: Phase 1 = on-demand preview, one per task, ephemeral port, lifecycle
  cleanup, rebuild-if-stale. Defer to Phase 2 (do not implement here):
  auto-start on review, in-drawer iframe instead of a new tab, an overview of
  all review tasks' previews, sharing the URL across machines.

## Related

- 0041 · Worktree-backed agent runs
- 0047 · Move-to-done flow (the button this feature supports)
- 0049 · Live activity indicator
- 0053 · Keep agent logs and chat available in review state (complementary:
  that task restores the fix loop; this task shows the build)

## Activity

- 2026-08-06T17:57:47Z · created · nick
- 2026-08-06T18:03:05Z · status ready→active
- 2026-08-10T22:24:09Z · status active→ready
