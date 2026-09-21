---
id: "0480"
title: Add opt-in Stories page for cross-area delivery tracking
type: feature
status: active
needs_input: true
needs_input_reason: dev-error
needs_input_detail: "• If the problem persists, retry later or contact support with the Request ID above"
priority: p2
area: web + core
assigned_to: ai
created_by: ""
branch: feat/add-opt-in-stories-page-for-cross-area-d
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-09-21T12:19:02Z"
updated_at: "2026-09-21T13:18:18Z"
dev_error_count: 3
---
## Problem

Tasks can share a customer-visible outcome while belonging to different technical areas and owners. For example, the RepoOS project-updates email list spans Neon infrastructure, the landing site, and a human-operated launch checklist. Areas describe where work lands; they cannot show whether the whole outcome is ready.

## Desired UX

When Stories is explicitly enabled for a repository, a new Stories page appears in the primary navigation between Work and Checks. It groups tagged tasks into named delivery slices and makes their collective state legible at a glance. A story is optional task metadata, not a second task system: it has no worktree, agent, branch, independent status, or hierarchy.

## Configuration and data model

- Add a documented `[stories]` configuration block with `enabled = false` by default. Missing, malformed, or false configuration must preserve current behavior exactly.
- Add an optional `story` field to task frontmatter, the task model/index, task API serialization and task mutation paths. Normalize whitespace and match story names case-insensitively for grouping while retaining a stable display name.
- Support setting, changing, and clearing a story through the existing task create/edit APIs and CLI. In the task drawer, use the standard styled control: offer existing story names and permit a deliberate new name; do not use a native select.

## Stories page

- [ ] Add a `/stories` route and show its navigation item only when `stories.enabled` is true, placed exactly between Work and Checks.
- [ ] Group every tagged task by story; untagged tasks do not appear. Do not create separate story files or a parallel persistence store.
- [ ] Each story card shows: title, total task count, done/total progress, per-status counts, currently active/review tasks, tasks awaiting human input or blocked/error states when available, and most recent activity.
- [ ] Order stories with attention-needed/active work first, then by recent activity; completed stories remain visible but visually quiet.
- [ ] Expanding or opening a story reveals its member tasks with the same status cues and opens the normal task drawer on selection. Include useful empty states for no tagged tasks and no stories.
- [ ] A story is derived as complete only when all of its tasks are done. Do not add a manual completion control.

## Compatibility and verification

- [ ] With Stories disabled, there is no nav item, route entry point, task-edit control, extra API work, or visual regression in existing boards.
- [ ] Existing task files without `story` parse unchanged; unknown/legacy frontmatter remains preserved.
- [ ] SSE/index updates immediately refresh story roll-ups when a task is retagged or changes status.
- [ ] Add parser/config/API/unit tests plus UI tests for the disabled gate, nav position, grouping, status roll-up, ordering, retagging, and mobile layout. Run `repoos check`.
- [ ] Document Stories configuration and the distinction between a story and an area in user documentation.

## Non-goals

No nested stories/epics, standalone story tickets, story-specific agents or worktrees, manual story statuses, cross-repository aggregation, or campaign/project-management features. This is a deliberately small, derived planning layer over existing tasks.

## Seed example

After implementation, the project-updates email-list tasks (#0477, #0478, #0479) should be taggable as one story, demonstrating a cross-area outcome without changing their individual areas.

## Activity

- 2026-09-21T12:19:02Z · created · unknown
- 2026-09-21T12:22:42Z · status inbox→ready
- 2026-09-21T12:22:46Z · status ready→active, branch
- 2026-09-21T12:23:37Z · agent exited with an error (copilot) · • If the problem persists, retry later or contact support with the Request ID above
- 2026-09-21T12:33:28Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-09-21T13:14:57Z · needs_input
- 2026-09-21T13:16:55Z · agent exited with an error (copilot) · • If the problem persists, retry later or contact support with the Request ID above
- 2026-09-21T13:18:15Z · cli_override
- 2026-09-21T13:18:18Z · model_override
