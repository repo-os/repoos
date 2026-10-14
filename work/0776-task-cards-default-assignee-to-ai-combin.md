---
id: "0776"
title: "Task cards: default assignee to AI, combined area chip, compact file-change chip"
type: feature
status: review
priority: p1
area: [ui, core]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/task-cards-default-assignee-to-ai-combin
created_at: "2026-10-14T06:06:09Z"
updated_at: "2026-10-14T07:08:38Z"
review_rounds: 2
review_passes: 2
---
## Problem
Three things on the task card and defaults are noisy or wrong:

1. New tasks default to unassigned, so every card shows a '· open' chip. The default should be AI.
2. Multiple areas render as separate chips ('web' 'server'). They should be one chip, comma separated ('web, server').
3. The file-change chip shows files and lines together ('10f 377+'), which is long and hard to read. It should show only the file count.

## Desired UX
- Default assignee: the setting 'defaultAssignee' (src/core/config.ts, default 'unassigned' today) defaults to 'ai', so new tasks are AI-assigned and the '· open' chip is hidden for them. It stays editable in Settings and repoos.toml, and existing tasks are not changed.
- Areas: one chip for all areas, joined as 'web, server'.
- File changes: a chip showing only the count with a document icon, for example '📄 10', using the same icon style as the lock and dependency chips (#0660, #0661 in the screenshots). Use a distinct colour from the other chips so the file-change chip is easy to spot. Drop the line counts from the chip; keep them in the tooltip if useful.

## Acceptance criteria
- A new task created with no assignee is assigned to AI, and the '· open' chip is not shown for it. An existing unassigned or human-assigned task keeps its assignee.
- The Settings control for the default assignee shows 'AI' as the default, and repoos.toml accepts the same value.
- Multiple areas render as a single chip ('web, server'), with the same chip style.
- The file-change chip shows only the count with the icon and a distinct colour; line counts are not in the chip label.
- Tests cover the default assignee value, the single area chip, and the file-count label.
- docs/ and site/ pages describing the card and defaults are updated.

## Notes for AI
Screenshots from the maintainer are attached: 1 and 2 show the area chips ('core server cli ui' and 'web server'); 3 shows the '· open' chip and the '10f 377+' file chip on the card; 4 shows the lock chips for dependencies. The card is src/ui-app/src/components/TaskCard.vue (the assignee chip is around line 1040, the area chips and file-change chip near 1030-1060). The default is src/core/config.ts (defaultAssignee, around lines 191 and 2060).

## Shots
```json
[
{
"label": "Board card: one combined area chip and a file-count-only chip",
"target": "default",
"route": "/work",
"highlight": ".tc-area-chip, .tc-file-chip",
"steps": [
{
"waitFor": ".tc-file-chip"
}
],
"state": "board:cardChips"
}
]
```

## Implementation notes
This repo has no `site/` tree. The marketing site lives in `landing/` and describes no card chips, no areas, and no default assignee, so there was nothing to update there; the defaults/card documentation changes are in `user-docs/configuration.md` and `docs/concepts.md`. (#0776)

## Screenshots

![6](/api/tasks/0776/attachments/screenshot-1.png)
![7](/api/tasks/0776/attachments/screenshot-2.png)
![8](/api/tasks/0776/attachments/screenshot-3.png)
![9](/api/tasks/0776/attachments/screenshot-4.png)

## Activity

- 2026-10-14T06:06:09Z · created · njachowski@gmail.com
- 2026-10-14T06:06:10Z · screenshots
- 2026-10-14T06:15:44Z · status inbox→ready
- 2026-10-14T06:15:46Z · status ready→active, branch
- 2026-10-14T06:25:13Z · body
- 2026-10-14T06:34:18Z · body: section Shots
- 2026-10-14T06:37:17Z · body
- 2026-10-14T06:38:42Z · body
- 2026-10-14T06:45:49Z · status active→review
- 2026-10-14T06:45:56Z · note: highlight .tc-area-chip, .tc-file-chip matched nothing on /
- 2026-10-14T06:46:48Z · note: review pass 1: needs some work
- 2026-10-14T06:46:48Z · status review→active
- 2026-10-14T06:50:05Z · body: section Shots
- 2026-10-14T06:51:07Z · body
- 2026-10-14T06:52:33Z · body
- 2026-10-14T07:02:06Z · status active→review
- 2026-10-14T07:02:06Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (cd1f486fb) during finalization (#0734)
- 2026-10-14T07:02:07Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (cd1f486fb) during finalization (#0734)
- 2026-10-14T07:03:09Z · note: review pass 2: needs some work
- 2026-10-14T07:03:09Z · status review→active
- 2026-10-14T07:04:48Z · body: section Implementation notes
- 2026-10-14T07:06:18Z · body
- 2026-10-14T07:07:42Z · status active→review
- 2026-10-14T07:07:42Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (cd1f486fb) during finalization (#0734)
- 2026-10-14T07:07:42Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (cd1f486fb) during finalization (#0734)
- 2026-10-14T07:08:38Z · note: review pass 3: needs some work
