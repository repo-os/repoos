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
updated_at: "2026-10-21T14:52:33Z"
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

## Shots
```json
[
{
"label": "Remote runners + close-out pipeline: job kind, per-phase timings, queue position and blockers",
"target": "default",
"route": "/checks?tab=now",
"highlight": ".rr-panel"
}
]
```

## Activity

- 2026-10-21T12:39:47Z · created · njachowski@gmail.com
- 2026-10-21T13:33:34Z · status inbox→ready
- 2026-10-21T13:33:41Z · cli_override, model_override
- 2026-10-21T13:33:43Z · status ready→active, branch
- 2026-10-21T13:40:30Z · message_queued at 2026-10-21T13:40:30.987Z
- 2026-10-21T13:40:31Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-21T13:40:32Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-21T13:58:16Z · body
- 2026-10-21T13:59:47Z · body
- 2026-10-21T14:02:31Z · body
- 2026-10-21T14:06:04Z · body
- 2026-10-21T14:07:02Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-10-21T14:07:02Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-21T14:07:02Z · message_delivered: 1 message(s)
- 2026-10-21T14:18:11Z · handoff failed · remote validation failed: test failure: tests/agent-review.test.ts > agent review before human sign-off (#0101) > returns a task to active when review findings are auto-bounced to the engineer, tests/agent-review.test.ts > agent review before human sign-off (#0101) > flags needs_input instead of parking silently once auto-bounce rounds are used up, tests/agent-review.test.ts > agent review before human sign-off (#0101) > does not re-raise an exhausted-rounds flag dismissed during the review on thinkpad — fix it in the feature branch and re-run the gate
- 2026-10-21T14:23:34Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/agent-review.test.ts > agent review before human sign-off (#0101) > returns a task to active when review findings are auto-bounced to the engineer, tests/agent-review.test.ts > agent review before human sign-off (#0101) > flags needs_input instead of parking silently once auto-bounce rounds are used up, tests/agent-review.test.ts > agent review before human sign-off (#0101) > does not re-raise an exhausted-rounds flag dismissed during the review on thinkpad — fix it in the feature branch and re-run the gate · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-21T14:23:34Z · note: handoff requested (cli)
- 2026-10-21T14:32:43Z · CTO action: restart-stalled-agent (resume) · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/agent-review.test.ts > agent review before human sign-off (#0101) > returns a task to active when review findings are auto-bounced to the engineer, tests/agent-review.test.ts > agent review before human sign-off (#0101) > flags needs_input instead of parking silently once auto-bounce rounds are used up, tests/agent-review.test.ts > agent review before human sign-off (#0101) > does not re-raise an exhausted-rounds flag dismissed during the review on thinkpad — fix it in the feature branch and re-run the gate
- 2026-10-21T14:42:40Z · CTO nudge: held — machine under pressure (the memory compressor is holding 37% of RAM (8.8 GB of RAM) — holding new work until memory pressure eases)
- 2026-10-21T14:47:40Z · message_queued at 2026-10-21T14:47:40.272Z
- 2026-10-21T14:47:40Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-21T14:52:33Z · CTO nudge: held — an undelivered message is already queued
