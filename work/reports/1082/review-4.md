---
task: "1082"
pass: 4
at: "2026-11-10T09:27:42.939Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/handoff-should-wait-bounded-for-a-runnin
state: ok
tree_identity: "08984f75f:08984f75f6"
---
## Verdict
good to go — EVIDENCE-GAP-ONLY: the code is sound; the drawer shot shows "starting…", not the wait label (accepted-scope item 1).

## Relevance
still relevant — on `main` the handoff commit step still fails immediately on the lock refusal, and nothing else in the handoff path waits for it.

## Evidence
- `default-1.png` (declared "Task drawer while a handoff waits for the running check"): shows "Checks · starting… 1m 35s" and "starting…" on the Dev tab. It does not show "Waiting for the running check to finish". I confirmed `statusProgressLabel` is defined in `TaskDrawer.vue:427` but never read by the template, so the label cannot render. Accepted scope item (1) excludes this. Re-capture once the label is wired.
- Capture tree `08984f75f6` is current: the only commits after it are bookkeeping.

## Bugs
None found

## Edge cases
- `commitWipCheckpointForRemoteGate` (`engineer-remote-self-check.ts:116`) waits up to 45 minutes with no handoff deadline, inside the engineer's own `repoos check`. It only runs in a race after the live-lock pre-check, but a stalled check would hang for that long.
- `handoffWaitingReason` (`TaskDrawer.vue:416`) ignores `state`. If the server dies mid-wait, `progress.reason` persists on a `running` status file. It is invisible today, but it would show as stale once the label is wired.
- Stale or dead locks: `aliveCheckGateLockForWorktree` reconciles a dead holder on the first attempt, so the handoff proceeds with no wait. Stale-but-alive locks are recovered after the 1s poll.
- Deadline: the guard budget is `checkGateWaitBudgetMs(handoffDeadlineAt)`, the same deadline the handoff wrapper uses, minus 60s. A wait cannot outlive its handoff.
- `git merge-tree` conflicts only on `work/1082-…md`; no source conflicts.
- No new bare `node`, `npm` or `npx` in added lines.

## Suggestions
- Wire `statusProgressLabel` into the rendered progress line, or delete it as dead code, and re-capture the shot. Accepted-scope item (1) defers this, so it is not blocking.
- Accepted-scope items (2) and (3) are unchanged, as agreed: fail-fast `routes/tasks.ts` and `lockfile-conflict.ts`, and label-path tests.
- Prior pass 3 findings: the dead-label item is still open but now accepted as a follow-up. The deadline-interaction and `samePath` items are fixed. The test-gap item is partly addressed: the status-file tests exist, but the `runWhileCheckGateWait` label path is still untested, which is accepted item (3).

## Verdict
good to go — EVIDENCE-GAP-ONLY: the code is sound; the drawer shot shows "starting…", not the wait label (accepted-scope item 1).

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-10T08:55:58.178Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

