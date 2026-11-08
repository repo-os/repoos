---
id: "1055"
title: Review and safely clean task worktrees
type: chore
status: active
priority: p2
area: [core, server]
assigned_to: ai
created_by: schedule
branch: feat/review-and-safely-clean-task-worktrees
created_at: "2026-11-07T22:37:10Z"
updated_at: "2026-11-08T00:52:05Z"
review_rounds: 1
routing_switches: 1
routing_escalations: 1
review_passes: 1
handoff_signal_retry_count: 2
engineer_stall_resume_log: "[{\"at\":\"2026-11-08T00:36:58.679Z\",\"reason\":\"clean-exit-without-handoff\"}]"
---
## Problem

RepoOS leaves a Git worktree and branch behind for every task it runs. Most are cleaned up on close-out, but over time some are left over: merged feature branches that were never collected, and worktrees whose task is done, archived or gone. These add noise and have caused confusing failures, such as close-outs that fail with "feature branch worktree not found". The cleanup must never lose work: unfinished, dirty, unmerged, held, human-owned or in-review work has to stay.

This is the recurring hygiene pass. On each run, review the registered worktrees, remove only the ones RepoOS itself proves safe to remove with its guarded `repoos gc`, and report every worktree that was kept together with the exact reason.

## Acceptance criteria

- [ ] Before changing anything, `repoos status --json` and `repoos gc --dry-run` were run, and the report records the worktree count, the safe candidates, and the protected worktrees with their reasons.
- [ ] If there are safe candidates, cleanup was done only with `repoos gc --yes`, and a second `repoos status --json` plus `repoos gc --dry-run` shows no safe candidates left (or the report says why some remain).
- [ ] If there are no safe candidates, the run changed nothing: `repoos gc --yes` was not run and no worktree or branch was removed. The report says so.
- [ ] The report lists every protected worktree with its exact reason, and the before and after counts.
- [ ] No active, review, held, human-assigned, dirty or unmerged task worktree or branch was removed, and nothing was removed by hand with `git worktree remove` or `git branch -D`.
- [ ] No product code was edited, nothing was pushed, and no unrelated task was started. The diff contains only this task's own task file and report files.

## Notes for AI

Runbook:

1. Re-read `AGENTS.md`, `repoos driver brief`, and `repoos list`. Check the live state of any task referenced by a retained worktree before judging it.
2. Run `repoos status --json` and `repoos gc --dry-run`. Record the current count, safe candidates, and protected reasons.
3. If RepoOS reports safe candidates, apply its own guarded cleanup with `repoos gc --yes`, then verify with another `repoos status --json` and `repoos gc --dry-run`.
4. Never remove a worktree or branch by hand. Never clean active, review, held, human-assigned, dirty, or unmerged task work. Do not reset task files to main based only on their path. Leave unresolved done/archived worktrees for the safety rules tracked in #1004.
5. Record before and after counts and the protected worktrees in this task's handoff report. If there are no safe candidates, report that and finish without changing anything.

Do not edit product code, push, or start unrelated tasks as part of this run.

Context: `repoos gc` is the only sanctioned way to remove worktrees and branches; it decides what is safe. Worktrees outside RepoOS's managed task-worktree directory (for example other tools' worktrees) are not this task's to remove. This task comes from the "Safe worktree cleanup" schedule in `schedules/`; a normal run has an empty code diff, so there is nothing for the scoped check to test beyond the task's own files. Once #1004 lands and changes what `repoos gc` collects, update this runbook and the schedule template to match.

## Activity

- 2026-11-07T22:37:10Z · created · schedule
- 2026-11-07T23:51:45Z · status ready→active, branch
- 2026-11-07T23:53:24Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: I stopped before cleanup because the only GC candidate is this active #1055 worktree. `repoos status --json` warned that it was reporting the main checkout and associated the candidate with task #1008, so running `repoos gc --yes` could re… · stderr: Reading additional input from stdin...
- 2026-11-07T23:59:36Z · body
- 2026-11-08T00:00:34Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: `REPOOS_CHECK_CHANGED=main repoos check` passed. The report records the before snapshot, all retained reasons, and the blocker. The cleanup is still incomplete: the sole GC candidate is this active #1055 worktree, though RepoOS associates … · stderr: (empty)
- 2026-11-08T00:07:56Z · CTO nudge: held — handoff gate is running
- 2026-11-08T00:14:50Z · status active→review
- 2026-11-08T00:14:50Z · message_queued at 2026-11-08T00:14:50.884Z
- 2026-11-08T00:14:50Z · note: shots: skipped — the diff (3 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-08T00:16:19Z · note: review pass 1: needs some work
- 2026-11-08T00:16:20Z · message_delivered: 1 message(s)
- 2026-11-08T00:16:20Z · status review→active
- 2026-11-08T00:21:28Z · body
- 2026-11-08T00:22:56Z · CTO nudge: held — handoff gate is running
- 2026-11-08T00:31:54Z · status active→review
- 2026-11-08T00:31:54Z · message_queued at 2026-11-08T00:31:54.637Z
- 2026-11-08T00:31:54Z · note: shots: skipped — the diff (5 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-08T00:31:55Z · message_delivered: 1 message(s)
- 2026-11-08T00:31:55Z · status review→active
- 2026-11-08T00:36:58Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 1/3
- 2026-11-08T00:40:53Z · body
- 2026-11-08T00:41:52Z · status active→review
- 2026-11-08T00:41:53Z · note: shots: skipped — the diff (5 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-08T00:41:54Z · message_queued at 2026-11-08T00:41:54.383Z
- 2026-11-08T00:41:54Z · status review→active
- 2026-11-08T00:41:56Z · CTO nudge: held — handoff gate is running
- 2026-11-08T00:52:03Z · status active→review
- 2026-11-08T00:52:03Z · message_queued at 2026-11-08T00:52:03.834Z
- 2026-11-08T00:52:03Z · note: shots: skipped — the diff (6 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-08T00:52:05Z · message_delivered: 2 message(s)
- 2026-11-08T00:52:05Z · status review→active
