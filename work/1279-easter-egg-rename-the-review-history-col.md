---
id: "1279"
title: "Easter eggs bundle: rename review history column to Issues"
type: feature
status: ready
needs_input: true
needs_input_reason: needs-human-step
needs_input_detail: "Acceptance criteria mention a real device, physical hardware, accounts, credentials, or third-party registration — split that verification into a separate human-only task. (matched: named mobile hardware — \"Board card top line uses the plain task number as in the pipeline card, and stays on one line at phone, tablet and desktop widths, including long ids and p1 badges;\")"
priority: p3
area: web
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-20T10:35:33Z"
updated_at: "2026-11-20T10:46:10Z"
---
## Problem
The review pass history table in the task drawer has a column headed 'finding classes', which means little to a reader. It is useful as a quick view of what is wrong when a pass is not good to go.

## Desired UX
1. Rename the review history column 'Finding classes' to 'Issues'. Keep the content (reviewer class labels, a dash when none).
2. Work board cards: show the task number as plain text, not a chip/button, the way the Pipeline view does, to save space on the card's top line. The task number chip in the task drawer stays the clickable one.
3. The top line of a board card (task number, type, priority and robot icon) must never wrap to a second line. If something must shrink to fit, shorten the type label 'feature' to 'feat'.

## Acceptance criteria
- Header in TaskDrawer.vue (finding classes th, around line 7069) reads Issues; user-docs wording that says finding classes is reworded to match; internal names unchanged.
- Board card top line uses the plain task number as in the pipeline card, and stays on one line at phone, tablet and desktop widths, including long ids and p1 badges; 'feature' becomes 'feat' only when needed to fit.
- Tests asserting the old header text or the old chip are updated; headless fixtures at 375, 768 and 1280.

## Notes for AI
Copy change only. Never touch repoos.toml. Headless Playwright only.

## Screenshots

![Review pass history table with the Finding classes column](/api/tasks/1279/attachments/att_f890472a-9287-4186-9f3b-df29a2c0616b.png)
![Pipeline view: task number is plain text (#1275 FEATURE P1)](/api/tasks/1279/attachments/att_2af63faa-2ce5-45f6-9a94-683f604594c0.png)
![Board view: task number is a chip (#1279, #1271)](/api/tasks/1279/attachments/att_d98615f9-d1e6-40f5-aa8f-a5988611a4cc.png)

## Activity

- 2026-11-20T10:35:33Z · created · t@t
- 2026-11-20T10:36:08Z · screenshots
- 2026-11-20T10:37:42Z · status inbox→ready
- 2026-11-20T10:38:55Z · title
- 2026-11-20T10:45:33Z · body: Desired UX (added 3, removed 1)
- 2026-11-20T10:45:44Z · body: Acceptance criteria (added 3, removed 3)
- 2026-11-20T10:45:44Z · needs_input
- 2026-11-20T10:45:58Z · screenshots
- 2026-11-20T10:46:10Z · screenshots
