---
id: "1084"
title: "Easter eggs bundle: task drawer status cards (one at a time, spacing, stray info icon)"
type: feature
status: inbox
priority: p3
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-11-10T04:51:24Z"
updated_at: "2026-11-10T04:51:25Z"
---
## Problem
The task drawer (screenshot, #1070 after a failed Move to done) stacks a red close-out failure card on top of a yellow "Waiting for you" review card. Several things are wrong:

1. **Two status cards at once.** We agreed on ONE status card at a time in the drawer. Pick the most actionable (a fresh close-out failure outranks a stale review-needs-work state) and show only that; fold the other into a collapsed "Also" line or the Details view.
2. **Stale/contradictory content.** The yellow card still says the reviewer sent it back 2 times and quotes a finding about the shell fade, while the red card says close-out failed on a test. The user cannot tell which is current or what to do next.
3. **Stray info (i) icon with a barely visible popup.** The popup repeats the card text ("The build or check gate failed on the merged branch...") and overlaps the check output text, nearly invisible. Remove the duplicate popover (or make it a real, readable popover only if it adds information); no native tooltip.
4. **Spacing.** The red card has no side padding relative to the drawer content and no gap between it and the yellow card below. Use the shared card spacing so edges and vertical gaps line up with the rest of the drawer.
5. Wording: avoid jargon ("gate", "merged branch") in the card text; say what failed and the single next action.

## Acceptance
- Only one status card renders at a time, with a deterministic priority order and a test.
- No duplicate info popover; check output stays readable.
- Consistent horizontal padding and vertical gaps; screenshot of the failed close-out state in light and dark.

## Notes for AI
Find the drawer cards in src/ui-app (task drawer status/close-out failure and review "waiting for you" components). Easter egg bundle: keep it to this card cleanup. Do not edit repoos.toml.

## Screenshots

![32](/api/tasks/1084/attachments/att_bf168d02-53c0-4a61-9f11-e304e50cca7e.webp)

## Activity

- 2026-11-10T04:51:24Z · created · njachowski@gmail.com
- 2026-11-10T04:51:25Z · screenshots
