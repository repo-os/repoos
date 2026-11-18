# macOS RepoOS Hub QA pass — 2026-11-18 (task #1169)

Scope: build, launch, server discovery, connect, and first-run screens of the
native Hub in `macos/`. Environment: macOS 27.2.1, Xcode 27.2 (27B52), Debug,
`CODE_SIGNING_ALLOWED=NO`, DerivedData kept outside the repo. The app run used
`REPOOS_HUB_SUPPORT_DIRECTORY` pointing at a scratch directory; the unit-test
run did **not** (see "Registry written by the test host" below).

## Checked

| Step | Result |
| --- | --- |
| `xcodebuild … build` (RepoOSHub scheme, Debug, own derivedDataPath) | Pass — `BUILD SUCCEEDED` |
| `xcodebuild … test`, first run (before the fix below) | Pass — 188 XCTest cases, 0 failures. This run also wrote the real Hub registry; see below. |
| Launch built `RepoOS Hub.app` via `open -n --env REPOOS_HUB_SUPPORT_DIRECTORY=…` | Pass — one 1485×967 content window (CGWindow ID 9249). |
| Launch by direct exec of the binary from a shell | A process started, but the first window check (about 6 s after launch) listed only menu-bar-sized windows (34 pt tall) for that PID and no content window. Not explained, not a crash, not investigated further. The `open` path is the one used for everything else. |
| Empty-state window (no servers) | Renders: sidebar with "No servers yet", and the "Add your first RepoOS server" pane. Window-only capture, viewed and described here. |
| Add server sheet, "Running locally" discovery | Pass — found `repoos` at `localhost:7171` from `~/.repoos/servers` plus the live health probe. The sheet lists that one server with a `+` add control. |
| Add discovered server (health check + persist) | Pass — isolated `servers.json` entry written with `lastHealth: healthy`; sidebar row appears. |
| Connected server web view | Pass — renders the RepoOS sign-in page in the isolated web view; no blank screen. |

All screenshots were captured window-only with `screencapture -l<windowid>`;
the full screen was never captured. The PNGs are not committed: the
pre-commit secret scan cannot read their compressed payloads (it fails
closed above its 4 MiB expansion limit), so the findings above are the record.
The captures stay outside the repo in the run's scratch directory.

## Registry written by the test host (fixed)

`xcodebuild test` launches the Hub as the test host (`TEST_HOST`). With no
`REPOOS_HUB_SUPPORT_DIRECTORY` set, that process wrote Nick's real registry,
`~/Library/Application Support/RepoOS Hub/servers.json`, at 02:22:55Z (UTC).
What changed, as far as this run can tell:

- A new recents entry: route `/` on the server `repoos` (`127.0.0.1:7171`,
  ID `7B800A52-…`), `lastVisitedAt 2026-11-18T02:22:55Z`.
- `lastSelectedServerID` now points at that server.
- The eight saved server entries are intact, and their names, origins, and
  pin state were not touched.

The values `lastSelectedServerID` held before the run were not recorded, so
they are not restored here. Nick should decide whether to remove that single
recents entry and reselect a server by hand.

**Fix:** `ServerRegistryStore.applicationSupportDirectory` now returns a
per-process scratch directory when `XCTestConfigurationFilePath` is set, after
the explicit override check. The table-driven test
`testApplicationSupportDirectoryResolutionTable` covers three cases: an explicit
override under XCTest, an XCTest host with no override, and a normal launch. The
five `ServerRegistryStoreTests` cases pass. The real registry's modification time
did not change across that run.

The full unit suite was rerun after registry isolation: 189 cases pass, 0 fail
(188 before, plus the new table test), and the real registry's modification
time was unchanged across that run. This follow-up's focused XCTest
`ServerRegistryStoreTests.testRemovesXCTestSupportDirectory` passed on
2026-11-18, confirming the disposable registry directory is removed. Cleanup
now throws on removal failure instead of silently swallowing it; the app logs
that error during shutdown. A test verifies a failed removal is propagated.

## Not verified

- **Logged-in views (projects, tasks, drawers).** The sign-in page requires an
  email code. I entered the bootstrap admin email through synthetic clicks and
  keystrokes, but the field did not accept input, so the logged-in UI was not
  reached. AppleScript clicks did reach the native Add server sheet but not the
  `WKWebView` email field. That is an automation limitation, not evidence of a
  Hub input bug. The separate #1167 QA pass exercised signed-in screens on
  2026-11-17, but that does not verify them against this pass's build. The
  earlier record named human follow-up #1172; its task file is not present in
  this worktree, and completion has not been confirmed. Held human task #1174
  now tracks the sign-in check for this build. This acceptance criterion
  remains open until that task records its result.
- **Discovery of a server that is not already running.** Only the live
  `localhost:7171` server was exercised.
- **Settings, command palette, notifications, Dock badge, WebKit OAuth.** Not
  exercised.

## Fixed

- **Test host wrote the real Hub registry.** Fixed as described above, with a
  table-driven test.
- **XCTest scratch registry accumulated between runs.** The test host uses a
  unique temporary directory and removes it when the host exits. A focused test
  verifies cleanup.

No crash, blank screen, or broken screen was found in the checked UI paths, so
no UI source change was made.

## Follow-ups for a human

- Complete held human task #1174: sign in and verify the projects and tasks
  screens against this pass's build (acceptance criterion "shows
  projects/tasks without errors"). The previously referenced #1172 was not
  available in this worktree and is not claimed complete.
- Decide what to do about the recents entry and selection written to the real
  registry at 02:22:55Z (see above).
- Look into the direct-exec launch that showed no content window, if anyone
  launches the Hub outside LaunchServices.
