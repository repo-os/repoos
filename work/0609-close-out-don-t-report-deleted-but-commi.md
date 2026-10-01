---
id: "0609"
title: "Close-out: don't report deleted-but-committed files as uncommitted work"
type: feature
status: review
needs_input: true
needs_input_reason: dev-error
needs_input_detail: "Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh"
priority: p2
area: core
assigned_to: ai
created_by: ""
branch: feat/close-out-don-t-report-deleted-but-commi
cli_override: cursor
model_override: composer-2.5
review_model_override: opencode-go/longcat-2.5-preview-free
created_at: "2026-09-30T16:35:40Z"
updated_at: "2026-10-01T08:05:23Z"
review_rounds: 1
review_passes: 1
last_check_failure: "repoos check at 2026-10-01T07:21:44.176Z: server-side finalization timed out (deadline exceeded)"
dev_error_count: 1
---
Observed on #0602 (2026-10-01, machine under heavy load): close-out's non-forced `removeWorktree` apparently started deleting the feature worktree and stopped partway. `uncommittedWorkFiles` (src/core/git.ts, called from `cleanup` in src/server/integration-orchestrator.ts) then reported ~100 tracked-but-deleted files (` D`) as 'uncommitted files the merge did not carry', raising a `closeout-worktree-dirty` needs-input even though the branch was fully merged and nothing was lost.

Do: (1) make close-out distinguish deleted-but-committed files (content identical to branch HEAD) from real edits/untracked files; (2) when the branch is an ancestor of main and only such deletions remain, retry or force the removal instead of raising needs-input; (3) add a test reproducing a half-removed worktree. Note: a hotfix already added a 'Clear worktree' button (POST /api/tasks/:id/clear-worktree) for manual recovery.

## Activity

- 2026-09-30T16:35:40Z · created · unknown
- 2026-10-01T06:56:32Z · cli_override, model_override
- 2026-10-01T06:56:33Z · model_override
- 2026-10-01T06:57:10Z · review_model_override
- 2026-10-01T06:57:11Z · status inbox→ready
- 2026-10-01T06:57:12Z · status ready→active, branch
- 2026-10-01T07:21:46Z · agent exited with an error (cursor) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-10-01T07:35:12Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-01T07:44:46Z · status active→review
- 2026-10-01T07:44:46Z · note: shots: skipped — the diff (4 changed paths) touches no [[preview.paths]] globs — no UI change to capture
- 2026-10-01T07:49:07Z · status review→active
- 2026-10-01T08:05:23Z · status active→review
