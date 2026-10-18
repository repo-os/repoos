---
id: "0838"
title: "Close-out: a failed auto-resolve must not demote the task to inbox"
type: bug
status: inbox
priority: p2
area: core
assigned_to: ""
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-18T16:14:48Z"
updated_at: "2026-10-18T16:14:48Z"
---
## Problem
When Move to done failed with "auto-resolve failed for work/<id>-*.md" (#0829, 2026-10-18), the task's main-side file ended up `status: inbox`, the board showed it under Inbox, and the next handoff failed with "task must be active or review, but is inbox". A person had to `repoos mv <id> active` and re-run review. The failure path should leave the task where it was (review) with a clear error.

## Desired UX
Any close-out failure after the Move to done request leaves the task status unchanged (review) with the failure recorded; a retry works without manual status repair. Investigate why the main copy of the task file lags (`status inbox→done` in activity on #0829/#0830/#0832) and whether the auto-resolve takes a stale copy.

## Acceptance criteria
- Test: a simulated auto-resolve failure for the task's own file leaves status review and records the error; retrying Move to done succeeds.
- Test: no close-out failure path writes `inbox`.
- docs/close-out-pipeline.md updated.

## Notes for AI
Related: #0835 (NUL byte made task files binary, a likely trigger), #0754 (task-file-only resolution). Source: driver observation 2026-10-18.

## Activity

- 2026-10-18T16:14:48Z · created · njachowski@gmail.com
