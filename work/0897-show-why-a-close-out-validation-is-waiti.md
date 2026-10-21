---
id: "0897"
title: "Show why a close-out/validation is waiting: queue position, what runs ahead on each runner"
type: feature
status: review
priority: p2
area: [server, web]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/show-why-a-close-out-validation-is-waiti
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-10-21T12:39:47Z"
updated_at: "2026-10-21T18:50:42Z"
dev_error_count: 3
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
"label": "Remote runners: close-out job kind + per-phase timings, with the handoff check queue position and blocker",
"target": "default",
"route": "/checks?tab=now",
"highlight": ".rr-panel",
"steps": [
{
"waitFor": ".rr-blockers"
}
],
"state": "runners:queued"
},
{
"label": "Task drawer: live remote close-out phase, host and per-phase elapsed",
"target": "default",
"route": "/work?task=9999&tab=changes",
"highlight": ".drawer-remote-activity",
"steps": [
{
"waitFor": ".drawer-remote-activity"
}
],
"state": "runners:queued"
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
- 2026-10-21T15:14:37Z · body
- 2026-10-21T15:26:48Z · body
- 2026-10-21T15:34:42Z · body
- 2026-10-21T15:39:08Z · note: handoff requested (ui-review)
- 2026-10-21T15:42:41Z · CTO nudge: held — handoff gate is running
- 2026-10-21T15:44:48Z · body
- 2026-10-21T15:45:45Z · note: waitFor .drawer-remote-activity: waitFor: Timeout 5000ms exceeded. on /work?task=9999&tab=changes
- 2026-10-21T15:45:45Z · note: highlight .drawer-remote-activity matched nothing on /work?task=9999&tab=changes
- 2026-10-21T15:49:34Z · handoff failed · ui-review handoff failed at check · remote validation failed: test failure: tests/check-remote-wip.test.ts > managed engineer dirty-tree fallback (#0695) > warns and runs locally when a WIP checkpoint cannot be created, tests/task-drawer-check-chip.test.ts > task drawer check chip (#0564) > starts with the local machine from the SSE event, then upgrades to the remote host when its durable row lands mid-gate on mini — fix it in the feature branch and re-run the gate
- 2026-10-21T15:50:07Z · body
- 2026-10-21T15:52:41Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-21T15:52:43Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T15:54:06Z · body
- 2026-10-21T15:59:06Z · agent exited with an error (opencode) · ✗ Server finalization stopped at check: remote validation failed: test failure: tests/check-remote-wip.test.ts > managed engineer dirty-tree fallback (#0695) > warns and runs locally when a WIP checkpoint cannot be created, tests/task-drawer-check-chip.test.ts > task drawer check chip (#0564) > starts with the local machine from the SSE event, then upgrades to the remote host when its durable row lands mid-gate on mini — fix it in the feature branch and re-run the gate. The task stays active — fix the failure and ask again.
- 2026-10-21T15:59:06Z · engineer crash recovery: resuming opencode + opencode-go/deepseek-v4.1-flash (1/3 crashes in 30m) · ✗ Server finalization stopped at check: remote validation failed: test failure: tests/check-remote-wip.test.ts > managed engineer dirty-tree fallback (#0695) > warns and runs locally when a WIP checkpoint cannot be created, tests/task-dr…
- 2026-10-21T15:59:11Z · message_delivered: 1 message(s)
- 2026-10-21T16:00:14Z · note: Previous remote-validation failure (agent-review auto-bounce/exhausted-rounds tests, 14:18Z) matches known runner memory-pressure guard issue #0900, not this diff: those tests never start their engineer spawn when the runner's swap exceeds the guard. This change's own tests (remote-host-pool queue detail, driver-brief blocked validations, integration-job phases, snapshot queue detail, shot fixtures) pass locally, and the scoped gate is green.
- 2026-10-21T16:02:12Z · body
- 2026-10-21T16:04:38Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T16:15:11Z · needs_input
- 2026-10-21T16:15:44Z · status active→ready
- 2026-10-21T16:15:54Z · status ready→active
- 2026-10-21T16:15:56Z · note: stopped orphaned engineer pid 32098
- 2026-10-21T16:15:56Z · message_delivered: 1 message(s)
- 2026-10-21T16:21:35Z · body
- 2026-10-21T16:25:35Z · note: stopped orphaned engineer pid 41277
- 2026-10-21T16:25:38Z · agent exited with an error (opencode) · ✗ Server finalization stopped at check: remote validation failed: test failure: tests/check-remote-wip.test.ts > managed engineer dirty-tree fallback (#0695) > warns and runs locally when a WIP checkpoint cannot be created, tests/task-drawer-check-chip.test.ts > task drawer check chip (#0564) > starts with the local machine from the SSE event, then upgrades to the remote host when its durable row lands mid-gate on mini — fix it in the feature branch and re-run the gate. The task stays active — fix the failure and ask again.
- 2026-10-21T16:25:38Z · engineer crash recovery: resuming opencode + opencode-go/deepseek-v4.1-flash (2/3 crashes in 30m) · ✗ Server finalization stopped at check: remote validation failed: test failure: tests/check-remote-wip.test.ts > managed engineer dirty-tree fallback (#0695) > warns and runs locally when a WIP checkpoint cannot be created, tests/task-dr…
- 2026-10-21T16:26:56Z · body
- 2026-10-21T16:39:14Z · body
- 2026-10-21T16:48:38Z · body
- 2026-10-21T16:49:03Z · needs_input
- 2026-10-21T16:56:23Z · CTO action: restart-stalled-agent (resume) · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/agent-review.test.ts > agent review before human sign-off (#0101) > returns a task to active when review findings are auto-bounced to the engineer, tests/agent-review.test.ts > agent review before human sign-off (#0101) > flags needs_input instead of parking silently once auto-bounce rounds are used up, tests/agent-review.test.ts > agent review before human sign-off (#0101) > does not re-raise an exhausted-rounds flag dismissed during the review on thinkpad — fix it in the feature branch and re-run the gate
- 2026-10-21T16:57:07Z · message_queued at 2026-10-21T16:57:07.686Z
- 2026-10-21T16:57:20Z · message_queued at 2026-10-21T16:57:20.864Z
- 2026-10-21T16:57:40Z · body
- 2026-10-21T16:58:22Z · body
- 2026-10-21T17:01:22Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-21T17:05:23Z · body
- 2026-10-21T17:07:26Z · body
- 2026-10-21T17:11:30Z · body
- 2026-10-21T17:13:07Z · handoff_deferred: 2 queued message(s) must be read before review
- 2026-10-21T17:13:07Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-21T17:13:07Z · message_delivered: 2 message(s)
- 2026-10-21T17:17:30Z · body
- 2026-10-21T17:25:58Z · handoff failed · remote validation failed: test failure: tests/agent-cta.test.ts > shared agent prompt call to action > uses the canonical starter prompt verbatim, tests/agent-cta.test.ts > shared agent prompt call to action > derives the compact preview from the opening of the prompt on mini — fix it in the feature branch and re-run the gate
- 2026-10-21T17:31:23Z · CTO action: restart-stalled-agent (resume) · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/agent-review.test.ts > agent review before human sign-off (#0101) > returns a task to active when review findings are auto-bounced to the engineer, tests/agent-review.test.ts > agent review before human sign-off (#0101) > flags needs_input instead of parking silently once auto-bounce rounds are used up, tests/agent-review.test.ts > agent review before human sign-off (#0101) > does not re-raise an exhausted-rounds flag dismissed during the review on thinkpad — fix it in the feature branch and re-run the gate
- 2026-10-21T17:39:27Z · message_queued at 2026-10-21T17:39:27.755Z
- 2026-10-21T17:39:27Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-21T17:39:43Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-21T17:41:01Z · body
- 2026-10-21T17:43:21Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-10-21T17:43:21Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-21T17:43:21Z · message_delivered: 1 message(s)
- 2026-10-21T17:52:12Z · handoff failed · remote validation failed: test failure: tests/agent-cta.test.ts > shared agent prompt call to action > uses the canonical starter prompt verbatim, tests/agent-cta.test.ts > shared agent prompt call to action > derives the compact preview from the opening of the prompt on thinkpad — fix it in the feature branch and re-run the gate
- 2026-10-21T17:57:25Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/agent-review.test.ts > agent review before human sign-off (#0101) > returns a task to active when review findings are auto-bounced to the engineer, tests/agent-review.test.ts > agent review before human sign-off (#0101) > flags needs_input instead of parking silently once auto-bounce rounds are used up, tests/agent-review.test.ts > agent review before human sign-off (#0101) > does not re-raise an exhausted-rounds flag dismissed during the review on thinkpad — fix it in the feature branch and re-run the gate · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-21T17:57:25Z · note: handoff requested (cli)
- 2026-10-21T18:04:36Z · CTO action: restart-stalled-agent (fresh) · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/agent-review.test.ts > agent review before human sign-off (#0101) > returns a task to active when review findings are auto-bounced to the engineer, tests/agent-review.test.ts > agent review before human sign-off (#0101) > flags needs_input instead of parking silently once auto-bounce rounds are used up, tests/agent-review.test.ts > agent review before human sign-off (#0101) > does not re-raise an exhausted-rounds flag dismissed during the review on thinkpad — fix it in the feature branch and re-run the gate
- 2026-10-21T18:07:24Z · agent exited with an error (opencode) · ✗ Server finalization stopped at check: remote validation failed: test failure: tests/agent-cta.test.ts > shared agent prompt call to action > uses the canonical starter prompt verbatim, tests/agent-cta.test.ts > shared agent prompt call to action > derives the compact preview from the opening of the prompt on thinkpad — fix it in the feature branch and re-run the gate. The same worktree can be resumed and retried.
- 2026-10-21T18:07:24Z · engineer crash recovery: resuming opencode + opencode-go/deepseek-v4.1-flash (1/3 crashes in 30m) · ✗ Server finalization stopped at check: remote validation failed: test failure: tests/agent-cta.test.ts > shared agent prompt call to action > uses the canonical starter prompt verbatim, tests/agent-cta.test.ts > shared agent prompt call…
- 2026-10-21T18:09:46Z · body
- 2026-10-21T18:10:47Z · needs_input
- 2026-10-21T18:35:37Z · body
- 2026-10-21T18:50:42Z · status active→review

