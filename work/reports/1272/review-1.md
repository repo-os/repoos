---
task: "1272"
pass: 1
at: "2026-11-20T07:42:23.322Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/close-out-timer-should-count-from-when-v
state: ok
tree_identity: "e5b4329c0:aae616c740"
---
## Verdict
`good to go` — the timer now reads only the validating start, queued jobs get position-only state, and all three states are tested.

## Relevance
`still relevant` — the enqueue-time fallback really exists on main and is the only path that produced the misleading 20m clock.

## Evidence
None

## Bugs
None found

No further findings of this class were found after grepping: `enqueuedAt` fallbacks across `src/server` (git-worker.ts `ageMs` fallback, remote-validation waiter, driver-brief brief jobs, routes/tasks.ts, check-gate-lock.ts), all callers of `attemptIsExecuting` and `closeOutAttemptStartedAt`/`closeOutFailureCutoff`, all `queueDetail`/`blockerTaskId` consumers (`types.ts`, `IntegrationPipelineSummary.vue`, `IntegrationStatusBar.vue`, `shot-preview-fixtures.ts`), the copy helpers in `integration-pipeline-ui.ts` used by TaskCard/TaskDrawer/StatusBar, and every place `startedAt` is written in `integration-job.ts`/`integration-orchestrator.ts`.

## Edge cases
- **Retry semantics confirmed**: `enqueue` creates a fresh job with `startedAt: null`, so a retried attempt restarts the clock from its own start — the retry path in `close-out-timer-1272.test.ts` proves it.
- **`startedAt` set but phase `queued`**: `attemptIsExecuting` checks only `startedAt`, not phase. Today `startedAt` and the `queued → syncing` phase land in one atomic `updateJob` write, so the states can't diverge; if a future caller sets `startedAt` alone, a queued job would be classified active. Worth a comment, not a blocker.
- **`blockerElapsedMs` NaN**: if `startedAt` were an unparseable string, `Math.max(0, NaN)` yields `NaN` rather than `null`. Pre-existing pattern, unreachable with the current writer; noted for the class.
- **The screenshot's "Checks 20m 29s"** may come from `cardChecksDisplay` (the handoff/check-run clock in `TaskCard.vue`), not the close-out job, as the engineer honestly flagged. This change fixes the close-out clock per the acceptance criteria; if the long Checks figure persists on a live run, that's a separate clock and deserves its own task.
- The dead text branch in `IntegrationPipelineSummary.vue` ("Close-out in progress" with empty queue and no active job) is unreachable given `empty`'s definition — harmless.

## Suggestions
- The single auto capture (board root) doesn't demonstrate the queued or validating states. No shots were declared, so nothing is missing per the rules, but a small `state` fixture shot of the queued pipeline summary would let a human eyeball the new label in one click.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-20T07:40:31.422Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

