---
id: "1285"
title: "Task details modal: edits must save when the modal closes"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/task-details-modal-edits-must-save-when-
cli_override: claude code
model_override: haiku
created_at: "2026-11-22T18:21:14Z"
updated_at: "2026-11-22T19:03:19Z"
---
## Problem
#1282 moved Type, Priority, Area, Story/Assigned to and Depends on into a modal. The modal edits the drawer's unsaved draft and only says 'Changes are saved with the drawer's Save bar'. Nick opened the modal, changed a value, pressed Done, and the change did not stick (the card still showed the old value) because the drawer's Save bar was never pressed: it sits behind the modal and is easy to miss.

## Desired UX
The modal saves what it edits. Replace Done with Save and Cancel: Save patches the task (same path as the drawer's saveDraft, only the modal's fields) and closes the modal; Cancel (and the X / Escape) discards the modal's unsaved changes and closes. Remove the line about the Save bar. The collapsed summary shows the saved values. Editing the title or body in the drawer keeps its own Save bar.

## Acceptance criteria
- Change type, priority, area, story/assignee or dependencies in the modal, press Save: the card, the drawer summary and the task file show the new values, with no further click.
- Cancel / X / Escape leave the task unchanged and the draft reverted for those fields.
- A test covers save and cancel for at least one field and for dependencies.
- Declare shots at phone and desktop width of the modal with Save and Cancel visible.

## Notes for AI
Modal and draft code is in src/ui-app/src/components/TaskDrawer.vue (metaModalOpen, saveDraft, changedFields, metaSummary). Patch only the modal's fields from the modal's Save, so unsaved title/body edits are not saved by it.

## Shots
```json
[
{
"label": "Task details modal at phone width with Save and Cancel",
"target": "default",
"route": "/work?task=9999",
"highlight": "[data-test-id=\"task-meta-modal\"]",
"steps": [
{
"click": "[data-test-id=\"task-meta-summary\"]"
},
{
"waitMs": 300
}
],
"state": "drawer:taskDetailsSummary",
"viewport": "phone",
"viewportWidth": 390,
"viewportHeight": 844
},
{
"label": "Task details modal at desktop width with Save and Cancel",
"target": "default",
"route": "/work?task=9999",
"highlight": "[data-test-id=\"task-meta-modal\"]",
"steps": [
{
"click": "[data-test-id=\"task-meta-summary\"]"
},
{
"waitMs": 300
}
],
"state": "drawer:taskDetailsSummary",
"viewport": "desktop",
"viewportWidth": 1280,
"viewportHeight": 800
}
]
```

## Activity

- 2026-11-22T18:21:14Z · created · t@t
- 2026-11-22T18:21:15Z · needs_input
- 2026-11-22T18:21:21Z · body: Notes for AI (added)
- 2026-11-22T18:21:21Z · needs_input
- 2026-11-22T18:21:24Z · status inbox→ready
- 2026-11-22T18:21:26Z · cli_override, model_override
- 2026-11-22T18:21:28Z · status ready→active, branch
- 2026-11-22T18:23:25Z · body
- 2026-11-22T18:25:24Z · engineer stopped by request
- 2026-11-22T18:30:28Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-11-22T18:30:28Z · note: handoff requested (cli)
- 2026-11-22T18:30:40Z · held, held-reason, held-by, held-at
- 2026-11-22T18:37:10Z · released
- 2026-11-22T18:37:15Z · CTO nudge: held — handoff gate is running
- 2026-11-22T18:54:20Z · note: ui verification passed: 2 of 2 shots captured with clean console
- 2026-11-22T18:54:21Z · message_queued at 2026-11-22T18:54:21.404Z
- 2026-11-22T18:54:21Z · handoff failed · task-file handoff failed at review · Engineering report draft is missing: .repoos/engineering-report-drafts/1285.md
- 2026-11-22T18:54:21Z · message_delivered: 1 message(s)
- 2026-11-22T18:58:52Z · body
- 2026-11-22T19:02:15Z · CTO nudge: held — handoff gate is running
- 2026-11-22T19:03:19Z · note: ui verification passed: 2 of 2 shots captured with clean console
