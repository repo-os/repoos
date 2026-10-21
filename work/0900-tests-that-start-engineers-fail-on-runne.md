---
id: "0900"
title: "Tests that start engineers fail on runners whose swap is over the pressure guard limit: isolate tests from host memory pressure"
type: feature
status: review
priority: p1
area: [core, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/tests-that-start-engineers-fail-on-runne
cli_override: cursor
model_override: grok-4.7-low
created_at: "2026-10-21T14:05:10Z"
updated_at: "2026-10-21T15:46:31Z"
dev_error_count: 2
---
## Problem
Remote validation fails persistently on spawn-related tests (tests/agent-review.test.ts auto-bounce/exhausted-rounds, tests/agent-concurrency.test.ts queue/double-start, agent-drivers qwen 'on thinkpad'). 2026-10-21: #0894 failed its handoff gate on these, #0895 failed twice (13:27Z and 13:59Z), #0874 failed once on mini; the same tests also fail on main on the laptop under load (agent-review 'timed out waiting for engineer resumed with auto-bounce findings'). Root cause found: the memory-pressure guard (#0871, pressureGuard.maxSwapUsedRatio=0.5) reads the HOST's swap, and the tests start real engineer spawns through the server. Runner swap at diagnosis time: thinkpad 3012/4095 MB (73%), mini 1027/2048 MB (50.1%), bee 428/4095 MB (10%). Over the limit the guard holds new engineer starts, so the tests' expected spawn never happens. Because fallbackToLocal=true, close-outs then silently re-run the whole gate on the laptop (slow, high load) - the 'Ran locally' events and 20+ minute close-outs.

## Desired UX
Gate results do not depend on the runner's or laptop's memory state. Unit/integration tests of spawn behaviour run with the pressure guard disabled or fed a fixed healthy sample. The pressure guard itself keeps its own dedicated tests with injected samples. A remote failure caused by the guard is never reported as a test failure of the branch.

## Acceptance criteria
- Test fixtures that start engineers (agent-review, agent-concurrency, agent-drivers, and any other that calls /start) set pressureGuard.enabled=false or inject a healthy sample; verified by running them with a stub reporting 90% swap used.
- A test proves the suite is green when the host reports swap 73% and compressor 40%.
- Add a guard-focused test that still covers blocked/unblocked transitions with injected samples.
- Document in docs/debugging-check-failures.md: runner swap over 50% held engineer starts and caused false remote failures; how to spot it (queue marker kind pressure) and the swap check.

## Notes for AI
Look at src/core/pressure-guard.ts, resource-limits.ts and the test helpers (makeFixture/withServer in src/ui-app/tests). Do not lower the guard's production thresholds. Also consider logging the guard verdict in the gate output when it holds a start.

## Activity

- 2026-10-21T14:05:10Z · created · njachowski@gmail.com
- 2026-10-21T14:05:31Z · status inbox→ready
- 2026-10-21T14:05:35Z · cli_override, model_override
- 2026-10-21T14:05:36Z · status ready→active, branch
- 2026-10-21T14:20:32Z · message_queued at 2026-10-21T14:20:32.508Z
- 2026-10-21T14:20:32Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-21T14:22:58Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-21T14:27:40Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-10-21T14:27:40Z · engineer crash recovery: resuming opencode + opencode-go/deepseek-v4.1-flash (1/3 crashes in 30m) · the agent process exited with an error — open the task to see the full output
- 2026-10-21T14:27:41Z · message_delivered: 1 message(s)
- 2026-10-21T14:41:27Z · cli_override, model_override
- 2026-10-21T14:41:29Z · model_override
- 2026-10-21T14:41:37Z · note: stopped orphaned engineer pid 84383
- 2026-10-21T14:41:39Z · message_delivered: 1 message(s)
- 2026-10-21T14:44:15Z · body
- 2026-10-21T14:46:52Z · body
- 2026-10-21T14:48:28Z · body
- 2026-10-21T14:50:46Z · needs_input
- 2026-10-21T14:59:14Z · handoff failed · remote validation failed: test failure: tests/check-remote-wip.test.ts > managed engineer dirty-tree fallback (#0695) > warns and runs locally when a WIP checkpoint cannot be created on bee — fix it in the feature branch and re-run the gate
- 2026-10-21T15:01:07Z · body
- 2026-10-21T15:03:15Z · body
- 2026-10-21T15:03:18Z · note: handoff requested (ui-review)
- 2026-10-21T15:06:12Z · body
- 2026-10-21T15:07:31Z · body
- 2026-10-21T15:11:21Z · handoff failed · ui-review handoff failed at check · remote validation failed: test failure: tests/check-remote-wip.test.ts > managed engineer dirty-tree fallback (#0695) > warns and runs locally when a WIP checkpoint cannot be created on mini — fix it in the feature branch and re-run the gate
- 2026-10-21T15:16:53Z · watchdog: restarted engineer after identical check failure · branch tip unchanged since the last failing handoff validation
- 2026-10-21T15:22:41Z · message_queued at 2026-10-21T15:22:41.664Z
- 2026-10-21T15:22:41Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-21T15:26:03Z · agent exited with an error (cursor) · ActionRequiredError: Weekly usage limit reached. It resets in 5 days. Buy credits to keep going now, or upgrade your plan for more weekly usage.
- 2026-10-21T15:26:03Z · engineer crash recovery: resuming cursor + grok-4.7-low (1/3 crashes in 30m) · ActionRequiredError: Weekly usage limit reached. It resets in 5 days. Buy credits to keep going now, or upgrade your plan for more weekly usage.
- 2026-10-21T15:26:04Z · message_delivered: 1 message(s)
- 2026-10-21T15:34:33Z · body
- 2026-10-21T15:37:07Z · body
- 2026-10-21T15:37:47Z · needs_input
- 2026-10-21T15:46:30Z · status active→review
- 2026-10-21T15:46:31Z · note: shots: skipped — the diff (15 changed paths) touches no capture target's globs — no UI change to capture
