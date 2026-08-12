---
id: "0128"
title: Place task panel actions and preview controls above tabs
type: feature
status: active
priority: p2
area: ui
assigned_to: ai
created_by: ""
branch: feat/place-task-panel-actions-and-preview-con
created_at: "2026-08-12T07:23:05Z"
updated_at: "2026-08-12T09:17:02Z"
---
## Problem

The task detail panel puts its status-transition controls (the "Move to" status
Select and contextual action button, such as "Move to ready", "Start work",
"Pause work", or "Move to done") inside the tabbed content area. As a result,
the controls disappear whenever the user views a tab other than the one that
contains them, forcing users to switch tabs before they can change a task's
status. The controls also consume three vertical lines: a "Move to" label, the
Select, and the action button.

Preview controls are similarly embedded in tab content and vertically stacked:
a "Preview" label, the managed-preview URL, and its start or stop action. The
preview URL and controls should remain available regardless of the selected tab
without taking three lines of panel space.

## Desired UX

Show a compact status-transition row directly below the task title and above
the tab list. The row contains the current-status Select followed by the
contextual action button, with no separate "Move to" label and no vertical
stacking. When preview controls apply, show a second compact row directly below
the status row: the managed-preview URL/link followed by the applicable preview
action (for example, start or stop), with no standalone "Preview" label. Both
rows must remain visible and usable regardless of the selected tab, while the
existing tabs and their content continue to work as before. Preserve the
current status-specific and preview lifecycle behavior.

## Acceptance criteria

- [ ] The task panel renders the status Select followed by any status-specific
  transition action button between the task title and the tab list, with no
  separate "Move to" label.
- [ ] The Select and action button occupy one horizontal row rather than three
  vertically stacked lines. The Select displays the task's current status and
  remains the control for selecting a destination status.
- [ ] When preview controls are available for the task, the managed-preview
  URL/link and the applicable preview action are rendered directly below the
  status row and above the tab list, with no standalone "Preview" label.
- [ ] The preview URL/link and preview action occupy one horizontal row rather
  than vertically stacked lines. The URL remains usable to open the managed
  preview, and the action remains usable to start or stop it as appropriate.
- [ ] These controls remain visible and interactive when every task-panel tab
  is selected, including the Agent tab and any tabs that do not previously
  show the controls.
- [ ] The controls retain their current status-specific behavior, labels,
  enabled/disabled states, confirmation flow, and calls to the status-change
  path. This includes inbox → ready, ready → active, active → ready, and
  review → done where applicable.
- [ ] Changing status through either the Select or contextual button updates
  the displayed task and continues to work without requiring a tab switch.
- [ ] Starting, stopping, and opening a preview continue to use the existing
  preview lifecycle and error handling, and work without requiring a tab
  switch.
- [ ] The tab list remains directly below the action area, retains the current
  active-tab behavior, and no tab content is duplicated, hidden, or reordered
  unintentionally.
- [ ] The compact control row remains usable at the task panel's narrow/mobile
  width without wrapping to three stacked lines or overlapping the title, tabs,
  or panel-close control; the same is true of the preview row when present.

## Notes for AI

- Primary file: `src/ui-app/src/components/TaskDrawer.vue`. Locate the current
  tab layout and the status-transition controls before moving their containing
  markup; preserve the existing event handlers and conditionals rather than
  duplicating controls in multiple tabs.
- Replace the separate "Move to" label and vertically stacked field wrappers
  with one responsive horizontal control row: current-status Select first,
  contextual action button second.
- Move the existing preview URL/link and start/stop controls out of their tab
  content into a second responsive horizontal row: URL/link first, preview
  action second. Do not duplicate preview controls or alter managed-preview
  creation, teardown, URL, or error behavior.
- Keep task content, activity, Agent/chat, review, and other tab-specific
  sections inside their respective tab panels. Only move the shared
  status-transition and preview control areas.
- Do not change task lifecycle rules, permitted status transitions, board-card
  actions, or the task-panel tab set as part of this layout change.
- Follow the existing component styling and responsive conventions. Rebuild the
  UI and use RepoOS's managed preview to confirm the panel works on more than
  one selected tab.

## Activity

- 2026-08-12T07:23:05Z · created · unknown
- 2026-08-12T07:23:08Z · status inbox→ready
- 2026-08-12T09:17:02Z · status ready→active, branch
