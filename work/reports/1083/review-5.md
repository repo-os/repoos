---
task: "1083"
pass: 5
at: "2026-11-10T22:23:26.802Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/review-runner-a-stale-review-already-run
state: ok
tree_identity: "ef78ee65c:"
---
## Bugs
None found. I checked pass 4's open item: `registration()` now calls the runner's non-reconciling `hasEntry` and returns null before any probe for an idle task. The test asserts that `reviewProcessLive` and `isRunning` are not called. The pass 1–3 items (finalizing counted as live, the prepare-rejects case, unguarded `runs.delete`) are also fixed. No bare `node`, `npm` or `npx` was added. The only `merge-tree` conflict is the task's own `work/1083-*.md`.

## Edge cases
- **Reaper and a just-finished timed-out review (accepted item 2).** A finalizing entry's `since` is `run.startedAt`, not the finalize start, so the reaper can clear a timed-out review's finalize. It sets `run.cancelled` and drops the run before `onReviewDone`. For kiro and crush, which await a session capture first, `timedOut` is then lost and the report is written as a generic failure. This is the accepted item, so it is not blocking.
- **Board read between reviewer exit and `close`.** `reconcileDeadAgents` now reaps proc-backed review entries. If a read lands in that gap, the entry finalizes with `exitedCleanly=false` and a clean exit is recorded as a failure. The window is milliseconds, and engineer turns already behave this way.
- **Cancel during a finalize** keeps the completion fence until the finalize settles or the reaper clears it (accepted item 4).

## Suggestions (non-blocking)
- `agents.ts:6977` still returns the bare "a review is already running" text. Only `spawnDurable` calls `startReview`, and the canRun/send/checkpoint gates refuse first, so it is effectively unreachable. Give it the same pid and since detail for consistency.
- `registration()` reconciles up to three times on the held path (`reviewProcessLive`, `isRunning` for `entryPresent`, and `running()`). `entryPresent` could use `hasEntry`.
- The default runner mock returns `isRunning: () => false`, so most release tests never touch the real `AgentRunner`. Only `review-dead-adopted.test.ts` does. A test with a real `startReview` that throws would confirm that no runner entry survives.
- The comment on `reapStaleRegistration` says a just-finished turn is left alone. That is not true for timed-out turns (see Edge cases), so the comment should be corrected with item 2.
- Accepted follow-ups 1, 3 and 5 are unchanged.

## Relevance
still relevant — `review.ts` still needs the release path and the reaper, and nothing on `main` removes the leak.

## Evidence
None. No UI shots apply to this diff.

## Verdict
good to go — No blocking defects. Only accepted follow-ups and non-blocking suggestions remain.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

