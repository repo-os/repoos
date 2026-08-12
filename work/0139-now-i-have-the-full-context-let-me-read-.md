---
id: "0139"
title: "feature: add new task button to control page"
type: feature
status: ready
priority: p2
area: web
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-08-12T12:09:39Z"
updated_at: "2026-08-13T00:00:00Z"
---

## Description

The "New task" button currently exists only on the Work page (`/work`). Since the Control page (`/`) is the default landing page and the first thing users see when opening RepoOS, users who want to create a task must navigate away from Control to find the button. This adds unnecessary friction to the task creation workflow.

## Problem Statement

Users landing on the Control page (the default home page) who want to create a new task must:
1. Navigate away from Control (either via sidebar or stat cards)
2. Find their way to the Work page
3. Then locate and click the "New task" button

This extra navigation step creates friction and may cause users to lose focus on their intent.

## Solution

Add an identical "New task" button to the upper right corner of the Control page header, with the same appearance and behavior as the existing one on the Work page.

## Desired UX

- Button placement: upper right corner of the Control page header
- Button styling: accent-styled `Button` component with a plus icon and label "New task"
- Behavior: clicking the button calls `ui.openNewTask()` to open the TaskDrawer in new-task creation mode
- Navigation: the drawer overlays on top of the Control page—no route navigation occurs
- The button is visually identical to the existing one in `WorkView.vue`

## Acceptance Criteria

- [ ] A "New task" button (accent variant, plus icon, label "New task") appears in the upper right corner of the Control page header
- [ ] Button is aligned with the page title "Mission Control"
- [ ] Clicking the button calls `ui.openNewTask()` and opens the TaskDrawer in new-task creation mode
- [ ] Button is visually identical to the existing one in `WorkView.vue` (same `Button` component, variant, icon, and label)
- [ ] On narrow/mobile viewports the button does not break layout (wraps or stacks appropriately)
- [ ] The existing Control page content (title, description, stat grid, panels) remains unchanged
- [ ] `repoos check` passes

## Implementation Notes

- **Reuse existing button**: copy the exact button markup from `src/ui-app/src/views/WorkView.vue` (lines 72–82)
- **Required imports**: add `import { Button } from "../components/ui/button.vue"` and `import { useUiStore } from "../stores/ui"` to DashboardView script block (if not already present)
- **Layout**: wrap the title and description in a flex row so title+desc sit left and button sits right. Use `display: flex; justify-content: space-between; align-items: center` (or appropriate utility class)
- **CSS**: use `<style scoped>` block if needed; do not introduce a new CSS file
- **Do not**: modify TaskDrawer, UI store, Work page, or create a separate header component

## Scope

- **In scope**: adding the "New task" button to the DashboardView header only
- **Out of scope**: other buttons or actions on the Control page

## Activity

- 2026-08-12T12:09:39Z · created · unknown
- 2026-08-13T00:00:00Z · fleshed out and moved to ready
