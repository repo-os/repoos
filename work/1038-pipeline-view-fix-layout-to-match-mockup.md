---
id: 1038
title: "Pipeline view: fix layout to match mockup (no h-scroll, wider cards, lane padding, fill pane)"
type: bug
status: inbox
priority: p1
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-11-04T20:30:08Z"
updated_at: "2026-11-04T20:30:08Z"
---
## Problem

The Pipeline view shipped in #1035 does not match the approved mockup (attached to #1035). Two screenshots of the shipped view are attached below. What is wrong:

1. **It scrolls horizontally.** `.pipeline-grid` in `src/ui-app/src/components/PipelineView.vue` has `min-width: 1700px` and columns of `minmax(258px, 1fr)`, inside an `overflow-x: auto` wrapper. At a normal window width the Coding column is cut off, and a card sits half out of view at the left edge.
2. **Cards are too narrow.** `.pipeline-card` in `PipelineCard.vue` is a fixed `250px`, so titles clip ("Easter eggs bundle: New-button con…") and the agent line truncates ("grok-4.7-low · composer-…").
3. **No vertical padding in the lane.** Lanes are a fixed `96px` and the card has `min-height: 84px`, so the card nearly touches the hairlines above and below. The mockup has even breathing room.
4. **Lanes do not fill the page.** With one or two tasks, about 60% of the pane below is empty. The mockup's lane grid and Merged column run to the bottom.
5. **Other mismatches seen in the screenshots:**
- a stray vertical scrollbar plus a white corner square at the bottom right;
- the header row is taller than it needs to be, with a large gap before the first lane;
- an unrequested 150px left gutter ("Ready · 8" chip, "sent back once") eats width, and the mockup puts "sent back once" inside the lane;
- the Merged column tint reads olive/yellow in dark mode, where the mockup shows green;
- a held or paused card is dimmed to `opacity: 0.55`, so the #1036 card looks washed out. State should be shown with a chip, not by fading the whole card.

## Desired UX

- **No horizontal scroll at any normal width.** All six stage columns (Coding, Checks, Handoff, Review, Close-out, Merged) fit the page width and share it evenly. Remove the `min-width: 1700px`, the `overflow-x: auto` wrapper and the fixed column minimums. Below about 1000px wide it may fall back to a horizontal scroll, but the default must never scroll.
- **Wider cards.** The card fills its column minus an even gutter (about `column width - 2 x lane padding`), with a sensible `max-width` (about 360px) so a very wide window does not stretch it absurdly. Four lines stay four lines; the title and agent line should clip far less often.
- **Lane padding.** Each lane has vertical padding around the card equal to the horizontal padding between the card and the column guides (about 8px to 10px). Lane height is the card height plus that padding on both sides; the card stays centered.
- **Lanes fill the pane.** The grid, the faint hairline guides and the green Merged column run the full height of the page content area, down to `--page-bottom-inset`, even with only one or two tasks. Empty lanes are drawn as lane-height empty rows (or the guides simply extend), never as a blank void.
- **No scrollbars unless needed.** No vertical scrollbar or corner square when the content fits. Overflow scrolls only when there are more lanes than fit.
- **Compact header and gutter.** Drop the header row to the label height (about 28px) with no gap. Remove the left gutter column; show "sent back once" as a small amber note on the card or just above it, as the mockup does, and put the "Ready - N" queue count somewhere that does not take a column (for example beside the Pipeline/Board toggle or in the header row's left corner as an overlay).
- **Merged column is green** in both themes, using the existing green tint token, checked against the mockup in dark mode.
- **Held and paused state is a chip, not a fade.** Remove `opacity: 0.55` on `.is-held` and `.is-paused`; use the existing chip or the pause or play glyph treatment so the card text stays readable. (If a lighter dim is wanted for held cards, keep it to the border and background, never the text.)

## Acceptance criteria

- [ ] At 1280px and 1920px wide, all six columns are visible with no horizontal scrollbar (verified with a screenshot at each width in the Changes tab).
- [ ] Cards fill their column minus even gutters and are visibly wider than 250px at 1920px; titles clip only when genuinely long.
- [ ] Vertical lane padding around each card equals the horizontal padding to the column guides (within 1px), cards centered in the lane.
- [ ] With one active task, the lane grid, guides and green Merged column extend to the bottom of the page content area; with 10 tasks, the lanes scroll vertically inside the page without a corner square.
- [ ] No left gutter column; "sent back" and the Ready queue count are still shown and nothing else regresses (stuck, needs-input, held and paused chips, click-to-open task panel).
- [ ] Held and paused cards are no longer text-dimmed; they are identifiable by a chip or glyph.
- [ ] Merged column tint is green in light and dark mode and passes the contrast audit.
- [ ] Declared `## Shots` for the Pipeline route in light and dark with 1 task and with several; update the existing PipelineView component tests, and add a test that no `min-width` forces horizontal scroll.

## Notes for AI

- Files: `src/ui-app/src/components/PipelineView.vue` (grid, lanes, gutter, Merged tint) and `PipelineCard.vue` (card width, `.is-held` and `.is-paused` opacity). The mounting site is `src/ui-app/src/views/WorkView.vue`.
- Follow the repo layout rules in AGENTS.md: the view root spans the full `.main` width and fills the height, with `--page-bottom-inset` on the actual scrollport. A grid with `grid-template-rows: auto repeat(N, minmax(lane, 1fr))` plus a min-height of 100% is one way to fill the pane; a pseudo-lane background pattern is another. Pick whichever keeps the Merged column continuous.
- The approved mockup is attached to #1035 (third Screenshots image); treat it as the source of truth for spacing and colors, and the two attached screenshots here as the "before".
- Colors via the existing tokens only (`--green-tint`, `--txt-faint`, hairline `color-mix` already used); the `hardcoded-colors` guard applies.
- Related: #1034 (stuck-text clamp) touches the same card; rebase or coordinate if both are in flight.

## Screenshots

![Shipped: scrolled right, Coding column cut off, lanes stop early](/api/tasks/1038/attachments/att_f33b9cd4-573e-49de-9f07-b79000f23902.webp)
![Shipped: narrow card clipping title, left gutter, empty pane below](/api/tasks/1038/attachments/att_f4973ca2-7bd8-4982-8474-68f7bfdcd925.webp)

## Activity

- 2026-11-04T20:30:08Z · created · njachowski@gmail.com
- 2026-11-04T20:30:08Z · screenshots
