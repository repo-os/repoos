---
id: "0888"
title: "Engineer turn ends cleanly without a handoff: resume it automatically instead of waiting for a CTO nudge"
type: bug
status: done
priority: p1
area: server
merged_commit: bfa38dfe8e3c2117e1f9f2b219bb6ab10ec08fdb
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/engineer-turn-ends-cleanly-without-a-han
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-10-20T21:57:26Z"
updated_at: "2026-10-21T01:05:15Z"
last_close_out_gate_ms: 100234
last_close_out_gate_at: "2026-10-21T01:04:36.950Z"
review_passes: 1
dev_error_count: 1
engineer_crash_log: "[{\"cli\":\"opencode\",\"model\":\"opencode-go/deepseek-v4.1-flash\",\"at\":\"2026-10-21T00:05:32.519Z\",\"kind\":\"dev-error\"}]"
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
- 2026-10-20T23:17:32Z · status inbox→ready
- 2026-10-20T23:17:38Z · cli_override, model_override
- 2026-10-20T23:17:39Z · status ready→active, branch
- 2026-10-20T23:43:00Z · body
- 2026-10-20T23:46:24Z · body
- 2026-10-20T23:52:12Z · message_queued at 2026-10-20T23:52:12.104Z
- 2026-10-20T23:52:12Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-21T00:05:32Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-10-21T00:05:32Z · engineer crash recovery: resuming opencode + opencode-go/deepseek-v4.1-flash (1/3 crashes in 30m) · the agent process exited with an error — open the task to see the full output
- 2026-10-21T00:05:35Z · message_delivered: 1 message(s)
- 2026-10-21T00:05:38Z · body
- 2026-10-21T00:08:06Z · body
- 2026-10-21T00:12:25Z · body
- 2026-10-21T00:15:56Z · body
- 2026-10-21T00:16:24Z · body
- 2026-10-21T00:39:02Z · needs_input
- 2026-10-21T00:39:08Z · assigned_to
- 2026-10-21T00:40:56Z · body
- 2026-10-21T00:48:38Z · assigned_to
- 2026-10-21T00:48:39Z · note: handoff requested (ui-review)
- 2026-10-21T00:56:35Z · status active→review
- 2026-10-21T00:56:36Z · note: shots: skipped — the diff (11 changed paths) touches no capture target's globs — no UI change to capture
- 2026-10-21T00:57:04Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T00:57:46Z · note: review pass 1: good to go
- 2026-10-21T01:04:36Z · close-out gate completed in 100s
- 2026-10-21T01:05:15Z · status done→done, release:success
