---
id: 1044
title: "Post-merge summary: status and report-state edge cases (follow-up to #1041)"
type: bug
status: ready
priority: p3
area: [core, web]
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-11-06T22:50:03Z"
updated_at: "2026-11-07T06:24:31Z"
---
## Problem

#1041 landed the PM-written post-merge task summary after 14 review passes. The reviewer's last pass (14) still listed failure-path edge cases that were set aside so the feature could ship. They are all about the summary status and the committed report disagreeing, and one UI evidence gap.

## Desired UX

- A retry never reports success from an old report while the new run is still pending or after it failed.
- A summary whose status is done but whose report file is missing or unreadable shows as failed with the reason, in the CLI and in the task drawer, and is retryable.
- A failed pending-status write is surfaced, not ignored.
- A shot shows the task drawer Report pane with a rendered post-merge summary (use a state fixture), not only an engineering report.

## Acceptance criteria

- queueTaskSummary does not start a run when the pending status write fails, or fails loudly after one retry (src/server/task-summary.ts ~873-889).
- A persisted done status with a missing or unreadable summary.md resolves to failed with the reason (src/server/task-summary.ts ~276-290), and the drawer renders that error.
- The CLI and API never treat an unchanged idle or done status plus an old report as success for a new retry (src/commands/control-api.ts ~1793-1808, 1900-1907).
- A fixture-based shot of the Report pane with a summary-bearing task is declared and captured.
- Tests cover each case.

## Notes for AI

Read work/reports/1041/review-14.md (and review-12, review-13) on the 1041 branch history for the exact lines and the pattern the reviewer flagged. Check first whether #1041's final commit already fixed any of these and only do what is still open. Keep it narrow: one pass, no new failure-path classes; file anything else as a separate task.

## Activity

- 2026-11-06T22:50:03Z · created · njachowski@gmail.com
- 2026-11-07T06:24:31Z · status inbox→ready
