---
id: "1118"
title: "remote-host-pool tests fail on the remote host (bee) but pass locally: find the load or host dependence"
type: feature
status: active
priority: p2
area: [core, tests]
assigned_to: ai
created_by: t@t
branch: feat/remote-host-pool-tests-fail-on-the-remot
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-14T12:33:15Z"
updated_at: "2026-11-14T13:19:15Z"
handoff_signal_retry_count: 1
---
## Problem
Tests in `src/ui-app/tests/remote-host-pool.test.ts` fail under load or on the remote validation host and pass when run alone. Two cases on 2026-11-14: (1) #1101 "times out while deferred and removes stale dead-pid queue entries" (fixed earlier); (2) "host-side lock (server + standalone CLI share one limit) > lets a holder expire the waiter with a clear timeout instead of a red gate on bee" failed #1108's handoff with "remote validation failed: test failure ... on bee", yet passed 12 of 12 in the task worktree. A handoff gate that fails for host reasons wastes about 15 minutes per rerun.

## Desired UX
These tests give the same result on bee, thinkpad, mini and the laptop, idle or loaded. A failure on a remote host is a real failure.

## Acceptance criteria
1. Reproduce each failing test on the remote host path (or under artificial CPU load locally) and record what differs: timing windows, pid reuse, filesystem or clock behaviour, parallel workers sharing a lock directory.
2. Remove the race or the host dependence in the test or fixtures (isolated temp dirs per test, injected clocks, event-based waits); do not just raise a timeout without explaining why that is safe. If the test exposed a real bug in the production lock code, fix it and say so.
3. All tests in the file pass 20 times in a row alone and under load, and once through the remote validation path if a host is reachable.
4. No change to production behaviour unless a real bug is found.

## Notes for AI
Read docs/debugging-check-failures.md. Precedents: #1099, #1101, #1107. Related to the check-speed task (do not change gate scope there).

## Activity

- 2026-11-14T12:33:15Z · created · t@t
- 2026-11-14T12:33:26Z · cli_override, model_override
- 2026-11-14T12:33:28Z · status inbox→ready
- 2026-11-14T12:33:29Z · status ready→active, branch
- 2026-11-14T12:36:12Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: I couldn’t complete the task’s acceptance criteria, so I’m leaving it active and **not** requesting handoff. - The reported holder/waiter test passed once in isolation. I did not reproduce the remote-host failure or establish a host-depend… · stderr: Reading additional input from stdin... 2026-11-14T12:36:11.932747Z ERROR codex_core::session: failed to record rollout items: thread 01a1da0c-73d6-7212-ac89-a7c7cd898e8d not found
- 2026-11-14T12:43:22Z · body
- 2026-11-14T13:19:14Z · engineer stopped by request
