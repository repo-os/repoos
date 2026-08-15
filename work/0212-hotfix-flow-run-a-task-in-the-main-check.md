---
id: "0212"
title: "Hotfix flow: run a task in the main checkout instead of a worktree"
type: feature
status: active
priority: p1
area: core
assigned_to: ai
created_by: ""
branch: feat/hotfix-flow-run-a-task-in-the-main-check
created_at: "2026-08-15T05:46:19Z"
updated_at: "2026-08-15T11:06:19Z"
---
## Problem

Every task today follows one pathway: derive a branch, cut a linked worktree under the worktrees dir, run the agent there, hand off, then close out by merging that branch into main. That is right for most work and wrong for a small fix — cutting a worktree, bootstrapping it, and running the full close-out gate is a lot of ceremony to change three lines.

Add a second, explicitly-marked pathway: a **hotfix** that runs the agent in the MAIN checkout (`config.root`), on a short-lived branch, and merges to main with a simpler flow. Triggered from a button in the task drawer, at the bottom-right of the same row as "Delete task". Once triggered, the task must make it unmistakable — in the drawer and on the board card — that it is a hotfix and is NOT using a worktree.

Half the plumbing already exists: `ensureWorktree` returns `config.root` when the main checkout is already on the task's branch (`src/core/git.ts:225`). What's missing is deliberately choosing that path, and hardening everything downstream that assumes the main checkout is nobody's workspace.

## Proposed shape

- **One flavor, plus an escape hatch.** Hotfix = work in the main checkout on a `hotfix/<id>-<slug>` branch. Committing straight to `main` (no branch) is a separate, explicit sub-option — not the default. The branch form keeps the merge a trivial fast-forward and preserves an undo.
- **Persist as frontmatter** (`hotfix: true`, and a `hotfix_target` of `branch` | `main`) so the mode survives a server restart and every server-side branch point reads it off the task, never off UI state. Both keys must round-trip through `TaskFrontmatter`/`Task` and `patchTaskFile`.
- **Refuse to start a hotfix against a dirty main.** See risk 1 below — this single guard removes the worst foot-gun and is far simpler than trying to scope the commit to agent-touched files. Reuse the `dirtyFiles(config.root)` guard that already backs move-to-done, and surface the same "commit or stash first" UI.
- **One root-occupier at a time.** Extend the close-out lock idea in `src/server/repo-lock.ts` into a root lock that BOTH a running hotfix and a close-out must hold, so they cannot interleave.
- **Skip, don't fail**, for hotfix tasks: no preview, no clean restart, no diff-based review.

## Risks to address (each needs a deliberate decision in the implementation)

1. **The handoff commit will sweep up unrelated dirty files.** `handoffTask` commits with `git add -A -- . :(exclude)dist :(exclude)screenshots :(exclude)<task file>` (`src/server/handoff.ts:187`). In a worktree that is safe — nothing else lives there. In root it captures every dirty file in the user's main checkout. On a direct-to-main hotfix those land on `main` with no review gate. This is the highest-severity risk.
2. **Root contention with close-out.** `completeTaskLocked` runs entirely in root: merge, build, screenshots, `repoos check` (`src/server/done.ts:408-522`). A hotfix agent editing root while another task closes out means the merge aborts on a dirty tree, or the post-merge build/check runs against a tree contaminated by hotfix edits and fails, blaming the wrong task. Two concurrent hotfixes are the same problem squared. Needs real mutual exclusion.
3. **RepoOS is self-hosting.** The server serving the board runs out of this same checkout, watches those files, and serves that `dist/`. An agent rebuilding `dist/` in root under a live server has a different blast radius than the same work in a sibling worktree.
4. **Direct-to-main loses both gates.** The normal flow checks twice — `repoos check` at handoff in the worktree, then build + check post-merge in root. Straight-to-main has only the first, and a failure has nowhere to fall back to. Reviews also go dark: `ReviewManager` diffs the branch against main (`src/server/review.ts:403`), and branch == main is an empty diff.
5. **The watchdog will misfile a stalled hotfix.** `worktreeStatus` deliberately reports root as `{path: null, dirty: false}` (`src/core/git.ts:292`) so the whole repo's dirt does not mark tasks dirty. The watchdog uses exactly that to route a stuck task to `review` vs back to `ready` (`src/server/task-watchdog.ts:147`). A hotfix that stalls with real uncommitted work in root reads as "no work" and is sent back to `ready`.
6. **Restart and preview do not apply.** `resetWorktree` correctly refuses on root (`src/core/git.ts:325`), so "clean restart" surfaces as a confusing 400. `PreviewManager.doStart` would resolve to root and spawn a SECOND `repoos serve` against the live checkout (`src/server/preview.ts:272`).
7. **`deleteBranch` is safe only by luck.** It uses `git branch -d` (`src/core/git.ts:802`), which refuses a checked-out branch, so close-out will not delete `main`. Make that an explicit guard rather than an accident.

