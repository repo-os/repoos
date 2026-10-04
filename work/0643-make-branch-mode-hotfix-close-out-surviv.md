---
id: "0643"
title: Make branch-mode hotfix close-out survive a failed publish and index.lock contention
type: bug
status: active
priority: p2
area: [server, core]
assigned_to: ai
created_by: ""
branch: feat/make-branch-mode-hotfix-close-out-surviv
created_at: "2026-10-04T06:43:06Z"
updated_at: "2026-10-04T07:28:27Z"
---
## Problem
Observed on #0642 (2026-10-04). Move to done on a branch-mode hotfix failed at publish with `could not merge to main: error: Unable to create .git/index.lock: File exists`, and every retry then failed in the sync phase with `feature branch hotfix/… worktree not found`.

Two defects:
1. **Failed publish strands the checkout.** For a branch-mode hotfix the "task worktree" is the main checkout sitting on the hotfix branch. Close-out deliberately checks out `main` before publishing (`integration-orchestrator.ts`, "Ensure the main checkout is on the actual main branch"), but on any publish failure it leaves the checkout on `main`. `validateCandidate` then calls `worktreePathForBranch(root, taskBranch)`, finds no worktree with the hotfix branch checked out, and fails with "worktree not found" on every retry. The task cannot recover without a manual `git checkout <hotfix branch>`.
2. **No retry on `index.lock`.** The publish step fails immediately on a transient git lock. The lock was gone by the time it was inspected, and only `fsmonitor` daemons were running, so the holder is unknown; the step should tolerate a short-lived lock.

## Desired UX
- A failed publish restores the main checkout to the hotfix branch it came from, so retrying Move to done works with no manual git.
- Alternatively (or additionally), the sync/validate phase handles a hotfix branch that is not checked out anywhere: for a hotfix there is no separate worktree to find, so it should use the branch ref directly or re-checkout it.
- Git operations in the publish path retry briefly (bounded, with backoff) on `index.lock` contention before failing, and the final error names the lock and says retry is safe.

## Acceptance criteria
- [ ] A test: branch-mode hotfix, publish fails after the checkout switch, checkout is back on the hotfix branch and the next Move to done succeeds
- [ ] A test: sync phase for a branch-mode hotfix whose branch is not checked out does not fail with "worktree not found"
- [ ] A test: a transient `index.lock` during publish is retried and the close-out succeeds; a persistent lock fails with a clear message
- [ ] Non-hotfix close-out behaviour is unchanged
- [ ] `docs/close-out-pipeline.md` updated if the hotfix section contradicts the new behaviour

## Notes for AI
Relevant code: `src/server/integration-orchestrator.ts` (checkout-to-main step before publish, `validateCandidate` worktree lookup, `preflightConflict`), `src/server/done.ts` (hotfix handling and post-close branch cleanup), `src/core/git.ts` (`ensureHotfix`, `resetHotfix`). Find who else takes `index.lock` around publish (fsmonitor, watcher, task-file auto-commits) before choosing the retry shape. Do not edit task files by hand. This is close-out pipeline code, so run the full normal flow, not a hotfix.

## Scope
Covers: hotfix close-out recovery and git lock tolerance in the publish path. Deferred: redesigning the hotfix flow, and non-hotfix lock handling beyond the shared retry helper.

## Activity

- 2026-10-04T06:43:06Z · created · unknown
- 2026-10-04T07:28:19Z · status inbox→ready
- 2026-10-04T07:28:27Z · status ready→active, branch
