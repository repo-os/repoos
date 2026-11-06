---
task: 1041
pass: 15
at: "2026-11-06T23:05:15.853Z"
agent: reviewer
cli: github copilot
model: default
branch: feat/post-merge-task-summary-report-written-b
state: ok
tree_identity: "706c7bbcb:706c7bbcb"
---
Repeated review classes: dispatch/fallback, locking/rollback, changed-file reporting, linked-task facts, summary validation, and mtime-based retry polling are fixed; status/report-state failures remain. A human should review this recurring failure-path pattern.

## Relevance
still relevant — `main` has no post-merge summary implementation.

## Evidence
The capture matches the route and passes both assertions with no recorded console errors, but the task is still in Review and the image shows only engineering rounds—not a rendered summary. The required summary display remains unverified.

## Bugs
- **Status/report-state divergence** (`src/server/task-summary.ts:322-357, 886-908`; `src/server/routes/tasks.ts:4107-08`; `src/commands/control-api.ts:1896-1906`): If writing `pending` fails, the queue does not start the job, but the route still returns 202. If the failed-state write also fails, an older `done` status and report remain; polling then reports success for the old report. With no prior status, the failure is hidden as `idle` and CLI polling times out. Also, a committed report can remain visibly `failed` if the `done` status write fails but its fallback persists `failed`; the caller ignores that write result.

## Edge cases
The latest engineering report is stale: round 6 records source `2d3c488`, while reviewed HEAD is `706c7bb`; no report for the current implementation is present.

## Suggestions
None found

## Verdict
needs some work — status-write failures can leave a retry unstarted while presenting stale or misleading status.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-06T22:57:22.705Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

