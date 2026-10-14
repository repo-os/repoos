---
id: "0778"
title: "Easter eggs bundle: Shots validator and review card wording"
type: bug
status: inbox
needs_input: true
needs_input_reason: underspecified
needs_input_detail: "missing sections: Desired UX"
priority: p3
area: [web, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-14T07:43:09Z"
updated_at: "2026-10-14T07:43:10Z"
---
## Problem
Two small bugs found on 2026-10-14. Both are cosmetic or validation-only, so they are bundled.

1. **Shot can't be deleted when its state is invalid.** A task whose ## Shots list contains an unknown state fixture (for example board:cardChips on #0776) fails the Shots validator. The UI then refuses to delete any shot on that task ('the task's ## Shots section is not a valid list — fix it before deleting'), so the bad shot can't be removed from the UI. Fix: deleting a shot must work even when other entries are invalid. Validate only what's being written, and let the user remove the invalid entry.
2. **Duplicate text on the 'Waiting for you' card.** src/server/review.ts ~1675 writes the same sentence to needsInputDetail as to the reason, and the card shows both ('The reviewer has sent this back to the engineer 2 times…' appears twice). Fix: don't repeat the reason in the detail; keep the detail for something different (for example the last review's verdict line), or hide the detail when it equals the reason.

## Acceptance criteria
- Test: deleting a shot on a task with one invalid entry succeeds and removes only the selected entry.
- Test: the Waiting-for-you card shows the reason once when the detail would repeat it.
- CLI: repoos update --shots '[]' is rejected today ('expected at least one shot'); add a documented way to clear all shots (or document --section Shots --section-body '').
- Light and dark themes checked on the card.

## Notes for AI
Source: user report 2026-10-14 on #0776 (shot delete error) and the Waiting-for-you card. Items are small and independent; commit per item so a reviewer can read them separately. Mark nothing else superseded.

## Activity

- 2026-10-14T07:43:09Z · created · njachowski@gmail.com
- 2026-10-14T07:43:10Z · needs_input
