---
id: "1141"
title: "Work queue: show or hide human and held tasks"
type: feature
status: review
priority: p2
area: [web, ui]
assigned_to: ai
created_by: t@t
branch: feat/work-queue-show-or-hide-human-and-held-t
created_at: "2026-11-16T03:51:39Z"
updated_at: "2026-11-16T04:20:07Z"
---
## Problem

Human-assigned and held tasks take up space in the main Work Queue lists even when the user wants to focus on other work. The existing bottom-left controls should continue to open those task groups, but the page needs separate controls to show or hide human and held tasks in the queue lists.

## Desired behavior

- Add independent show/hide controls for human-assigned tasks and held tasks between the “Client board” link and the adjacent `><` control in the Work Queue header.
- Hiding either category removes those tasks from the Work Queue lists; showing it restores them. Keep the two settings independent.
- Keep human, held, and archived tasks accessible from the bottom-left controls.
- Reorder those bottom-left controls to: Human, Held, Archived.
- Match the existing Work Queue control styling and interaction patterns, including accessible labels and keyboard operation.

## Acceptance criteria

1. Work Queue has separate show/hide controls for human-assigned tasks and held tasks in the requested header location.
2. Each control filters only its own category from the Work Queue lists; toggling it back restores the category.
3. Bottom-left controls remain available in the order Human, Held, Archived.
4. Existing counts and task actions remain correct when categories are hidden from the lists.
5. Add or update focused UI tests for both filters and the reordered controls; rebuild the UI.

## Notes for AI

Use the attached screenshot as the layout reference. Inspect existing Work Queue filtering and bottom-left control components before editing; preserve current routes and task actions. Keep the change scoped to the Work Queue page and use existing shared styling and accessibility patterns. Do not add a new settings page or change task status/assignment semantics.

## Desired UX
- Add independent show/hide controls for human-assigned tasks and held tasks between the “Client board” link and the adjacent `><` control in the Work Queue header.
- Hiding either category removes those tasks from the Work Queue lists; showing it restores them. Keep the two settings independent.
- Keep human, held, and archived tasks accessible from the bottom-left controls.
- Reorder those bottom-left controls to: Human, Held, Archived.
- Match the existing Work Queue control styling and interaction patterns, including accessible labels and keyboard operation.

## Shots
```json
[
{
"label": "Human and Held show/hide toggles in the Work Queue header",
"target": "default",
"route": "/work",
"highlight": ".queue-visibility",
"state": "card:humanStep"
},
{
"label": "Human tasks hidden from the board lists",
"target": "default",
"route": "/work",
"highlight": ".queue-visibility",
"steps": [
{
"click": "[data-testid='toggle-human-visibility']"
},
{
"waitMs": 300
}
],
"state": "card:humanStep"
}
]
```

## Screenshots

![Work Queue showing current bottom-left Human, Archived, Held controls and header placement](/api/tasks/1141/attachments/att_cc67c690-b8ed-4a91-8b28-e94b280c092e.png)

## Activity

- 2026-11-16T03:51:39Z · created · t@t
- 2026-11-16T03:51:40Z · screenshots
- 2026-11-16T03:51:40Z · needs_input
- 2026-11-16T03:51:47Z · needs_input, body: Desired UX (added)
- 2026-11-16T03:53:14Z · status inbox→ready
- 2026-11-16T03:53:24Z · status ready→active, branch
- 2026-11-16T04:08:25Z · body
- 2026-11-16T04:12:53Z · body
- 2026-11-16T04:16:24Z · CTO nudge: held — handoff gate is running
- 2026-11-16T04:20:03Z · note: ui verification passed: 2 of 2 shots captured with clean console (1 shot warning)
- 2026-11-16T04:20:06Z · status active→review
- 2026-11-16T04:20:07Z · message_queued at 2026-11-16T04:20:07.332Z
