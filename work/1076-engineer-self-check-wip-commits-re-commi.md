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
cli_override: claude code
model_override: haiku
created_at: "2026-11-09T08:36:18Z"
updated_at: "2026-11-10T02:36:21Z"
last_handoff_failure_fingerprint: "check|repoos check failed: ◆ Check plan"
last_handoff_failure_sha: 7acb7acb0353d1640a3ab26f488ff34f36ec1465
review_passes: 4
review_rounds: 2
handoff_signal_retry_count: 2
dev_error_count: 13
engineer_stall_resume_log: "[{\"at\":\"2026-11-09T19:51:44.422Z\",\"reason\":\"clean-exit-without-handoff\"}]"
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

## Accepted scope (criterion 1)
Owner/accepted interpretation: the server already writes only the LIVE task's own file into a task worktree — an audit of the write sites (activity, CTO/watchdog notes, `routes/tasks.ts` sync, `server.ts` `syncTaskBranch`) shows each targets `config.root`/main or this task's own `task.path`. No write site is changed. Enforcement lands at the commit boundary instead: every commit made in a task worktree is scoped (pathspec, or an explicit foreign-unstage before a bare commit) so a sibling's `work/<other-id>-*.md` / `work/reports/<other-id>/**` can never ride the branch, and handoff restores any that already did.

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
- 2026-11-09T15:12:31Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: PID 20806 (`claude -p --resume`, haiku) is STILL running (14:25 elapsed). This is the **reviewer agent** for #1076, and it's concurrently active in this worktree. That's very likely what modified `done.ts` (as part of its review, it may ha… · stderr: (empty)
- 2026-11-09T15:12:31Z · status active→review
- 2026-11-09T15:12:31Z · note: shots: skipped — the diff (17 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-09T15:13:20Z · note: review pass 2: needs some work
- 2026-11-09T15:13:20Z · status review→active
- 2026-11-09T15:52:58Z · body: Accepted scope (criterion 1) (added)
- 2026-11-09T15:52:58Z · message_queued at 2026-11-09T15:52:58.690Z
- 2026-11-09T15:55:14Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-09T16:53:07Z · queued message undelivered for 60m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-09T16:53:08Z · message_delivered: 1 message(s)
- 2026-11-09T17:10:15Z · message_queued at 2026-11-09T17:10:15.129Z
- 2026-11-09T17:10:15Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-09T17:12:50Z · body
- 2026-11-09T17:15:15Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-09T17:39:49Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-11-09T17:39:49Z · engineer crash recovery: resuming opencode + deepinfra/deepseek-ai/DeepSeek-V4.1-Flash (1/3 crashes in 30m) · the agent process exited with an error — open the task to see the full output
- 2026-11-09T17:39:53Z · needs_input
- 2026-11-09T17:39:53Z · message_delivered: 1 message(s)
- 2026-11-09T17:41:19Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-11-09T17:41:19Z · engineer crash recovery: resuming opencode + deepinfra/deepseek-ai/DeepSeek-V4.1-Flash (2/3 crashes in 30m) · the agent process exited with an error — open the task to see the full output
- 2026-11-09T17:41:23Z · needs_input
- 2026-11-09T17:42:49Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-11-09T17:42:49Z · engineer crash recovery: surfaced instead of switching — a human-set task override (opencode + deepinfra/deepseek-ai/DeepSeek-V4.1-Flash) is pinned, so RepoOS did not replace it (3/3 crashes in 30m)
- 2026-11-09T17:52:49Z · watchdog: restarting engineer after 10m with no live process
- 2026-11-09T17:54:19Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-11-09T17:54:19Z · engineer crash recovery: surfaced instead of switching — a human-set task override (opencode + deepinfra/deepseek-ai/DeepSeek-V4.1-Flash) is pinned, so RepoOS did not replace it (4/3 crashes in 30m)
- 2026-11-09T18:04:20Z · watchdog: restarting engineer after 10m with no live process
- 2026-11-09T18:05:56Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-11-09T18:05:56Z · engineer crash recovery: surfaced instead of switching — a human-set task override (opencode + deepinfra/deepseek-ai/DeepSeek-V4.1-Flash) is pinned, so RepoOS did not replace it (5/3 crashes in 30m)
- 2026-11-09T18:16:06Z · watchdog: restarting engineer after 10m with no live process
- 2026-11-09T18:17:34Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-11-09T18:17:34Z · engineer crash recovery: surfaced instead of switching — a human-set task override (opencode + deepinfra/deepseek-ai/DeepSeek-V4.1-Flash) is pinned, so RepoOS did not replace it (3/3 crashes in 30m)
- 2026-11-09T18:27:39Z · watchdog: restarting engineer after 10m with no live process
- 2026-11-09T18:30:40Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The handoff wiring is correct and does run the restore inside `runHandoffFinalization`, before the check gate and review lock. The test does exercise it via `finalizeReviewHandoff`. Now let me assess the actual remaining work. Let me focus… · stderr: (empty)
- 2026-11-09T18:35:10Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-09T18:51:40Z · body
- 2026-11-09T19:00:14Z · note: adopted orphaned engineer pid 13123
- 2026-11-09T19:15:04Z · body
- 2026-11-09T19:46:07Z · body
- 2026-11-09T19:51:44Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 1/3
- 2026-11-09T19:56:45Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-11-09T19:56:45Z · note: handoff requested (cli)
- 2026-11-09T19:57:01Z · message_queued at 2026-11-09T19:57:01.800Z
- 2026-11-09T19:57:02Z · handoff failed · task-file handoff failed at commit · git add failed: A check is running; wait for it to finish.
- 2026-11-09T19:57:06Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-09T20:02:33Z · body
- 2026-11-09T20:21:29Z · message_queued at 2026-11-09T20:21:29.216Z
- 2026-11-09T20:29:44Z · body
- 2026-11-09T20:46:02Z · body
- 2026-11-09T20:46:37Z · handoff_deferred: 2 queued message(s) must be read before review
- 2026-11-09T20:46:37Z · message_queued at 2026-11-09T20:46:37.350Z
- 2026-11-09T20:46:37Z · ↻ resuming engineer to read queued message
- 2026-11-09T20:46:37Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The check passes. The tests step is deferred to the remote validation runner (which is the normal path — RepoOS runs the full suite server-side). I've already run the task's own tests directly and all pass (34 + 11). Let me do a final stat… · stderr: (empty)
- 2026-11-09T20:57:42Z · message_delivered: 3 message(s)
- 2026-11-09T21:00:40Z · CTO nudge: held — handoff gate is running
- 2026-11-09T21:01:38Z · status active→review
- 2026-11-09T21:01:38Z · message_queued at 2026-11-09T21:01:38.414Z
- 2026-11-09T21:01:38Z · note: shots: skipped — the diff (19 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-09T21:03:57Z · note: review pass 3: needs some work
- 2026-11-09T21:03:57Z · needs_input
- 2026-11-09T21:21:38Z · status review→active
- 2026-11-09T21:21:38Z · note: send-back — returned to active for engineer follow-up
- 2026-11-09T21:21:41Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-09T21:21:47Z · needs_input
- 2026-11-09T21:21:47Z · message_queued at 2026-11-09T21:21:47.685Z
- 2026-11-09T21:26:52Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — task-file handoff failed at commit · git add failed: A check is running; wait for it to finish. · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-11-09T21:26:53Z · note: handoff requested (cli)
- 2026-11-09T21:30:40Z · CTO nudge: held — handoff gate is running
- 2026-11-09T21:44:12Z · message_delivered: 1 message(s)
- 2026-11-09T21:56:53Z · message_queued at 2026-11-09T21:56:53.461Z
- 2026-11-09T21:56:53Z · handoff failed · task-file handoff failed at check · server-side finalization timed out (deadline exceeded)
- 2026-11-09T22:00:40Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-09T22:09:08Z · handoff_deferred: 2 queued message(s) must be read before review
- 2026-11-09T22:09:08Z · message_queued at 2026-11-09T22:09:08.551Z
- 2026-11-09T22:09:08Z · ↻ resuming engineer to read queued message
- 2026-11-09T22:09:09Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: Only task #1076's own files. The branch is clean. Let me do a final review of the three fixes to confirm correctness, then write a concise summary. Let me re-read the final state of the three edited source regions. · stderr: (empty)
- 2026-11-09T22:11:10Z · message_delivered: 3 message(s)
- 2026-11-09T22:15:40Z · message_queued at 2026-11-09T22:15:40.043Z
- 2026-11-09T22:15:40Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-09T22:20:40Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-09T22:45:14Z · body
- 2026-11-09T22:48:22Z · status active→review
- 2026-11-09T22:48:22Z · message_queued at 2026-11-09T22:48:22.690Z
- 2026-11-09T22:48:22Z · note: shots: skipped — the diff (23 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-09T22:50:13Z · note: review pass 4: needs some work
- 2026-11-09T22:50:14Z · needs_input
- 2026-11-09T22:51:50Z · status review→active
- 2026-11-09T22:51:50Z · note: send-back — returned to active for engineer follow-up
- 2026-11-09T22:51:52Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-09T22:51:58Z · needs_input
- 2026-11-09T22:51:59Z · message_queued at 2026-11-09T22:51:59.378Z
- 2026-11-09T22:57:05Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — task-file handoff failed at commit · git add failed: A check is running; wait for it to finish. · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-11-09T22:57:06Z · note: handoff requested (cli)
- 2026-11-09T23:00:40Z · CTO nudge: held — handoff gate is running
- 2026-11-09T23:19:58Z · message_queued at 2026-11-09T23:19:58.825Z
- 2026-11-09T23:19:59Z · handoff failed · task-file handoff failed at check · repoos check failed: ◆ Check plan
- 2026-11-09T23:20:40Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-09T23:38:54Z · message_delivered: 1 message(s)
- 2026-11-09T23:46:37Z · agent exited with an error (opencode) · ✗ Server finalization stopped at check: repoos check failed: ◆ Check plan. The task stays active — fix the failure and ask again.
- 2026-11-10T00:20:17Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-10T00:39:48Z · message_overdue: still queued after 60m without being delivered
- 2026-11-10T00:41:21Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-10T01:11:46Z · cli_override, model_override
- 2026-11-10T01:12:59Z · needs_input
- 2026-11-10T01:56:08Z · message_delivered: 2 message(s)
- 2026-11-10T02:31:21Z · message_queued at 2026-11-10T02:31:21.977Z
- 2026-11-10T02:31:22Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-10T02:36:21Z · CTO nudge: held — an undelivered message is already queued
