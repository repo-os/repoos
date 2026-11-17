---
id: "1151"
title: "Full-screen diff pages: make the Back control meet the 44px touch target"
type: bug
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-17T03:32:44Z"
updated_at: "2026-11-17T03:32:45Z"
---
## Problem
At 390×844, the Back control on the full-screen diff view measures 76×28 CSS px, below the app's 44×44 mobile touch-target convention. The same DiffView is routed at /tasks/:taskId/diff, /repo/working-diff and /repo/commits/:sha, so all entry points share the issue.

## Desired UX
The back action is easy to hit with a thumb on narrow phones without taking extra horizontal space from the diff.

## Acceptance criteria
- Back control measures at least 44px high and 44px wide on mobile at 390px and 320px.
- Keyboard focus remains visible and desktop layout is preserved.
- Verify all three DiffView routes.

## Notes for AI
Use the attached screenshot; inspect light and dark themes and a populated diff if available.

## Screenshots

![Repo working diff at 390×844: Back control is 76×28px](/api/tasks/1151/attachments/att_3406ddab-f98f-42a2-ad2e-2b10467d9dd8.png)

## Activity

- 2026-11-17T03:32:44Z · created · t@t
- 2026-11-17T03:32:45Z · screenshots
