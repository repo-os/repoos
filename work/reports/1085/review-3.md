---
task: "1085"
pass: 3
at: "2026-11-10T22:52:53.207Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/stale-handoff-running-validate-record-ou
state: ok
tree_identity: "99a959506:d5ddf9067"
---
## Verdict
needs some work — startup sweep and restart path drop checkpoint markers still owned by a pending delta review (two defects)

## Relevance
still relevant — `main` has no reconciliation of `running` handoff records, and this branch adds it.

## Evidence
None. The code defects below block sign-off, so this is not an evidence-only verdict. The shots were captured on d5ddf9067 and HEAD is 99a959506, so they need a re-capture on the final tree (RepoOS already marks them STALE).

## Bugs
Class: **checkpoint-marker liveness inferred from handoff-slot ownership, but the `review` phase is not slot-backed.** Prior pass 2 findings are fixed: `handoff-live.ts` is process-only, `ChecksProgressDisplay`/`TaskCard`/`checks-card-status` all honor `stale`, and the watchdog skips held tasks inside the loop. Instances of the class in this diff:

1. **Startup sweep deletes `review`-phase markers** (`src/server/post-handoff-checkpoint-recovery.ts`, `sweepOrphanedPostHandoffCheckpointRecoveries`, called from `server.ts:~2232`). A marker in `review` means the delta review is pending. `resumeCloseOutAfterCheckpointRecovery` (~line 264) returns early without that marker, so a restart during the delta review means a later `good to go` never resumes close-out. The sweep test "sweeps orphan checkpoint markers" enshrines this with `phase: "review"`. Fix: sweep only `gate`, or keep `review` while the review is still pending.

2. **Clear-and-restart drops a pending delta review** (`post-handoff-checkpoint-recovery.ts:149-155`, `startPostHandoffCheckpointRecovery`). Any non-failed marker is cleared when no handoff slot is claimed. The `review` phase is never claimed, so a second Move to done during the delta review deletes the marker and restarts the gate. The caller in `routes/tasks.ts` (~line 3284) shows no `isPostHandoffCheckpointRecoveryActive` or `reviews.isRunning` guard in the lines I read. Before this diff the call was refused. Fix: refuse on `review` phase or a running review, and add a test.

## Edge cases
- `HANDOFF_DEADLINE_MS` is both the stale threshold (`handoff-status.ts`) and the deadline timer (`handoff.ts:1326-1331`), which settles the record as failed first. `stale: true` is almost never observable for handoff records, so AC2 is covered only by the local slot-age path.
- The GET route (`routes/tasks.ts:5126`) now persists `superseded` and emits SSE, so a read writes state.
- A live finalization superseded by a newer review pass stays live. The UI then enables Move to done. The server done path does not check `handoffProcessLive`, and `finishHandoffStatus` overwrites with the real result later.
- `beginHandoffStatus` now restarts a superseded `attemptKey` with `outcomeQueued: false`, so a replayed callback can queue the outcome message twice.
- Conflicts with main are only `work/1085-*.md`, which close-out resolves from main. No source conflicts.
- No bare `node`, `npm` or `npx` in added lines.

## Suggestions
- Add route-level coverage for the GET reconcile and the watchdog `reconcileOrphanedHandoffStatuses`. The new tests cover the pure functions.
- Re-capture both shots (`card:handoffStaleActive`, `card:reviewLandableReady`) on the final tree.

## Automated verification
(appended by RepoOS)

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-10T21:47:04.950Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

