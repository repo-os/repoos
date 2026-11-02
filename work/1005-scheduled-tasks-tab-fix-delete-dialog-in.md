---
id: 1005
title: "Scheduled tasks tab: fix delete dialog interactions and compact cards"
type: bug
status: review
priority: p1
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/scheduled-tasks-tab-fix-delete-dialog-in
cli_override: github copilot
review_cli_override: opencode
review_model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-11-01T16:13:02Z"
updated_at: "2026-11-02T16:50:44Z"
---
## Problem

On Agents → Scheduled Tasks, the Delete schedule confirmation appears, but its Cancel and Delete schedule buttons do not respond to pointer clicks and show no hover/click affordance. Nick reports similar behavior in other modals, suggesting a shared dialog or overlay interaction issue. Scheduled-task cards also stack all details and actions vertically, leaving excessive empty space and making the page unnecessarily tall.

## Desired UX

Make the delete confirmation and other affected shared dialogs reliably interactive with visible hover and focus states. Fix the common dialog/overlay cause where possible, not only this instance. Lay out schedule details horizontally and place the action buttons in a right-aligned column, following the Dev page's card layout. Keep the cards readable on narrow screens by stacking or wrapping responsively.

## Acceptance criteria

- Test: pointer clicks on Cancel close the delete dialog without deleting the schedule; clicking Delete schedule removes the selected schedule and closes the dialog.
- Test: hover and keyboard focus states are visible on both dialog actions.
- Test: exercise the shared dialog interaction path in another representative modal and fix the common cause if the same failure reproduces.
- Test: schedule cards present their details in a compact horizontal layout with actions aligned at the right on wide screens, without excessive vertical whitespace.
- Test: the card layout remains readable and the action buttons remain usable at narrow viewport widths.
- Keep schedule enable, edit, run-now, and delete behavior intact.

## Notes for AI

Inspect the shared Dialog, overlay, and portal interaction rules (including `data-overlay-layer` and pointer-event handling) before adding a schedule-specific workaround. Use the project's designed dialog components; do not replace them with native browser dialogs. The attached Dev page is a layout reference. The screenshots show current behavior and should be attached to review evidence. After UI changes, rebuild the UI and declare reviewer screenshots.

## Shots
```json
[
{
"label": "Scheduled task cards use a compact horizontal layout",
"target": "default",
"route": "/agents?tab=scheduled",
"highlight": ".schedule-card"
},
{
"label": "Delete schedule dialog with working actions",
"target": "default",
"route": "/agents?tab=scheduled",
"highlight": "[role=\"dialog\"]",
"steps": [
{
"click": "[data-testid^=\"schedule-card-\"] .schedule-actions button:last-child"
}
]
}
]
```

## Screenshots

![Screenshot-2026-11-02-at-00.07.14](/api/tasks/1005/attachments/att_5cbde5b5-45a3-4683-8b65-4702cfcf7d74.png)
![Screenshot-2026-11-02-at-00.08.05](/api/tasks/1005/attachments/att_f0a1cede-8a97-4647-9063-81f3d1c66471.png)
![Screenshot-2026-11-02-at-00.11.19](/api/tasks/1005/attachments/att_70cbe84e-7d18-4608-8570-434426e9596d.png)

## Activity

- 2026-11-01T16:13:02Z · created · njachowski@gmail.com
- 2026-11-01T16:13:04Z · screenshots
- 2026-11-02T04:30:30Z · status inbox→ready
- 2026-11-02T13:27:50Z · cli_override
- 2026-11-02T13:27:55Z · review_cli_override
- 2026-11-02T13:27:57Z · review_model_override
- 2026-11-02T15:17:26Z · review_cli_override, review_model_override
- 2026-11-02T15:17:28Z · review_model_override
- 2026-11-02T15:17:34Z · status ready→active, branch
- 2026-11-02T16:50:44Z · status active→review
