---
task: "1083"
pass: 1
at: "2026-11-10T18:02:06.830Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/review-runner-a-stale-review-already-run
state: ok
tree_identity: "6a30fc353:"
---
## Verdict
needs some work — cancel and the reaper drop in-flight finalize fences, and unguarded `runs.delete` calls can remove a newer run's registration.

## Relevance
still relevant — `reconcileDeadAgents` still skips review entries on `main` (`entry.review || entry.finalizing`), and `review.ts` has not changed on `main` since the branch point, so the premise holds.

## Evidence
None. No UI shots apply (server and test diff only).

## Bugs
1. **Completion fences dropped while finalize is still running** (`src/server/review.ts` `cancel` ~2543, `releaseRegistration` ~1331, reaper ~1326). `handleReviewDone` keeps its fence "across every awaited worker read". `cancel()` and the reaper now delete that fence mid-finalize, so `canRun` admits a second review while the first still writes its report and status. Trigger: cancel during finalize, or a finalize hung past the timeout, then `review again`. Fix: `cancel()` should not drop a completion fence (the finalize's own `release` clears it on the cancelled path). The reaper's age check already covers hung finalizes. The test "clears a cancelled completion fence whose finalize never settles" asserts the current behaviour and would need to change.
2. **Registration deleted without an ownership check.** The class is "release without identity guard". Unguarded `this.runs.delete(task.id)` at `review.ts` ~1553, ~1637 and ~2403 (the `run.cancelled` branches before spawn), and `releaseRegistration` ~1334. A cancelled prepare that resumes after a new `review again` was admitted deletes the new run's `runs` entry. The guarded sites at ~1438 and ~1698 show the pattern: `if (this.runs.get(taskId) === run)`.

## Edge cases
- A preparation that outlives `reviewTimeoutMs` (15 min default) is reaped while still preparing. A later `cancel()` then finds no run, no fence and no runner entry, returns early without writing the cancelled marker, and the cancelled review still spawns.
- The refusal's `since` is the prepare-time `run.startedAt`, not the process start the spec describes. It is still correct for telling stale from live.
- `reconcileDeadAgents` now reaps dead review turns and hard-codes `exitedCleanly=false` for proc-attached ones. This is harmless today because `finalizeReviewDone` accepts that parameter and never reads it.
- A review whose worktree vanishes (`cwdGone`) is now finalized as failed, where it previously waited.

## Suggestions
- No test covers the `agents.ts` reconcile change, which is the root-cause fix for adopted reviews. Add one that asserts `onReviewDone` fires for a dead adopted review.
- Add tests for cancel during finalize followed by a re-run, and for a cancelled prepare that resumes after a new run is admitted.
- The runner-level busy refusal at `agents.ts` ~6942 still carries no pid or time. It is a backstop, so leave it.

## Could not verify (environment)
- I did not re-run tests, per the brief. The nine tests in `review-stale-registration.test.ts` are read-only evidence here.
- Landing facts (merge with main, lock, cleanliness, scope) are the server-computed checklist. I did not re-run them. `git log` shows no `review.ts` or `agents.ts` changes on `main` since the branch point, which fits the WARN on the task file alone.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

