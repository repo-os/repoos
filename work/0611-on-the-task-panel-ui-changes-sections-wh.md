---
id: "0611"
title: On the task panel ui changes sections where we show the s…
type: feature
status: draft
priority: p2
area: general
assigned_to: ai
created_by: hello@repoos.org
branch: ""
created_at: "2026-10-01T04:34:32Z"
updated_at: "2026-10-01T04:34:34Z"
---
On the task panel ui changes sections where we show the shots taken by the task let's use the same styling/structure as we do on "new task" and "new input" screenshot upload, each screenshot it's own row. That way we have room on the row to show some of the relevant text content/description of what the shot is, e.g. the label, steps, selector which is in the task spec now:

[
  {"target": "default", "route": "/", "label": "Top bar bell popover", "steps": [{"click": "button[data-test-id=\"notice-bell-trigger\"]"}, {"waitMs": 400}], "selector": "[data-test-id=\"notice-bell-popover\"]"},
  {"target": "default", "route": "/", "label": "Needs-you panel with notice rows", "steps": [], "selector": "main"},
  {"target": "default", "route": "/settings?tab=notifications", "label": "Settings: release notification toggles", "steps": []}
]

## Original prompt

On the task panel ui changes sections where we show the shots taken by the task let's use the same styling/structure as we do on "new task" and "new input" screenshot upload, each screenshot it's own row. That way we have room on the row to show some of the relevant text content/description of what the shot is, e.g. the label, steps, selector which is in the task spec now:

[
  {"target": "default", "route": "/", "label": "Top bar bell popover", "steps": [{"click": "button[data-test-id=\"notice-bell-trigger\"]"}, {"waitMs": 400}], "selector": "[data-test-id=\"notice-bell-popover\"]"},
  {"target": "default", "route": "/", "label": "Needs-you panel with notice rows", "steps": [], "selector": "main"},
  {"target": "default", "route": "/settings?tab=notifications", "label": "Settings: release notification toggles", "steps": []}
]

## Screenshots

![Screenshot-2026-10-01-at-12.24.16](/api/tasks/0611/attachments/screenshot-1.png)
![Screenshot-2026-09-30-at-20.53.22](/api/tasks/0611/attachments/screenshot-2.png)

## Activity

- 2026-10-01T04:34:32Z · created · hello@repoos.org
- 2026-10-01T04:34:34Z · screenshots
- 2026-10-01T04:34:34Z · screenshots
