---
id: "0997"
title: "Agent-failed card text, dead click target, and unclickable restart modal"
type: bug
status: review
priority: p0
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/agent-failed-card-text-dead-click-target
created_at: "2026-11-01T07:03:42Z"
updated_at: "2026-11-02T19:32:20Z"
---
## Problem

Three linked UI faults on a failed task (#0994, after an engineer stopped with "Could not create the task worktree: not a git repository"):

1. **The card hover text is generic.** The board card for an "Agent exited with error" task shows the tooltip "The agent exited with an error." The panel's Waiting-for-you card shows the real cause ("crash recovery could not start the engineer: Could not create the task worktree: not a git repository"). The hover should show that same reason, not the generic label.
2. **The yellow status line does nothing.** Clicking "AGENT EXITED WITH ERROR" on the card should open the task panel at the full error. It does nothing.
3. **The restart modal's buttons do not respond.** Clicking "Restart work" opens "Restart task #0994?" with Cancel, Start clean and Resume worktree. None of the three respond to clicks, however many times they are clicked. Something else appears to hold focus or pointer events over the modal.

## Desired UX

- Hover on the card and the yellow line both show the real failure reason, the same text the task panel shows.
- Clicking the yellow line opens the task panel on the status details.
- Every button in the restart modal works. Cancel closes it, Resume worktree and Start clean each run the action.

## Acceptance criteria

- [ ] The card tooltip and the yellow line use the same failure reason as the panel's Waiting-for-you card, with no generic fallback when a reason exists.
- [ ] Clicking the card's status line opens the task panel (keyboard too).
- [ ] Each button in the restart modal responds to a mouse click and to the keyboard. Test with a real click in the browser, not only in a unit test.
- [ ] A regression test fails on the current code for the modal click problem.
- [ ] Use the shared dialog components and `data-overlay-layer` (AGENTS.md), with no native title tooltip.

## Notes for AI

Likely causes to check first: the restart confirmation is not body-teleported with `data-overlay-layer`, so a layer behind it takes the pointer (AGENTS.md #0575); the card status line is a plain `<div>` with no click handler; the tooltip reads the generic label instead of the reason. Related server work is in `src/server/task-watchdog.ts` (queued messages to a stopped engineer; see the uncommitted-to-approval note below).

**Approval note:** a watchdog hotfix for "queued message to a stopped engineer never resumes" (`src/server/task-watchdog.ts`, `handleStalledCleanExit`) was written but not approved. It landed on main through the user's commit `7361989e3`. Confirm with the human whether to keep it before any further server change.

## Screenshots

![Board card and restart modal for #0994](/api/tasks/0997/attachments/att_f8aa23a2-1424-4a04-8973-2b1eacac126d.png)
![29](/api/tasks/0997/attachments/att_6f099625-7021-4e83-9d99-14555ec705c8.png)
![30](/api/tasks/0997/attachments/att_6305a077-4556-468c-b473-8df56584b8e4.png)

## Activity

- 2026-11-01T07:03:42Z · created · njachowski@gmail.com
- 2026-11-01T07:03:44Z · screenshots
- 2026-11-02T04:30:56Z · title, branch
- 2026-11-02T04:31:13Z · title, branch
- 2026-11-02T15:17:51Z · status inbox→ready
- 2026-11-02T18:38:54Z · status ready→active
- 2026-11-02T19:32:20Z · status active→review
