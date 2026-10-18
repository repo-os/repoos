---
updated_at: "2026-10-18T18:52:00Z"
review_passes: 2
id: "0838"
title: "Close-out: a failed auto-resolve must not demote the task to inbox"
type: bug
status: review
priority: p2
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/close-out-a-failed-auto-resolve-must-not
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-18T16:14:48Z"
last_close_out_gate_ms: 83050
last_close_out_gate_at: "2026-10-18T18:44:28.492Z"
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
- 2026-10-18T18:27:08Z · status inbox→ready
- 2026-10-18T18:27:14Z · cli_override, model_override
- 2026-10-18T18:27:16Z · status ready→active, branch
- 2026-10-18T18:31:39Z · body
- 2026-10-18T18:32:29Z · body
- 2026-10-18T18:40:49Z · status active→review
- 2026-10-18T18:40:50Z · note: shots: skipped — the diff (5 changed paths) touches no capture target's globs — no UI change to capture
- 2026-10-18T18:41:27Z · note: review pass 1: good to go
- 2026-10-18T18:44:28Z · close-out gate completed in 83s
- 2026-10-18T18:44:30Z · note: handoff requested (cli)
- 2026-10-18T18:44:31Z · handoff failed · task-file handoff failed at validate · task must be active or review, but is inbox
- 2026-10-18T18:44:46Z · status inbox→active
- 2026-10-18T18:44:51Z · note: handoff requested (ui-review)
- 2026-10-18T18:51:23Z · status active→review
- 2026-10-18T18:51:24Z · note: shots: skipped — the diff (5 changed paths) touches no capture target's globs — no UI change to capture
- 2026-10-18T18:51:59Z · note: review pass 2: good to go

