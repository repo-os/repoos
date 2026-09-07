---
id: "0333"
title: Hide the top-bar connection indicator unless the server is disconnected
type: feature
status: ready
priority: p2
area: ui
assigned_to: ai
created_by: hello@repoos.org
branch: ""
created_at: "2026-09-07T18:45:52Z"
updated_at: "2026-09-07T18:47:49Z"
---
## Problem

The top bar always shows a green "live" connection pill in the upper right
corner whenever the UI is connected to the server. A permanently-on
"everything is fine" indicator is visual noise: it draws the eye on every page
load without adding information. The state that actually matters to a user —
the server being unreachable — is not differentiated strongly enough (it swaps
the same pill to a subdued "offline" rather than making the problem obvious).

## Desired UX

- While the server is connected, the top bar shows **no connection indicator
  at all** — the upper-right corner is clean.
- When the connection is lost, a **red indicator** appears in the same
  upper-right spot, carrying a meaningful tooltip such as
  **"Server is disconnected"**.
- When the connection is restored, the indicator disappears again
  (silence = healthy).

## Acceptance criteria

- [ ] While connected (`connected === true` in the repo store), no green
      "live" pill/dot/text renders in the top bar.
- [ ] When the connection drops, a red indicator appears in the top bar's
      upper-right area (same position as the old "live" pill).
- [ ] The red indicator has a meaningful tooltip reading "Server is
      disconnected" (or equivalent wording).
- [ ] On reconnect, the red indicator is removed again — it is only ever
      visible while disconnected.
- [ ] The initial "loading" connection state is treated the same as
      connected: no indicator shown.
- [ ] The indicator remains accessible when shown (screen-reader label /
      `aria-label` reflecting the disconnected state).
- [ ] `bun run build:ui` (or full `bun run build`) passes and the UI smoke
      test is clean.

## Notes for AI

- The current indicator lives in `src/ui-app/src/components/TopBar.vue`:
  the `connState` computed (`"loading" | "live" | "offline"`, ~line 19) and the
  `.conn` div in the template (~line 338) with its `:title`/`:aria-label`.
  Connection state comes from the `connected`/`loading` refs of the Pinia
  repo store (`src/ui-app/src/stores/repo.ts`).
- Simplest implementation: render the `.conn` element only when
  `connState === "offline"` (`v-if`), styled red, with the tooltip text.
  No store changes expected.
- **Stated assumptions:**
  - Tooltip wording "Server is disconnected" is used; exact copy may be
    tweaked slightly as long as it is meaningful.
  - The `loading` state is hidden too (the user's ask implies no indicator
    unless something is wrong; a flash of "loading" on every page load would
    defeat that).
  - The disconnected indicator is non-interactive (tooltip only, no click
    action) — no retry button was requested.
- **Do NOT touch** the other places that surface connection state:
  `Sidebar.vue` ("server connected" row) and `FeedPanel.vue`
  ("connected / reconnecting" label) are out of scope for this task.
- Zero runtime dependencies — this is a pure UI change.
- After any UI change, rebuild (`bun run build:ui` for speed or
  `bun run build`) so the worktree build is fresh.

## Scope

Covers only the top bar (TopBar.vue) connection indicator. Deferred /
explicitly out of scope: the Sidebar's server status row, the FeedPanel's
streaming label, and any disconnect toast/notification or auto-retry UX
(nothing of the sort was requested).

## Original prompt

Rather than showing the  green "live" server connected state in the upper right corner only show it if the server gets disconnected (e.g. a red color thing with a meaningful tooltip like "server is disconnected")

## Activity

- 2026-09-07T18:45:52Z · created · hello@repoos.org
- 2026-09-07T18:47:09Z · status draft→inbox, title, area, body
- 2026-09-07T18:47:49Z · status inbox→ready