## Acceptance criteria

- [ ] A "Hotfix" button sits at the bottom-right of the drawer's delete row (`src/ui-app/src/components/TaskDrawer.vue:2130`), opposite "Delete task"
- [ ] Triggering it explains what changes (no worktree, works in the main checkout, simpler merge) and requires a confirm before the task is switched
- [ ] Hotfix mode is persisted in task frontmatter and survives a server restart; the board card and the drawer both carry a persistent, unmissable hotfix marker (not just a transient button state)
- [ ] A hotfix task runs its agent with `cwd = config.root` on a `hotfix/<id>-<slug>` branch; the direct-to-main variant is a separate explicit choice
- [ ] Starting a hotfix against a dirty main checkout is refused with an actionable message, not started and cleaned up afterwards
- [ ] A hotfix run and a close-out cannot hold the main checkout at the same time; the second one is rejected or queued with a clear reason
- [ ] Two hotfix tasks cannot run concurrently
- [ ] The handoff commit for a hotfix never includes files the agent did not touch
- [ ] `repoos check` still gates a hotfix before it reaches main
- [ ] Preview, clean restart, and diff-based review are hidden/skipped for hotfix tasks rather than failing with a confusing error
- [ ] The watchdog evaluates a stalled hotfix against root's real git status instead of `worktreeStatus`, so uncommitted work routes it to `review`, not `ready`
- [ ] Close-out for a hotfix never attempts to delete `main` and never removes a worktree that does not exist
- [ ] Tests: hotfix start refused on dirty main; hotfix + close-out mutual exclusion; handoff commit scoping; watchdog routing for a hotfix with uncommitted root work

## Notes for AI

- Read `src/server/handoff.ts` first — the trusted finalization path validates that the agent's workdir equals `worktreePathForBranch(root, task.branch)` (`:134-141`). For a root-mode task that resolves to `config.root` only while root stays checked out on the hotfix branch. Decide deliberately whether to keep that invariant or add a hotfix-specific validation branch; do not weaken the check for normal tasks.
- `ensureWorktree`'s existing root shortcut (`src/core/git.ts:225`) means much of this works accidentally today. Prefer making the choice explicit at the call site (`src/server/routes/tasks.ts:320`) over relying on the shortcut.
- `bootstrap` validates and may build the worktree (`src/core/bootstrap.ts:210`). Running its build step against the live server's own root is one of the risk-3 hazards; decide which steps a hotfix should skip.
- Do not change the default pathway's behaviour. Every guard added here must leave worktree-based tasks exactly as they are.

## Related

- #0204, #0211 (the dirty-main guard and its failure — the same `dirtyFiles` guard is reused here)

## Activity

- 2026-08-15T05:46:19Z · created · unknown
- 2026-08-15T05:47:30Z · status inbox→ready
- 2026-08-15T11:06:19Z · status ready→active, branch
