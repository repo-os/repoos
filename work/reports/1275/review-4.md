---
task: "1275"
pass: 4
at: "2026-11-22T10:30:12.200Z"
agent: reviewer
cli: github copilot
model: default
branch: feat/close-outs-validate-several-tasks-at-onc
state: ok
tree_identity: "df83ae759:6d23ece96e"
---
## Relevance
still relevant — main still serializes close-outs.

## Evidence
None

## Bugs
- **Class: main-checkout concurrency** — `integration-orchestrator.ts:1919` commits gate-duration bookkeeping outside the publish locks. It can overlap another job’s merge; `commitFiles` stages before its commit, and conflict resolution commits the whole index. Failure repair at `:1585` also modifies the checkout outside those locks.
- **Class: timeout budget** — `shiftBudgetAnchorPastWait` uses wall-clock wait to shift a monotonic anchor. Sleep or a clock jump can erase validation time; restarting a publishing run can shift the same wait again.
- **Class: scheduler liveness** — `close-out-scheduler.ts:136-140` swallows a failed `onGiveUp` and permanently abandons the still-pending job, blocking later publication. `server.ts:1984` also marks crashes failed without normal candidate cleanup or restoring the review lock.
- **Class: pipeline UI contract** — `integration-status.ts:220` omits parallel-job heartbeats and retry details, causing false stall reports. `routes/tasks.ts:4787` flags intentionally parked publishers stale. If the head is queued during crash backoff, the snapshot presents a later runner as active and the head as blocked by it.

No further findings of this class were found after grepping: scheduler, orchestrator failure and timeout paths, checkout writers, pipeline consumers, API, configuration, tests and docs.

## Edge cases
The current-round engineering report is missing; the supplied report describes an older commit. Overlap tests use a stand-in orchestrator.

## Suggestions
Recapture both shots on HEAD. The stale captures show the intended pipeline and setting; the recorded console has zero errors. Update the budget documentation to match the implementation.

## Verdict
needs some work — checkout concurrency, timeout, failure recovery and status defects block sign-off.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-22T08:59:25.885Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

