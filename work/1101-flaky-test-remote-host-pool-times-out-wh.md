---
id: "1101"
title: "Flaky test: remote-host-pool 'times out while deferred and removes stale dead-pid queue entries' fails under load (from #1099)"
type: bug
status: review
priority: p2
area: server
assigned_to: ai
created_by: t@t
branch: feat/flaky-test-remote-host-pool-times-out-wh
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-13T05:55:54Z"
updated_at: "2026-11-13T10:38:32Z"
---
## Problem
src/ui-app/tests/remote-host-pool.test.ts "times out while deferred and removes stale dead-pid queue entries" (added by #1099) passes alone on main (2.1s) but fails in the full-file run and in remote validation on a loaded machine: `expect(readdirSync(waitDir)).toEqual([String(process.pid)])` (line ~2447). It blocked #1081 twice remotely on 2026-11-13 even though the task does not touch remote validation.

## Acceptance criteria
- The test (or the lock-wait cleanup it covers) is deterministic under load: no fixed 10s timeout or timing-dependent directory listing; reproduce by running the whole file alongside other suites.
- Document the cause in docs/debugging-check-failures.md.

## Notes for AI
It passes in isolation, so look for a race between stale-entry cleanup and the live-pid entry, or a timing budget (waitSecs 2 vs the 7s assertion) that breaks when the machine is busy. Do not just raise the timeout.

## Activity

- 2026-11-13T05:55:54Z · created · t@t
- 2026-11-13T07:10:31Z · cli_override, model_override
- 2026-11-13T07:10:33Z · status inbox→ready
- 2026-11-13T07:10:34Z · status ready→active, branch
- 2026-11-13T08:34:24Z · message_queued at 2026-11-13T08:34:24.073Z
- 2026-11-13T08:34:24Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-13T08:50:12Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-13T09:56:32Z · message_overdue: still queued after 60m without being delivered
- 2026-11-13T10:05:34Z · queued message undelivered for 91m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-13T10:05:34Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code unknown) · last assistant: The parallel run exposed a platform issue with the “out-of-range” PID assumption: the host still reported that PID as present, so the entry survived. I’m replacing that synthetic value with a controlled short-lived child process: create it… · stderr: Reading additional input from stdin... 2026-11-13T07:16:43.841230Z ERROR codex_core::tools::router: error=apply_patch verification failed: Failed to find expected lines in /Users/nick/code/nick/repoos-worktrees/feat/flaky-test-remote-host-pool-times-out-wh/docs/debugging-check-failures.md: by the listing. The PID conf…
- 2026-11-13T10:06:30Z · message_delivered: 1 message(s)
- 2026-11-13T10:10:00Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: I’m blocked on a verified fix. The test still fails at the stale-entry cleanup assertion, including after I controlled the dead child’s lifecycle and delayed the lock shell’s queue scan. I also removed the wall-clock ceiling and changed th… · stderr: 2026-11-13T07:42:29.093119Z ERROR codex_models_manager::manager: failed to refresh available models: Connection failed: error sending request 2026-11-13T07:47:01.884040Z ERROR codex_models_manager::manager: failed to refresh available models: Connection failed: error sending request 2026-11-13T07:51:34.898391Z ERROR c…
- 2026-11-13T10:10:21Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-13T10:36:43Z · body
- 2026-11-13T10:38:32Z · status active→review
- 2026-11-13T10:38:32Z · message_queued at 2026-11-13T10:38:32.643Z
- 2026-11-13T10:38:32Z · note: shots: skipped — the diff (5 changed paths) touches no capture target's globs — no UI change to capture
