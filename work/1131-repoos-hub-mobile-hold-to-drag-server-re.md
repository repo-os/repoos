---
id: "1131"
title: "RepoOS Hub mobile: hold-to-drag server reordering, and move Find servers on my tailnet next to Add server"
type: feature
status: review
priority: p1
area: mobile
story: RepoOS Hub for Mobile
assigned_to: ai
created_by: t@t
branch: feat/repoos-hub-mobile-hold-to-drag-server-re
created_at: "2026-11-15T14:39:13Z"
updated_at: "2026-11-15T16:50:15Z"
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

## Activity

- 2026-11-15T14:39:13Z · created · t@t
- 2026-11-15T14:39:14Z · needs_input
- 2026-11-15T14:39:29Z · status inbox→ready
- 2026-11-15T14:39:33Z · status ready→active, needs_input, branch
- 2026-11-15T16:50:15Z · status active→review
