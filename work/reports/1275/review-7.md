---
task: "1275"
pass: 7
at: "2026-11-23T11:37:52.240Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/close-outs-validate-several-tasks-at-onc
state: ok
tree_identity: "044a13184:59e1384f8b"
---
Repeated review classes: Passes 1–5 flagged checkout concurrency, timeout/budget, scheduler liveness, pipeline UI (parked publisher, parallel fields), config wake, and merge conflicts. The branch at `044a131` addresses these: `withMainCheckout` on main writes, monotonic `shiftBudgetAnchorPastWait` with `parkedAtNs`, crash backoff plus `failCrashed`, publishing excluded from validation slots, `unavailable` cooling, parallel snapshot fields, and main merged. A human should still glance at crash-backoff UI versus queue truth.

## Verdict
`good to go` — parallel close-out validation matches the spec; prior defect classes appear resolved on this tree.

## Relevance
`still relevant` — main still serialized validation before this work; the queue backlog problem remains real.

## Evidence
None

## Bugs
None found

No further findings of this class were found after grepping: `selectCloseOutStarts`, `CloseOutScheduler`, `runCloseOut`/`failCrashedCloseOut`, `withMainCheckout`/`shiftBudgetAnchorPastWait`, `close-out-repair.ts`, `buildIntegrationSnapshot`, `integration-pipeline-ui.ts`, `routes/tasks.ts` (`isParkedPublisher`), `maxParallelValidations` in config/schema/routes, docs and parallel/scheduler tests; no new bare `node`/`npm`/`npx` in the task diff.

## Edge cases
Landing preflight warns only on this task’s `work/` file (close-out takes main’s copy). Shots on tree `59e1384` remain valid per handoff (bookkeeping-only delta to `044a131`); both show “Also running” and Settings default 2 with zero console errors. Scheduler tests use stand-ins, not live remote overlap.

## Suggestions (non-blocking)
During scheduler crash backoff the queue head can still look active/stale while a parallel job runs—snapshot does not surface cooling. Pre-existing native `title` on queue chips in `IntegrationStatusBar.vue` unchanged.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-23T11:25:32.725Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

