---
id: "0711"
title: "Close-out must record merged_commit even when the branch is deleted, so dependents are not blocked as cancelled"
type: bug
status: active
priority: p1
area: server
assigned_to: ai
created_by: ""
branch: feat/close-out-must-record-merged-commit-even
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-06T09:14:46Z"
updated_at: "2026-10-06T23:56:47Z"
---
Field report from tuk-private (RepoOS v0.5.66). Source rows in tuk-private/repoos/docs/repoos-feedback.md. Row 22: tasks closed out do not get merged_commit recorded when the branch is deleted; dependencyMergeState (src/core/task-dependencies.ts) then reports dependents as cancelled.

## Activity

- 2026-10-06T09:14:46Z · created · unknown
- 2026-10-06T09:14:47Z · needs_input
- 2026-10-06T23:52:11Z · cli_override, model_override
- 2026-10-06T23:52:14Z · status inbox→ready
- 2026-10-06T23:52:15Z · status ready→active, needs_input, branch
- 2026-10-06T23:55:25Z · body
- 2026-10-06T23:56:47Z · body
