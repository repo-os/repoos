---
id: "0994"
title: Worktree creation must survive a slow checkout and be safe to retry
type: bug
status: ready
priority: p1
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-31T12:59:31Z"
updated_at: "2026-10-31T16:39:36Z"
---
## Problem

Starting a task sometimes fails with "could not create worktree: ... fatal: a branch named 'feat/...' already exists", leaving an empty branch (zero commits ahead of main) and sometimes a half-checked-out directory with no worktree registration. Every later start then fails the same way until someone deletes the branch by hand. It hit #0988, #0989 and #0991 on 2026-10-31 and cost hours of idle engineer time.

## Root cause (read from `src/core/git.ts`, `ensureWorktree`)

1. The `git worktree add` runs through `gitCapture`, which is a `spawnSync` with a hard 4000 ms timeout. A checkout of about 2,800 files under machine load can take longer. The child is killed mid-checkout (the error text shows "Updating files: 42%"), after git has already created the branch.
2. The retry path in `ensureWorktree` removes the leftover target directory and re-runs the SAME `args`. When the branch did not exist at the start, those args contain `-b <branch>`, but the first attempt already created the branch, so the retry fails with "a branch named ... already exists". The retry never recomputes whether the branch exists.
3. `localBranches` also reads refs with a 4000 ms timeout and returns an empty set on timeout, which can wrongly make `branchExists` false on a later start and choose `-b` again.
4. The server's own auto-start and a manual `repoos start` can run this concurrently for the same task and collide on the branch.

## Desired UX

Starting a task either produces a registered worktree on a branch, or fails cleanly and leaves nothing behind. Starting it again just works.

## Acceptance criteria

- [ ] `git worktree add` for a task uses a timeout sized for a full checkout (and is not shared with the 4 s observational read timeout); a slow checkout completes instead of being killed.
- [ ] The retry recomputes whether the branch exists and uses the plain form (`worktree add <target> <branch>`) when the first attempt created it, never `-b` again.
- [ ] If an attempt is killed or fails, the cleanup removes the half-made directory, runs `git worktree prune`, and deletes the branch only when it has zero commits ahead of main and no worktree.
- [ ] A read timeout in `localBranches` is not treated as "branch does not exist" for this decision (ask git directly for that branch, with a longer timeout).
- [ ] Two concurrent starts for the same task do not both create the branch: one waits for or reuses the other's result.
- [ ] Tests with a fake git cover: killed-mid-checkout then retry, branch left with no worktree, a ref-read timeout, and concurrent starts.

## Notes for AI

Do not weaken the one-writer-per-worktree rule (docs/agent-run-operations.md, #0837). Do not add a runtime dependency. Never delete a branch that has commits ahead of main. See also AGENTS.md "Stuck-active incident (#0151)" for the earlier heal logic in the same function.

## Activity

- 2026-10-31T12:59:31Z · created · njachowski@gmail.com
- 2026-10-31T16:39:36Z · status inbox→ready
