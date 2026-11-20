---
id: "1279"
title: "Easter eggs bundle: rename review history column to Issues"
type: feature
status: ready
priority: p3
area: web
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-20T10:35:33Z"
updated_at: "2026-11-20T10:45:33Z"
---
## Problem
The review pass history table in the task drawer has a column headed 'finding classes', which means little to a reader. It is useful as a quick view of what is wrong when a pass is not good to go.

## Desired UX
1. Rename the review history column 'Finding classes' to 'Issues'. Keep the content (reviewer class labels, a dash when none).
2. Work board cards: show the task number as plain text, not a chip/button, the way the Pipeline view does, to save space on the card's top line. The task number chip in the task drawer stays the clickable one.
3. The top line of a board card (task number, type, priority and robot icon) must never wrap to a second line. If something must shrink to fit, shorten the type label 'feature' to 'feat'.

## Acceptance criteria
- Header in src/ui-app/src/components/TaskDrawer.vue (the finding classes th, around line 7069) reads Issues.
- Any other user-facing text that says finding classes (user-docs/review-and-close-out.md and similar) is reworded to match; internal names and APIs stay unchanged.
- Tests that assert the old header text are updated.

## Notes for AI
Copy change only. Never touch repoos.toml. Headless Playwright only.

## Screenshots

![Review pass history table with the Finding classes column](/api/tasks/1279/attachments/att_f890472a-9287-4186-9f3b-df29a2c0616b.png)

## Activity

- 2026-11-20T10:35:33Z · created · t@t
- 2026-11-20T10:36:08Z · screenshots
- 2026-11-20T10:37:42Z · status inbox→ready
- 2026-11-20T10:38:55Z · title
- 2026-11-20T10:45:33Z · body: Desired UX (added 3, removed 1)
