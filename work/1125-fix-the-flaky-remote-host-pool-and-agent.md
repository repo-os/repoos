---
id: "1125"
title: Fix the flaky remote-host-pool (and agent-review/pressure-guard/agent-drivers) tests that keep failing close-out and handoff on remote runners
type: bug
status: active
priority: p0
area: [core, server]
assigned_to: ai
created_by: t@t
branch: feat/fix-the-flaky-remote-host-pool-and-agent
cli_override: cursor
model_override: composer-2.5
created_at: "2026-11-15T04:51:36Z"
updated_at: "2026-11-15T05:24:09Z"
---
## Problem

Close-out (Move to done) and handoff keep failing on unrelated, timing-sensitive tests when run on the remote runners (bee, thinkpad). Today #1120 failed three close-outs in a row, #1123 and #1122 failed once each, and #1120/#1122 failed handoff checks, all on the same few tests:

- tests/remote-host-pool.test.ts: 'host-side lock (server + standalone CLI share one limit)': 'breaks an orphaned lock dir within the wait budget instead of timing out on it (#0521 review)', 'times out while deferred and removes stale dead-pid queue entries', 'lets a holder expire the waiter with a clear timeout'
- tests/agent-review.test.ts: 'routes reviewer chat to its own session and serves the conversation'
- tests/pressure-guard.test.ts: 'waitForPressureRelief waits until a fake probe reports relief, then proceeds'
- tests/agent-drivers.test.ts: 'engineer resource limits (#0961) passes worker caps and the shared shim path to the spawned engineer'

They fail on both hosts, so it is the tests, not one runner. Each failure costs 15-20 minutes and blocks landing; a green-review task can fail close-out repeatedly with nothing wrong in its branch. Earlier fixes (#1101, #1102) did not remove it.

## Acceptance criteria

- [ ] For each test listed, the root cause of the timing dependence is identified and recorded (real wall-clock sleeps/timeouts vs injected clock, shared lock dirs or pids between parallel runs, slow runner startup), by reproducing under CPU and I/O load, not by guessing.
- [ ] The races are removed, not widened: tests use injected/fake clocks and isolated temp dirs or lock paths per test, with no fixed sleeps that need a quiet machine. Raising timeouts alone does not count.
- [ ] Each fixed test passes 50 times in a row under artificial load (for example repeated runs alongside a busy-loop or concurrent test suite) and on both remote runners.
- [ ] A short note in docs/debugging-check-failures.md lists these tests, their cause and the pattern to avoid.
- [ ] No test is deleted, skipped or marked retry-on-fail to make this pass, and the production lock/queue behavior is unchanged unless the investigation finds a real bug (then fix it and say so).

## Notes for AI

Follow AGENTS.md 'Is a repoos check failure a flake or a real bug?' and docs/debugging-check-failures.md. A failure that reproduces on two hosts is real until proven otherwise; check whether the host-side lock directory is shared between concurrently running test files or leaked from a prior run.

## Activity

- 2026-11-15T04:51:36Z · created · t@t
- 2026-11-15T04:51:40Z · cli_override, model_override
- 2026-11-15T04:51:41Z · status inbox→ready
- 2026-11-15T04:51:43Z · status ready→active, branch
- 2026-11-15T05:21:07Z · message_queued at 2026-11-15T05:21:07.370Z
- 2026-11-15T05:21:07Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-15T05:22:24Z · body
- 2026-11-15T05:24:09Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
