---
task: "1083"
pass: 2
at: "2026-11-10T18:46:55.330Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/review-runner-a-stale-review-already-run
state: ok
tree_identity: "8a3e6ee6a:"
---
## Verdict
needs some work — one lifecycle bug: a review whose finalize hangs after its process dies is never reaped, so the stale-registration symptom can return.

## Relevance
still relevant — `reviewTimeoutMinutes` and the `isRunning`/`cancel` path are unchanged on `main` in the ways the task describes, and the leak it reports is still reachable.

## Evidence
None. No UI shots apply (server and test diff only).

## Bugs
1. **A finalizing review with a dead process is treated as live forever** (`src/server/review.ts` `registration()` ~1290, `reapStaleRegistration()` ~1320; `src/server/agents.ts` `isRunning` ~6418, `reconcileDeadAgents` ~6439). `reconcileDeadAgents` skips `entry.finalizing`, so a review entry whose child has exited but whose `finalizeTurn` has not settled still answers `isRunning(key) === true`. The reaper therefore computes `live = true` and never clears it, and `cancel()` does not clear it either, because the runner entry and the completion fence both remain. Trigger: the child dies, then a worker read in `finalizeReviewDone` hangs. Every later `review again` is refused until restart, which is the #1080 symptom. Class: **liveness signal conflated with entry existence** (`isRunning`, `running()` and the reaper all read "entry present" as "process alive"). Instances in this diff: `registration()` ~1293, `running()` ~6642 (it lists the finalizing entry with its dead pid, so the refusal can name a dead pid), and `reapStaleRegistration`. Fix: treat `finalizing` as not-live in the reaper (for example, expose a `reviewProcessAlive(key)` that excludes finalizing entries), and add a test that a finalizing runner entry older than the timeout is cleared.

## Edge cases
- Cancelled-finalize fence (prior bug 1): fixed. `cancel()` no longer deletes `completions`, and a test covers it (`review-stale-registration.test.ts:108`). The reaper still drops a fence after the timeout. A hung finalize that later settles can then write its report alongside a newly admitted run. I treat this as the intended trade-off, but it should be stated in the docs.
- Prior bug 2 (unguarded `runs.delete`): fixed. Every site now goes through `dropRun` or the identity-guarded `release`. The reaper marks a reaped preparing run `cancelled`, so it cannot spawn afterwards.
- `reconcileDeadAgents` now reaps review turns. For a spawned review whose child has exited but whose `close` has not fired yet, the reaper runs `cleanup` first, which skips the `tailer.drain()` in `finishTurn`, so trailing output can be lost. Engineers already had this race. `exitedCleanly` is never read in `finalizeReviewDone`, so it does no harm today.
- The round-1 engineering report is stale (source commit `5e9b11324`, HEAD `8a3e6ee6a`). It does not cover the `review-dead-adopted` test or the final `agents.ts` change, so I did not rely on its claims.
- `merge-tree` conflicts only in the task's own `work/1083-*.md`, which the landing checklist already marks as resolved at close-out. No source file conflicts.

## Suggestions
- Add a test for a reviewer whose finalize never settles, to lock in Bug 1's fix.
- The runner's busy refusal in `agents.ts` (~6942) still has no pid or time. It remains a backstop, so leaving it is fine.

## Could not verify (environment)
- I did not run the test suite (per the brief). The nine stale-registration tests and the new dead-adopted test are read-only evidence here. I checked the diff and code paths by reading only.
- No `node`, `npm` or `npx` invocations were added in the diff.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

