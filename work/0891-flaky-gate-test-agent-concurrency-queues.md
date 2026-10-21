---
id: "0891"
title: "Flaky gate test: agent-concurrency 'queues starts beyond maxConcurrentAgents and drains' fails on remote runners"
type: bug
status: active
priority: p2
area: server
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/flaky-gate-test-agent-concurrency-queues
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-10-21T04:07:35Z"
updated_at: "2026-10-21T07:38:33Z"
dev_error_count: 1
engineer_crash_log: "[{\"cli\":\"opencode\",\"model\":\"opencode-go/deepseek-v4.1-flash\",\"at\":\"2026-10-21T06:03:26.061Z\",\"kind\":\"dev-error\"}]"
---
## Problem
`tests/agent-concurrency.test.ts > agent start concurrency cap > queues starts beyond maxConcurrentAgents and drains them as slots free` (and its sibling "a queued task cannot be double-started while waiting for a slot") repeatedly fails the remote validation gate on bee/thinkpad for tasks whose diff does not touch the runner (#0873 at 01:02 and 01:51, #0876 at 04:06 UTC on 2026-10-21), while the same file passes locally and on main. Each false failure costs a full gate cycle (3-10 minutes, more under load) and sends the task back to the engineer for nothing. On a loaded runner the test's timing assumptions (spawned fake CLIs, drain-on-exit ordering) do not hold.

## Desired UX
The test is deterministic: it never depends on wall-clock or on how fast a spawned fake process exits. A passing run on main passes on every runner, loaded or not.

## Acceptance criteria
- Reproduce the failure: run the file under CPU contention (for example 4 parallel copies, or with `--pool` limited and a busy loop in another process) and show the failing assertion.
- Fix the test (and any runner code race it exposes) so it passes 50 of 50 runs under that contention.
- Also audit `tests/agent-drivers.test.ts`: it fails a different test each run under load (one test hit a 30s timeout) and fails 1 test on main during the same window; fix or quarantine the timing-sensitive ones the same way.
- Replace sleeps and wall-clock polling with explicit gates (deferred promises, the fake process exit event) as `docs/debugging-check-failures.md` recommends (remove the race, do not reconcile environments).
- Do not raise timeouts as the fix.

## Notes for AI
See AGENTS.md "Is a `repoos check` failure a flake or a real bug?" and docs/debugging-check-failures.md. The same-file failures are on the `bee`/`thinkpad` remote runners; the local pass means the difference is load/timing, not code.

## Verification
Reproduced on 2026-10-21 before the fix: main's `agent-concurrency.test.ts` run as 8 parallel copies under 10 busy-loop processes failed 8/8 runs — `AssertionError: expected true to be falsy` at `expect(r1.queued).toBeFalsy()` (the host pressure guard deferred the first start) and the sibling hit `Test timed out in 5000ms`. Cause: `AgentRunner.spawnOrQueue` consults `pressureReason(config)` before the slot cap, so a loaded runner queued the first start for `pressure`.

After the fix, on the same machine: `agent-concurrency.test.ts` passed 50/50 sequential runs with 12 busy loops (strictest, default 5s per-test timeout); `agent-drivers.test.ts` passed 4/4 runs with 8 busy loops under the real `src/ui-app/vite.config.ts` (30s timeout, pool 2). Fake CLIs now hold the turn open until the test sends SIGTERM (explicit exit event), and no test in either file has an internal waitFor deadline shorter than the test timeout. `REPOOS_CHECK_CHANGED=main repoos check` passed on the final tree.

## Activity

- 2026-10-21T04:07:35Z · created · njachowski@gmail.com
- 2026-10-21T04:50:06Z · status inbox→ready
- 2026-10-21T04:50:15Z · cli_override, model_override
- 2026-10-21T04:50:18Z · status ready→active, branch
- 2026-10-21T05:03:18Z · message_queued at 2026-10-21T05:03:18.762Z
- 2026-10-21T05:03:19Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-21T05:23:03Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-21T05:51:15Z · status active→ready
- 2026-10-21T05:51:15Z · engineer stopped by request
- 2026-10-21T05:51:21Z · status ready→active
- 2026-10-21T05:51:22Z · message_delivered: 1 message(s)
- 2026-10-21T05:57:03Z · body
- 2026-10-21T05:58:41Z · body
- 2026-10-21T06:03:26Z · agent exited with an error (opencode) · error: Transport
- 2026-10-21T06:03:26Z · engineer crash recovery: resuming opencode + opencode-go/deepseek-v4.1-flash (1/3 crashes in 30m) · error: Transport
- 2026-10-21T06:09:02Z · message_queued at 2026-10-21T06:09:02.483Z
- 2026-10-21T06:09:02Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-21T06:12:43Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-21T07:02:56Z · status active→ready
- 2026-10-21T07:02:56Z · engineer stopped by request
- 2026-10-21T07:03:00Z · status ready→active
- 2026-10-21T07:03:01Z · message_delivered: 1 message(s)
- 2026-10-21T07:08:36Z · body
- 2026-10-21T07:11:09Z · body
- 2026-10-21T07:18:12Z · message_queued at 2026-10-21T07:18:12.715Z
- 2026-10-21T07:18:12Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-21T07:21:29Z · body
- 2026-10-21T07:21:43Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-21T07:22:02Z · body
- 2026-10-21T07:27:56Z · body
- 2026-10-21T07:28:24Z · body
- 2026-10-21T07:29:31Z · body: Verification (added)
- 2026-10-21T07:29:31Z · message_queued at 2026-10-21T07:29:31.970Z
- 2026-10-21T07:34:09Z · body
- 2026-10-21T07:35:16Z · body
- 2026-10-21T07:38:32Z · handoff_deferred: 2 queued message(s) must be read before review
- 2026-10-21T07:38:32Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-21T07:38:33Z · needs_input
