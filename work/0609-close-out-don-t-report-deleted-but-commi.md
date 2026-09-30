---
id: "0609"
title: "Close-out: don't report deleted-but-committed files as uncommitted work"
type: feature
status: inbox
priority: p2
area: core
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-09-30T16:35:40Z"
updated_at: "2026-09-30T16:35:40Z"
---
Observed on #0602 (2026-10-01, machine under heavy load): close-out's non-forced `removeWorktree` apparently started deleting the feature worktree and stopped partway. `uncommittedWorkFiles` (src/core/git.ts, called from `cleanup` in src/server/integration-orchestrator.ts) then reported ~100 tracked-but-deleted files (` D`) as 'uncommitted files the merge did not carry', raising a `closeout-worktree-dirty` needs-input even though the branch was fully merged and nothing was lost.

Do: (1) make close-out distinguish deleted-but-committed files (content identical to branch HEAD) from real edits/untracked files; (2) when the branch is an ancestor of main and only such deletions remain, retry or force the removal instead of raising needs-input; (3) add a test reproducing a half-removed worktree. Note: a hotfix already added a 'Clear worktree' button (POST /api/tasks/:id/clear-worktree) for manual recovery.

## Activity

- 2026-09-30T16:35:40Z · created · unknown
