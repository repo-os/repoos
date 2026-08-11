---
id: "0108"
title: Remove move-to-done confirmation
type: feature
status: done
priority: p2
area: ui
assigned_to: ai
created_by: ""
branch: feat/remove-move-to-done-confirmation
cli_override: codex
model_override: gpt-5.6-terra
created_at: "2026-08-11T20:02:12Z"
updated_at: "2026-08-11T20:09:12Z"
---
## Problem

The task panel shows scary red warning text and requires an additional confirmation after the user clicks "Move to done." This makes a straightforward status change feel unnecessarily alarming and cumbersome.

## Desired UX

The task panel should show the existing prominent "Move to done" button. Clicking it should move the task to done immediately, without warning text or a second confirmation step.

## Acceptance criteria

- [ ] The scary red warning text is removed from the task panel.
- [ ] The prominent "Move to done" button remains available.
- [ ] Clicking "Move to done" moves the task directly to done.
- [ ] No warning or double-confirmation step appears.

## Notes for AI

- Limit the change to the task panel's move-to-done interaction.
- Preserve the existing appearance and prominence of the "Move to done" button.
- Assume the button's current action remains unchanged apart from removing the warning and confirmation requirement.

## Activity

- 2026-08-11T20:02:12Z · created · unknown
- 2026-08-11T20:02:19Z · status inbox→ready
- 2026-08-11T20:02:41Z · cli_override, model_override
- 2026-08-12T04:07:00Z · status active→review · removed confirmation step, repoos check green
- 2026-08-11T20:09:12Z · status review→done
