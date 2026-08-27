---
id: "0307"
title: Automatically repair and surface terminal handoff check failures
type: feature
status: ready
priority: p1
area: server
assigned_to: ai
created_by: ""
branch: ""
model_override: deepinfra/Qwen/Qwen3-Coder-480B-A35B-Instruct-Turbo
review_model_override: deepinfra/Qwen/Qwen3-Coder-480B-A35B-Instruct-Turbo
created_at: "2026-08-27T02:56:16Z"
updated_at: "2026-08-27T03:11:54Z"
---
## Problem

When an engineer emits the handoff signal but repoos check fails, RepoOS retries automatically and can then leave the task silently active. The watchdog only notices later through inactivity, delaying recovery.

## Desired outcome

Terminal handoff-check failures become an explicit durable workflow. RepoOS gives the engineer bounded repair opportunities in the same worktree with the exact failure context, then immediately flags the task for human help when repair is exhausted.

## Acceptance criteria

- [ ] Persist parseable handoff-check failure details: stage, command, exit code, and bounded diagnostic output.
- [ ] Start a bounded repair turn in the same task worktree with the exact failure context.
- [ ] Tell the engineer to fix the failing check and preserve the existing implementation.
- [ ] Bound automatic repair attempts across restarts and prevent infinite retry loops.
- [ ] After retries are exhausted, set needs_input immediately with a machine-readable reason such as check-failed-after-retries.
- [ ] Emit the existing needs-input notification and show the actionable failure in the task UI and transcript.
- [ ] Keep the task associated with its existing worktree; do not move reviewable work to ready.
- [ ] Teach the watchdog to recognize terminal handoff-check failure without waiting for inactivity.
- [ ] Keep reviewer auto-bounce separate: engineer repair turns own check failures.
- [ ] Add tests for first failure, bounded retries, restart durability, successful repair, exhausted repair, notification, and watchdog interaction.
- [ ] Verify repoos check passes.

## Notes

Coordinate with the handoff retry logic in src/server/handoff.ts, agent lifecycle in src/server/agents.ts, and src/server/task-watchdog.ts. Related behavior was observed on task 0302, where the handoff check failed after two automatic retries and the task remained active until the watchdog later surfaced it.

## Activity

- 2026-08-27T02:56:16Z · created · unknown
- 2026-08-27T03:11:33Z · status inbox→ready
- 2026-08-27T03:11:42Z · model_override
- 2026-08-27T03:11:50Z · review_model_override
- 2026-08-27T03:11:54Z · review_model_override
