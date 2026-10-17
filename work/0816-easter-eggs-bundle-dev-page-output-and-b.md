---
id: "0816"
title: "Easter eggs bundle: Dev page output and buttons, integration timer, badges, Human list"
type: feature
status: inbox
priority: p3
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-17T08:02:53Z"
updated_at: "2026-10-17T08:02:53Z"
---
## Problem
Several small UI issues, bundled as the one open easter-eggs bundle. Replaces #0814, which was marked done with no code landed.
1. The Dev page Last output panel shows many lines (67 in the Divot example), so it is long and hard to scan.
2. Expanding or minimising an output panel is forgotten when you leave the page and come back.
3. Start, Stop and Restart sit in the middle of the Dev card, away from the target name. The card also has empty space above the Command line.
4. The integration timer chip shows how long a run has taken, but gives no sense of how long a run usually takes.
5. Some card badges are too long: 'doesn't look fully fleshed out' and 'needs a human-only verification step' take a lot of room.
6. There is no quick way to see every task that needs a human. Tasks are only in their status columns.
7. On a stopped Dev target, the URL line is clickable and opens a dead page. It should be greyed out.

## Desired UX
- Item 1: the output panel shows at most 6 lines by default, with a scroll for more. It starts minimised, unless the last run ended in an error, in which case it opens so the error is visible.
- Item 2: the expanded or minimised state of each output panel is remembered per target across page changes and reloads.
- Item 3: Start, Stop and Restart sit on the right side of the card, directly below the target name (for example site, docs). The Command line moves up into the space the buttons left, and the URL line follows it, so the card is shorter.
- Item 4: hovering the integration timer shows a tooltip with the median duration of the last 15 integration runs that have timing data (or fewer, if fewer exist), using the app's existing designed tooltip or popover. Clicking the timer switches it to a countdown from that median, in a clearly different style, such as T-01:34 in italics. Clicking again switches back.
- Item 5: shorten badge text by a word or two where the meaning stays clear: 'doesn't look fully fleshed out' becomes 'not fully fleshed out'; 'needs a human-only verification step' becomes 'Needs human step'. Review the other long badges and shorten any that lose nothing.
- Item 6: a 'Human' button beside the Archived button. It toggles a list of every task that needs a human, using the same human icon and colour as the human chip on the cards. The list works like the Archived list.
- Item 7: while the target is stopped, the URL is not a link and shows 'Click Start' in grey, matching the Start button. When running, it is a normal link.

## Acceptance criteria
- Test: an output panel with more than 6 lines shows 6 by default and scrolls for more.
- Test: a successful last run starts minimised; a failed last run starts expanded.
- Test: a panel expanded on the Dev page is still expanded after navigating away and back.
- Test: Start, Stop and Restart render on the right, below the target name; the Command line sits where the empty space was.
- Test: the median tooltip uses the last 15 runs with timing data, or fewer if fewer exist, and shows the count used. Clicking the timer switches to a countdown styled differently.
- Test: the badges read 'not fully fleshed out' and 'Needs human step'; the other shortened badges keep their meaning.
- Test: the Human button lists every task that needs a human, with the human icon and colour, and toggles like Archived.
- Test: a stopped target's URL is not a link and shows 'Click Start' in grey; a running target's URL is a link.
- Light and dark themes checked; keyboard operable; tooltips reachable by keyboard focus.

## Notes for AI
Start from the Dev page view (grep for 'Last output' and 'Restart'), the integration pipeline timer (src/ui-app/src/lib/integration-pipeline-ui.ts and its chip), the badge text (grep 'fleshed out' and 'human-only verification'), the Archived list (grep 'Archived') for the Human button, and the human chip styling on task cards. Use the shared tooltip or popover component (AGENTS.md: no native title tooltips). Store per-target expand state the same way other view preferences are remembered. Source: user requests 2026-10-17.

## Activity

- 2026-10-17T08:02:53Z · created · njachowski@gmail.com
