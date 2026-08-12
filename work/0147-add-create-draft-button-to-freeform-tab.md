---
id: "0147"
title: Add Create draft button to the freeform New Task tab
type: feature
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: ""
created_at: "2026-08-12T22:35:00Z"
updated_at: "2026-08-12T22:35:00Z"
---

## Problem

When a user types a rough explanation into the freeform "New Task" textarea, the only action available alongside "Cancel" is "Create task" — which invokes the PM agent and generates a fully fleshed-out task. There is no lightweight way to capture an early-stage idea without involving the AI at all. The user may have a half-formed thought they want to park and return to later, without an agent touching it yet.

## Desired UX

In the freeform tab of the New Task drawer, a third button labeled **Create draft** sits between the existing Cancel and Create task buttons.

- Clicking **Create draft** stores the textarea content directly as a new task with `status: draft`, bypassing the PM agent entirely. No AI runs. The raw text becomes the task body.
- The drawer closes (same as Cancel) and the new draft task appears in the Drafts column/queue.
- The user can later open the draft from the board, edit it manually, and promote it to a full task when they are ready.

## Acceptance criteria

- [ ] A **Create draft** button appears in the freeform tab's button row between Cancel and Create task.
- [ ] The button is disabled when the textarea is empty (`!freeformText.trim()`), matching the existing Create task guard.
- [ ] Clicking Create draft creates a task with `status: "draft"` and the raw freeform text as its body, using the existing `POST /api/tasks` path (no PM agent invocation).
- [ ] On successful creation the drawer closes (or shows a brief confirmation before closing — same pattern as existing workflows).
- [ ] The button is disabled while a save is in-flight (`ui.saving`), same as the existing buttons.
- [ ] The existing Cancel and Create task buttons continue to work unchanged.
- [ ] `repoos check` passes.

## Notes for AI

- **Button location**: the button row is in `src/ui-app/src/components/TaskDrawer.vue` around line 1047 (`<div class="btn-row" style="margin-top: 20px">`). Insert the new button **between** the Cancel `<Button variant="outline">` and the Create task `<Button variant="default">`.
- **Button style**: use `variant="outline"` (same as Cancel) so the eye is drawn to the primary Create task action.
- **Draft creation**: call `repo.createTask()` (same path as the manual form) with `status: "draft"` and the freeform text as the body. Do NOT invoke the PM agent. This is a direct save, not a freeform agent call.
- **Do not** change the existing `draftSaved` fallback logic (the path that saves a draft when the PM agent fails) — that is a separate concern.
- **Do not** add a "drafts list" or new draft-list UI — drafts already exist as a status column. The existing board's draft column displays them.
- **After success**: follow the same pattern as `createFreeform` — clear the text, close the drawer, and let the board pick up the new draft task via the SSE refresh.
