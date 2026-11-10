---
task: "1082"
pass: 3
at: "2026-11-10T08:58:19.062Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/handoff-should-wait-bounded-for-a-runnin
state: ok
tree_identity: "08984f75f:08984f75f6"
---
## Verdict
needs some work — the drawer never renders the waiting label; the capture reads "starting…", so AC1's visible waiting state is unmet.

## Relevance
still relevant — on `main` the handoff commit step still fails immediately on the lock refusal, and nothing else waits for it.

## Evidence
None. The code defect below blocks, so this is not `EVIDENCE-GAP-ONLY`. The capture (`default-1.png`, tree `08984f75f6`, same code as `b49dc3156`) shows "Checks · starting… 1m 37s" and body "starting…". It does not show "Waiting for the running check to finish". The shot declares no assertions, so it passed without checking the label.

## Bugs
- **Wait state written but never rendered (unused computed / dead consumer).** `TaskDrawer.vue:427` defines `statusProgressLabel` with the wait reason first, but the template never reads it (grep finds no template use). `handoffWaitingReason` (`:416`) only feeds `showStatusProgress` (`:449`). That passes the raw `{ reason }` progress into `ChecksProgressDisplay`, which ignores `reason` and shows "starting…". No other consumer of `progress.reason` exists in `src/ui-app`, `src/cli` or `src/commands`. Review 2's "label precedence fixed" item was verified against this dead computed and is not actually fixed. Fix by wiring the label into the rendered progress line, then re-capture with an assertion on the label text.
- **Fail-fast siblings of the wait (AC1 says "any other server git operation").** `routes/tasks.ts:3217` passes `waitForCheckGate: false`. The docs call this deliberate, but AC1 does not carve it out, so either wait there or record the exception in the spec. `lockfile-conflict.ts:77,82` (`add -A` and `commit --no-edit` in a task worktree) also fail immediately on a live lock. I did not trace every server git call on task worktrees.
- **Test gap for the same class.** No test covers the label path (`runWhileCheckGateWait` → `setHandoffWaitingReason` → rendered text). The drawer test only checks the status file, so the dead label passed.

## Edge cases
- Deadline interaction (review 2): fixed. `checkGateWaitBudgetMs(handoffDeadlineAt)` uses the same deadline as `withHandoffDeadline`, minus a 60s margin.
- `commitWipCheckpointForRemoteGate` waits up to 45 minutes with no deadline inside the engineer's own `repoos check`. Only a race can reach it, but a stalled check is expensive. Consider a shorter bound.
- `persistTrackedReviewReport`'s `git add` is unwrapped. `work/reports/` is bookkeeping, so the refusal should not hit it; no change needed.
- The `samePath` realpath change is sound, and missing paths fall back to `resolve`.
- `git merge-tree` conflicts only on the task file `work/1082-…md`, not source.
- No bare `node`/`npm`/`npx` in added lines.

## Suggestions
- Remove `statusProgressLabel` if it stays dead, or wire it up. Either way, add a drawer test that asserts the rendered text.
- Add the label text as a shot assertion so a blank or wrong state fails the capture.
- Consider `lockfile-conflict.ts` for the same wait treatment as the handoff commit.

## Verdict
needs some work — the drawer never renders the waiting label; the capture reads "starting…", so AC1's visible waiting state is unmet.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-10T08:55:58.178Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

