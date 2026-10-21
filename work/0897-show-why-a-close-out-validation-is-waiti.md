---
id: "0897"
title: "Show why a close-out/validation is waiting: queue position, what runs ahead on each runner"
type: feature
status: active
priority: p2
area: [server, web]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/show-why-a-close-out-validation-is-waiti
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-10-21T12:39:47Z"
updated_at: "2026-10-21T13:40:32Z"
---
## Problem
A close-out sat in 'validating' for ~18 min (2026-10-21, #0892) although its own gate only ran ~6 min on bee. Nothing shows where the other ~12 min went: waiting for a runner slot, a prior phase, or something else queued/running ahead of it on a runner (other handoff checks, reviews, other close-outs). Operators and drivers can't tell a slow gate from a queued one.

## Desired UX
For every task in validating/handoff/close-out, the task drawer, the Runners tab and `repoos servers`/`repoos driver brief` show: current phase with elapsed time per phase (queued for slot, uploading, install/build, tests), which host it is on, and for a queued job its position plus what is running ahead (task id, kind: handoff/close-out/self-check/review/shot, host, elapsed). A long-wait warning names the blocker.

## Acceptance criteria
- Per-phase timings recorded and shown (queued/upload/build/tests) for remote validation and close-out.
- Runner view lists the running jobs per host with task id and kind, and the waiting queue with positions.
- `repoos driver brief --json` includes the blocking job for any validation waiting more than 2 minutes.
- Tests cover the queue-ahead computation.

## Notes for AI
Dispatch is least-recently-used among free hosts and queues only when every host is at its limit (docs/remote-validation.md). Hosts: bee (1 slot), thinkpad (2), mini (2). Start from the host pool lease/acquire code and the existing wait markers under .repoos/queue-markers.

## Activity

- 2026-10-21T12:39:47Z · created · njachowski@gmail.com
- 2026-10-21T13:33:34Z · status inbox→ready
- 2026-10-21T13:33:41Z · cli_override, model_override
- 2026-10-21T13:33:43Z · status ready→active, branch
- 2026-10-21T13:40:30Z · message_queued at 2026-10-21T13:40:30.987Z
- 2026-10-21T13:40:31Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-21T13:40:32Z · CTO nudge: held — an undelivered message is already queued
