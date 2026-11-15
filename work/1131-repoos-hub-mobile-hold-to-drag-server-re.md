---
id: "1131"
title: "RepoOS Hub mobile: hold-to-drag server reordering, and move Find servers on my tailnet next to Add server"
type: feature
status: active
priority: p1
area: mobile
story: RepoOS Hub for Mobile
assigned_to: ai
created_by: t@t
branch: feat/repoos-hub-mobile-hold-to-drag-server-re
created_at: "2026-11-15T14:39:13Z"
updated_at: "2026-11-15T16:39:06Z"
check_retry_count: 1
last_check_failure: "repoos check at 2026-11-15T16:20:20.969Z: repoos check failed: reused check inputs changed during handoff — run the check again"
---
## Problem
Feedback from Nick after testing the #1127 build on his Nothing Phone (3a):

1. In the server list (`mobile/src/components/ServerListView.vue`), the **Edit** button in the header exists only to turn on a drag-to-reorder mode (`editMode`, `draggable`, testid `hub-edit-toggle`). It costs an extra tap and a mode switch.
2. **Find servers on my tailnet** sits at the top-left of the list, separate from the **Add server** button at the bottom. Nick looked for a way to add a tailnet server near Add server, didn't find one, and was confused.
3. If the trusted server is too old to have `GET /api/servers/tailnet` (bee is on v0.5.83), the discovery screen says "The server sent an unexpected reply." It doesn't tell him what's wrong or how to fix it.

## Desired UX
- Remove the Edit/Done toggle. Reorder servers with a long press on a row, then drag, the same way Nick's Tiao Android app does it (hold-to-drag with haptic feedback and a lifted-row look; on bee at ~/code/nick/tiao for reference). Tapping a row still opens the server, and the ⋮ menu still opens server edit and delete.
- Put **Find servers on my tailnet** in the bottom action area together with **Add server**. For example, a secondary button just above or next to the primary Add server button, or Add server opening a choice between "Enter a URL" and "Find on my tailnet". Pick whichever reads cleaner on a 412px-wide screen. The header keeps only the title and settings.
- If discovery gets a 404 or a non-JSON reply, show a plain message: "<server> is running an older RepoOS that can't list tailnet servers yet. Update RepoOS on that machine, or add servers by URL." Include a button that opens manual add.

## Acceptance criteria
- No Edit button. A long press on a row starts the drag, and the new order is saved the same way as today's reorder.
- A normal tap and the ⋮ menu work as before. Scrolling the list doesn't start a drag by accident.
- **Find servers on my tailnet** appears only in the bottom action area, next to Add server, and it's still reachable when the list is empty.
- A server without the endpoint shows the friendly message above, not "unexpected reply".
- Component tests are updated (hub-edit-toggle tests are removed or replaced), and `just build-android` passes.

## Verification notes
Hold-to-drag feel, haptics and iOS gesture behavior are covered by code and component tests, not a real-device run; a quick check on Nick's phone is a human step. This repo has no preview target for the Hub app, so handoff screenshots will show the desktop app rather than the mobile picker — an evidence gap, not a missing change. `just build-android` passed on this branch.

## Activity

- 2026-11-15T14:39:13Z · created · t@t
- 2026-11-15T14:39:14Z · needs_input
- 2026-11-15T14:39:29Z · status inbox→ready
- 2026-11-15T14:39:33Z · status ready→active, needs_input, branch
- 2026-11-15T15:18:38Z · body
- 2026-11-15T15:27:03Z · body
- 2026-11-15T15:31:23Z · body: Verification notes (added)
- 2026-11-15T15:31:23Z · message_queued at 2026-11-15T15:31:23.203Z
- 2026-11-15T15:34:06Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-15T15:34:25Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-15T15:34:25Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: Now wire the manual-add emit in `App.vue`: · stderr: (empty)
- 2026-11-15T15:34:25Z · message_delivered: 1 message(s)
- 2026-11-15T15:36:10Z · body
- 2026-11-15T15:44:33Z · body
- 2026-11-15T15:48:50Z · body
- 2026-11-15T15:54:06Z · CTO nudge: held — machine under pressure (CPU idle is 0% (below 5%) — holding new work until the machine has idle CPU; system load is high (4.4× per CPU, limit 3×) — waiting for headroom before starting more work)
- 2026-11-15T15:56:52Z · message_queued at 2026-11-15T15:56:52.032Z
- 2026-11-15T15:59:06Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-15T15:59:55Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-15T16:03:30Z · message_delivered: 1 message(s)
- 2026-11-15T16:08:33Z · body
- 2026-11-15T16:09:57Z · CTO nudge: held — handoff gate is running
- 2026-11-15T16:10:27Z · message_queued at 2026-11-15T16:10:27.621Z
- 2026-11-15T16:13:40Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-15T16:13:41Z · message_delivered: 1 message(s)
- 2026-11-15T16:18:03Z · body
- 2026-11-15T16:19:54Z · CTO nudge: held — handoff gate is running
- 2026-11-15T16:20:18Z · message_queued at 2026-11-15T16:20:18.176Z
- 2026-11-15T16:20:39Z · message_delivered: 1 message(s)
- 2026-11-15T16:33:18Z · message_queued at 2026-11-15T16:33:18.495Z
- 2026-11-15T16:33:18Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-15T16:34:07Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-15T16:35:42Z · body
- 2026-11-15T16:37:46Z · queued message undelivered for 4m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-15T16:37:46Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: Check passed. Tests were skipped by the runner env (`REPOOS_SKIP_TESTS=1`), so let me run the affected suites directly to be sure. · stderr: (empty)
- 2026-11-15T16:37:46Z · message_delivered: 1 message(s)
- 2026-11-15T16:39:06Z · message_queued at 2026-11-15T16:39:06.965Z
