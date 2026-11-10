---
task: "1083"
pass: 3
at: "2026-11-10T19:45:04.981Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/review-runner-a-stale-review-already-run
state: ok
tree_identity: "e0dc5bd70:"
---
## Verdict
needs some work — `isRunning` now runs a registry read and pid probes for every task on each board GET, and the AC1 rejection path has no test.

## Relevance
still relevant — `reconcileDeadAgents` still skips live review entries on `main` and `review.ts` has not moved, so the leak the task describes is still reachable.

## Evidence
None. No UI shots apply to this diff.

## Bugs
1. **Liveness probe runs on every read path (side effects in a predicate).** `ReviewManager.registration()` (`src/server/review.ts` ~1300) calls `runner.reviewProcessLive()` unconditionally, which calls `reconcileDeadAgents()`. That does a synchronous `readRegistry` file read, pid probes, and can finalize a dead review, even when the task has no run, fence or entry. Callers: `isRunning` (~1276), `runningCount`, `routes/info.ts:156` (`snapshot.tasks.map(withReviewStatus)`, so once per task per board GET), `task-watchdog.ts:677/860`, `request-close-out.ts:221`. Fix: return null from `registration()` before the probe when `!run && !fenced && !runner.isRunning(key)`. The reaper goes through the same function.
2. **AC1 "rejects" case is untested.** `review-stale-registration.test.ts:66` covers only a synchronous throw from `startReview`. Two real release paths have no test: a `prepare` callback that rejects (`prepareReview` `finally`, ~1474) and a `finalizeRun` that rejects (`handleReviewDone`'s error branch, ~1907). Add one test for each and assert `isRunning` is false afterwards.

Rounds 1 and 2 are verified fixed: cancel no longer drops a fence, unguarded `runs.delete` sites now go through `dropRun` or the identity-guarded `release`, and a dead finalizing entry is no longer live.

## Edge cases
- `registration()` stamps `since = Date.now()` for a finalizing entry with no fence and no run, so it never ages. The window is short (kiro/crush capture awaits, ≤5s), but fall back to the entry's `startedAt` instead.
- The `proc.on("close", finishTurn)` handler (`agents.ts` ~8122) calls `cleanup(taskId)` by key, not by entry identity. If reconcile reaped a review first and a newer review took the key, a late `close` would finalize the new entry. The window is narrow; add an `entries.get(taskId) === entry` guard.
- The reaper drops a completion fence after the review timeout even while its finalize is still writing. Round 2 accepted this trade-off; it should be written down.
- A cancelled preparation emits `state: "cancelled"` after its run has been dropped, so a newer live review can show as cancelled.
- I ran `git merge-tree --write-tree main HEAD` once before I re-read the brief's rule against it. It exited 1, consistent with the checklist's task-file-only conflict. I did not list the conflicting files.

## Suggestions
- The runner busy refusal (`agents.ts` ~6967) still has no pid or start time. It is a backstop, so leaving it is fine.
- Name the fence trade-off in `user-docs/` or `docs/` near the review registration.

## Could not verify (environment)
- I did not run tests, per the brief. The test evidence is read-only.

## Verdict
needs some work — `isRunning` probes the registry and pids on every board GET (bug 1), and the AC1 rejection path has no test (bug 2).

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

