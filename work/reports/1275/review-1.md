---
task: "1275"
pass: 1
at: "2026-11-22T04:04:32.285Z"
agent: reviewer
cli: github copilot
model: default
branch: feat/close-outs-validate-several-tasks-at-onc
state: ok
tree_identity: "fcd505253:fc79fe63e5"
---
## Relevance
still relevant — queued close-outs remain serial on main.

## Evidence
None

## Bugs
- **Class: merge conflict** — `src/server/integration-status.ts` conflicts with main; merge main and re-review.
- **Class: pressure guard bypass** — `server.ts:1879` skips the guard when no job is running, so one pump can start several jobs under pressure.
- **Class: cancellation lifecycle** — `integration-job.ts:175` skips parked non-head publishers even when cancelled. `cancelDone` waits for their teardown, which can hang behind a stalled head.
- **Class: pipeline UI contract** — `integration-status.ts` removes parallel jobs from `queue`, but the drawer, card, pipeline view and error handling still check only `active`/`queue`. Running jobs appear idle; cancellation state is also wrong. `integrationQueuePosition` understates queued positions.
- **Class: visual verification** — Neither capture shows the changed pipeline or setting, so the required overlapping-job UI is unverified.

No further findings of this class were found after grepping: scheduler, cancellation route, pipeline consumers, settings, tests and docs.

## Edge cases
The overlap and failure-isolation tests exercise scheduler selections, not the live pump or parked cancellation.

## Suggestions
Recapture the parallel pipeline and Settings control. The supplied phone and desktop shots show Mission Control; no console errors were recorded.

## Verdict
needs some work — merge conflict, scheduling and UI defects block sign-off.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-22T04:03:04.295Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

