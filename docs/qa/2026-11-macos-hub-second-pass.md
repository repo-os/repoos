# macOS RepoOS Hub QA second pass — 2026-11-19 (task #1193)

Scope: menu bar, Cmd-K quick switcher, server add/edit, relaunch persistence, and Hub light/dark appearance. Environment: macOS 27.2.1, Xcode 27.2 (27B52), Debug, `CODE_SIGNING_ALLOWED=NO`. DerivedData and QA registry were kept outside the repository at `/Users/nick/Library/Caches/RepoOS/macos-1193-derived` and `/Users/nick/Library/Caches/RepoOS/hub-qa-1193`.

## Checked

| Step | Result |
| --- | --- |
| `xcodebuild … build` (`RepoOSHub`, Debug, macOS SDK, own `derivedDataPath`) | Pass — `BUILD SUCCEEDED`. Xcode logged a CoreSimulator/CoreDevice version mismatch, but it did not block the macOS build. |
| Launch built app through LaunchServices with `REPOOS_HUB_SUPPORT_DIRECTORY` set | Pass — Hub opened to its empty state. All manual registry changes were confined to the QA directory. |
| File menu | Pass — New RepoOS Window, Add Server…, Close, and Close All were present and enabled appropriately. Add Server… opened the expected sheet. |
| Add server discovery | Pass — Running locally listed `repoos` at `localhost:7171`. Selecting it filled the address; Add server saved it after the health check. Sidebar showed the selected server as Healthy. |
| Edit server | Pass — sidebar context menu exposed Notifications…, Pin task…, Pin server, Copy URL, Edit server…, and Remove server. Edit sheet showed name, origin, group, SF Symbol, accent color, and pin controls. Changed the name to `RepoOS QA` and group to `Second pass`; after Save, the sidebar reflected both values and Healthy status. |
| Cmd-K quick switcher | Pass — `⌘K` opened the quick switcher. It showed the saved server, recent routes, and Add server. Query `repoos` filtered to those local entries; query `1193` showed No matches. |
| Relaunch | Pass — quit and relaunched the built app with the same isolated support directory. The edited `RepoOS QA` server was restored as selected and Healthy. The isolated JSON retained its display name, group, and selected server ID. |
| Hub appearance | Pass — Settings offered System, Light, and Dark. Both Light and Dark settings screens rendered with readable controls and labels; screenshots were captured window-only. |
| `xcodebuild … test` | Pass — 191 passed, 7 skipped, 0 failed. XCTest emitted AppKit constraint-conflict runtime warnings from `HubFindBarContainerTests`; these were not reproduced as a visual or functional fault in the quick switcher during this pass. |
| Window captures | Captured with `screencapture -l<windowid>` only. PNGs are in `/Users/nick/Library/Caches/RepoOS/hub-qa-1193/` and are not committed. |

## Not verified

- **Signed-in task search and task results.** The embedded server opened its sign-in page. Searching `1193` in the Hub quick switcher returned No matches, so this run verifies the shortcut, local filtering, and empty result state only. It does not prove task search against signed-in results. The task explicitly assigns signed-in project/task views to human task #1174.
- **Add/edit failure states and remote hosts.** Only a healthy local server was used. No failure response or remote origin was exercised.

## Findings

No reproducible Hub bug was observed in the tested paths, so no source change or new regression test was warranted. The macOS build passed, and XCTest passed with 191 tests, 7 skips, and 0 failures. The test host used an isolated support directory. XCTest did emit AppKit constraint-conflict runtime warnings from `HubFindBarContainerTests`; this pass did not establish those warnings as user-visible defects in the separate Cmd-K quick switcher.
