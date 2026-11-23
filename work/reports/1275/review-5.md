---
task: "1275"
pass: 5
at: "2026-11-22T12:03:20.743Z"
agent: reviewer
cli: github copilot
model: default
branch: feat/close-outs-validate-several-tasks-at-onc
state: ok
tree_identity: "80a94a421:a195d1059b"
---
## Relevance
still relevant — main still serializes close-outs.

## Evidence
None

## Bugs
- **Class: main-checkout concurrency** — `integration-orchestrator.ts:4699` releases the publish locks before committing the release stamp; delayed repair commits in `close-out-repair.ts:109` also run unlocked. Either can race another job’s checkout mutation.
- **Class: failure recovery** — `integration-orchestrator.ts:1637` ignores lock-acquisition failure after 90 seconds. A longer publish permanently skips review-lock and status restoration.
- **Class: scheduler capacity** — `integration-job.ts:208-222` counts publishing as validation capacity, leaving runner slots idle. `close-out-scheduler.ts:83-89` also reserves capacity for cooling jobs before skipping them, delaying other validations and cancellation.
- **Class: pipeline UI contract** — `integration-status.ts:211-267` still presents a later runner as active when the queued head is in crash backoff, incorrectly naming that later job as the head’s blocker.

No further findings of this class were found after grepping: scheduler, checkout writers, failure repair, status consumers, configuration, tests and docs.

## Edge cases
The engineering report matches the reviewed implementation. Both screenshots show the intended UI; handoff recorded no console errors. The checklist reports only the task-file merge conflict.

## Suggestions
Correct the budget description in `docs/close-out-pipeline.md`: parked time is excluded, but the prior validation budget is retained.

## Verdict
needs some work — checkout concurrency, recovery, scheduling and status defects remain.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-22T12:01:25.888Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

