---
task: "1085"
pass: 5
at: "2026-11-11T01:10:25.082Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/stale-handoff-running-validate-record-ou
state: ok
tree_identity: "2e8fb26f3:2e8fb26f3"
---
## Verdict
needs some work — `handoff.ts` conflicts with main, and checkpoint recovery can leak its slot or drop a pending delta marker

## Relevance
still relevant — `main` has no `reconcileHandoffStatus`, so a `running` record still outlives its process there.

## Evidence
None. Both captures render the declared state on the `default` target. Shot 1 (`card:handoffStaleActive`) shows `Checks · step 4 of 8 · tests 24/72 · 45m 00s · stale`. Shot 2 (`card:reviewLandableReady`) shows `REVIEW PASSED · READY TO FINISH` with Move to done enabled. Shot 1 has a "repo server not responding" toast over the header; that is capture noise, not a code defect. The captures come from `2e8fb26f3`, and the only later commits are report bookkeeping, so they are not stale.

## Bugs
Class: **checkpoint-recovery claim and marker side effects run before a guard, or outside the `try` that releases them.**

1. **Landing blocker:** the server checklist reports `src/server/handoff.ts` conflicting with main. Merge main and re-request review.
2. **Claim leak:** `startPostHandoffCheckpointRecovery` claims the slot at `post-handoff-checkpoint-recovery.ts:164`. Then `writeRecovery` (`:167`) and `if (!branch) throw` (`:213`) run before the `try` at `:217` that holds the release at `:244`. A throw in either leaves `isHandoffInFlight` true for the life of the process. The record then never supersedes, goes stale, and Move to done is refused as "already running" until restart. This breaks criteria 1 and 3.
3. **Marker dropped before refusal:** `:158–160` clears a `review` marker when no delta review is running. Then `:164` can refuse because a handoff holds the slot. The approved marker is gone, so `resumeCloseOutAfterCheckpointRecovery` (`:282`) finds nothing and close-out never resumes. This breaks the in-scope "keep pending delta-review markers" item and regresses the pre-change refusal.

Sibling check: the other claim sites in the diff (`server.ts:3141` unified handoff, `handoff.ts` retry wrappers) are either unchanged or already release on their branches. I did not audit throw paths in the unchanged `server.ts:3141` block.

## Edge cases
- A `review` marker with no running review restarts the gate. This is accepted scope item (6).
- Shot 2 shows the `superseded` path only. Criterion 3 is covered by the unit tests, not by a stale-running capture.
- Criteria 1 and 2 have targeted tests (`handoff-status.test.ts`, `handoff-stale-ui.test.ts`, `checks-card-status.test.ts`). Criterion 4 has tests for both named cases.

## Suggestions (non-blocking)
- Round-4 bug 3 is only partly fixed. `runner` is now required in the type, but `?.` remains at `:152`, `:164` and `:244`. Call the methods directly so a missing runner fails loudly.
- Round-4 suggestion still open: the card's slot-age stall uses `CHECK_WAIT_STALLED_MS` (30 min), while handoff staleness follows `REPOOS_HANDOFF_DEADLINE_MS`. Derive both from one value.
- Add tests for a throw between claim and `try`, and for a `review` marker dropped while a handoff holds the slot.
- Accepted scope, not blocking: `watchdog this.reviews?.read` stays optional (item 5); GET persists `superseded` (item 2).

## Verdict
needs some work — `handoff.ts` conflicts with main; checkpoint recovery can leak its slot or drop a pending delta marker

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-11T01:08:31.833Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

