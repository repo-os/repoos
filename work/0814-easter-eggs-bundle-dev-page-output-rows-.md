---
id: "0814"
title: "Easter eggs bundle: Dev page output rows, output collapse memory, and button layout"
type: feature
status: inbox
priority: p3
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-17T05:50:02Z"
updated_at: "2026-10-17T05:50:02Z"
---
## Problem
Three small Dev page issues:
1. The Last output panel shows many lines (67 in the Divot example), so it's long and hard to scan.
2. Expanding or minimising an output panel is forgotten when you leave the page and come back.
3. Start, Stop and Restart sit in the middle of the card, away from the target name.

## Desired UX
- Item 1: the output panel shows at most 6 lines by default, with a scroll for more. It is minimised by default, unless the last run ended in an error, in which case it opens so the error is visible.
- Item 2: the expanded or minimised state of each output panel is remembered per target across page changes and reloads.
- Item 3: Start, Stop and Restart sit on the right side of the card, directly below the target name (for example site, docs), not in the middle.

## Acceptance criteria
- Test: an output panel with more than 6 lines shows 6 by default and scrolls for more.
- Test: a successful last run starts minimised; a failed last run starts expanded.
- Test: a panel expanded on the Dev page is still expanded after navigating away and back.
- Test: Start, Stop and Restart render on the right, below the target name, with the same behaviour.
- Light and dark themes checked; keyboard operable.

## Notes for AI
Start from the Dev page view (src/ui-app/src/views/DevView.vue or the dev target card component; grep for 'Last output' and 'Restart'). Store the per-target expand state the same way other view preferences are remembered. Source: user request 2026-10-17.

## Activity

- 2026-10-17T05:50:02Z · created · njachowski@gmail.com
