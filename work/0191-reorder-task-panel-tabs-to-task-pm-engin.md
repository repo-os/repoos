---
id: "0191"
title: "Reorder task panel tabs to Task, PM, Engineer, Reviewer"
type: feature
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-14T08:35:22Z"
updated_at: "2026-08-14T08:35:22Z"
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

- [ ] Task panel tabs are reordered to: Task, PM, Engineer, Reviewer
- [ ] Tab names match the specified labels exactly
- [ ] Tab ordering persists across page reloads
- [ ] No functionality or data is lost in the reorganization

## Notes for AI

- Locate the task panel component implementation and identify where tabs are currently defined
- Determine current tab names/order to understand what changes are needed
- Ensure the reordering does not break any tab navigation or state management
- Test all tabs to confirm they remain functional after reordering

## Activity

- 2026-08-14T08:35:22Z · created · unknown
