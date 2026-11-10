---
id: "1082"
title: Handoff should wait (bounded) for a running self-check instead of failing 'A check is running; wait for it to finish'
type: bug
status: active
priority: p1
area: [server, core]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/handoff-should-wait-bounded-for-a-runnin
cli_override: claude code
model_override: haiku
created_at: "2026-11-09T20:11:19Z"
updated_at: "2026-11-10T05:56:15Z"
last_handoff_failure_fingerprint: "check|repoos check failed: build — src/server/handoff.ts(1147,72): error TS18047: 'finalized.report' is possibly 'null'."
last_handoff_failure_sha: b1fb1141a2bbafe4f1c334c9b42e8862e5efd991
review_rounds: 1
review_passes: 1
handoff_signal_retry_count: 2
dev_error_count: 1
---
## Problem
Since #1061 landed (check-gate lock), a handoff whose commit step runs while the engineer's own `repoos check` still holds the lock fails immediately with "git add failed: A check is running; wait for it to finish." (seen on #1073 and #1076 on 2026-11-10 around 03:00). The handoff does not wait or retry, so the task looks stuck until an engineer notices and re-requests handoff. Several tasks hit this at the same time and sat for 40+ minutes.

## Desired UX
A handoff that arrives while a self-check is running waits for it (bounded, for example up to the check's own timeout, with a visible "waiting for the running check to finish" state) and then proceeds; it fails only if the wait times out. The engineer never needs to retry by hand.

## Acceptance criteria
1. The handoff commit step (and any other server git operation refused by the lock for a reason that is just 'a check is running') waits for lock release with bounded polling, not an immediate failure; the task shows a plain-English waiting state.
2. If the holder process is dead or the lock is stale, recovery runs first and the handoff proceeds.
3. Tests: handoff during a running check waits and succeeds; times out cleanly; stale lock is recovered.
4. Docs: docs/check-run-history.md and user-docs/check.md describe the behaviour.

## Notes for AI
Look at `src/server/check-gate-lock.ts` (`CHECK_GATE_WRITE_REFUSAL`), `src/server/handoff.ts` (commit step) and `src/core/git.ts` (the guarded git add/commit). Do not edit repoos.toml.

## Activity

- 2026-11-09T20:11:19Z · created · njachowski@gmail.com
- 2026-11-09T23:28:11Z · cli_override, model_override
- 2026-11-09T23:28:14Z · status inbox→ready
- 2026-11-09T23:28:17Z · status ready→active, branch
- 2026-11-09T23:33:32Z · message_queued at 2026-11-09T23:33:32.955Z
- 2026-11-09T23:35:40Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-09T23:40:49Z · message_queued at 2026-11-09T23:40:49.745Z
- 2026-11-09T23:46:02Z · watchdog: auto-surfaced stuck task · status active→ready · agent exited without emitting the handoff signal · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-11-09T23:46:41Z · agent exited with an error (cursor) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-10T00:39:49Z · message_overdue: still queued after 60m without being delivered
- 2026-11-10T01:11:47Z · cli_override, model_override
- 2026-11-10T01:11:54Z · status ready→active, needs_input
- 2026-11-10T01:11:57Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-10T01:12:10Z · message_delivered: 2 message(s)
- 2026-11-10T01:46:21Z · message_queued at 2026-11-10T01:46:21.343Z
- 2026-11-10T01:46:21Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-10T01:51:21Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-10T01:53:10Z · body
- 2026-11-10T01:56:21Z · CTO nudge: held — handoff gate is running
- 2026-11-10T02:03:15Z · note: ui verification passed: 1 shot captured with clean console (1 shot warning)
- 2026-11-10T02:03:17Z · status active→review
- 2026-11-10T02:03:17Z · message_queued at 2026-11-10T02:03:17.904Z
- 2026-11-10T02:05:12Z · note: review pass 1: needs some work
- 2026-11-10T02:05:13Z · status review→active
- 2026-11-10T02:05:16Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-10T02:10:27Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-11-10T02:10:28Z · note: handoff requested (cli)
- 2026-11-10T02:11:21Z · CTO nudge: held — handoff gate is running
- 2026-11-10T02:28:39Z · note: ui verification passed: 1 shot captured with clean console (1 shot warning)
- 2026-11-10T02:28:40Z · message_queued at 2026-11-10T02:28:40.578Z
- 2026-11-10T02:28:40Z · handoff failed · task-file handoff failed at review · Engineering report draft is missing: .repoos/engineering-report-drafts/1082.md
- 2026-11-10T02:31:21Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-10T02:58:01Z · message_delivered: 1 message(s)
- 2026-11-10T03:28:47Z · message_overdue: still queued after 60m without being delivered
- 2026-11-10T03:28:48Z · queued message undelivered for 60m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-10T03:28:51Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 143) · last assistant: The round-2 scoped check is running. It has committed a WIP checkpoint and is now in remote validation. I'll report when it finishes, then either hand off or fix whatever fails. · stderr: Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-10T04:23:34Z · message_delivered: 1 message(s)
- 2026-11-10T04:24:12Z · message_queued at 2026-11-10T04:24:12.611Z
- 2026-11-10T04:24:13Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-10T04:24:33Z · note: adopted orphaned engineer pid 58420
- 2026-11-10T04:29:32Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-10T04:56:17Z · note: adopted orphaned engineer pid 58420
- 2026-11-10T04:57:46Z · watchdog: check wait escalated · waiting: waiting for serialized local fallback (1 ahead, position 2); wait exceeds the handoff deadline for 30m · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-10T05:01:15Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-10T05:26:15Z · message_overdue: still queued after 60m without being delivered
- 2026-11-10T05:28:07Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-10T05:28:21Z · queued message undelivered for 64m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-10T05:28:37Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code unknown) · last assistant: The round-2 check failed to start. It timed out after 45 minutes waiting for the local check slot, which another task's check (`first-load-skeletons`, pid 72341) is holding. The code has not been tested yet. I've queued a fresh run behind … · stderr: Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-11-10T05:28:39Z · note: handoff requested (cli)
- 2026-11-10T05:31:15Z · CTO nudge: held — handoff gate is running
- 2026-11-10T05:52:06Z · message_queued at 2026-11-10T05:52:06.329Z
- 2026-11-10T05:52:06Z · handoff failed · task-file handoff failed at check · repoos check failed: build — src/server/handoff.ts(1147,72): error TS18047: 'finalized.report' is possibly 'null'.
- 2026-11-10T05:56:15Z · CTO nudge: held — an undelivered message is already queued
