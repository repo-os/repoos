---
task: "1085"
pass: 4
at: "2026-11-10T23:55:58.733Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/stale-handoff-running-validate-record-ou
state: ok
tree_identity: "537a19c4c:99a9595068"
---
## Verdict
needs some work — checkpoint recovery can start a second finalization before its slot is claimed; shots are stale on HEAD

## Relevance
still relevant — `main` has no reconciliation of `running` handoff records, and this branch adds it.

## Evidence
None. The captures were taken on 99a9595068 and HEAD is 537a19c4c, so they are stale. Re-capture on the final tree. The declared highlights exist in source (`task-card-check-progress` at `TaskCard.vue:1886`, `.tc-hint` at `TaskCard.vue:1950`), but both sit behind `v-if`s, so the new captures must show a real render.

## Bugs
Class: **the handoff slot is claimed after the start decision, and the claim result is ignored.** This is check-then-act across awaits, plus an optional dependency that silently disables the guard. Instances:

1. `src/server/post-handoff-checkpoint-recovery.ts`, `startPostHandoffCheckpointRecovery` (~L154): it refuses only when `isHandoffInFlight` is true. `runRecoveryPipeline` claims the slot only after two awaits (`worktreePath`, `runGit`). A second Move to done in that window sees a `gate` marker that is not in flight, clears it, and starts a second pipeline.
2. Same file, `runRecoveryPipeline` (~L222–239): `const claimed = …?? false` ignores a `false` return and runs `finalizeReviewHandoff` anyway. When the first pipeline's `finally` releases the slot, the second still runs with no slot. The watchdog and `handoff-status` then see no live process and reconcile its live record to `superseded`.
3. Same file, `CheckpointRecoveryDeps.runner` (~L135) is optional, and every guard is `runner?.x?.()`. A caller that omits it loses both the refusal and the claim without any error. Both current callers pass it (`request-close-out.ts:299`, `routes/tasks.ts:3296`), so make it required.
4. `src/server/task-watchdog.ts`, `reconcileOrphanedHandoffStatuses`: `this.reviews?.read(...)` is optional. If it is unwired, the newer-review supersede branch never fires. The server wires it, so this is latent. Make it required or test the unwired case.

No test covers two starts racing, or a claim that returns `false`.

## Edge cases
- Pass 3 findings are fixed. The sweep keeps `review` markers (`sweepOrphanedPostHandoffCheckpointRecoveries`), and a second start refuses while the delta review runs. A `review` marker with no running review still restarts the gate. That looks intentional, but its restart path is untested.
- `stale` is almost never observable for handoff records, because the deadline timer settles them at the same 30 minutes. This is accepted follow-up (1).
- No bare `node`, `npm` or `npx` in added lines. The merge conflict is only the task's own `work/1085-*.md`, which close-out resolves from main.

## Suggestions
- The card's slot-age staleness uses `CHECK_WAIT_STALLED_MS` (30 min), while the handoff threshold follows `REPOOS_HANDOFF_DEADLINE_MS`. The two can disagree when the env var is set. Derive both from one value.
- Add route-level coverage for the GET reconcile and the watchdog pass. Only the pure functions are tested now.
- Add the two-start race test from bug 1.
- Re-capture `card:handoffStaleActive` and `card:reviewLandableReady` on the final tree.

## Verdict
needs some work — checkpoint recovery can start a second finalization before its slot is claimed; shots are stale on HEAD

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-10T23:04:34.996Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

