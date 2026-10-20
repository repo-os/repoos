---
id: "0888"
title: "Engineer turn ends cleanly without a handoff: resume it automatically instead of waiting for a CTO nudge"
type: bug
status: inbox
priority: p1
area: server
assigned_to: ""
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-20T21:57:26Z"
updated_at: "2026-10-20T21:57:26Z"
---
## Problem
Overnight 2026-10-21 (CTO off) at least six engineers (#0867, #0866, #0883, #0869 and others) stopped after a turn: no crash, no handoff request, worktree clean, no live process, task still `active`. Several of those followed a `handoff_deferred` note (a handoff was requested while a message was queued, #0865), others just ended. Nothing resumed them; each needed a manual `repoos start` (or `mv ready` then `start` when the runner registry still said "already running"). #0869 resumes engineers after a non-clean exit, and the CTO's `restart-stalled-agent` / completion nudge covers the rest, but with the CTO off a clean exit without handoff is a dead end. Each stall costs 10-30 minutes of wall-clock per task.

## Desired UX
An `active` task whose engineer process has exited cleanly without a handoff request, with unfinished work (acceptance criteria not yet met or no handoff since the last commit), is resumed automatically after a short grace period, once or a few times, with a one-line note in Activity; after N resumes without progress it surfaces as needs_input with the reason. No CTO required.

## Acceptance criteria
- A watchdog (reuse TaskWatchdog / the #0869 crash-recovery path, do not add a third mechanism) detects: status active, no live runner and no process holding the worktree, no pending handoff request, last exit clean, and either an unhandled `handoff_deferred` or no handoff since the last commit.
- It resumes the engineer with the existing resume preamble, rate-limited (for example 3 resumes per 30 minutes per task), recording each in Activity.
- A deferred handoff (`handoff_deferred`) always leads to the engineer being resumed to read the queued message; verify the delivery microtask path in `AgentRunner.cleanup()` does this when crash recovery is not involved.
- Phantom runner registry entries ("already running" with no process) are cleared as part of the same check (#0863 already detects them: reuse it).
- Never resumes a paused task, a task assigned to a human, a task in review or closing out, or a task whose engineer was stopped by a person.
- Table-driven tests over exit kind x handoff state x queued messages x paused/human/review.

## Notes for AI
Relevant code: src/server/agents.ts (`cleanup()`, `deliverQueuedMessages`, crash recovery from #0869), src/server/task-watchdog.ts, src/server/engineer-crash-recovery.ts, the CTO restart-stalled-agent action (see ADR 0008, docs/adr/0008-centralized-agent-recovery.md: fit into that design, do not add a parallel mechanism). Run the tests touching these files in small groups; shared lifecycle code has regressed existing tests three times already.

## Activity

- 2026-10-20T21:57:26Z · created · njachowski@gmail.com
