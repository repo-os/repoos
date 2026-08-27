---
id: "0308"
title: Only surface actionable worktree states in the UI
type: feature
status: ready
priority: p2
area: ui
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-27T05:30:22Z"
updated_at: "2026-08-27T10:17:16Z"
---
## Problem

Task cards currently surface a dirty badge when a linked worktree has uncommitted files or a branch has commits ahead of main. This is an internal Git state, not necessarily a blocker, and it creates unnecessary noise. Worktree changes may be committed or resolved later by the task workflow.

## Desired outcome

Do not show passive dirty-state indicators on task cards or ordinary task views. Surface worktree state only when a concrete operation is blocked or a human decision is required, with clear user-facing language.

## Acceptance criteria

- [ ] Remove the passive dirty badge from task cards and ordinary task-list views.
- [ ] Do not label uncommitted worktree files as dirty in user-facing task UI.
- [ ] Do not label a branch being ahead of main as dirty in user-facing task UI.
- [ ] Preserve internal Git state detection for safe restart, handoff, review, and close-out logic.
- [ ] When an action genuinely requires a human decision or is blocked, show an actionable message explaining the exact issue and next step.
- [ ] Keep the main-checkout close-out guard visible when uncommitted main files actually block merging.
- [ ] Ensure tasks without a branch or worktree never receive a stale dirty indicator.
- [ ] Add or update UI tests for passive task cards, restart decisions, close-out blocking, and branchless tasks.
- [ ] Verify the full repoos check passes.

## Notes

Use user-facing terms such as changes, resume available, or main checkout needs attention only when they describe an actionable state. Reserve dirty for internal implementation and diagnostics. Related confusion was observed on task 0306.

## Activity

- 2026-08-27T05:30:22Z · created · unknown
- 2026-08-27T10:17:16Z · status inbox→ready
