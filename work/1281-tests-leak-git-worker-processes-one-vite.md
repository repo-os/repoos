---
id: "1281"
title: "Tests leak git worker processes: one vitest run left 48 git-worker-entry processes"
type: feature
status: review
priority: p2
area: [core, server]
assigned_to: ai
created_by: t@t
branch: feat/tests-leak-git-worker-processes-one-vite
cli_override: claude code
model_override: haiku
created_at: "2026-11-20T11:47:41Z"
updated_at: "2026-11-20T21:03:17Z"
review_rounds: 1
review_passes: 1
review_failed_report_retries: 0
---
## Problem
On 2026-11-20 around 19:45 local, a single scoped vitest run in the #1258 engineer worktree had about 48 live src/server/git-worker-entry.ts processes (each several minutes old) plus its vitest workers, and the machine load average reached about 130 on 10 cores. This looks like a test, or the code it exercises, starting git worker processes and not shutting them down.

## Desired UX
A test run leaves no git worker processes behind, and the number alive at once stays bounded, so engineers' scoped checks cannot swamp the machine.

## Acceptance criteria
- Find which tests or code paths spawn git-worker-entry.ts and never terminate it (pool not closed, worker not unref'd or killed in teardown).
- Fix so workers are closed in test teardown and capped in production; add a test that asserts no git worker processes remain after the suite helper exits.
- Document the cap in docs if it is user-visible.

## Notes for AI
Reproduce with bun run test on a scoped path while watching ps for git-worker-entry. Never touch repoos.toml.

## Activity

- 2026-11-20T11:47:41Z · created · t@t
- 2026-11-20T11:48:06Z · status inbox→ready
- 2026-11-20T15:04:05Z · cli_override, model_override
- 2026-11-20T15:04:11Z · status ready→active, branch
- 2026-11-20T15:26:14Z · message_queued at 2026-11-20T15:26:14.833Z
- 2026-11-20T15:26:15Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-20T15:29:23Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-20T15:29:24Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 143) · last assistant: #1281 is still waiting on the scoped `repoos check --changed main`. It's about 10 minutes in, running the test suite, and hasn't written an exit line, so there's no pass or fail yet. The handoff stays on hold until it finishes. I'll check … · stderr: (empty)
- 2026-11-20T15:29:40Z · orphaned run process stopped · pid 51218 · /opt/homebrew/bin/bun /Users/nick/.bun/bin/repoos check · cpu 24s · age 19m
- 2026-11-20T15:29:55Z · orphaned run process stopped · pid 54759 · ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 -o ServerAliveInterval · cpu 0s · age 18m
- 2026-11-20T15:31:15Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-20T15:31:35Z · message_delivered: 1 message(s)
- 2026-11-20T15:32:53Z · message_queued at 2026-11-20T15:32:53.315Z
- 2026-11-20T15:32:53Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-20T15:35:54Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-20T15:35:54Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 143) · last assistant: The CTO check-in is right: this task has been idle too long. My earlier scoped check was killed partway through the tests (312 of 821 done), with no failure reported, so I restarted it detached at `/tmp/1281-check2.log`. The handoff stays … · stderr: (empty)
- 2026-11-20T15:35:55Z · message_delivered: 1 message(s)
- 2026-11-20T15:36:15Z · message_queued at 2026-11-20T15:36:15.254Z
- 2026-11-20T15:36:15Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-20T15:39:24Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-20T15:39:24Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 143) · last assistant: #1281 is still waiting on the scoped `repoos check --changed main`. I restarted it detached (PID 13490) after the earlier run was killed mid-suite, and it's at 11 of 821 tests. There's no pass or fail yet, so I'm not handing off. I'll chec… · stderr: (empty)
- 2026-11-20T15:39:25Z · message_delivered: 1 message(s)
- 2026-11-20T15:41:15Z · message_queued at 2026-11-20T15:41:15.069Z
- 2026-11-20T15:41:15Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-20T15:44:24Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-20T15:44:25Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 143) · last assistant: #1281 is still waiting on the scoped `repoos check --changed main`. The restarted run (PID 13490) is at 73 of 821 tests after about 8 minutes, and it hasn't exited, so there's no pass or fail yet. The earlier "failed" lines in the log are … · stderr: (empty)
- 2026-11-20T15:44:25Z · message_delivered: 1 message(s)
- 2026-11-20T15:46:15Z · message_queued at 2026-11-20T15:46:15.281Z
- 2026-11-20T15:46:15Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-20T15:49:24Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-20T15:49:26Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 143) · last assistant: #1281 is still waiting on the scoped `repoos check --changed main`. The restarted run (PID 13490) is at 203 of 821 tests after about 13 minutes and hasn't exited, so there's no pass or fail yet. I'm not handing off until it finishes. I'll … · stderr: (empty)
- 2026-11-20T15:49:28Z · message_delivered: 1 message(s)
- 2026-11-20T15:49:31Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: #1281 is still waiting on the scoped `repoos check --changed main`. The restarted run (PID 13490) is at 291 of 821 tests after about 18 minutes and hasn't exited, so there's no pass or fail yet. The handoff stays on hold until it finishes.… · stderr: (empty)
- 2026-11-20T15:49:40Z · orphaned run process stopped · pid 13490 · /opt/homebrew/bin/bun /Users/nick/.bun/bin/repoos check · cpu 14s · age 18m
- 2026-11-20T15:49:55Z · orphaned run process stopped · pid 18453 · ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 -o ServerAliveInterval · cpu 0s · age 17m
- 2026-11-20T15:51:15Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-20T15:56:15Z · CTO nudge: held — handoff gate is running
- 2026-11-20T16:06:02Z · status active→review
- 2026-11-20T16:06:03Z · message_queued at 2026-11-20T16:06:03.051Z
- 2026-11-20T16:06:03Z · note: shots: skipped — the diff (6 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-20T16:06:08Z · note: review pass 1: failed — no usable report
- 2026-11-20T16:06:16Z · note: review pass 2: failed — no usable report
- 2026-11-20T16:06:23Z · note: review pass 3: failed — no usable report
- 2026-11-20T16:06:23Z · needs_input
- 2026-11-20T17:06:15Z · message_overdue: still queued after 60m without being delivered
- 2026-11-20T19:49:31Z · needs_input (review-failed) cleared for review again by hello@repoos.org
- 2026-11-20T19:50:49Z · note: review pass 4: needs some work
- 2026-11-20T19:50:49Z · status review→active
- 2026-11-20T19:50:52Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-20T19:51:03Z · message_delivered: 1 message(s)
- 2026-11-20T20:01:16Z · CTO nudge: held — handoff gate is running
- 2026-11-20T21:03:16Z · status active→review
- 2026-11-20T21:03:16Z · message_queued at 2026-11-20T21:03:16.983Z
- 2026-11-20T21:03:17Z · note: shots: skipped — the diff (12 changed paths) touches no capture target's globs — no UI change to capture
