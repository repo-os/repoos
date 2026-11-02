---
id: 1005
title: "Scheduled tasks tab: fix delete dialog interactions and compact cards"
type: bug
status: active
priority: p1
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/scheduled-tasks-tab-fix-delete-dialog-in
cli_override: github copilot
review_cli_override: opencode
review_model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-11-01T16:13:02Z"
updated_at: "2026-11-02T17:59:41Z"
review_rounds: 1
review_passes: 1
last_check_failure: "repoos check at 2026-11-02T16:24:55.241Z: repoos check failed: ui verification failed (2 issue(s)): [missing-target] Delete schedule dialog with working actions (target \"default\"): click [data-testid^=\"schedule-card-\"] .schedule-actions button:last-child: click: Error: strict mode violation: locator('[data-testid^=\"schedule-card-\"] .schedule-actions button:last-child') resolved to 8 elements: on /agents?tab=scheduled (http://127.0.0.1:51188/agents?tab=scheduled); [missing-target] Delete schedule dialog with working actions (target \"defa… (truncated)"
dev_error_count: 1
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
"label": "Compact schedule card after Cancel closes the dialog",
"target": "default",
"route": "/agents?tab=scheduled",
"highlight": ".schedule-list > .schedule-card:first-child",
"steps": [
{
"click": ".schedule-list > .schedule-card:first-child .schedule-actions button:last-child"
},
{
"click": ".delete-confirm-actions button:first-child"
}
]
},
{
"label": "Delete dialog with Cancel hover state",
"target": "default",
"route": "/agents?tab=scheduled",
"highlight": "[role=\"dialog\"]",
"steps": [
{
"click": ".schedule-list > .schedule-card:first-child .schedule-actions button:last-child"
},
{
"hover": ".delete-confirm-actions button:first-child"
}
]
},
{
"label": "Delete dialog with confirm hover state",
"target": "default",
"route": "/agents?tab=scheduled",
"highlight": "[role=\"dialog\"]",
"steps": [
{
"click": ".schedule-list > .schedule-card:first-child .schedule-actions button:last-child"
},
{
"hover": ".delete-confirm-actions button:last-child"
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
- 2026-11-02T15:24:12Z · note: adopted orphaned engineer pid 41998
- 2026-11-02T15:34:09Z · message_queued at 2026-11-02T15:34:09.865Z
- 2026-11-02T15:34:10Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-02T15:39:09Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-02T15:41:06Z · note: adopted orphaned engineer pid 41998
- 2026-11-02T15:42:01Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-02T15:45:12Z · body
- 2026-11-02T15:48:05Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-02T15:48:05Z · agent exited with an error (copilot) · ✗ handoff deferred — read the queued message(s) first, then request review again
- 2026-11-02T15:48:05Z · engineer crash recovery: resuming github copilot + default (1/3 crashes in 30m) · ✗ handoff deferred — read the queued message(s) first, then request review again
- 2026-11-02T15:48:08Z · needs_input
- 2026-11-02T15:48:09Z · message_delivered: 1 message(s)
- 2026-11-02T16:04:03Z · body
- 2026-11-02T16:24:51Z · note: ui verification failed (2 issue(s)): [missing-target] Delete schedule dialog with working actions (target "default"): click [data-testid^="schedule-card-"] .schedule-actions button:last-child: click: Error: strict mode violation: locator('[data-testid^="schedule-card-"] .schedule-actions button:last-child') resolved to 8 elements: on /agents?tab=scheduled (http://127.0.0.1:51188/agents?tab=scheduled); [missing-target] Delete schedule dialog with working actions (target "default"): highlight [rol
- 2026-11-02T16:25:49Z · body
- 2026-11-02T16:32:55Z · body
- 2026-11-02T16:50:44Z · status active→review
- 2026-11-02T16:57:38Z · note: review pass 1: needs some work
- 2026-11-02T16:57:39Z · status review→active
- 2026-11-02T16:57:41Z · CTO nudge: held — remote validation is running
- 2026-11-02T17:06:52Z · body
- 2026-11-02T17:16:53Z · body
- 2026-11-02T17:54:40Z · handoff failed · handoff recovery attempted · finalization failed
- 2026-11-02T17:59:41Z · watchdog: auto-surfaced stuck task · status active→review · handoff recovery was attempted after an interrupted turn but finalization failed — manual intervention needed · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-11-02T17:59:41Z · note: handoff requested (cli)
