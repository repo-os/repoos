---
id: "0819"
title: "Easter eggs bundle: clearer docs-skipped warning, and check status in the screenshot viewer"
type: bug
status: inbox
priority: p3
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-17T12:52:42Z"
updated_at: "2026-10-17T12:52:42Z"
---
## Problem
When a change touches documentation, the handoff capture tries the Docs site preview target. If no declared shot names a docs route, the target is skipped, and the Changes tab shows '[shot-warning] declared shot not captured — Docs site matched only documentation content, and no declared shot names a route — docs captures need a declared route, so this target was skipped'. The wording is hard to act on. The screenshot viewer also shows only the image, not the green check or the warning, so the status is hidden when you open a shot.

## Desired UX
- The skipped docs warning reads: 'Docs site skipped: no docs shot declared', with a short link that explains how to declare a docs route for the task.
- The screenshot viewer header shows the shot's check (or cross) and any warning for that shot, the same as the row in the Changes list.

## Acceptance criteria
- Test: a docs-only change with no declared docs shot shows the new warning text and the declare link.
- Test: the screenshot viewer shows the shot's check and warning in its header.
- Light and dark themes checked on the warning and the viewer header.

## Notes for AI
Start from the shot-warning text in the handoff capture code (grep for 'docs captures need a declared route') and the screenshot viewer (grep for 'Screenshots' and 'Wider images scale down'). Source: user report 2026-10-17 on #0817's Changes tab.

## Activity

- 2026-10-17T12:52:42Z · created · njachowski@gmail.com
