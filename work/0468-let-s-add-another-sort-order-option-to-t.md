---
id: "0468"
title: Add task number sort options to work page
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/add-task-number-sort-options-to-work-pag
cli_override: github copilot
model_override: default
pm_cli_override: github copilot
created_at: "2026-09-21T11:33:55Z"
updated_at: "2026-09-21T11:53:10Z"
---
## Problem

The work page currently does not offer a sort order based on task number. Users need a way to sort tasks by task number in both directions: newest first and oldest first. Without this option, task ordering is limited and it is harder to quickly find the most recent or oldest tasks by their numeric identifier.

## Desired UX

The work page should include new sort options alongside the existing sorting choices. Users should be able to sort by:

- Task number newest
- Task number oldest

The "newest" option should place the highest task number first, while the "oldest" option should place the lowest task number first. The new options should be visible and usable from the work page’s sorting controls in a way that matches the existing sorting experience.

## Acceptance criteria

- [ ] The work page exposes a sort option for task number newest.
- [ ] The work page exposes a sort option for task number oldest.
- [ ] Selecting task number newest orders tasks from highest task number to lowest task number.
- [ ] Selecting task number oldest orders tasks from lowest task number to highest task number.
- [ ] The new sort options work in the work page’s normal task list rendering.
- [ ] The addition is limited to the work page sort functionality described in this task.

## Notes for AI

- Assumption: "task number" refers to the numeric task identifier shown in the work page listing.
- Keep the change focused on the work page sorting logic and UI; do not broaden the task into unrelated list or board behavior.
- Prefer a minimal, consistent addition to the existing sort selector rather than introducing a separate or custom sorting flow.
- Preserve current behavior for all existing sort options unless the task explicitly requires otherwise.
- If the codebase sorts by string values today, verify whether task numbers should be compared numerically rather than lexicographically.

## Scope

This task covers:
- adding task number newest and task number oldest to the work page sort menu
- implementing the underlying sorting behavior for both options
- verifying the updated ordering appears correctly in the work page list

This task does not cover:
- redesigning the work page layout or sorting UI beyond adding these options
- adding unrelated sort orders or filtering improvements
- changing task numbering itself

## Related

- None specified

## Original prompt

Let's add another sort order option to the work page: order by task number newest and task number oldest

## Activity

- 2026-09-21T11:33:55Z · created · hello@repoos.org
- 2026-09-21T11:35:32Z · status draft→inbox, title, area, body
- 2026-09-21T11:53:00Z · cli_override, model_override
- 2026-09-21T11:53:01Z · cli_override
- 2026-09-21T11:53:05Z · status inbox→ready
- 2026-09-21T11:53:10Z · status ready→active, branch
