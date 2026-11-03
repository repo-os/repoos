---
id: 1015
title: "Re-attached (adopted) engineers go idle after a server restart: find out why and fix"
type: bug
status: active
priority: p0
area: server
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/re-attached-adopted-engineers-go-idle-af
created_at: "2026-11-03T09:05:45Z"
updated_at: "2026-11-03T16:31:06Z"
handoff_signal_retry_count: 1
---
## Problem
Per `docs/agent-run-operations.md` (#0837) and `src/server/orphan-engineers.ts`, a server restart should re-attach the engineers it recorded (activity: `adopted orphaned engineer pid N`) and carry on. In practice, after restarts on 2026-11-03 the adopted engineers on #1004, #1005 and #1013 went idle:
- #1005: adopted at 08:41, a queued message undelivered since 08:18, no worktree activity for over an hour; the CTO only logged "held — an undelivered message is already queued".
- #1004: adopted at 07:48, queued messages never delivered, then needed a manual pause/start.
- #1013: a message queued 60+ minutes was never delivered (`message_overdue`) before a manual restart.
Each needed a manual pause and start. Hypothesis (unverified): the adopted process is alive, but its stdout/stdin link to the new server is gone, so the server no longer sees its progress, handoff request or queued-message delivery, and the watchdog/CTO treat it as healthy.

## Desired UX
An engineer that survives a server restart either keeps working with the new server seeing its output, handoff requests and message delivery, or is detected as unreachable and restarted automatically (with a clear activity line), never left idle for an hour. Restarting the server mid-task should not need human intervention.

## Acceptance criteria
- [ ] Reproduce: start an engineer, restart the server, show what the adopted process can and cannot do (output stream, message delivery, handoff signal). Record the finding in `docs/agent-run-operations.md`.
- [ ] Fix, either by re-establishing the channel or by detecting a non-communicating adopted engineer and restarting it safely (one writer per worktree, no duplicate WIP commits, #0832).
- [ ] Queued messages to an adopted engineer are delivered or the engineer is restarted within a bounded time; add a test.
- [ ] The watchdog/CTO no longer reports "held: undelivered message already queued" indefinitely for an adopted idle engineer.

## Notes for AI
Start at `src/server/orphan-engineers.ts` and the adoption path in `src/server/agents.ts`; check how message delivery (`message_queued` → `message_delivered`) and the idle/watchdog logic treat an adopted run. Evidence: activity logs of tasks 1004, 1005, 1013 on 2026-11-03.

## Activity

- 2026-11-03T09:05:45Z · created · njachowski@gmail.com
- 2026-11-03T11:57:48Z · status inbox→ready
- 2026-11-03T12:24:15Z · status ready→active, branch
- 2026-11-03T13:53:36Z · watchdog: restarting engineer after 72m with no live process
- 2026-11-03T14:04:26Z · watchdog: auto-surfaced stuck task · status active→ready · agent never started — no session exists for this task · next step: resume the session manually from the task's worktree and check for uncommitted work
- 2026-11-03T14:04:28Z · CTO action: restart-stalled-agent (resume) · agent never started — no session exists for this task
- 2026-11-03T15:11:17Z · status ready→active
- 2026-11-03T15:17:09Z · message_queued at 2026-11-03T15:17:09.905Z
- 2026-11-03T15:17:10Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-03T15:22:09Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-03T15:46:03Z · watchdog: check wait escalated · waiting: waiting for a local check slot (2 ahead, position 3); waiting behind #1013 check (pid 43807, alive), #1013 check (pid 27634, alive); slot holder has made no progress for 30 minutes (no heartbeat) for 6s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-03T15:46:33Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-03T15:47:04Z · watchdog: check wait escalated · waiting: waiting for a local check slot (2 ahead, position 3); waiting behind #1013 check (pid 43807, alive), #1013 check (pid 51437, alive); slot holder has made no progress for 30 minutes (no heartbeat) for 6s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-03T15:47:48Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-03T16:08:38Z · body
- 2026-11-03T16:26:00Z · body
- 2026-11-03T16:27:19Z · watchdog: check wait escalated · waiting: waiting for a Playwright slot — position 2 (1 ahead); slot holder has made no progress for 30 minutes (no heartbeat) for 6s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-03T16:28:04Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-03T16:30:34Z · watchdog: check wait escalated · waiting: waiting for a Playwright slot — position 2 (1 ahead); slot holder has made no progress for 30 minutes (no heartbeat) for 9s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-03T16:30:49Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-03T16:31:06Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-03T16:31:06Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
