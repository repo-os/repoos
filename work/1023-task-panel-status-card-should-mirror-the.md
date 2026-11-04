---
id: 1023
title: "Task panel status card should mirror the board card: same lines, same activity animation, no blank rows"
type: bug
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-11-04T05:34:26Z"
updated_at: "2026-11-04T05:34:27Z"
---
## Problem
While #1016 ran its handoff checks, the board card showed "RUNNING CHECKS" with the animated activity indicator (the style chosen in Settings, `activityAnimationStyle`). The task panel for the same task showed a different, static three-row block: "Confirming handoff / Handoff / Running checks…". The rows repeat each other, add no information, and leave mostly empty space. The card and the panel disagree about the same state. This was meant to be fixed already (see `eef0c75d6`, `a79124e85`, `68b544019`), but the panel's `confirmingHandoff` case still builds fixed three-line text.

Code: `drawerStatusSummary` in `src/ui-app/src/components/TaskDrawer.vue` (around lines 740-860; the `confirmingHandoff`, `reviewerRunning` and `workRunning` branches build `lines`) and the `.drawer-status-summary` markup around line 5610. The card side is `src/ui-app/src/components/TaskCard.vue`; the animation is `ActivityIndicator.vue`.

## Desired UX
The panel status block shows the same state label the card shows for that task (for example "Running checks"), with the Settings-selected activity animation, and one or two useful lines at most: what is happening and where (local or runner, scope), or the current handoff step. Rows that would only repeat the title or hold nothing useful are dropped, and the block shrinks to fit rather than keeping empty rows.

## Acceptance criteria
- For every state that shows on the card (work running, checks running, confirming handoff, reviewer running), the panel's status label matches the card's label for the same task at the same moment.
- Running states in the panel render `ActivityIndicator`, so the animation follows `activityAnimationStyle` and `activityAnimationSize`, as on the card.
- The block never shows a row that repeats another row or the heading. `confirmingHandoff` shows at most two lines (heading plus the current handoff step or check progress).
- Empty rows take no space.
- A test covers the label match for checks running and confirming handoff, and a declared shot shows the panel next to its card in the running state.

## Notes for AI
Reuse whatever the card uses to pick its label and progress line (`cardProgressLine` and friends) instead of building a second copy in the drawer. Screenshots: board card on the left, panel on the right, same task, same moment.

## Screenshots

![Board card: Running checks with animated indicator](/api/tasks/1023/attachments/att_4d98e6c3-ffea-40fc-ba5b-5ed65244ec16.png)
![Task panel for the same task: Confirming handoff, Handoff, Running checks…, no animation](/api/tasks/1023/attachments/att_e56947d0-dd1a-41a1-9e10-a6970e377175.png)

## Activity

- 2026-11-04T05:34:26Z · created · njachowski@gmail.com
- 2026-11-04T05:34:27Z · screenshots
