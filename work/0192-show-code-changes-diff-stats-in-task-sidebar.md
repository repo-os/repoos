---
id: "0192"
title: Show code changes (diff stats) in task sidebar to diagnose implementation status
type: feature
status: ready
priority: p2
area: ui-app
assigned_to: unassigned
created_by: ""
branch: feat/show-code-changes-diff-stats-in-task-sid
created_at: "2026-08-14T08:59:00Z"
updated_at: "2026-08-14T12:45:12Z"
---
## Problem

When a task claims to be "done" but has no actual code changes, it's hard to diagnose at a glance. Example: task 0189 (Architect agent) reports completion but has zero commits on its branch. Currently, you must manually run `git diff main...branch --stat` to see if work was actually implemented. This creates friction when triaging stuck tasks or diagnosing handoff issues.

## Desired UX

The task sidebar should display **code change statistics** prominently, showing:
- **Lines added/deleted** (e.g., "+342, -18")
- **Files changed** (e.g., "7 files changed")
- A visual indicator when there are **zero changes** (warning or highlight)

This should appear in:
- Task drawer (near branch name and status)
- Task list card (small badge or summary)
- Both on active/review/done tasks

## Acceptance criteria

- [ ] Diff stats displayed in task drawer (additions/deletions and file count)
- [ ] Diff calculated as `main...branch` (from branch base to current HEAD)
- [ ] Zero changes clearly highlighted (red badge or warning state)
- [ ] Stats update when branch changes or task status changes
- [ ] Works for tasks without branches (shows "no branch")
- [ ] Stats appear in both active and review states
- [ ] Efficiently fetches diff stats (cache or throttle if needed)
- [ ] `repoos check` passes

## Notes for AI

- Use `git diff main...{branch} --stat` to calculate stats
- Parse output to extract file count and +/- line counts
- Handle edge cases: no branch, branch not found, branch at exact main commit
- Consider caching stats client-side (branch changes infrequently during a task)
- If implementing server-side, add lightweight endpoint `/api/tasks/:id/diff-stats`
- Useful for: diagnosing stuck tasks, spotting empty handoffs, verifying implementation before move-to-done

## Related

- #0189 (Architect agent with zero commits prompted this request)
- #0075 (Move-to-done needs better visibility into task state)

## Activity

- 2026-08-14T08:59:00Z · created · user
- 2026-08-14T10:32:43Z · status inbox→ready
- 2026-08-14T10:57:30Z · status ready→active, branch
- 2026-08-14T11:07:34Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been emitted on its own line — the agent's final line must be exactly `::repoos-handoff-ready::` (see #0154/#0155 for signal-line rendering bugs)
- 2026-08-14T11:54:52Z · status review→ready
- 2026-08-14T11:54:58Z · status ready→active
- 2026-08-14T12:45:12Z · status active→ready
