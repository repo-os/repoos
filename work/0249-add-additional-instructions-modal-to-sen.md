---
id: "0249"
title: Add additional instructions modal to send to dev action
type: feature
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-18T06:29:50Z"
updated_at: "2026-08-18T06:29:50Z"
---
## Problem

When reviewing a task and sending it back to development, there's currently no way to provide additional context or instructions alongside the review. The review content itself is sent, but reviewers often need to add clarifications, specific guidance, or notes about what should be prioritized in the next dev iteration.

## Desired UX

1. The "Send engineer" button is renamed to "Send to dev" throughout the UI.

2. When a user in Review state clicks "Send to dev", a modal dialog opens with:
   - A text area for entering optional additional instructions
   - The text area has a placeholder indicating instructions are optional
   - A "Send" button to confirm and proceed with the handoff
   - A "Cancel" button to dismiss without sending

3. The additional instructions (if any) are included in the handoff along with the existing review content.

4. If the user doesn't add any additional instructions, the handoff proceeds normally with just the review content.

## Acceptance criteria

- [ ] Button text changed from "Send engineer" to "Send to dev" in Review state
- [ ] Clicking "Send to dev" opens a modal dialog
- [ ] Modal contains a text area for additional instructions
- [ ] Text area has placeholder text indicating instructions are optional
- [ ] Modal has "Send" and "Cancel" buttons
- [ ] Clicking "Cancel" closes the modal without sending
- [ ] Clicking "Send" proceeds with handoff including any entered instructions
- [ ] Additional instructions are passed to the engineering agent along with the review
- [ ] Empty additional instructions are handled gracefully (handoff works without them)
- [ ] `repoos check` passes with no regressions

## Notes for AI

- Search for "Send engineer" in the codebase to find all button instances to rename
- Look at existing modal patterns in the UI for consistency (likely in `src/ui-app/src/components/`)
- The handoff logic that sends review content to the engineer likely lives in `src/core/` or `src/server/` - trace the send action to understand where to attach additional instructions
- Assume the additional instructions should be passed as part of the handoff payload/message
- Keep the modal simple - no need for markdown preview or rich text, just a plain textarea

## Activity

