---
id: 1004
title: Make retained worktree cleanup safe and actionable
type: chore
status: inbox
priority: p2
area: [core, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-11-01T15:50:52Z"
updated_at: "2026-11-01T15:54:16Z"
---
## Problem
The 2026-11-01 cleanup found 48 registered worktrees: 28 were clean feature worktrees whose branches were already merged into main, and 16 were protected. Running `repoos gc --yes` removed the safe candidates; the current count is 21 with zero remaining cleanup candidates and 16 protected worktrees.

The protected set revealed several different cases: 12 tasks marked done (six with commits not in main; six with uncommitted changes limited to work/*.md, while #0664 also has uncommitted repository files); #0652 is archived but still has ready status; #0794 is human-assigned and ready; #1000 and #1001 are active. Four additional registered worktrees are outside RepoOS's managed task-worktree directory (three Codex worktrees and /private/tmp/pre-merge-0960).

The current warning gives one total and suggests `repoos gc`, but does not make clear which entries are safe to remove, why others are retained, or that normal maintenance only collects integration candidates.

## Desired UX
Make cleanup run automatically for worktrees that RepoOS can prove are safe to remove, and explain retained worktrees by reason. Derive fail-closed rules for completed, archived, missing, dirty, and unmerged task branches. Keep active or human-owned work protected; preserve any source or task data that is not proven redundant with the canonical main checkout. Make dry-run output and the worktree warning distinguish safe cleanup candidates from protected entries and worktrees outside RepoOS's control.


## Acceptance criteria

- Audit all retained worktrees for tasks marked done or archived and record each branch's ahead commits, source diff from main, and uncommitted paths.
- For each task marked done, verify its intended source changes are represented in main; if not, preserve and route the work through an authorized RepoOS review/close-out path.
- For task-file-only dirty changes, compare with canonical main copies and clear them only through a reviewed, RepoOS-compatible operation; never discard source edits or other task data.
- Confirm archived tasks are handled intentionally by GC without deleting unmerged work.
- Add tests for the selected GC behavior, including archived-but-unmerged and done-but-dirty cases.
- After reconciliation, `repoos gc --dry-run` lists no candidates among the audited done/archived worktrees, and the task records accurately describe their delivery state.
- Do not change or clean active tasks #1000/#1001 or human-assigned #0794 as part of this audit.

## Notes for AI

Use `repoos gc --dry-run` and RepoOS status as evidence, not as permission to delete. Never force-remove a worktree or branch whose source contents are not proven safe. Use RepoOS commands for task status changes and close-out; do not hand-edit `work/*.md`.

## Activity

- 2026-11-01T15:50:52Z · created · njachowski@gmail.com
- 2026-11-01T15:54:14Z · title
- 2026-11-01T15:54:15Z · body: Problem (added 3, removed 1)
- 2026-11-01T15:54:16Z · body: Desired UX (added 1, removed 1)
