---
id: "0436"
title: Change delete task confirmation to a modal with buttons
type: feature
status: ready
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: ""
created_at: "2026-09-19T04:25:46Z"
updated_at: "2026-09-19T04:27:34Z"
---
## Problem

The delete task confirmation experience is not clear or visually prominent enough. Users need a more explicit, modal-based confirmation that prevents accidental deletion of tasks.

## Desired UX

When a user triggers a delete task action, a modal dialog appears with:
- Clear messaging about what task will be deleted
- Prominent Cancel and Delete action buttons
- Destructive styling on the Delete button to signal the irreversible action
- Modal closes without deleting on cancel; deletes and closes on confirmation

## Acceptance criteria

- [ ] Delete task action triggers a modal dialog (not an inline confirmation or browser alert)
- [ ] Modal displays the task ID/title being deleted
- [ ] Cancel button closes the modal without deleting
- [ ] Delete button confirms deletion, removes the task, and closes the modal
- [ ] Modal uses existing Radix Dialog component for consistency
- [ ] Styling aligns with the existing UI design system
- [ ] Modal properly teleported to body to avoid stacking context issues

## Notes for AI

- Look for the existing delete task handler in the Vue 3 UI components
- Check `src/ui-app/src/views/` for task list/detail views that have delete functionality
- Use Radix Dialog or the custom modal component already in use elsewhere
- Any `position: fixed` overlay must be wrapped in `<Teleport to="body">`
- Rebuild the UI with `bun run build:ui` after changes
- Verify the modal works end-to-end: appears, cancels cleanly, and deletes as expected

## Original prompt

Change the delete task confirmation to a modal with buttons.

## Screenshots

![Screenshot-2026-09-19-at-12.16.38](/api/tasks/0436/attachments/screenshot-1.png)

## Activity

- 2026-09-19T04:25:46Z · created · hello@repoos.org
- 2026-09-19T04:25:47Z · screenshots
- 2026-09-19T04:26:03Z · status draft→inbox, title, area, body
- 2026-09-19T04:27:16Z · body
- 2026-09-19T04:27:34Z · status inbox→ready
