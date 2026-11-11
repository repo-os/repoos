---
task: "1085"
pass: 2
at: "2026-11-10T20:12:30.802Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/stale-handoff-running-validate-record-ou
state: ok
tree_identity: "86dd47a3b:86dd47a3b"
---
## Verdict
needs some work — a crash-orphaned checkpoint marker keeps records live, the stale flag misses several checks renderers, and the watchdog writes to held tasks

## Relevance
still relevant — `main` has no reconciliation or `superseded` handling for handoff records.

## Evidence
None. Both captures render on the declared routes from tree 86dd47a3b, which differs from HEAD only by `work/reports/1085/round-2.json`. The active card shows "· stale" on the highlighted block, and the review card shows "REVIEW PASSED · READY TO FINISH" with Move to done enabled. Evidence is current and the console log is clean.

## Bugs
1. **Durable marker treated as a live process** (`src/server/handoff-live.ts:16`). `isPostHandoffCheckpointRecoveryActive` (`post-handoff-checkpoint-recovery.ts:79-84`) is true while the marker's phase is `gate` or `review`. The marker is deleted only on the pipeline's own success or failure paths (lines 230, 235, 283, and the failure write at 137). Nothing sweeps it at startup, so a restart mid-recovery leaves it forever. The record never supersedes (AC1 miss), and `startPostHandoffCheckpointRecovery` (line 114) refuses every later attempt. The test "treats post-handoff checkpoint recovery as a live handoff" locks this in. `hasPendingHandoff` is bounded because pending requests replay at start (verify). Fix: liveness must come from a process-owned signal, or add a startup sweep.

2. **Stale flag wired into one of several checks renderers.** Only `formatChecksCardLine` (drawer and active status line) reads `stale`. `TaskCard.vue` `cardChecksDisplay` (~line 95) has no `stale` field. `ChecksProgressDisplay.vue` `cardLine` (~line 58) reads only `slow`, and it builds its own line whenever `statusLine` is null, which is every non-active card. Local check-slot elapsed (`slotAgeMs`) is never flagged. AC2 fails for those paths.

3. **Automation writes to held tasks** (`src/server/task-watchdog.ts:582`). `reconcileOrphanedHandoffStatuses` runs over every active and review task before the `isHoldActive` skip (~line 591). Held tasks get `superseded` writes and SSE events, which breaks the AGENTS.md hold rule. Fix: apply the hold filter inside the reconcile loop.

## Edge cases
- A live handoff past 30 min (the default `handoffDeadlineMs`, `handoff.ts:425-428`) is flagged stale. `stale` then drops it from `reviewChecksRunning` (`TaskCard.vue:144`) and `handoffInFlight` (`repo.ts:1510`), so Move to done enables while the check still runs. The `tests` step allows 40 min. Confirm the server done route refuses in that window.
- With the task still `active`, a newer review pass does not supersede a live handoff, because the predicate requires `taskStatus === "review"`. AC1 says "or a newer review verdict", so this is a narrower reading than the spec.
- `repo.ts:1995` sets `handoffSteps[id] = "superseded"` from SSE. The step fallback at `repo.ts:1514` does not exclude that value when no status is cached.
- A replayed `attemptKey` after supersede returns the superseded record (`beginHandoffStatus`), so the record stays superseded while the attempt runs.

## Suggestions
- `DEFAULT_HANDOFF_STALE_AFTER_MS` (`handoff-status.ts`, ~line 296) is 60 min, and its comment says it matches the handoff default. The real default is 30 min. Production passes `HANDOFF_DEADLINE_MS`, so use that or remove the default.
- Pass 1 asked for route and watchdog wiring tests. Those are still missing; the tests cover only the pure function.
- Previous fixes verified: recovery now claims the slot (`post-handoff-checkpoint-recovery.ts:175`, runner passed from both callers); CLI prints `superseded`; review cards poll and listen for SSE; stale no longer blocks `handoffInFlight`.
- No bare `node`, `npm` or `npx` in the diff. The merge-conflict check is `WARN` with only the task file conflicting, per the landing checklist.

## Verdict
needs some work — crash-orphaned checkpoint marker keeps records live, stale flag misses checks renderers, watchdog writes to held tasks

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-10T20:09:28.370Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

