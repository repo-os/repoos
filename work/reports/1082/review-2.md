---
task: "1082"
pass: 2
at: "2026-11-10T08:24:40.058Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/handoff-should-wait-bounded-for-a-runnin
state: ok
tree_identity: "745752f99:ae6594083d"
---
## Verdict
needs some work — the 45-minute wait is cut at 30 minutes by the handoff's hard deadline, and the drawer's waiting label has no visual proof.

## Relevance
still relevant — on main the handoff commit step still fails immediately on the lock refusal, and nothing else on main waits for it.

## Evidence
None. This is not `EVIDENCE-GAP-ONLY`, because code defects exist. The one capture is stale (`ae6594083d` against reviewed HEAD `745752f99`) and shows the Mission Control home page, not the drawer's waiting label. The visible waiting state is unverified.

## Bugs
- **Bounded waits outlive the handoff deadline (lifecycle ordering).** `handoff.ts:418-420` caps finalization at 30 min by default, and `withHandoffDeadline` (`handoff.ts:1307-1323`) races the whole run against it. The guard wait (`review-guard.ts`, called at `handoff.ts:~819`) and the report-commit wait (`handoff.ts:~1140`) both run inside it, so the wait ends at 30 min, not 45. The handoff then reports `server-side finalization timed out (deadline exceeded)`, not the new timeout text. The orphaned waiter keeps polling after the handoff has failed. It can commit into the worktree later, racing the next attempt. Its `onWait` and `finally` also write the waiting label through `setHandoffWaitingReason` (`handoff-status.ts:203`), which has no attempt key, so it can label a newer running attempt. The docs (`docs/check-run-history.md`, `user-docs/check.md`) and the `CHECK_GATE_WAIT_MS` comment ("matches the local check queue timeout") are wrong. No test covers this; the timeout test calls the guard directly with 120 ms.
- **Fail-fast pre-check defeats the wait (doc contract).** `engineer-remote-self-check.ts:88-90` returns immediately when the lock is alive, before the new wait. The wait only covers the race window, but the docs say it covers the remote self-check checkpoint commit.
- **Waiting state not visually verified (AC1, Desired UX).** No drawer capture exists, so the visible "Waiting for the running check to finish" state is unproven. Required visual criterion, so blocking.

## Edge cases
- Review-1 items verified fixed: the label precedence in `TaskDrawer.vue`; the `finally` clearing the reason; the PATCH route now uses `waitForCheckGate: false`; the dead-holder recovery test exists.
- Still unwrapped: `handoff.ts:1130` (`git add` of the report path). I did not confirm whether the lock refuses it.
- `review-report-store.ts:59` waits up to 45 min. I did not check whether its caller at `review.ts:2865` runs under a request or a deadline.
- The `realpathSync` change in `samePath` is sound; missing paths fall back to `resolve`.

## Suggestions
- Derive the wait bound from the handoff `deadlineAt`, or raise the cap, and abort the wait when the deadline passes. Add a test through `withHandoffDeadline`.
- Derive the busy regex from `CHECK_GATE_WRITE_REFUSAL`. It is currently duplicated in `review-guard.ts` and `check-gate-lock.ts`.
- Restore the `review-guard.test.ts` header comment, which the diff deleted.
- Capture the drawer during a waiting handoff (or add a state fixture) on the final tree.

## Verdict
needs some work — fix the 30-vs-45-minute deadline interaction, the remote-checkpoint doc claim, and capture the waiting state on the final tree.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-10T02:28:28.053Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

