---
id: "0063"
title: Let the user restart a dirty task in its existing worktree or a clean one
type: feature
status: review
priority: p2
area: ui
assigned_to: ai
created_by: ""
branch: feat/0063-restart-dirty-task-choice
created_at: "2026-08-10T23:57:48Z"
updated_at: "2026-08-11T01:18:42Z"
---
## Activity

- 2026-08-10T23:57:48Z · created · unknown
- 2026-08-11T01:15:48Z · set to review · ai

## Problem

"Start work" on a previously-run task silently reuses the existing (dirty)
worktree: `ensureWorktree` returns the existing path (`src/core/git.ts:151`)
and the start endpoint just spawns there (`src/server/server.ts:547`). There is
**no way to choose a clean start** — a task whose previous agent run left the
branch ahead of `main` and/or with uncommitted changes can only be restarted
cleanly with manual git. The UI surfaces only `git.branchExists`
(`TaskDrawer.vue:866`), never whether the worktree is dirty.

This bit in practice: a stuck claude run had committed `node_modules` (272
files) into task #0054's branch, #0045's worktree carried uncommitted stale
`dist/` + screenshot changes, and the only path was manual worktree inspection
and a hand-rolled `git rm -r --cached node_modules` cleanup. When switching
engines (claude → opencode) the old conversation is gone anyway — the worktree
files are all the new agent has — so inheriting a half-broken or polluted tree
unconditionally is the wrong default for the restart case.

## Desired UX

When a user clicks "Start work" on a task whose branch/worktree **already
exists and is dirty** (commits ahead of `main` and/or uncommitted changes), the
drawer asks how to proceed:

- **Continue in existing worktree** — default, non-destructive; keeps the
  previous agent's progress (committed and uncommitted). This is today's
  behavior, made explicit.
- **Start fresh** — resets the branch to `main` and discards the previous
  agent's commits and working-tree changes before spawning. Destructive: the
  confirm copy states the old work is discarded (recoverable via git reflog
  until GC).

Tasks whose worktree is clean (never started, or previous run left nothing)
never prompt — Start work behaves exactly as today. A task started via an API
call without a `mode` also keeps today's behavior (continue).

## Acceptance criteria

- [ ] Task git info gains a dirtiness signal:
      `git: { branchExists, ahead, uncommitted, lastCommit, lastCommitAt }`
      where `ahead` is the commit count on the branch not in `main` and
      `uncommitted` is true when the worktree has uncommitted or untracked
      changes (`git status --porcelain` non-empty, gitignored files excluded).
      Computed in `refreshBranches`/the indexer so `GET /api/tasks` carries it;
      mirrored in `src/core/types.ts` `TaskGitInfo` and the UI `types.ts`.
- [ ] Dirtiness reads from the **worktree path** (via `git worktree list`),
      never the main checkout; fail-soft to clean when git is missing, the
      worktree is gone, or `main` has no commits to diff against.
- [ ] `POST /api/tasks/:id/start` accepts an optional body
      `{ mode: "continue" | "fresh" }` (absent ⇒ `continue`). `fresh` resets
      the branch hard to `main` inside the existing worktree (reuses the
      worktree path — no delete/recreate) before the agent spawns; the response
      echoes `{ mode, reset: true }`.
- [ ] The TaskDrawer start action, when the task's worktree is dirty, presents
      the continue/fresh choice with "Start fresh" requiring confirmation
      (destructive warning). Clean tasks skip the dialog entirely.
- [ ] Unit tests for the dirtiness computation (ahead count, uncommitted
      flag, ignored-file exclusion) and a fixture E2E proving `fresh` resets
      the branch before spawning (fakebin pattern); `repoos check` passes; zero
      new runtime dependencies.

## Notes for AI

- **Files to touch**: `src/core/git.ts` (new `worktreeDirtyInfo(root, branch)`
  helper — `git rev-list --count main..<branch>` for `ahead`, `git -C
  <worktree> status --porcelain` for `uncommitted`), `src/core/types.ts`
  (`TaskGitInfo`), `src/core/indexer.ts` + `src/server/live-index.ts`
  (`refreshBranches`), `src/server/server.ts` (start route, `mode` handling),
  `src/ui-app/src/components/TaskDrawer.vue` + `src/ui-app/src/api.ts` and
  `types.ts` (choice dialog + payload).
- **Use the merge-base, not a hardcoded `main`**, when computing `ahead` —
  `main` is the convention here but the diff must be against the current
  default branch; treat a missing base as clean.
- **`fresh` must not orphan the worktree**: reset in place
  (`git reset --hard`), keep the branch name and worktree path so
  `ensureWorktree` still reuses them. Do NOT delete the branch or worktree —
  that belongs to the done flow (`src/server/done.ts`).
- **Don't** change pause semantics; don't reset on follow-up `message` turns;
  don't prompt for non-start actions; don't add a `repoos` CLI flag for this
  (start is API + UI only); don't auto-delete anything.
- **Self-hosting rule**: this repo runs itself — after the UI change run
  `bun run build:ui`, keep `repoos serve` running, and probe: dirty task shows
  the choice + fresh resets the worktree; clean/first-time tasks start with no
  dialog; `repoos check` passes.

## Scope

- **This task**: the dirtiness signal, the start `mode`, the drawer choice on
  dirty tasks, tests.
- **Deferred (separate tasks)**: a "reset" affordance outside the start flow;
  surfacing worktree dirtiness in the board/card UI beyond the drawer; storing
  a stash/snapshot of the discarded work before a fresh reset; a CLI path.

## Related

- 0037 · Start/Pause (the start endpoint this extends)
- 0041 · Worktree-backed agent runs (the reuse behavior this makes explicit)
- 0047 · Move-to-done (where worktrees are actually removed)
- 0054 · Preview a review task's worktree UI (worktree introspection precedent)
- Root incident: a stuck claude run left #0054's branch polluted with
  node_modules and #0045's worktree uncommitted-stale; restarting required
  manual git.

## Activity

- 2026-08-11T00:07:48Z · status ready→active
- 2026-08-11T01:18:42Z · status active→review
