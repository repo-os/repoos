---
id: "0892"
title: "RepoOS Hub (macOS): add Copy URL to the server menu, and fix the server color bar not applying or persisting"
type: bug
status: active
priority: p2
area: macos
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/repoos-hub-macos-add-copy-url-to-the-ser
created_at: "2026-10-21T05:57:31Z"
updated_at: "2026-10-21T07:06:32Z"
---
## Problem
Two problems in the native macOS app (RepoOS Hub) server sidebar:

1. The server's context menu (Notifications..., Pin task..., Pin server, Edit server..., Stop local server, Restart local server, Remove server) has no way to copy the server's URL.
2. The colored bar on the left edge of a server row in the sidebar does not follow the color the owner picks. In the web UI header the owner picked yellow for the "lightingai" server (the color popover with 12 swatches and a Default button), but the sidebar row never shows a yellow bar. Other servers ("pn", "Private") do show bars (purple, pink), so the bar can render. After the app is refreshed, the color picked in the UI is lost as well. In a browser or the PWA, refreshing keeps the selected color, so the color is saved by the web UI correctly and the native app either does not read it back or does not store it in the place the sidebar reads from.

## Desired UX
- The server context menu has a **Copy URL** item that copies the server's full URL (the same URL shown under the server name, with scheme and port) to the clipboard.
- Picking a server color in the web UI immediately shows that color as the bar on the server's sidebar row in the Hub, and the color survives a refresh and an app restart, matching the browser/PWA behavior. Choosing **Default** clears the bar.

## Acceptance criteria
- Context menu: a Copy URL item, placed with the other server items, copies the exact server URL; works for local and remote servers; covered by a UI/unit test of the menu model.
- Find the cause of the color bug: where the web UI persists the chosen color (likely a per-server UI preference in local storage or a server-side setting), what the native app's sidebar reads, and why those differ for the embedded web view (separate web-view storage, a missing bridge message to native, or the sidebar color field never being updated from the web UI's change).
- Fix both directions: web UI color change updates the native sidebar bar; the sidebar bar and the web UI both come from one persisted source that survives refresh and relaunch.
- Verify with at least two servers: set a color on one, refresh, relaunch the app, and confirm the bar and the header color match; choose Default and confirm the bar clears.
- Do not change the existing colors of "pn" and "Private" (existing bars must keep rendering).
- Screenshots of the sidebar before and after, attached to the task with `repoos update <id> --screenshot`.

## Notes for AI
Native code is under macos/RepoOSHub (server list/sidebar view and its context menu). The web UI's color picker is the "lightingai" header chip popover; find where it saves (search the ui-app for the color swatch component and its storage key) and how the Hub embeds the page (WKWebView storage and any message bridge). The two reporter screenshots are in ## Screenshots: the server context menu (no Copy URL), and the yellow lightingai color popover with the sidebar bar unchanged. Verify on a real Hub build using the iOS/macOS tooling available, not only unit tests.

## Screenshots

![Server context menu has no Copy URL item](/api/tasks/0892/attachments/att_e67ecc24-cacd-4c71-bf34-9f75393d2d75.png)
![lightingai color popover is yellow; sidebar bar is not](/api/tasks/0892/attachments/att_464c834d-dcfe-41db-831d-829b5eebf38f.png)

## Activity

- 2026-10-21T05:57:31Z · created · njachowski@gmail.com
- 2026-10-21T06:06:44Z · screenshots
- 2026-10-21T06:06:50Z · screenshots
- 2026-10-21T06:07:16Z · body: Notes for AI (added 1, removed 1)
- 2026-10-21T06:14:25Z · status inbox→ready
- 2026-10-21T07:00:21Z · status ready→active, branch
- 2026-10-21T07:06:32Z · message_queued at 2026-10-21T07:06:32.045Z
