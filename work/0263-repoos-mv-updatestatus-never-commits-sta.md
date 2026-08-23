---
id: "0263"
title: repoos mv / updateStatus never commits status changes to git
type: chore
status: review
priority: p2
area: core
assigned_to: ai
created_by: ""
branch: feat/repoos-mv-updatestatus-never-commits-sta
model_override: default
pm_model_override: default
created_at: "2026-08-20T11:39:46Z"
updated_at: "2026-08-23T11:05:38Z"
---
## Problem

`RepoOS.updateStatus()` (`src/core/repoos.ts`) — the function backing
`repoos mv` — calls `rewrite()`, which only does `writeFileSync` plus a
best-effort index-cache refresh. It never calls `commitTaskFile`/git commit,
unlike `patchTaskFile` in `src/server/write.ts` (used by the HTTP PATCH
route and now by `repoos update`), which always commits.

This was a contributing factor in a real incident (see #0202's activity
log, 2026-08-20): an agent ran `repoos mv 0202 review` from inside its task
worktree. Before #0202 (this session, commit c5e39773) fixed the separate
worktree-vs-main-checkout write-target bug, that write landed on the wrong
copy entirely. But even after that fix, a `repoos mv` write to the correct
(main checkout) copy is left UNCOMMITTED — sitting as a dirty change in the
main checkout's git state. RepoOS's own self-heal safety net
(`healBoardDivergence` in `src/server/agents.ts`) explicitly refuses to
trust a worktree-vs-main divergence unless the worktree side is backed by a
real commit (`fileCommittedClean` check) — a deliberate, correct guard
against trusting stray mid-edits. An uncommitted `repoos mv` write undermines
that same guarantee for the main checkout's own copy: nothing else in the
system can distinguish "a deliberate status change" from "a stray dirty
file," and a later `git reset`/`git clean`/conflicting merge in the main
checkout could silently lose the status change with no error.

## Desired UX

`repoos mv` (and any other CLI path that mutates a task's status/metadata
directly, bypassing the HTTP API) commits its change to git in the main
checkout, the same way `patchTaskFile`/`repoos update` already do. An agent
or human running `repoos mv 0202 review` should get the same durability
guarantee as the HTTP `PATCH .../review` path.

## Acceptance criteria

- [ ] `repoos mv <id> <status>` commits the status change (a `docs(<id>):
      status <old>→<new>` style message is fine, matching patchTaskFile's
      convention).
- [ ] Decide and document: should `cmdMv` route status changes — especially
      transitions INTO `review` — through the same `guardReviewTransition`
      gate the HTTP PATCH route uses (commits pending implementation
      changes, rejects a vacuous transition), or is a plain commit of the
      task file itself sufficient for the CLI path? The HTTP path's
      guarantees exist for a reason; a CLI shortcut that skips them for
      review transitions specifically is worth a deliberate decision, not
      an accident of two similar-looking code paths.
- [ ] `RepoOS.updateTask()` (also in `src/core/repoos.ts`, backing
      whatever else calls it) — audit whether it has the same gap.
- [ ] Existing `repoos mv` tests/behavior for non-git-repo or detached
      scenarios (if any) still pass — commit should be best-effort/fail-soft
      like patchTaskFile's, not a hard failure that blocks the status write
      itself.
- [ ] `repoos check` passes.

## Notes for AI

- Compare directly against `patchTaskFile` in `src/server/write.ts` — it's
  the known-good reference for "write + commit" semantics on a task file.
- `src/server/agents.ts`'s `healBoardDivergence` and `fileCommittedClean`
  are the reason this gap is worth fixing rather than leaving as a curiosity
  — they're the concrete mechanism whose guarantees this gap quietly
  undermines.
- Related: #0202 (the task whose activity log surfaced this), and the CLI
  write-target fix landed in commit c5e39773 on main this same session.

## Original prompt

Follow-up from investigating why task #0202's agent reported "task is now
in review" while the live board silently stayed on `active`. Two bugs
compounded: (1) repoos mv/update/new resolving to cwd instead of the board
root when run from inside a worktree (fixed, commit c5e39773), and (2) this
one — even a correctly-targeted repoos mv write is never committed to git,
which is exactly why the board's own self-heal mechanism correctly declined
to trust it.

## Activity

- 2026-08-20T11:40:22Z · body
- 2026-08-22T16:53:10Z · pm_model_override
- 2026-08-23T04:55:24Z · model_override
- 2026-08-23T04:55:44Z · status inbox→ready
- 2026-08-23T08:22:28Z · status ready→active, branch
- 2026-08-23T11:05:38Z · status active→review
