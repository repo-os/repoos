---
id: "0818"
title: "Model routing: decision cards show response time, cost and details; test card can collapse; relative timestamps"
type: bug
status: done
priority: p2
area: web
merged_commit: 7dd757bbdf4bd2f31dc5d6bc55a67615afe8c8f4
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/model-routing-decision-cards-show-respon
created_at: "2026-10-17T11:25:18Z"
updated_at: "2026-10-17T12:18:39Z"
last_close_out_gate_ms: 86989
last_close_out_gate_at: "2026-10-17T12:17:44.118Z"
review_passes: 1
---
## Problem
#0811 was marked done, but only the live test result card landed. The Recent decisions list is still the old layout:
1. Decision cards do not show response time or cost, and the request and response details are not expandable.
2. The test result card cannot be minimised. It should collapse to the high-level summary (outcome, model, cost, and the chosen candidate with its probability) with the details one click away.
3. Timestamps show the absolute time ('14:32:08'). They should show a human-readable relative time ('14 seconds ago', '13 hours ago'), with the exact timestamp shown on hover.

Source: #0811's scope (src/ui-app/src/components/ModelRoutingPanel.vue, the Recent decisions block around line 681 and shortTime). The test card (Response time, Question sent, Answer received) is already on main.

## Desired UX
- Each decision card always shows: chosen candidate, recommended candidate, response time, cost (when known), and the chosen answer's probability (when present).
- Each decision card has an expandable details area, collapsed by default, with the question sent and the answer received, matching the test card's layout.
- The test result card has a collapse control. Collapsed, it shows outcome, model, cost and the chosen candidate with its probability. Expanded, it shows the full detail. Collapsed is the default after a new test.
- Timestamps read as relative time ('14 seconds ago', '13 hours ago'); the absolute time appears on hover, using the app's designed tooltip.

## Acceptance criteria
- Test: a decision card shows response time and cost when recorded, and hides the details until expanded.
- Test: the test result card collapses to the summary and expands to the full detail.
- Test: a timestamp shows relative time, and the absolute time appears on hover or keyboard focus.
- Light and dark themes checked on both card types.

## Notes for AI
Start from ModelRoutingPanel.vue (the test card around lines 630-660, the Recent decisions list from line 681, and shortTime). Use the shared tooltip component (AGENTS.md: no native title tooltips). Source: user report 2026-10-17.

## Shots
```json
[
{
"label": "Model routing tab: live test card collapses to a summary; decision cards show response time, cost and relative timestamps",
"target": "default",
"route": "/agents?tab=model-routing",
"highlight": "[data-testid=\"model-routing-panel\"]"
}
]
```

## Activity

- 2026-10-17T11:25:18Z · created · njachowski@gmail.com
- 2026-10-17T11:25:41Z · status inbox→ready
- 2026-10-17T11:26:00Z · status ready→active, branch
- 2026-10-17T11:30:33Z · body
- 2026-10-17T11:32:29Z · body: section Shots
- 2026-10-17T11:33:20Z · body
- 2026-10-17T11:40:56Z · status active→review
- 2026-10-17T11:41:47Z · note: review pass 1: good to go
- 2026-10-17T12:17:44Z · close-out gate completed in 87s
- 2026-10-17T12:18:39Z · status review→done, release:success
