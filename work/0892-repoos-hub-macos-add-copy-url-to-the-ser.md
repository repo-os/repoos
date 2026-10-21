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
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-21T05:57:31Z"
updated_at: "2026-10-21T12:03:45Z"
check_retry_count: 1
last_check_failure: "repoos check at 2026-10-21T11:18:00.093Z: repoos check failed: server-side finalization timed out (deadline exceeded)"
dev_error_count: 1
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

## Implementation notes
**Root cause.** The web UI saved the repo color only in `localStorage` (`repoos.repoColor.<repo>`). The Hub read it by evaluating JavaScript in the embedded `WKWebView`, and only on navigation finish / server switch, so a color picked in the page never reached the sidebar live. `localStorage` was also a weak cross-context source: the Hub kept its own isolated per-server data store, and the read could pick any repo's key.

**Fix.** The web UI now mirrors the preference into one first-party cookie, `repoos_repo_color`, whose value is `<repo-name>:<#RRGGBB>` with an explicit empty color for **Default** (`src/ui-app/src/repo-color.ts`). The Hub observes that server's isolated `WKHTTPCookieStore` (plus a low-frequency read fallback), applies the color to the sidebar row, and stores it as the registry's display cache. No script or message bridge is injected; see `docs/native-hub-webkit.md`. Legacy `localStorage` colors migrate into the cookie on first load, so existing bars keep rendering.

**Copy URL.** The server context menu is now a pure model (`ServerActionsMenuModel`) and includes **Copy URL**, which copies the exact stored origin (scheme and port) for local and remote servers.

**Verified live.** Real Hub build from this worktree, branch UI served in its embedded web view against a running server: picking yellow showed the sidebar bar immediately; the header chip and bar matched; the color survived an app relaunch; **Default** cleared it; pn (purple) and Private (pink) kept their bars. The context menu showed **Copy URL** in place. See the after screenshots above.

## Verification
Verified on a worktree build of the Hub with `xcodebuild` (Debug, ad-hoc signed) and on screen:

- **Menu:** the server context menu shows **Copy URL** between Pin server and Edit server for local and remote entries. The action copies the saved origin verbatim, scheme and port included (`http://localhost:7559`); `ServerActionsMenuModelTests` covers both cases plus the pasteboard write.
- **Color bar:** a page in the server's own web view writing the same cookie string as `src/ui-app/src/repo-color.ts` (`repoos_repo_color=lightingai:#E4C86B`) updated the sidebar bar and the registry cache, and the bar survived quitting and relaunching the app. `pn` (#9E8FD0) and `Private` (#E07A8A) kept their bars throughout.
- **Real picker:** the branch's built web UI was served to the Hub from a local test origin (its API proxied to the local server) to exercise the real swatch popover; the header chip and sidebar bar matched.
- **Caveat:** the local server on `localhost:7559` is still running a pre-change web-UI build, so its picker only writes `localStorage` there. That is why the end-to-end picker run used the branch's built UI; the reader side is the same cookie in the same per-server data store either way.
- **Default:** the explicit empty color is parsed as `cleared` and maps to a nil accent (bar removed); `RepoAccentColorPreferenceTests.testEmptyColorIsAnExplicitDefault` pins it.

Swift tests run: `ServerActionsMenuModelTests`, `RepoAccentColorPreferenceTests`, `ServerSidebarRowLayoutTests` (all pass). `REPOOS_CHECK_CHANGED=main repoos check` passes.

## Screenshots

