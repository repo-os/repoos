---
id: "0814"
title: "Easter eggs bundle: Dev page output rows, output collapse memory, and button layout"
type: feature
status: done
priority: p3
area: web
merged_commit: a281b0368d428cafb8210d0afc1ffbe2a016a5c0
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/easter-eggs-bundle-dev-page-output-rows-
created_at: "2026-10-17T05:50:02Z"
updated_at: "2026-10-17T06:47:06Z"
last_close_out_gate_ms: 258949
last_close_out_gate_at: "2026-10-17T06:46:16.801Z"
review_passes: 1
---
## Problem
Four small Dev page and integration UI issues, bundled into the one open easter-eggs bundle:
1. The Dev page Last output panel shows many lines (67 in the Divot example), so it is long and hard to scan.
2. Expanding or minimising an output panel is forgotten when you leave the page and come back.
3. Start, Stop and Restart sit in the middle of the Dev card, away from the target name.
4. The integration timer chip (for example '#0108 integrating… check 1m 36s') shows how long a run has taken, but gives no sense of how long a run usually takes.

## Desired UX
- Item 1: the output panel shows at most 6 lines by default, with a scroll for more. It starts minimised, unless the last run ended in an error, in which case it opens so the error is visible.
- Item 2: the expanded or minimised state of each output panel is remembered per target across page changes and reloads.
- Item 3: Start, Stop and Restart sit on the right side of the card, directly below the target name (for example site, docs).
- Item 4: hovering the integration timer shows a tooltip with the median duration of the last 15 integration runs that have timing data (or fewer, if fewer exist), using the app's existing designed tooltip or popover. Clicking the timer switches it to a countdown from that median, shown as a clearly different style, such as T-01:34 in italics, so it's easy to tell it apart from the count-up timer. Clicking again switches back.

## Acceptance criteria
- Test: an output panel with more than 6 lines shows 6 by default and scrolls for more.
- Test: a successful last run starts minimised; a failed last run starts expanded.
- Test: a panel expanded on the Dev page is still expanded after navigating away and back.
- Test: Start, Stop and Restart render on the right, below the target name, with the same behaviour.
- Test: the median tooltip uses the last 15 runs with timing data, or fewer if fewer exist, and shows the count it used.
- Test: clicking the timer switches to a countdown from the median, styled differently, and clicking again switches back.
- Light and dark themes checked; keyboard operable; the tooltip is reachable by keyboard focus.

## Notes for AI
Start from the Dev page view (grep for 'Last output' and 'Restart') and the integration pipeline timer (src/ui-app/src/lib/integration-pipeline-ui.ts and the chip component that shows the elapsed timer). Store the per-target expand state the same way other view preferences are remembered. Use the shared tooltip or popover component (AGENTS.md: no native title tooltips). Source: user requests 2026-10-17.

## Shots
```json
[
{
"label": "Dev card: actions sit below the target name, and a failed run opens with six scrollable output lines",
"target": "default",
"route": "/dev?shotState=dev:failed",
"highlight": ".dev-card"
},
{
"label": "Dev card: a clean run starts minimised, with Start/Stop/Restart on the right",
"target": "default",
"route": "/dev?shotState=dev:running",
"highlight": ".dev-card"
}
]
```

## Activity

- 2026-10-17T05:50:02Z · created · njachowski@gmail.com
- 2026-10-17T06:13:02Z · body
- 2026-10-17T06:14:20Z · status inbox→ready
- 2026-10-17T06:14:26Z · status ready→active, branch
- 2026-10-17T06:21:57Z · body
- 2026-10-17T06:24:25Z · body
- 2026-10-17T06:26:29Z · body
- 2026-10-17T06:27:22Z · body: section Shots
- 2026-10-17T06:29:11Z · body
- 2026-10-17T06:37:29Z · status active→review
- 2026-10-17T06:38:34Z · note: review pass 1: good to go
- 2026-10-17T06:46:16Z · close-out gate completed in 259s
- 2026-10-17T06:46:17Z · note: handoff requested (cli)
- 2026-10-17T06:46:18Z · handoff failed · task-file handoff failed at validate · task must be active or review, but is inbox
- 2026-10-17T06:47:06Z · status inbox→done, release:success
