---
id: "0210"
title: Close the direct-PATCH bypass around handoff commit validation
type: bug
status: active
priority: p1
area: server
assigned_to: ai
created_by: ""
branch: feat/close-the-direct-patch-bypass-around-han
created_at: "2026-08-15T05:29:35Z"
updated_at: "2026-08-15T05:45:54Z"
---
## Problem

#0169 and #0170 built server-side handoff finalization (`src/server/handoff.ts`) that auto-commits an agent's changes and refuses a vacuous handoff (zero source changes) before flipping a task's status from `active` to `review`. But that validation only runs when an agent goes through the trusted handoff signal.

`PATCH /api/tasks/:id` (`patchTask` in `src/server/routes/tasks.ts:175`) sets `status` directly with no validation at all — it only special-cases `status: "done"` (redirecting to `/done`). Nothing stops `status: "review"` from being set this way, including via an agent just editing its own task file's frontmatter directly, which the file watcher then applies via `index.applyFileChange`.

This is exactly what happened on #0207: the agent edited its task file to `status: review` directly instead of emitting the trusted handoff signal, so the worktree sat in `review` with a fully uncommitted implementation (263 insertions, zero commits past main) until a human noticed and had to manually prompt the agent to commit.

## Desired behavior

Any transition into `review` — regardless of whether it arrives via `PATCH /api/tasks/:id`, a direct task-file edit picked up by the watcher, or the trusted handoff path — must go through the same guarantees `handoffTask` already enforces:

- The worktree must not have uncommitted implementation changes left behind; either they get committed (matching the existing auto-commit behavior, excluding `dist`/`screenshots`/the task file itself) or the transition is rejected.
- A transition with zero source changes since the branch diverged from main must be rejected unless the task is explicitly marked `no_source_change: true` (mirroring #0170's vacuous-handoff rejection).

## Acceptance criteria

- [ ] `PATCH /api/tasks/:id` with `status: "review"` on a task whose worktree has uncommitted changes either auto-commits them (same message convention as `handoffTask`) or rejects the transition with a clear error — it must never silently leave code uncommitted.
- [ ] A direct task-file edit that sets `status: review` (picked up via `index.applyFileChange`) is subject to the same check — the bypass is closed at the state-transition boundary, not just at one entry point.
- [ ] A transition to `review` with zero commits past main and no `no_source_change: true` is rejected, consistent with #0170's existing rule for the trusted handoff path.
- [ ] Existing trusted-handoff behavior (`src/server/handoff.ts`) is unchanged — this task closes the *other* path into `review`, it doesn't rework the one that already works correctly.
- [ ] Add a regression test: PATCH a task with an uncommitted worktree to `status: review` and assert it either commits or is rejected, never left dirty.
- [ ] `repoos check` passes.

## Notes for AI

- Read `src/server/handoff.ts` (`handoffTask`) first — reuse its commit/vacuous-handoff logic rather than reimplementing it; consider factoring the shared commit+validate steps into something both `handoffTask` and `patchTask`/the file-watch status-change path can call.
- `patchTask` is in `src/server/routes/tasks.ts:175`; the file-watch apply path is `index.applyFileChange` — trace where task-file status changes get picked up outside the API route.
- This was discovered live on #0207 (see its activity log) — real-world case, not hypothetical.

## Activity

- 2026-08-15T05:29:35Z · created · unknown
- 2026-08-15T05:45:52Z · status inbox→ready
- 2026-08-15T05:45:54Z · status ready→active, branch
