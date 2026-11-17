---
id: "1151"
title: "Full-screen diff pages: make the Back control meet the 44px touch target"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/full-screen-diff-pages-make-the-back-con
created_at: "2026-11-17T03:32:44Z"
updated_at: "2026-11-17T04:30:10Z"
---
## Problem
At 390×844, the Back control on the full-screen diff view measures 76×28 CSS px, below the app's 44×44 mobile touch-target convention. The shared DiffView is routed at /tasks/:taskId/diff, /tasks/:taskId/conflict-diff, /repo/working-diff and /repo/commits/:sha, so each entry point has the same issue.

## Desired UX
The back action is easy to hit with a thumb on narrow phones without taking extra horizontal space from the diff.

## Acceptance criteria
- Back control measures at least 44px high and 44px wide on mobile at 390px and 320px.
- Keyboard focus remains visible and desktop layout is preserved.
- Verify all four DiffView routes.

## Notes for AI
Use the screenshots attached to #1146 and #1151; inspect light and dark themes and a populated diff if available.

## Shots
```json
[
{
"label": "Task diff at 390px: Back is a 44px touch target (dark)",
"target": "default",
"route": "/tasks/1151/diff",
"highlight": ".diff-back-btn",
"theme": "dark",
"viewportWidth": 390,
"viewportHeight": 844
},
{
"label": "Task diff at 390px: Back is a 44px touch target (light)",
"target": "default",
"route": "/tasks/1151/diff",
"highlight": ".diff-back-btn",
"theme": "light",
"viewportWidth": 390,
"viewportHeight": 844
}
]
```

## Screenshots

![Repo working diff at 390×844: Back control is 76×28px](/api/tasks/1151/attachments/att_3406ddab-f98f-42a2-ad2e-2b10467d9dd8.png)

## Activity

- 2026-11-17T03:32:44Z · created · t@t
- 2026-11-17T03:32:45Z · screenshots
- 2026-11-17T03:38:04Z · body: Problem (added 1, removed 1); Acceptance criteria (added 1, removed 1); Notes for AI (added 1, removed 1)
- 2026-11-17T04:00:07Z · status inbox→ready
- 2026-11-17T04:00:11Z · status ready→active, branch
- 2026-11-17T04:18:31Z · body
- 2026-11-17T04:30:10Z · body
