---
id: "0816"
title: "Easter eggs bundle: Dev page output and buttons, integration timer, badges, Human list"
type: feature
status: ready
priority: p3
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-17T08:02:53Z"
updated_at: "2026-10-17T08:15:27Z"
---
## Problem
Three small UI items, the one open easter-eggs bundle. Items 1 to 4 of the earlier bundle #0814 (output row limit, output collapse memory, buttons on the right, integration timer median) already landed on main in 3e66d37e9 and are not repeated here.

1. Some card badges are too long: 'doesn't look fully fleshed out' and 'needs a human-only verification step' take a lot of room (src/ui-app/src/lib/needs-input-ui.ts).
2. There is no quick way to see every task that needs a human. Tasks are only in their status columns.
3. On a stopped Dev target, the URL line is clickable and opens a dead page. It should be greyed out.

## Desired UX
- Item 1: shorten badge text by a word or two where the meaning stays clear: 'doesn't look fully fleshed out' becomes 'not fully fleshed out'; 'needs a human-only verification step' becomes 'Needs human step'. Review the other long badges and shorten any that lose nothing.
- Item 2: a 'Human' button beside the Archived button. It toggles a list of every task that needs a human, using the same human icon and colour as the human chip on the cards. The list works like the Archived list.
- Item 3: while the target is stopped, the URL is not a link and shows 'Click Start' in grey, matching the Start button. When running, it is a normal link.

## Acceptance criteria
- Test: the badges read 'not fully fleshed out' and 'Needs human step'; other shortened badges keep their meaning.
- Test: the Human button lists every task that needs a human, with the human icon and colour, and toggles like Archived.
- Test: a stopped target's URL is not a link and shows 'Click Start' in grey; a running target's URL is a link.
- Light and dark themes checked; keyboard operable.

## Notes for AI
Start from src/ui-app/src/lib/needs-input-ui.ts (badge text), the Archived list (grep 'Archived') for the Human button, the human chip styling on task cards, and the Dev target URL line in src/ui-app/src/views/DevView.vue. Use the shared tooltip or popover component (AGENTS.md: no native title tooltips). Source: user requests 2026-10-17.

## Activity

- 2026-10-17T08:02:53Z · created · njachowski@gmail.com
- 2026-10-17T08:05:33Z · body
- 2026-10-17T08:15:27Z · status inbox→ready
