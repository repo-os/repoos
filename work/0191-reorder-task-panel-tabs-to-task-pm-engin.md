---
id: "0191"
title: "Reorder task panel tabs to Task, PM, Engineer, Reviewer"
type: feature
status: done
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/reorder-task-panel-tabs-to-task-pm-engin
created_at: "2026-08-14T08:35:22Z"
updated_at: "2026-08-14T09:02:00Z"
---
## Problem

The task panel tabs are not ordered and named according to the desired workflow structure. Reorganizing them will improve the user experience by presenting roles in a logical sequence.

## Desired UX

The task panel tabs should display in the following order and with these names:
1. Task
2. PM
3. Engineer
4. Reviewer

## Acceptance criteria

- [x] Task panel tabs are reordered to: Task, PM, Engineer, Reviewer
- [x] Tab names match the specified labels exactly
- [x] Tab ordering persists across page reloads
- [x] No functionality or data is lost in the reorganization

## Notes for AI

- Locate the task panel component implementation and identify where tabs are currently defined
- Determine current tab names/order to understand what changes are needed
- Ensure the reordering does not break any tab navigation or state management
- Test all tabs to confirm they remain functional after reordering

## Activity

- 2026-08-14T08:35:22Z · created · unknown
- 2026-08-14T08:35:53Z · status inbox→ready
- 2026-08-14T08:36:22Z · status ready→active, branch
- 2026-08-14T08:42:58Z · status active→review
- 2026-08-14T09:02:00Z · status review→done
- 2026-08-14T08:42:58Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been emitted on its own line — the agent's final line must be exactly `::repoos-handoff-ready::` (see #0154/#0155 for signal-line rendering bugs)
- 2026-08-14T10:15:00Z · implementation completed · reordered tabs in TaskDrawer.vue (Task, PM, Engineer, Reviewer) and committed to main
