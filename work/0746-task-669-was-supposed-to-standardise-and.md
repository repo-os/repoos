---
last_close_out_gate_ms: 265417
last_close_out_gate_at: "2026-10-08T16:41:23.389Z"
id: "0746"
title: Unify chat input styling and structure
type: refactor
status: review
priority: p2
area: [web, ui]
assigned_to: ai
created_by: hello@repoos.org
branch: feat/unify-chat-input-styling-and-structure
created_at: "2026-10-08T15:34:30Z"
updated_at: "2026-10-08T16:41:23Z"
review_passes: 1
---
## Problem

Chat inputs still appear in three or four different styles, despite Task 669 aiming to standardize and improve them. The inconsistent styling and structure make the chat experience feel fragmented.

## Desired UX

All chat inputs use the same styling and structure. When an input is active, it has a rounded highlight rather than a square internal highlight. Image attachment remains available.

## Acceptance criteria

- [ ] Chat input surfaces use a consistent shared styling and structure.
- [ ] The active input uses a rounded highlight, not a square internal one.
- [ ] Image attachment remains available.

## Notes for AI

- Inspect Task 669 and the existing chat input surfaces to identify where the inconsistent styles and structures come from.
- Assume this covers all chat inputs in the web UI.
- Keep the change focused on chat input consistency; do not remove image attachment.

## Related

- Task 669

## Original prompt

Task 669 was supposed to standardise and prettify the chat input field, but I think it didn't solve it, as I can see 3-4 different styles of chat inputs. I think we should go with the rounded highlight when the input is active, not the square internal one. also having an image attachment is good. can we make them all the same, share the same styling and structure?

## Screenshots

![Screenshot-2026-10-08-at-23.30.38](/api/tasks/0746/attachments/screenshot-1.png)
![Screenshot-2026-10-08-at-23.31.25](/api/tasks/0746/attachments/screenshot-2.png)
![Screenshot-2026-10-08-at-23.31.16](/api/tasks/0746/attachments/screenshot-3.png)
![Screenshot-2026-10-08-at-23.31.05](/api/tasks/0746/attachments/screenshot-4.png)
![Screenshot-2026-10-08-at-23.30.51](/api/tasks/0746/attachments/screenshot-5.png)

## Shots
```json
[
{
"label": "Ross chat open — shared ai-chat-compose box",
"target": "default",
"route": "/",
"highlight": ".ai-chat-compose",
"steps": [
{
"click": "[data-test-id=\"floating-head-ross\"]"
},
{
"waitMs": 400
}
]
},
{
"label": "Ross chat input focused — one rounded highlight on the box",
"target": "default",
"route": "/",
"highlight": ".ai-chat-compose",
"steps": [
{
"click": "[data-test-id=\"floating-head-ross\"]"
},
{
"waitMs": 400
},
{
"click": ".ai-chat-compose textarea"
},
{
"waitMs": 200
}
]
},
{
"label": "Model Playground — migrated onto the shared compose box",
"target": "default",
"route": "/agents?tab=playground",
"highlight": ".playground-compose",
"steps": [
{
"waitMs": 500
}
]
}
]
```

## Activity

- 2026-10-08T15:34:30Z · created · hello@repoos.org
- 2026-10-08T15:34:31Z · screenshots
- 2026-10-08T15:34:32Z · screenshots
- 2026-10-08T15:34:32Z · screenshots
- 2026-10-08T15:34:32Z · screenshots
- 2026-10-08T15:34:32Z · screenshots
- 2026-10-08T15:34:50Z · status draft→inbox, title, area, type, body
- 2026-10-08T15:49:15Z · status inbox→ready
- 2026-10-08T15:49:25Z · status ready→active, branch
- 2026-10-08T16:08:31Z · body
- 2026-10-08T16:15:20Z · body
- 2026-10-08T16:17:06Z · body
- 2026-10-08T16:18:16Z · body
- 2026-10-08T16:19:13Z · body: section Shots
- 2026-10-08T16:25:49Z · status active→review
- 2026-10-08T16:26:05Z · note: click .ai-chat-compose textarea: click: Timeout 5000ms exceeded. on /
- 2026-10-08T16:26:59Z · note: review pass 1: good to go
- 2026-10-08T16:41:23Z · close-out gate completed in 265s

