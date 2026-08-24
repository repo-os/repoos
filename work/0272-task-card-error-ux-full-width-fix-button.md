---
id: "0272"
title: "Task card error UX: full-width fix button, move full error detail to the task panel"
type: bug
status: inbox
priority: p2
area: ui
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-24T15:56:16Z"
updated_at: "2026-08-24T15:59:08Z"
---
## Problem
When MTD errors, the task card's "fix" button is not full width, and clicking to expand the error on the card shows the full error detail there — but the big task panel (drawer) only shows a short snippet. This is backwards: the small card should stay compact, and the full detail belongs in the spacious task panel.

## Fix
- Make the card's "fix" button full width.
- Clicking to expand an error on the card should open the task panel and show the full error there, instead of expanding inline on the card.
- The task panel's error display should show the full detail (not a snippet).

## Activity

- 2026-08-24T15:59:08Z · body
