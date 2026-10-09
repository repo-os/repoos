---
id: "0750"
title: Add fullscreen toggle to task tabs
type: feature
status: active
priority: p2
area: ui
assigned_to: ai
created_by: hello@repoos.org
branch: feat/add-fullscreen-toggle-to-task-tabs
created_at: "2026-10-09T18:47:28Z"
updated_at: "2026-10-09T19:01:42Z"
---
## Problem

Task tab contents can be difficult to see in the existing view. There is no way to expand the selected tab into a fullscreen view.

## Desired UX

The selected task tab has a fullscreen toggle. Activating it opens the current tab’s contents in a fullscreen modal, making them easier to see. The toggle also lets the user exit fullscreen and return to the task.

## Acceptance criteria

- [ ] The selected task tab offers a fullscreen toggle.
- [ ] Activating the toggle opens that tab’s contents in a fullscreen modal.
- [ ] The modal provides a way to exit fullscreen and return to the task.

## Notes for AI

- Treat “selected tab” as the currently active task tab.
- Keep the fullscreen view scoped to the current tab’s contents.

## Original prompt

On the task tabs I'd like to add a full screen toggle option on the selected tab, this full screen toggle should open the current tab in a fullscreen modal to make it easier to see the tab contents.

## Shots
```json
[
{
"label": "Task drawer with the new fullscreen toggle in the tab strip",
"target": "default",
"route": "/",
"highlight": "[data-test-id=\"task-tab-fullscreen\"]",
"steps": [
{
  "click": "[data-task-id=\"9999\"]"
},
{
  "waitFor": "[data-test-id=\"task-tab-fullscreen\"]"
},
{
  "waitMs": 300
}
],
"state": "board:withReviewTask"
},
{
"label": "Tab contents expanded to fullscreen",
"target": "default",
"route": "/",
"highlight": "[data-test-id=\"task-tab-fullscreen\"]",
"steps": [
{
  "click": "[data-task-id=\"9999\"]"
},
{
  "waitFor": "[data-test-id=\"task-tab-fullscreen\"]"
},
{
  "click": "[data-test-id=\"task-tab-fullscreen\"]"
},
{
  "waitMs": 400
}
],
"state": "board:withReviewTask"
}
]
```

## Screenshots

![Screenshot-2026-10-10-at-02.43.59](/api/tasks/0750/attachments/screenshot-1.png)

## Activity

- 2026-10-09T18:47:28Z · created · hello@repoos.org
- 2026-10-09T18:47:29Z · screenshots
- 2026-10-09T18:47:43Z · status draft→inbox, title, area, body
- 2026-10-09T18:47:54Z · status inbox→ready
- 2026-10-09T18:47:55Z · status ready→active, branch
- 2026-10-09T18:55:42Z · body
- 2026-10-09T18:56:31Z · body
- 2026-10-09T18:59:08Z · body: section Shots
- 2026-10-09T19:00:31Z · body
- 2026-10-09T19:01:42Z · body
