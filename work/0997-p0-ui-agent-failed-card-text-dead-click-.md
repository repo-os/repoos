---
id: "0997"
title: "Agent-failed card text, dead click target, and unclickable restart modal"
type: bug
status: active
priority: p0
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/agent-failed-card-text-dead-click-target
review_cli_override: github copilot
review_model_override: default
created_at: "2026-11-01T07:03:42Z"
updated_at: "2026-11-03T02:29:39Z"
review_rounds: 1
routing_switches: 1
review_passes: 1
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

## Shots
```json
[]
```

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
- 2026-11-02T18:52:01Z · message_queued at 2026-11-02T18:52:01.022Z
- 2026-11-02T18:52:01Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-02T18:55:24Z · body
- 2026-11-02T18:57:01Z · CTO nudge: held — remote validation is running
- 2026-11-02T19:04:35Z · body
- 2026-11-02T19:04:47Z · watchdog: check wait escalated · waiting: waiting for a Playwright slot — position 2 (1 ahead); slot holder has made no progress for 30 minutes (no heartbeat) for 2s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-02T19:09:02Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-02T19:12:01Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-02T19:23:41Z · body
- 2026-11-02T19:29:03Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-02T19:29:03Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-11-02T19:29:04Z · message_delivered: 1 message(s)
- 2026-11-02T19:32:20Z · status active→review
- 2026-11-02T19:32:20Z · note: shots: skipped — 6 shots already captured — an engineer-made capture pre-empts the automatic one
- 2026-11-02T19:32:21Z · note: shots: skipped — 6 shots already captured — an engineer-made capture pre-empts the automatic one
- 2026-11-02T19:47:25Z · note: review pass 1: failed — no usable report
- 2026-11-02T19:47:25Z · needs_input
- 2026-11-02T23:54:06Z · review_cli_override, review_model_override
- 2026-11-02T23:54:12Z · needs_input (review-failed) cleared for review again by hello@repoos.org
- 2026-11-02T23:57:08Z · note: review pass 2: needs some work
- 2026-11-02T23:57:09Z · status review→active
- 2026-11-03T00:20:20Z · body
- 2026-11-03T00:20:38Z · watchdog: check wait escalated · waiting: waiting for a Playwright slot — position 2 (1 ahead); slot holder has made no progress for 30 minutes (no heartbeat) for 2s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-03T00:22:08Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-03T00:39:29Z · handoff failed · remote validation failed: test failure: tests/ai-chat-standard.test.ts > no chat ships an animation it never defined > every `animation:` name in a component resolves to a @keyframes block on bee — fix it in the feature branch and re-run the gate
- 2026-11-03T02:04:20Z · CTO nudge: held — remote validation is running
- 2026-11-03T02:21:40Z · body
- 2026-11-03T02:29:27Z · body
- 2026-11-03T02:29:27Z · note: shot removed: Failed card: status line shows the recorded crash reason on hover
- 2026-11-03T02:29:33Z · body
- 2026-11-03T02:29:33Z · note: shot removed: Restart work opens the shared body-teleported restart dialog
- 2026-11-03T02:29:34Z · note: shot removed: Failed card: status line shows the recorded crash reason on hover
- 2026-11-03T02:29:35Z · note: shot removed: Failed card: status line shows the recorded crash reason on hover
- 2026-11-03T02:29:36Z · note: shot removed: Restart work opens the shared body-teleported restart dialog
- 2026-11-03T02:29:37Z · body
- 2026-11-03T02:29:37Z · note: shot removed: Cancel in the restart dialog responds to a real click and closes it
- 2026-11-03T02:29:38Z · note: shot removed: Failed card: status line shows the recorded crash reason on hover
- 2026-11-03T02:29:39Z · note: shot removed: Restart work opens the shared body-teleported restart dialog
