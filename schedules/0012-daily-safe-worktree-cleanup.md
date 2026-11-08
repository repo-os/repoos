---
id: "0012"
title: Weekly safe worktree cleanup
enabled: false
cadence: weekly
timezone: Asia/Singapore
time_of_day: "06:00"
run_at: ""
day_of_week: 0
task_title: Review and safely clean task worktrees
task_type: chore
task_area: "core,server"
task_priority: p2
task_assigned_to: ai
task_status: ready
auto_start_agent: true
last_run_at: "2026-11-07T22:37:11.559Z"
last_result: success
last_task_id: "1055"
last_error: ""
last_occurrence_key: "weekly:2026-11-08"
created_at: "2026-11-01T15:58:12.727Z"
updated_at: "2026-11-08T02:58:15.485Z"
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
