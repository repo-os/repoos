---
id: "0891"
title: "Flaky gate test: agent-concurrency 'queues starts beyond maxConcurrentAgents and drains' fails on remote runners"
type: bug
status: ready
needs_input: true
needs_input_reason: dev-error
needs_input_detail: "error: Transport"
debug_tldr: Agent transport failed mid-run after checks passed — retry the engineer session; no test fix needed until a run completes.
debug_tldr_at: "2026-10-21T06:03:47Z"
debug_tldr_key: "dev-error|error: Transport"
priority: p2
area: server
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/flaky-gate-test-agent-concurrency-queues
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-10-21T04:07:35Z"
updated_at: "2026-10-21T07:02:56Z"
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
