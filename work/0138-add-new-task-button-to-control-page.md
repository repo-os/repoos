---
title: Add New task button to the Control page
type: feature
priority: p2
area: web
assigned_to: ai
---

## Problem

The "New task" button currently lives only on the Work page (`/work`). The Control page (`/`) is the default landing page — it is the first thing a user sees when they open RepoOS. If a user arrives with the intent to create a task, they must first navigate away from Control (either by clicking into the Work view via the sidebar, or by clicking one of the stat cards) just to find the New task button. That extra navigation step is friction, and the user may lose track of why they opened RepoOS in the first place.

## Desired UX

A "New task" button sits in the upper right corner of the Control page, placed in the same visual position as the one on the Work page. It is identical in appearance (accent-styled `Button` with a plus icon and the label "New task") and in behavior: clicking it calls `ui.openNewTask()`, which opens the TaskDrawer in new-task mode. The user does not navigate away from the Control page; the drawer overlays on top, exactly as it does on the Work page.

## Acceptance criteria

- [ ] A "New task" button (accent variant, plus icon, label "New task") appears in the upper right corner of the Control page header, aligned with the page title "Mission Control".
- [ ] Clicking the button calls `ui.openNewTask()` and opens the TaskDrawer in new-task creation mode, with no route navigation.
- [ ] The button is visually identical to the existing one in `WorkView.vue` — same `Button` component, same variant, same icon, same label.
- [ ] On narrow/mobile viewports the button does not break layout; it either wraps below the title or stacks appropriately.
- [ ] The existing Control page content (title, description, stat grid, panels) is unchanged.
- [ ] `repoos check` passes.

## Notes for AI

- **Reuse, don't reimplement**: the button in `src/ui-app/src/views/WorkView.vue` (lines 72–82) is the canonical implementation. Copy the exact same `<Button>` markup into `src/ui-app/src/views/DashboardView.vue`.
- **Imports needed**: add `import { Button } from "../components/ui/button.vue"` and `import { useUiStore } from "../stores/ui"` to the DashboardView script block (if not already present).
- **Layout**: the current DashboardView header is a bare `<div>` with `page-title` and `page-desc`. Wrap these in a flex row so the title+desc sit on the left and the button on the right. Keep the existing class names; add a new wrapper with `display: flex; justify-content: space-between; align-items: center` (or use a utility class if one exists). Do not introduce a new CSS file — use a `<style scoped>` block if needed, or style inline.
- **Do not** add the button to a separate header component. This is a small, self-contained addition to `DashboardView.vue`.
- **Do not** change the TaskDrawer, the UI store, or the Work page.

## Scope

- **In scope**: adding the "New task" button to the DashboardView header only.
- **Deferred**: any other buttons or actions on the Control page.
