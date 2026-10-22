---
id: "0922"
title: "Task drawer: expanding a tab hides the cards between title and tabs"
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/task-drawer-expanding-a-tab-hides-the-ca
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-10-22T05:45:27Z"
updated_at: "2026-10-22T12:51:15Z"
---
## Problem
The task drawer stacks a lot between the title and the tab strip: the handoff-failure banner, the status row (status picker, Stop work, Move to done), the "Not landable yet" checklist, the preview control, and the "Waiting for you" needs-input card. On a task with several warnings (see the attached #0908 screenshots: handoff failure, landability checklist, reviewer-failed card) these push the tab strip down and leave only a thin strip of vertical space for the tab's content (Review, Changes, Dev, ...).

The tab strip's expand button (#0750, `fullscreen` ref and `toggleFullscreen` in `src/ui-app/src/components/TaskDrawer.vue`, class `drawer-fullscreen` on the dialog) widens the drawer to the viewport, but it does not remove those cards, so the content still has little height. The button was added to give the tab content room, and it does not do that when warnings are showing.

## Desired UX
- While the drawer is expanded, everything between the title block and the tab strip is hidden: the failure and warning banners, the status row, the landability checklist, the preview control and the needs-input card. The tab strip stays pinned directly under the title and the tab content takes all the remaining vertical height and scrolls inside it.
- Collapsing (the same button, Escape) brings all of it back exactly as it was, including any card's own open/closed state.
- Nothing important is silently lost while expanded: show a compact one-line indicator in or next to the title (for example a warning dot with "N alerts") that collapses back when clicked, or a count badge on the toggle's tooltip. The indicator does not take the space back.
- The existing behaviour stays: Escape exits expanded mode instead of closing the drawer, state resets when the drawer closes or the task changes, drafts and scroll position are kept.
- Works at desktop and phone widths (see the second attached screenshot, where the cards fill almost the whole screen).

## Acceptance criteria
- Test: with `fullscreen` true, the banners, status row, landability checklist, preview control and needs-input card are not rendered (or are `display: none`) while the title, tab strip and active tab content are; with it false, all render as today.
- Test: toggling expand and back preserves a chat draft and the active tab's scroll position (hide with `v-show`/CSS or equivalent that keeps state; do not unmount stateful tab content).
- Test: the compact alert indicator appears only when there is at least one hidden warning, and clicking it exits expanded mode.
- Escape and close/task-change resets still work (existing #0750 tests stay green).
- Declare `## Shots` for a task drawer on a fixture with the failure banner, landability checklist and needs-input card, in both normal and expanded state, desktop and phone width, light and dark themes.
- Update docs that describe the tab strip's expand control so they say it also hides the cards above the tabs.

## Notes for AI
Start from the `fullscreen` ref, `toggleFullscreen`, `onEscapeKeyDown` and the `drawer-fullscreen` class (around lines 1950-1995 and 4030) and the tab-strip button near line 5131 of `TaskDrawer.vue`. The cards between the title and tabs are the template blocks above the tab strip; gate them on `!fullscreen`. The `.drawer-fullscreen` CSS lives in `src/ui-app/src/style.css` (drawer content is body-teleported). Follow the repo UI conventions: styled tooltip, no native `title`. Reported by the user on #0908, 2026-10-22, with two screenshots attached.

## Screenshots

![6](/api/tasks/0922/attachments/att_8dab3f32-c540-4f73-832f-f1f36f7589a0.webp)
![7](/api/tasks/0922/attachments/att_fd12dcf6-ab59-4573-af86-ff6bf09eac49.webp)

## Activity

- 2026-10-22T05:45:27Z · created · njachowski@gmail.com
- 2026-10-22T05:45:36Z · screenshots
- 2026-10-22T12:51:08Z · status inbox→ready
- 2026-10-22T12:51:14Z · cli_override, model_override
- 2026-10-22T12:51:15Z · status ready→active, branch