![Server context menu has no Copy URL item](/api/tasks/0892/attachments/att_e67ecc24-cacd-4c71-bf34-9f75393d2d75.png)
![lightingai color popover is yellow; sidebar bar is not](/api/tasks/0892/attachments/att_464c834d-dcfe-41db-831d-829b5eebf38f.png)
![After relaunch: lightingai's header chip and sidebar bar are both the chosen yellow, while pn (purple) and Private (pink) keep their bars](/api/tasks/0892/attachments/att_c5c05988-9b84-4f6d-8f76-b9cf822e86ea.png)
![After: the Hub sidebar shows a yellow bar on the lightingai row; pn and Private bars are unchanged](/api/tasks/0892/attachments/att_c519394b-b0ab-4f23-8e8b-620b2f01fcae.png)
![After: the server context menu includes Copy URL between Pin server and Edit server](/api/tasks/0892/attachments/att_365c5ac8-5770-4d47-b505-20b5fc561701.png)
![Before: lightingai has no sidebar bar; pn and Private keep their purple/pink bars](/api/tasks/0892/attachments/att_abc53aa0-642a-4b2d-ac77-065b81d4cd80.png)
![After: choosing the yellow swatch in the header immediately turns the lightingai sidebar bar yellow](/api/tasks/0892/attachments/att_24aa9516-f7a1-4a8c-be50-3fa05051f5ed.png)
![Sidebar before: lightingai has no color bar; pn and Private keep their existing bars](/api/tasks/0892/attachments/att_011e1bb8-f09e-44d7-a54e-746a27d4f353.png)
![Sidebar after: lightingai's yellow bar matches the yellow header chip (branch web UI on a local test origin)](/api/tasks/0892/attachments/att_66ea6fdb-70c7-41cd-b689-ba1ec1cd072e.png)
![Server context menu in this build: Copy URL sits with the other server items](/api/tasks/0892/attachments/att_45a0e879-72b2-49b5-8506-e8754a18ada6.png)

## Activity

- 2026-10-21T05:57:31Z · created · njachowski@gmail.com
- 2026-10-21T06:06:44Z · screenshots
- 2026-10-21T06:06:50Z · screenshots
- 2026-10-21T06:07:16Z · body: Notes for AI (added 1, removed 1)
- 2026-10-21T06:14:25Z · status inbox→ready
- 2026-10-21T07:00:21Z · status ready→active, branch
- 2026-10-21T07:06:32Z · message_queued at 2026-10-21T07:06:32.045Z
- 2026-10-21T07:06:32Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-21T07:07:47Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-21T07:21:35Z · status active→ready
- 2026-10-21T07:21:37Z · engineer stopped by request
- 2026-10-21T07:21:50Z · status ready→active
- 2026-10-21T07:21:56Z · message_delivered: 1 message(s)
- 2026-10-21T07:24:28Z · body
- 2026-10-21T07:34:43Z · body
- 2026-10-21T08:02:59Z · status active→ready
- 2026-10-21T08:02:59Z · engineer stopped by request
- 2026-10-21T08:03:03Z · status ready→active
- 2026-10-21T08:13:13Z · message_queued at 2026-10-21T08:13:13.454Z
- 2026-10-21T08:13:13Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-21T08:17:25Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-21T08:22:35Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-10-21T08:22:35Z · engineer crash recovery: resuming opencode + opencode-go/deepseek-v4.1-flash (1/3 crashes in 30m) · the agent process exited with an error — open the task to see the full output
- 2026-10-21T08:22:37Z · message_delivered: 1 message(s)
- 2026-10-21T08:23:03Z · note: stopped orphaned engineer pid 96798
- 2026-10-21T08:23:04Z · message_delivered: 1 message(s)
- 2026-10-21T08:29:05Z · body
- 2026-10-21T08:36:42Z · body
- 2026-10-21T08:39:29Z · screenshots
- 2026-10-21T08:39:56Z · screenshots
- 2026-10-21T08:40:01Z · screenshots
- 2026-10-21T08:40:29Z · body: Implementation notes (added)
- 2026-10-21T08:40:30Z · message_queued at 2026-10-21T08:40:30.746Z
- 2026-10-21T08:42:35Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-21T08:45:36Z · screenshots
- 2026-10-21T08:45:40Z · body
- 2026-10-21T08:45:41Z · screenshots
- 2026-10-21T08:47:38Z · screenshots
- 2026-10-21T08:47:54Z · screenshots
- 2026-10-21T08:48:14Z · screenshots
- 2026-10-21T08:48:34Z · body: Verification (added)
- 2026-10-21T08:48:34Z · message_queued at 2026-10-21T08:48:34.717Z
- 2026-10-21T08:48:53Z · body: Verification (added 1, removed 1)
- 2026-10-21T08:48:53Z · message_queued at 2026-10-21T08:48:53.415Z
- 2026-10-21T08:50:25Z · body
- 2026-10-21T08:51:36Z · handoff_deferred: 3 queued message(s) must be read before review
- 2026-10-21T08:51:36Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-21T08:51:36Z · needs_input
- 2026-10-21T08:51:36Z · message_delivered: 3 message(s)
- 2026-10-21T08:54:13Z · body
- 2026-10-21T08:56:28Z · body
- 2026-10-21T09:06:23Z · body
- 2026-10-21T09:15:33Z · CTO nudge: held — machine under pressure (the memory compressor is holding 42% of RAM (10.1 GB of RAM) — holding new work until memory pressure eases)
- 2026-10-21T09:17:52Z · cli_override, model_override
- 2026-10-21T09:17:53Z · engineer stopped by request
- 2026-10-21T09:18:00Z · status active→ready
- 2026-10-21T09:18:04Z · status ready→active
- 2026-10-21T10:27:25Z · CTO nudge: held — machine under pressure (the memory compressor is holding 38% of RAM (9.2 GB of RAM) — holding new work until memory pressure eases)
- 2026-10-21T11:18:12Z · message_queued at 2026-10-21T11:18:12.385Z
- 2026-10-21T11:18:13Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-21T11:30:34Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-21T11:34:08Z · body
- 2026-10-21T11:40:42Z · CTO nudge: held — handoff gate is running
- 2026-10-21T11:41:30Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-10-21T11:41:30Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-21T11:41:31Z · message_delivered: 1 message(s)
- 2026-10-21T11:47:38Z · CTO nudge: held — handoff gate is running
