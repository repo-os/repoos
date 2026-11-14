---
task: "1108"
pass: 1
at: "2026-11-14T11:33:48.518Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/auto-recover-idle-tasks-failed-review-pa
state: ok
tree_identity: "6862f9ad9:2096abbb9"
---
## Verdict

`needs some work` — failed-report auto-retries reuse the timeout-retry counter, so bounds can be wrong after a timeout or across failure kinds.

## Relevance

`still relevant` — The #1106/#1103 idle-review patterns are real; this branch wires the right watchdog and review hooks.

## Evidence

None

## Bugs

- **Class: shared retry counter** — `src/server/review.ts`: `failedReportRetryScheduled`, the no-output retry branch, and `persistReviewTimeoutRetries` all use `timeoutRetryAttempts` / `review_timeout_retries`, the same state as `scheduleTimeoutRetry` and `canRetryTimedOutReview` (cap 1). A timeout retry or a prior no-output attempt lowers or removes further automatic no-output retries below `review.failedReportRetries`, and can block the separate timeout retry after no-output failures.

No further findings of this class were found after grepping: `src/server/review.ts` (schedule/reset/persist paths), `src/ui-app/tests/review-timeout.test.ts`, `reviewTimeoutRetryAttempts` in `src/server/review.ts`.

## Edge cases

- Overdue queued messages with **no** engineer only run through `recoverActiveTasksWithoutEngineer`, which scans `active` only; a task left in `review` after blocked auto-bounce may not get the 3m restart path until status changes.
- Handoff UI evidence is from tree `2096abbb9`; server notes only bookkeeping to `6862f9a9` — settings schema test covers the new controls if the capture is stale.

## Suggestions

- Add `review_failed_report_retries` (or similar) distinct from `review_timeout_retries`, and test timeout-then-no-output and no-output-then-timeout sequences.
- Optional: extend active-without-engineer recovery to `review` when a runner queue exists and no engineer is live, if product confirms that state happens in production.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-14T11:31:51.709Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

