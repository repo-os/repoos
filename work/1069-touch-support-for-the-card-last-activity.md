---
id: "1069"
title: Touch support for the card last-activity popover (fold into the mobile rewrite)
type: chore
status: inbox
priority: p3
area: web
assigned_to: ""
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-11-09T03:34:05Z"
updated_at: "2026-11-09T03:34:05Z"
---
## Problem
The last-activity popover on Board and Pipeline cards (added by the "card activity recency" bundle, #1058) works on mouse hover and keyboard focus only. On touch devices there is no way to see it. A first touch implementation (tap to pin, long-press) was dropped from #1058 because it broke click handling on unrelated tooltip hosts and kept producing gesture-arbitration bugs.

## Desired UX
On touch, tapping or long-pressing the status line shows the same popover without triggering the element's click action; every other tooltip host keeps its current touch behaviour.

## Acceptance criteria
- Touch opt-in is scoped to the recency triggers only (an explicit attribute), not global tooltip handling.
- A pointercancel before the long-press threshold never opens or pins the tooltip.
- Tapping a second tooltip host while one is pinned dismisses the first without swallowing the second's click.
- Tests for the gestures above.

## Notes for AI
Likely best done as part of the planned mobile rewrite; check that first and fold it in or close this task if the rewrite replaces the tooltip system. See work/reports/1058/review-2.md through review-8.md for the findings the first attempt hit. Do not edit repoos.toml.

## Activity

- 2026-11-09T03:34:05Z · created · njachowski@gmail.com
