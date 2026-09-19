---
id: "0437"
title: Auto-dismiss acknowledge banner when task state changes
type: bug
status: done
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/auto-dismiss-acknowledge-banner-when-tas
created_at: "2026-09-19T04:31:51Z"
updated_at: "2026-09-19T05:07:02Z"
---
## Problem

The "Acknowledge" banner/button that appears on tasks created by the PM AI agent persists after a human moves the task to a different state (e.g., from inbox to ready). This creates friction in the workflow: users often forget to manually dismiss the banner before taking action on the task, and the banner remains visible afterward serving no purpose.

When a human explicitly acts on a task by changing its state, that action should implicitly signal acknowledgement.

## Desired UX

When a human modifies a task's state (e.g., moving it from inbox to ready, or assigning it), the acknowledge banner/button automatically disappears. The acknowledgement is implicit in the state change itself, eliminating the need for a separate manual dismiss step.

The banner continues to appear on newly created PM tasks until either:
- The human explicitly dismisses it, OR
- The human changes the task's state

## Acceptance criteria

- [ ] Acknowledge banner auto-dismisses when a human changes task state
- [ ] The dismissal is automatic and requires no additional user action
- [ ] Newly created PM tasks still show the acknowledge banner until dismissed or state-changed
- [ ] State changes triggered by the PM AI (if any) do not auto-dismiss the banner
- [ ] The change applies wherever the acknowledge banner appears (task card view, task detail, etc.)

## Notes for AI

- The acknowledge banner UI component is likely in the task-card or task-detail view; search for the acknowledge banner rendering and state management
- Hook into the task state-change event(s) to trigger auto-dismiss logic
- Verify the mechanism can distinguish between human-triggered and PM-AI-triggered state changes before dismissing
- This is purely a UX refinement; the acknowledgement data structure/logic itself does not change, only when it is cleared

## Original prompt

Currently the "Acknowledge banner/button" on tasks created by the PM AI agent stay on the task cards even after a human moves the card to another state. Often I forget to click acknowledge, if a human has done anything with the card like moved it from inbox to ready then treat that as "acknowledged" and remove the banner/button.

## Activity

- 2026-09-19T04:31:51Z · created · hello@repoos.org
- 2026-09-19T04:32:05Z · status draft→inbox, title, area, type, body
- 2026-09-19T04:32:21Z · status inbox→ready
- 2026-09-19T04:32:26Z · status ready→active, branch
- 2026-09-19T04:36:02Z · status active→review
- 2026-09-19T05:07:02Z · status review→done, release:success
