---
id: "0317"
title: "The stop work double confirm should be a proper modal, no…"
type: feature
status: review
priority: p2
area: general
assigned_to: ai
created_by: hello@repoos.org
branch: feat/the-stop-work-double-confirm-should-be-a
model_override: opencode/hy3-free
review_cli_override: codex
review_model_override: gpt-5.6-luna
created_at: "2026-08-28T15:51:55Z"
updated_at: "2026-08-28T17:14:06Z"
review_passes: 3
---
The stop work confirmation dialog should be implemented as a proper modal component instead of the current implementation.

## Requirements

1. Replace the current confirmation dialog with a proper modal component
2. The modal should:
   - Have a clear title (e.g. "Confirm Stop Work")
   - Display a descriptive message explaining the consequences of stopping work
   - Include "Cancel" and "Stop Work" buttons
   - Be centered on screen with appropriate overlay
   - Prevent interaction with background elements
   - Support closing via ESC key and clicking outside the modal
3. Maintain the same functionality but improve the UX

## Technical Notes

- Look at existing modal implementations in the codebase for consistency
- Ensure accessibility attributes are properly set
- Follow established UI patterns and styling conventions

## Original prompt

The stop work double confirm should be a proper modal, not whatever this is in the screenshot

## Screenshots

![Screenshot-2026-08-28-at-22.33.23](/api/tasks/0317/attachments/screenshot-1.png)

## Activity

- 2026-08-28T16:18:43Z · body
- 2026-08-28T16:18:54Z · status draft→ready
- 2026-08-28T16:21:48Z · status ready→active, branch
- 2026-08-28T16:26:06Z · status active→review
- 2026-08-28T16:34:30Z · review_model_override
- 2026-08-28T16:34:36Z · status review→active
- 2026-08-28T16:36:32Z · status active→review
- 2026-08-28T16:51:33Z · needs_input
- 2026-08-28T16:54:15Z · review_cli_override, review_model_override
- 2026-08-28T16:54:21Z · review_model_override
- 2026-08-28T16:55:17Z · needs_input
- 2026-08-28T16:57:43Z · cli_override, model_override
- 2026-08-28T16:57:48Z · model_override
- 2026-08-28T16:57:56Z · status review→active
- 2026-08-28T17:00:44Z · status active→review
- 2026-08-28T17:03:27Z · cli_override, model_override
- 2026-08-28T17:04:47Z · model_override
- 2026-08-28T17:04:56Z · status review→active
- 2026-08-28T17:14:06Z · status active→review
