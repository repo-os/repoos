---
handoff_signal_retry_count: 1
id: "1276"
title: Close-out validation log should show live progress
type: feature
status: active
priority: p1
area: [server, core]
assigned_to: ai
created_by: t@t
branch: feat/close-out-validation-log-should-show-liv
cli_override: claude code
model_override: haiku
created_at: "2026-11-20T07:42:21Z"
updated_at: "2026-11-20T09:01:37Z"
---
## Problem
During a close-out the integration log (.repoos/logs/integration/<id>-<n>.log) is not written for the running attempt: #1258's log was last modified hours earlier while its job had been validating for ~55 minutes. Drivers and the UI cannot tell whether a close-out is running, waiting for a host slot, retrying after a timeout, or stuck. The card timer also appears to count from an earlier start.

## Desired UX
The running attempt streams its check progress to a log and to the integration-job API: current step (queued for host slot, building candidate, bundling, running tests with done/total, publishing), the host it runs on, the attempt number and when this attempt actually started. A retry after a timeout or failure is shown as a new attempt with its reason.

## Acceptance criteria
- Each attempt writes its own log file as it runs, updated at least every 30 seconds while active.
- GET /api/tasks/<id>/integration-job returns attempt, host, step and last-progress timestamp.
- The task card and drawer show the step, host and attempt; a stale progress timestamp is flagged as possibly stuck.
- Tests plus a docs update in docs/close-out-pipeline.md.

## Notes for AI
Related: #1272 (timer should count from validation start). Never touch repoos.toml.

## Activity

- 2026-11-20T07:42:21Z · created · t@t
- 2026-11-20T07:42:27Z · status inbox→ready
- 2026-11-20T07:46:53Z · cli_override, model_override
- 2026-11-20T07:46:53Z · status ready→active, branch
- 2026-11-20T09:01:37Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The close-out progress feature is implemented, but the task is **not ready to hand off**: the scoped gate is still red, so I've left the task `active` and not emitted the handoff signal. **Why the gate is red** - Three remote runs each fai… · stderr: (empty)

