---
id: "0418"
title: "New Skill Suggestion: Diagnose RepoOS close-out validation failures"
type: spec
status: active
priority: p2
area: server
assigned_to: human
created_by: ""
branch: feat/new-skill-suggestion-diagnose-repoos-clo
created_at: "2026-09-18T15:13:54Z"
updated_at: "2026-09-19T01:40:48Z"
---
## Problem

Task #0414 (Don't start a close-out while the server is mid-reload) completed a session that appears to contain a
non-trivial, reusable procedure: **Diagnose RepoOS close-out validation failures**.

This is an auto-generated suggestion from that session. Nothing is live as a
skill yet — approve it by turning the draft below into a skill file.

## Desired UX

If the draft is worth keeping, create `skills/diagnose-repoos-close-out-validation-failures/SKILL.md` from it (edit
as needed) and close this task the normal way. If it is not, close it and
discard the draft.

## Draft skill (SKILL.md)

```markdown
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

1. **Build the event timeline.** Read `.repoos/logs/system.log` and `.repoos/logs/tasks/<id>.log`. Note timestamps of: close-out job start, any `reload: spawning replacement` / `build changed (poll)` lines, `mergeBranch` calls, and the old server handover/exit. Determine whether a server reload was in flight during the close-out window.
2. **Check for a reload race.** If a reload was in flight when close-out began, the failure is environmental: a close-out must not start while a replacement is spawning/handing over. Fix: wait for the reload to settle first.
3. **Inspect retryable classification in `validateCandidate`** (`src/server/integration-orchestrator.ts`). Only a real conflict — `merge.conflicts` non-empty — should be non-retryable. When auto-resolve succeeded but its commit failed, `merge.conflicts` is empty and the error must be retryable.
4. **Check the self-heal repair handoff.** Confirm it fires for the actual failure reason string. If it only matches reasons starting `merge conflict in `, an `auto-resolve failed …` reason gets neither a retry nor a repair and the job dies silently.
5. **Inspect `mergeBranch` in `src/core/git.ts`** auto-resolve path. Confirm lock-contention signals — `index.lock` or `Unable to create … .lock` — are classified **retryable**, not `non-retryable`.
6. **Add a test** covering the ordering guarantee (close-out cannot begin during a reload) and, if changed, the retryable classification.
7. **Verify by hand.** Run the merge/resolve steps manually to isolate environmental causes from logic causes.

### B. Manual / interactive path (`repoos mv done` from CLI or interactive agent session)

The CLI guard blocks `done` if the branch still exists locally and is not an ancestor of `main` — `repoos mv done` only flips the status flag, it never merges. The Fix button / `POST /api/tasks/:id/done` handles the merge automatically and is the preferred path. Use this manual sequence only when driving the board directly:

1. **"Branch not merged into main" error.** The branch exists locally but hasn't been merged. Do NOT pass `--force-not-merged` unless the code truly landed another way. The correct fix:
   ```
   # In the task's worktree:
   git rebase main
   # Back in the main checkout:
   git merge --ff-only <branch>
   repoos mv <id> done
   git worktree remove <worktree-path>
   git branch -d <branch>
   ```
2. **"Not possible to fast-forward" error.** Main has moved ahead since the branch was cut. Rebase the branch onto current main first (step above), then `--ff-only` will succeed.
3. **Check for task file drift before merging.** Run `git diff main...HEAD --name-only | grep '^work/'` in the worktree. Any `work/` file other than the task's own `.md` is drift — run `git checkout main -- <file>` to restore it before merging.
4. **Verify the code landed.** After `repoos mv done`, confirm with `git show main:<a-file-the-task-added>` — the status flag flipping does not prove the code merged.
```

## Activity

- 2026-09-18T15:13:54Z · created · unknown
- 2026-09-19T01:40:09Z · body
- 2026-09-19T01:40:44Z · status inbox→ready
- 2026-09-19T01:40:48Z · status ready→active, branch
