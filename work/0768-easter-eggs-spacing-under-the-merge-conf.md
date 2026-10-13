---
id: "0768"
title: "Easter eggs: spacing under the merge-conflict message on review cards"
type: bug
status: ready
priority: p3
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-13T14:30:17Z"
updated_at: "2026-10-13T15:26:15Z"
---
## Problem
On a review card with a merge conflict (Move to done failed at merge), the 'Merge conflict in N file.' line sits too close to the action row below it, so the card looks unbalanced. Seen on #0762 with 'Sent to Debugger'.

## Desired UX
Consistent spacing between the conflict message and the action row, matching the other status rows on the card.

## Acceptance criteria
- Spacing fixed in the card's shared styles (use the global form/card classes, not a bespoke colour).
- Check the card in light and dark themes.

## Notes for AI
Start from the task card component that renders 'Merge conflict'. Small, cosmetic fix only.

## Activity

- 2026-10-13T14:30:17Z · created · njachowski@gmail.com
- 2026-10-13T15:26:15Z · status inbox→ready
