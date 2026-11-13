---
id: "1069"
title: Touch support for the card last-activity popover (fold into the mobile rewrite)
type: chore
status: active
priority: p3
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/touch-support-for-the-card-last-activity
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-09T03:34:05Z"
updated_at: "2026-11-13T14:52:17Z"
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

## Shots
```json
[
{
"label": "Board card activity recency popover",
"target": "default",
"route": "/",
"highlight": "[data-task-id=\"9999\"] [data-test-id=\"task-card-agent-hint\"]",
"steps": [
{
  "hover": "[data-task-id=\"9999\"] [data-test-id=\"task-card-agent-hint\"]"
}
],
"state": "board:activeCoding"
}
]
```

## Activity

- 2026-11-09T03:34:05Z · created · njachowski@gmail.com
- 2026-11-13T14:30:06Z · cli_override, model_override
- 2026-11-13T14:30:10Z · status inbox→ready
- 2026-11-13T14:30:11Z · status ready→active, branch
- 2026-11-13T14:33:19Z · body
- 2026-11-13T14:38:27Z · body
- 2026-11-13T14:40:11Z · body
- 2026-11-13T14:43:28Z · CTO nudge: held — handoff gate is running
- 2026-11-13T14:52:17Z · note: ui verification failed: ui verification failed (3 issue(s)): [missing-target] Board card activity recency popover (target "default"): hover [data-task-id="9999"] [data-test-id="task-card-agent-hint"]: hover: Timeout 5000ms exceeded. on / (http://127.0.0.1:36527/?shotState=board%3AactiveCoding); [missing-target] Board card activity recency popover (target "default"): state "board:activeCoding" did not render on target "default" — / shows no task card (http://127.0.0.1:36527/?shotState=board%3Aact
