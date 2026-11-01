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
updated_at: "2026-11-01T15:54:14Z"
---
## Problem

After RepoOS GC, multiple worktrees remain because their task records are marked done while branches have commits not in main or uncommitted task-file changes. An archived, superseded task (#0652) also retains a worktree because its status is still ready. These records keep the advisory worktree count above its ceiling and make it unclear whether work is missing from main or only stale local state remains.

## Desired UX

Give each retained worktree a clear disposition based on live task status, branch contents, and working-tree changes. Preserve any source change not proven to be present in main. Reconcile task state and remove a worktree only through RepoOS's guarded lifecycle after proving its contents are safe to discard.

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
