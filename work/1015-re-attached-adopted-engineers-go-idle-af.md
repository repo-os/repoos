---
id: 1015
title: "Re-attached (adopted) engineers go idle after a server restart: find out why and fix"
type: bug
status: inbox
priority: p0
area: server
assigned_to: ""
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-11-03T09:05:45Z"
updated_at: "2026-11-03T09:05:45Z"
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
