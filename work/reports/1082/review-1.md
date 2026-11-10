---
task: "1082"
pass: 1
at: "2026-11-10T02:05:12.534Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/handoff-should-wait-bounded-for-a-runnin
state: ok
tree_identity: "e1ee9d46f:c4a8ee3fc"
---
## Verdict
needs some work — the waiting label is masked during the wait it exists for, and refused handoff-path commits still fail fast.

## Relevance
still relevant — on main the commit step still fails immediately on the lock refusal, and nothing else on main already waits.

## Evidence
None. The one capture is the Mission Control home page (`default-1.png`, auto-matched to `src/ui-app/**`), not the drawer. It does not show the waiting state. The defects below are code defects, so this is not `EVIDENCE-GAP-ONLY`.

## Bugs
- **Waiting label is masked (AC1 visible state unmet).** `src/ui-app/src/components/TaskDrawer.vue:414-424`: `statusProgress` prefers `activeCheckRun` (the task's check run with `running`) over `handoffStatuses[id].progress`. While the self-check holds the lock its run is still `running`, so the drawer shows the check's step name and never reaches the `reason` branch. The reason only shows when no check run is live, which is when nothing is waiting.
- **Other refused server git writes still fail fast (AC1 says "any other server git operation").** `checkGateGitCommandRefusal` (`check-gate-lock.ts:1249`) refuses every `commit` in a locked worktree, bookkeeping paths included. Unwrapped instances:
  - `src/server/handoff.ts:1091-1103`: the engineering-report `add` and `commit` run inside the handoff itself, so a live check turns them into `could not commit finalized engineering report: A check is running`.
  - `src/server/review-report-store.ts:53-60`: `commit --only` on the worktree.
  - `src/server/engineer-remote-self-check.ts:102-108`: `add` and `commit` in the engineer worktree.
  - Not verified: the `integration-orchestrator.ts` writes (2121–2198, 3585–3598). Check whether they run in a locked worktree.
- **PATCH close-out route now hangs (`src/server/routes/tasks.ts:3215`).** The "commit & continue" path calls `guardReviewTransition` with no options, so the HTTP request blocks up to 45 minutes with no waiting state. This is an undocumented contract change. Either wait explicitly and say so, or keep fail-fast there.
- **Reason can stick (`src/server/handoff.ts:788-798`).** `setHandoffWaitingReason(..., null)` only runs on the non-throw path. If the guard throws, the wait reason stays in the record. Wrap it in `try/finally`.
- **Dead-holder test does not exercise recovery (`src/ui-app/tests/review-guard.test.ts`, "recovers a dead holder's lock").** The first attempt already ignores the dead holder, so `waits` is 0 and the loop's `recoverStaleCheckGateLocks` call never runs. AC3 "stale lock is recovered" is only nominally covered. No test covers handoff-level waiting or the `setHandoffWaitingReason` path.

Class check: no new bare `node`/`npm`/`npx` invocations in the diff. Prior reports: none; `work/reports/1082` holds only the engineering round. `git merge-tree` conflicts only in `work/1082-…md`, which is not a source conflict.

## Edge cases
- Timeout path: 45-minute deadline matches `localChecks.queueTimeoutMs`; the timeout test and the release-on-wait test are sound.
- Retrying the whole guard after a refused `add` is safe because `reset` runs first each attempt.

## Suggestions
- Drop `reason?` from `TaskCheckRun` in `src/ui-app/src/types.ts`. Nothing sets it on check runs.
- Add a shot of the drawer during a waiting handoff, or a state fixture, so the label is visually verified.

## Could not verify (environment)
- Did not re-run the test suite (per instructions). Did not confirm the drawer label in a browser.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-10T02:03:05.636Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

