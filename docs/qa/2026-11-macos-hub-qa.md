# macOS RepoOS Hub QA pass — 2026-11-18 (task #1169)

Scope: build, launch, server discovery, connect, and first-run screens of the
native Hub in `macos/`. Environment: macOS 27.2.1, Xcode 27.2 (27B52), Debug,
`CODE_SIGNING_ALLOWED=NO`, DerivedData kept outside the repo, Hub registry
isolated with `REPOOS_HUB_SUPPORT_DIRECTORY`.

## Checked

| Step | Result |
| --- | --- |
| `xcodebuild … build` (RepoOSHub scheme, Debug, own derivedDataPath) | Pass — `BUILD SUCCEEDED` |
| `xcodebuild … test` (RepoOSHub scheme, macOS destination) | Pass — 188 XCTest cases, 0 failures |
| Launch built `RepoOS Hub.app` with an isolated support directory | Pass via `open -n --env …`. A direct exec of the binary from a shell produced a process with no visible window; this is a launch-path difference, not a crash, and was not chased further. |
| Empty-state window (no servers) | Renders: sidebar with "No servers yet", "Add your first RepoOS server" pane. Window-only capture. |
| Add server sheet, "Running locally" discovery | Pass — discovered `repoos` at `localhost:7171` from the `~/.repoos/servers` registry plus the live health probe. |
| Add discovered server (health check + persist) | Pass — `servers.json` entry written with `lastHealth: healthy`, sidebar row shows. |
| Connected server web view | Pass — renders the RepoOS sign-in page inside the isolated web view, with no blank screen. |

Screenshots were captured window-only with `screencapture -l<windowid>`; the
full screen was never captured.

## Not verified

- **Logged-in views (projects, tasks, drawers).** The sign-in page requires an
  email code. I entered the bootstrap admin email through synthetic clicks and
  keystrokes, but the field did not accept input, so I could not reach the
  logged-in UI in this run. A human (or a session with the dev-login code at
  hand) needs to sign in and check the project and task screens.
- **Discovery of a server not already running.** Only the live `localhost:7171`
  server was exercised.
- **Settings, command palette, notifications, Dock badge, WebKit OAuth.** Not
  exercised.

## Fixed

No crash, blank screen, or broken screen was found in the checked paths, so no
source change was made in this pass. The unit suite is green.

## Follow-ups for a human

- Sign in to the connected server and verify the projects and tasks screens
  (the acceptance criterion "shows projects/tasks without errors"). This needs a
  person at the keyboard, or a session that can drive the sign-in field.
- Investigate the direct-binary launch showing no window (see the table) if it
  matters for anyone launching the Hub outside LaunchServices.
