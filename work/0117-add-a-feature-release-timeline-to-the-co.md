---
id: "0117"
title: Add a feature release timeline to the control page
type: feature
status: active
priority: p2
area: ui
assigned_to: ai
created_by: ""
branch: feat/add-a-feature-release-timeline-to-the-co
created_at: "2026-08-12T04:22:25Z"
updated_at: "2026-08-12T05:54:15Z"
---
## Problem

The control page does not show a history of released features. When a completed task's git worktree is successfully merged into `main`, users need a concise way to see that release and access the underlying task for more information.

## Desired UX

The control page includes a short, easy-to-read feature releases timeline. Each successful merge of a completed task's git worktree into `main` adds one timeline entry. Every entry links to its task for full details.

## Acceptance criteria

- [ ] The control page displays a feature releases timeline.
- [ ] A timeline entry is added when a completed task's git worktree is successfully merged into `main`.
- [ ] Failed or incomplete merges do not add a timeline entry.
- [ ] Each entry is concise and easy to scan.
- [ ] Each entry links to the corresponding task.
- [ ] The timeline persists across control page reloads.

## Notes for AI

- Use the existing task-completion and successful worktree-merge flow as the trigger for creating an entry.
- Derive the short entry text from existing task information; do not introduce a separate release-description workflow.
- Assume the timeline should appear in the control page's existing UI and use the repository's existing persisted data mechanisms.
- Avoid treating tasks as released before their worktree has been successfully merged into `main`.

## Scope

This task covers recording and displaying task-backed feature releases on the control page. Dedicated release authoring, editing, or broader release-management features are deferred.

## Activity

- 2026-08-12T04:22:25Z · created · unknown
- 2026-08-12T04:53:23Z · status inbox→ready
- 2026-08-12T05:54:15Z · status ready→active, branch
