---
id: "1076"
title: "Engineer self-check WIP commits re-commit other tasks' work files, blocking landing (stray bookkeeping in task branches)"
type: bug
status: active
priority: p2
area: [core, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/engineer-self-check-wip-commits-re-commi
cli_override: opencode
model_override: deepinfra/deepseek-ai/DeepSeek-V4.1-Flash
created_at: "2026-11-09T08:36:18Z"
updated_at: "2026-11-09T14:56:48Z"
handoff_signal_retry_count: 2
review_rounds: 1
review_passes: 1
dev_error_count: 6
engineer_crash_log: "[{\"cli\":\"opencode\",\"model\":\"deepinfra/deepseek-ai/DeepSeek-V4.1-Flash\",\"at\":\"2026-11-09T13:58:41.527Z\",\"kind\":\"dev-error\"}]"
---
## Problem
Several tasks (seen on #1058, also #1061 and #1060 earlier) repeatedly fail landing with "the diff changes another task's bookkeeping" and "work/<other id>-*.md conflicts with main". Cause found on #1058: the engineer's self-check creates "WIP: engineer self-check checkpoint" commits that stage everything dirty in the worktree, and the server keeps writing OTHER tasks' `work/<id>-*.md` files (activity, CTO nudge notes, task updates) into that worktree. Every checkpoint commit then re-adds those files to the branch, review after review says "restore unrelated bookkeeping", the engineer restores them, the next check re-commits them. The same loop also invalidates running checks (#1061's problem) and burns many review rounds.

## Desired UX
A task branch's diff against main only ever contains that task's own files. Other tasks' bookkeeping never appears in a task worktree's commits, and an engineer never has to fix this by hand.

## Acceptance criteria
1. Find and document which server paths write other tasks' `work/*.md` (and `work/reports/<other id>`) into a task worktree (task sync, activity/CTO notes, merge-of-main bookkeeping); stop them from touching a task worktree except for that task's own file, or write them only to main.
2. The self-check WIP checkpoint commit stages only the task's own files plus its source changes, and explicitly excludes `work/*.md` for other ids and `work/reports/<other id>/**`.
3. Handoff, before the review lock, runs a guarded cleanup that restores any other task's work files from main (via a normal commit that the review tolerates as bookkeeping), and reports it instead of failing landing.
4. `repoos landable` and the handoff report name the offending files and the cause in plain English.
5. Tests: a worktree with dirty other-task work files produces a checkpoint commit with none of them; a branch with such files is cleaned at handoff; the landing preflight passes afterwards.
6. Docs: agent-workflow-rules / close-out docs updated to describe the rule.

## Notes for AI
Look at the WIP checkpoint commit code in `src/commands/check.ts` and `src/core/git.ts`, the server's task-file sync (`ensureWorktree`, bookkeeping commits in `src/server/handoff.ts`), and the landing preflight (`repoos landable`, `src/server/conflict-resolution.ts`). Coordinate with #1061 (bookkeeping deferral during checks); do not duplicate it. Do not edit repoos.toml.

## Activity

- 2026-11-09T08:36:18Z · created · njachowski@gmail.com
- 2026-11-09T09:08:09Z · cli_override, model_override
- 2026-11-09T09:08:11Z · status inbox→ready
- 2026-11-09T09:08:12Z · status ready→active, branch
- 2026-11-09T09:11:35Z · model_override
- 2026-11-09T09:15:28Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-11-09T09:15:28Z · engineer crash recovery: surfaced instead of switching — a human-set task override (opencode + opencode-go/deepseek-v4.1-flash) is pinned, so RepoOS did not replace it (1/3 crashes in 30m)
- 2026-11-09T09:25:35Z · watchdog: restarting engineer after 10m with no live process
- 2026-11-09T09:27:01Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-11-09T09:27:01Z · engineer crash recovery: resuming opencode + deepinfra/deepseek-ai/DeepSeek-V4.1-Flash (1/3 crashes in 30m) · the agent process exited with an error — open the task to see the full output
- 2026-11-09T09:28:31Z · needs_input
- 2026-11-09T09:29:56Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-11-09T09:29:56Z · engineer crash recovery: resuming opencode + deepinfra/deepseek-ai/DeepSeek-V4.1-Flash (2/3 crashes in 30m) · the agent process exited with an error — open the task to see the full output
- 2026-11-09T09:31:26Z · needs_input
- 2026-11-09T09:38:40Z · engineer stopped by request
- 2026-11-09T09:38:44Z · held, held-reason, held-at
- 2026-11-09T10:09:40Z · body
- 2026-11-09T10:43:15Z · body
- 2026-11-09T13:15:58Z · released
- 2026-11-09T13:21:01Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-11-09T13:21:02Z · note: handoff requested (cli)
- 2026-11-09T13:21:55Z · CTO nudge: held — handoff gate is running
- 2026-11-09T13:31:11Z · status active→review
- 2026-11-09T13:31:12Z · message_queued at 2026-11-09T13:31:12.026Z
- 2026-11-09T13:31:12Z · note: shots: skipped — the diff (10 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-09T13:32:29Z · note: review pass 1: needs some work
- 2026-11-09T13:32:29Z · status review→active
- 2026-11-09T13:32:32Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-09T13:37:49Z · message_queued at 2026-11-09T13:37:49.877Z
- 2026-11-09T13:42:15Z · body
- 2026-11-09T13:47:34Z · message_queued at 2026-11-09T13:47:34.906Z
- 2026-11-09T13:52:03Z · message_delivered: 1 message(s)
- 2026-11-09T13:58:41Z · agent exited with an error (opencode) · error: Model busy, retry later
- 2026-11-09T13:58:41Z · engineer crash recovery: resuming opencode + deepinfra/deepseek-ai/DeepSeek-V4.1-Flash (1/3 crashes in 30m) · error: Model busy, retry later
- 2026-11-09T14:02:24Z · needs_input
- 2026-11-09T14:02:24Z · message_delivered: 2 message(s)
- 2026-11-09T14:16:55Z · message_queued at 2026-11-09T14:16:55.723Z
- 2026-11-09T14:16:55Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-09T14:21:55Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-09T14:24:32Z · agent exited with an error (opencode) · error: Model busy, retry later
- 2026-11-09T14:34:32Z · watchdog: restarting engineer after 10m with no live process
- 2026-11-09T14:34:33Z · message_delivered: 1 message(s)
- 2026-11-09T14:40:15Z · agent exited with an error (opencode) · ✗ Review request ignored: the last engineer turn exited with an error and never emitted its handoff signal. The task stays active and the engineer is resumed.
- 2026-11-09T14:56:48Z · watchdog: restarting engineer after 17m with no live process
