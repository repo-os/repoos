---
id: "0325"
title: Align New Input Panel UX with New Task Submission Flow
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/align-new-input-panel-ux-with-new-task-s
review_model_override: openrouter/google/gemini-3.8-flash
created_at: "2026-09-03T17:46:46Z"
updated_at: "2026-09-03T17:51:30Z"
---
## Problem

When submitting a new input via the "New input" panel, users are left waiting for many seconds without meaningful feedback on what is happening while the input is processed and enriched. The submit button simply disables with a spinner or loading text, locking the user in the panel and creating an unresponsive experience where they cannot proceed with other work or submit additional inputs.

## Desired UX

Adopt the same non-blocking feedback and acknowledgment pattern used in the "New task" panel:
- Upon submitting an input, immediately transition the panel to an acknowledgment state instead of keeping the user stuck on a loading button.
- Provide clear status feedback (e.g. an activity indicator) and reassure the user that the input is being created in the background and will be ready in a few seconds or so.
- Explicitly tell the user that nothing is lost and they can either submit another input or navigate away to do something else.
- Offer clear action buttons:
  - "Create another input": resets the form and focus so the user can quickly submit another item.
  - "Done": dismisses the panel while background creation continues.

## Acceptance criteria

- [ ] Submitting a new input provides immediate acknowledgment instead of blocking the user on a loading state for several seconds
- [ ] The panel displays feedback indicating the input is being created in the background and will be ready in a few seconds
- [ ] The panel informs users they can create another input or continue other work while processing finishes
- [ ] A "Create another input" button resets the input form and clears attachments for a fresh submission
- [ ] A "Done" button closes the panel without interrupting the in-flight input creation
- [ ] Pending attachments and input creation complete reliably in the background

## Notes for AI

- Reference the implementation of `ff-done` and the freeform submission flow in `src/ui-app/src/components/TaskDrawer.vue` (introduced in task #0311) to replicate the UX and visual hierarchy.
- Touch `src/ui-app/src/components/NewInputPanel.vue` and coordinate with `src/ui-app/src/stores/repo.ts` and `src/ui-app/src/stores/ui.ts` to manage non-blocking submission and cleanup.
- Assumption: If background creation fails after the panel has transitioned to acknowledgment or closed, notify the user via the existing error/toast mechanisms so feedback is not lost.
- Do not introduce new runtime dependencies or alter the underlying input data model.

## Scope

- Covers the submission experience, feedback messaging, and action buttons within `NewInputPanel.vue`.
- Does not alter server-side input enrichment logic or prompt definitions.

## Related

- #0311

## Original prompt

The "new input" panel should have a similar ux to the new task panel whereby the user isn't stuck waiting for many seconds without feedback on what's happpening. see how we handled the ux on "new task" and do the same, e.g. tell the user they can make another input or go do something else and it will be ready in a few seconds or so.

## Activity

- 2026-09-03T17:46:46Z · created · hello@repoos.org
- 2026-09-03T17:49:27Z · status draft→inbox, title, area, body
- 2026-09-03T17:50:35Z · status inbox→ready
- 2026-09-03T17:51:23Z · status ready→active, branch
- 2026-09-03T17:51:30Z · review_model_override
