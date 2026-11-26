---
id: "1293"
title: "Hub pull-to-refresh: hide the spinner when done and make it a symmetrical, prettier loader"
type: bug
status: inbox
priority: p2
area: mobile
story: RepoOS Hub for Mobile
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-26T17:20:25Z"
updated_at: "2026-11-26T17:20:26Z"
---
## Problem

The pull-to-refresh indicator added in #1286 stays on screen after the refresh finishes. It is also a text glyph (↻), which is lopsided and wobbles when it spins.

Likely cause: in `mobile/src/components/ServerListView.vue`, `onTouchEnd` resets `pullDistance` only when `refreshing` is false. Lifting the finger while a refresh is running leaves `pullDistance` above 0, and the indicator renders while `refreshing || pullDistance > 0`.

## Desired UX

The indicator appears while pulling and refreshing, then disappears smoothly when the refresh ends. While loading it is a clean, symmetrical circular spinner, centred above the list, that rotates around its exact centre and fits the Hub's pink-to-purple style. No other new UI.

## Acceptance criteria

- The indicator disappears after a refresh finishes, whether the finger is lifted before or after it finishes.
- It also disappears after a pull too short to trigger a refresh, a cancelled touch, and a refresh that fails.
- A refresh cannot stay in progress forever: every server check ends or times out.
- The loader is drawn with SVG or CSS (not a text character), is rotationally balanced, horizontally centred and does not wobble.
- Pulling gives visible progress toward the trigger point; the list does not jump when the indicator appears or leaves.
- Reduced-motion setting is respected.
- Normal scrolling, row menus and drag-to-reorder still work.
- A test covers the release-during-refresh case.

## Notes for AI

Files: `mobile/src/components/ServerListView.vue`, `mobile/src/style.css`, `mobile/src/App.vue` (`refreshServerList`), test in `src/ui-app/tests/mobile-server-list.test.ts`. No new dependencies.

## Screenshots

![Refresh arrow still showing above the server list after pulling down](/api/tasks/1293/attachments/att_63bb9b07-5f7d-479b-a397-d28200f42d53.png)

## Activity

- 2026-11-26T17:20:25Z · created · t@t
- 2026-11-26T17:20:26Z · screenshots
