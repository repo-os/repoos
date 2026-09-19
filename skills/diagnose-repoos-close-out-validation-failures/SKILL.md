---
name: diagnose-repoos-close-out-validation-failures
description: Use when a Move-to-done / close-out fails with 'validation failed (non-retryable)', 'auto-resolve failed', 'branch not merged into main', or a diverged-branch error — to find whether it was a real conflict, a reload race, a misclassified retryable git error, or a missing merge step on the manual path.
---

# Diagnose RepoOS close-out validation failures

## When to use

A task's close-out fails with any of:
- `validation failed (non-retryable)` or `auto-resolve failed for work/<id>.md` from the server pipeline (`POST /api/tasks/:id/done`)
- `lock-contention` error during merge
- `Refusing to mark #<id> done — branch "..." is not merged into main` from `repoos mv done` on the manual/interactive path
- `fatal: Not possible to fast-forward` when merging a feature branch into main

## Two distinct paths

### A. Server pipeline failures (`POST /api/tasks/:id/done` / Fix button)

This path handles the merge itself. Failures here are usually a reload race, retryability misclassification, or a real merge conflict.

1. **Build the event timeline.** Read `.repoos/logs/system.log` and `.repoos/logs/tasks/<id>.log`. Note timestamps of: close-out job start, any `reload: spawning replacement` (`src/server/reload.ts`) / `build changed (poll)` lines, `mergeBranch` calls, and the old server handover/exit. Determine whether a server reload was in flight during the close-out window.
2. **Check for a reload race.** If a reload was in flight when close-out began, the failure is environmental: a close-out must not start while a replacement is spawning/handing over (task #0414). Fix: wait for the reload to settle first, then retry Move-to-done.
3. **Inspect retryable classification in `validateCandidate`** (`src/server/integration-orchestrator.ts`). Only a real conflict — `merge.conflicts` non-empty — should be non-retryable (line ~1089: `retryable: merge.conflicts.length > 0 ? false : true`). When auto-resolve succeeded but its commit failed, `merge.conflicts` is empty (git.ts:1541-1548) and the error must be retryable.
4. **Check the self-heal repair handoff.** Confirm it fires for the actual failure reason string. The handoff matches only reasons starting `merge conflict in ` (`integration-orchestrator.ts:677`, `server.ts:1216`). An `auto-resolve failed …` reason starts differently, gets neither a retry nor a repair, and the job dies silently — that path needs its own classification.
5. **Inspect `mergeBranch` in `src/core/git.ts`** auto-resolve path. Confirm lock-contention signals — `index.lock` or `Unable to create … .lock` — are classified **retryable**, not `non-retryable`. The generic fallback (`mergeBranch` tail, git.ts:1566-1571) currently returns `conflicts: []`, which under step 3 makes it retryable — verify that holds.
6. **Add a test** covering the ordering guarantee (close-out cannot begin during a reload) and, if you changed the classification, the retryable/non-retryable boundary.
7. **Verify by hand.** Run the merge/resolve steps manually to isolate environmental causes (reload race, lock contention) from logic causes (misclassification, missing handoff).

### B. Manual / interactive path (`repoos mv done` from CLI or interactive agent session)

The CLI guard blocks `done` if the branch still exists locally and is not an ancestor of `main` (`src/commands/tasks.ts:220`) — `repoos mv done` only flips the status flag, it never merges. The Fix button / `POST /api/tasks/:id/done` handles the merge automatically and is the preferred path. Use this manual sequence only when driving the board directly:

1. **"Branch not merged into main" error.** The branch exists locally but hasn't been merged. Do NOT pass `--force-not-merged` unless the code truly landed another way. The correct fix:
   ```
   # In the task's worktree:
   git rebase main
   # Back in the main checkout:
   git merge --ff-only <branch>
   # Only now:
   repoos mv <id> done
   ```
   If the fast-forward fails with `fatal: Not possible to fast-forward`, the branch has diverged from main (it contains commits main doesn't, or main advanced past the merge-base). Resolve by rebasing the branch onto the current main and re-merging, never with `--no-ff` merge commits into main.
2. **Verify the merge actually landed.** `repoos mv done` does not merge; confirm with `git show main:<a file the task added>` before trusting the status flip. If the branch still isn't an ancestor of main, the guard will fire again on the next attempt.
