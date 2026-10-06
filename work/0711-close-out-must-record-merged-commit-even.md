---
id: "0711"
title: "Close-out must record merged_commit even when the branch is deleted, so dependents are not blocked as cancelled"
type: bug
status: inbox
needs_input: true
needs_input_reason: underspecified
needs_input_detail: "missing sections: Problem, Acceptance criteria, Notes for AI; body under 400 characters (excluding original prompt)"
priority: p1
area: server
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-10-06T09:14:46Z"
updated_at: "2026-10-06T09:14:47Z"
---
Field report from tuk-private (RepoOS v0.5.66). Source rows in tuk-private/repoos/docs/repoos-feedback.md. Row 22: tasks closed out do not get merged_commit recorded when the branch is deleted; dependencyMergeState (src/core/task-dependencies.ts) then reports dependents as cancelled.

## Activity

- 2026-10-06T09:14:46Z · created · unknown
- 2026-10-06T09:14:47Z · needs_input
