---
id: "1285"
title: "Task details modal: edits must save when the modal closes"
type: bug
status: inbox
needs_input: true
needs_input_reason: underspecified
needs_input_detail: "missing sections: Notes for AI"
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-22T18:21:14Z"
updated_at: "2026-11-22T18:21:21Z"
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

## Activity

- 2026-11-22T18:21:14Z · created · t@t
- 2026-11-22T18:21:15Z · needs_input
- 2026-11-22T18:21:21Z · body: Notes for AI (added)
