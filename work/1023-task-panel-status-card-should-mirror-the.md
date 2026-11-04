---
id: 1023
title: "Task panel status card should mirror the board card: same lines, same activity animation, no blank rows"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/task-panel-status-card-should-mirror-the
created_at: "2026-11-04T05:34:26Z"
updated_at: "2026-11-04T09:24:56Z"
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
![#1016 panel: Integrating pill reads 'queued #1 · 7m 29s — ahead: #1027 validating', a different wording from the card](/api/tasks/1023/attachments/att_776ae0f3-5692-4152-9944-d59cf66ca522.png)
![#1027 board card: 'integrating · remote tests · 7m 26s'](/api/tasks/1023/attachments/att_1743f691-e833-44da-8759-834b7a4a5c4e.png)
![#1027 panel: pill reads 'Integrating... (check · 7m 17s)' and the status dropdown is blank](/api/tasks/1023/attachments/att_bc803b78-7cff-4365-831d-ad6b102d2c5b.png)

## More examples
Seen on #1016 and #1027 while both were integrating (Move to done) on 2026-11-04. The card and the panel describe the same state in different words, and the panel loses information.

- #1027 card: "integrating · remote tests · 7m 26s". #1027 panel: "Integrating... (check · 7m 17s)". Same state, two labels ("remote tests" vs "check") and two clocks 9 seconds apart.
- #1027 panel: the status dropdown at the top left is empty while the task is closing out.
- #1016 panel: "Integrating... (queued #1 · 7m 29s — ahead: #1027 validating)". The card wording is not shown for queued, and the panel line is long and truncates.
- Both panels show a static pill with a bar glyph, not the Settings-selected activity animation the card uses.

Acceptance addition: for integrating, queued and validating states, the panel pill and the card use one shared label and elapsed-time source, and the status dropdown always shows the current status.


## Activity

- 2026-11-04T05:34:26Z · created · njachowski@gmail.com
- 2026-11-04T05:34:27Z · screenshots
- 2026-11-04T09:12:03Z · screenshots
- 2026-11-04T09:12:04Z · body: More examples (added)
- 2026-11-04T09:12:06Z · status inbox→ready
- 2026-11-04T09:12:08Z · status ready→active, branch
- 2026-11-04T09:24:55Z · message_queued at 2026-11-04T09:24:55.700Z
- 2026-11-04T09:24:56Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
