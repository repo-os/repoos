---
id: "1083"
title: "Review runner: a stale 'review already running' registration survives review cancel and blocks reviews until the server restarts (seen on #1080)"
type: bug
status: active
priority: p1
area: server
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/review-runner-a-stale-review-already-run
cli_override: claude code
model_override: haiku
created_at: "2026-11-09T22:52:19Z"
updated_at: "2026-11-10T19:31:11Z"
check_retry_count: 1
last_check_failure: "repoos check at 2026-11-10T18:49:37.527Z: repoos check failed: reused check inputs changed during handoff — run the check again"
review_rounds: 2
review_passes: 2
---
## Problem
On 2026-11-10 #1080 sat in review with a passed handoff for 45+ minutes: `repoos review again 1080` answered "a review is already running for this task" (ReviewRunner.isRunning, src/server/review.ts ~1173), but no reviewer process or session existed (no `claude -p`, no reviewer row since 17:27Z, the last attempt errored with "Can't reach the API server" while the machine was offline). `repoos review cancel 1080` followed by `repoos mv 1080 review` did not clear it. The in-memory running registration leaked when the original reviewer run failed (API outage), so every later review request was refused.

## Desired UX
A failed, killed or cancelled review always releases its running registration; `repoos review again` never reports "already running" without a live reviewer; and a watchdog clears an entry whose process/session is gone after a short timeout.

## Acceptance criteria
1. Release the registration in a `finally` path for every reviewer exit (success, error, API outage, kill, cancel), with tests that simulate a reviewer that rejects/throws before writing a session.
2. `review cancel` clears the registration even if the underlying process is already gone.
3. A watchdog (or canRun check) treats a registration older than the review timeout with no live process as stale, logs it, and clears it.
4. The refusal message says what is running (pid, since when) so a human can tell stale from live.

## Notes for AI
Look at `ReviewRunner.isRunning`/`canRun`/`cancel` in `src/server/review.ts` and the handoff step that starts the review. Do not edit repoos.toml.

## Activity

- 2026-11-09T22:52:19Z · created · njachowski@gmail.com
- 2026-11-10T13:31:26Z · status inbox→ready
- 2026-11-10T13:31:27Z · cli_override, model_override
- 2026-11-10T13:31:31Z · status ready→active, branch
- 2026-11-10T17:26:24Z · watchdog: restarting engineer after 235m with no live process
- 2026-11-10T17:31:17Z · note: handoff requested (cli)
- 2026-11-10T17:31:22Z · CTO nudge: held — handoff gate is running
- 2026-11-10T17:59:42Z · status active→review
- 2026-11-10T17:59:42Z · message_queued at 2026-11-10T17:59:42.454Z
- 2026-11-10T17:59:42Z · note: shots: skipped — the diff (6 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-10T18:02:07Z · note: review pass 1: needs some work
- 2026-11-10T18:02:07Z · status review→active
- 2026-11-10T18:02:09Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-10T18:02:10Z · message_delivered: 1 message(s)
- 2026-11-10T18:16:09Z · CTO nudge: held — handoff gate is running
- 2026-11-10T18:23:52Z · message_queued at 2026-11-10T18:23:52.075Z
- 2026-11-10T18:26:09Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-10T18:31:14Z · message_delivered: 1 message(s)
- 2026-11-10T18:31:23Z · CTO action: restart-stalled-agent (fresh) · agent exited without emitting the handoff signal
- 2026-11-10T18:41:10Z · message_queued at 2026-11-10T18:41:10.004Z
- 2026-11-10T18:41:10Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-10T18:41:18Z · body
- 2026-11-10T18:44:48Z · status active→review
- 2026-11-10T18:44:50Z · note: shots: skipped — the diff (8 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-10T18:49:34Z · message_queued at 2026-11-10T18:49:34.163Z
- 2026-11-10T18:49:35Z · note: review pass 2: needs some work
- 2026-11-10T18:49:36Z · status review→active
- 2026-11-10T18:49:37Z · message_queued at 2026-11-10T18:49:37.164Z
- 2026-11-10T18:49:39Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-10T18:53:43Z · message_delivered: 1 message(s)
- 2026-11-10T19:17:14Z · body
- 2026-11-10T19:21:58Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-10T19:21:58Z · message_queued at 2026-11-10T19:21:58.597Z
- 2026-11-10T19:21:58Z · ↻ resuming engineer to read queued message
- 2026-11-10T19:21:59Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The round-3 check passed: exit 0, no failed steps, and all 237 test files passed. I'll put that result into the report's summary line. · stderr: (empty)
- 2026-11-10T19:21:59Z · message_delivered: 2 message(s)
- 2026-11-10T19:26:11Z · message_queued at 2026-11-10T19:26:11.503Z
- 2026-11-10T19:26:11Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-10T19:31:11Z · CTO nudge: held — an undelivered message is already queued
