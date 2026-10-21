# RepoOS Hub for Mac

This directory is the standalone native macOS RepoOS Hub. It is deliberately
independent from the root TypeScript package: the server and web application do
not import, build, or package anything from `macos/`, and the macOS target has
no third-party dependencies.

The scaffold ships a native sidebar workspace with a **local server registry**
(Application Support JSON). Adding or editing a server normalizes HTTPS origins
(or HTTP for a loopback development server such as `localhost:7171`),
calls `GET /api/health` with a 10-second timeout, and only then persists the
entry. Adding takes only an address; the Hub derives the sidebar name from the
server's reported repository name (falling back to its address), and the
server's name, group, icon, color, and pin state remain editable from its
sidebar context menu. The window has no visible titlebar or toolbar row: the
native red/yellow/green window controls stay in their standard upper-left
position while the sidebar runs to the top edge and hosts the
back/forward/reload controls plus the sidebar toggle, with Settings in its
footer (#0855, #0857). A server row's context menu includes **Copy URL** (the
saved origin, scheme and port included, for local and remote servers) and its
left-edge color bar follows the repo color chosen in the embedded web UI. That
per-browser preference is shared through the first-party `repoos_repo_color`
cookie — no JavaScript bridge remains in the web view. A brand-new window opens
at 90% of the screen's visible frame rather than at its 880x520 minimum, so it
fills the screen like a browser; it stays resizable, and macOS frame restoration
takes over once the user has sized it (#0859). When the native sidebar is collapsed, a slim chevron
tab flush against the window's left edge brings it back. The main content area
loads the selected server's RepoOS web UI in an
isolated `WKWebView` (per-server data store, no native JavaScript bridge), with
native back/forward/reload and a **⌘K quick switcher** for servers, recents, and
pinned task contexts. Authorized servers can expose compact **attention summaries**
via `GET /api/hub/v1/summary` (Hub read capability in Keychain); the sidebar shows
fresh/stale/unavailable state, badges, native notifications, and an optional Dock
badge total. Cross-server task search in Cmd-K is opt-in per server via the Hub
task search API. See [`docs/native-hub-capabilities.md`](../docs/native-hub-capabilities.md)
and [`docs/native-hub-cross-server-search.md`](../docs/native-hub-cross-server-search.md).
and [`docs/native-hub-webkit.md`](../docs/native-hub-webkit.md)
for WebKit navigation, OAuth, and session behavior, and
[docs/macos-hub-navigation-retention.md](../docs/macos-hub-navigation-retention.md)
for recents and pinned-context retention rules.

## Requirements

- macOS 13 or later (the app declares a macOS 13 deployment target; per-server
  `WKWebsiteDataStore` identifiers, which persist sessions across relaunches,
  are macOS 14+, so on 13 the Hub falls back to in-memory per-server stores)
- Xcode 15 or later, with the macOS platform installed
- An Apple ID configured in Xcode for development signing (only needed to run
  a signed build from Xcode; command-line verification uses ad-hoc/no signing)

## Build and test from a checkout

From the repository root:

```sh
xcodebuild -project macos/RepoOSHub.xcodeproj \
  -scheme RepoOSHub \
  -configuration Debug \
  -sdk macosx \
  -derivedDataPath macos/.derived-data \
  CODE_SIGNING_ALLOWED=NO build

xcodebuild -project macos/RepoOSHub.xcodeproj \
  -scheme RepoOSHub \
  -destination 'platform=macOS' \
  -derivedDataPath macos/.derived-data \
  CODE_SIGNING_ALLOWED=NO test
```

The same project can be opened in Xcode with:

```sh
open macos/RepoOSHub.xcodeproj
```

Select the `RepoOSHub` scheme and press Run. For local development signing,
choose a Team under the target's **Signing & Capabilities** tab. Distribution
signing, hardened runtime, notarization, and secrets belong in a future
release workflow; no signing identity or credential is committed here.

The `macos/.derived-data/` directory is ignored and may be removed at any time.

### Layout snapshots

The Hub has no browser preview. `macos/scripts/hub-snapshots.sh` renders the
sidebar, the server summary popover, and the Tabs-mode top bar offscreen to PNGs
for review:

```sh
macos/scripts/hub-snapshots.sh
```

They land in `macos/.build/snapshots/` by default; `HUB_SNAPSHOT_DIR` overrides
the directory and `HUB_SNAPSHOT_SET=shots` writes the light-appearance handoff
set. The snapshot tests skip unless `HUB_SNAPSHOT_DIR` is set, so the normal
`xcodebuild test` run is unchanged. The repo's `[[shot.targets]]` row (declared
in human-owned `repoos.toml`) runs the same script at handoff and attaches the
PNGs to a task that touches Hub sources.

An offscreen snapshot shows the view's content, not how a real window sizes or
ornaments it. Use an XCUITest with `XCTAttachment` when the window frame,
traffic lights, or titlebar/tab-strip geometry is the question. See
[`docs/macos-hub-snapshots.md`](../docs/macos-hub-snapshots.md).

## Local server discovery (Add server)

The **Add server** sheet calls `LocalServerDiscovery` to populate **Running locally**.

**Primary source:** `~/.repoos/servers/<port>.json` files written by `repoos serve` (#0845).
Hub reads every `*.json` in that directory, skips malformed or unknown-schema files, and
validates each entry before showing it: the recorded PID must still be alive, and
`GET /api/health` must return `ok: true` with a `root` that matches the registry entry
(parallel probes, ~1.25 s timeout, one retry on timeout). Stale files are left on disk;
Hub does not delete them.

When the registry directory is **missing or empty**, Hub falls back to the bounded port
scan from #0844: it prefers **`/usr/sbin/lsof`** (`-iTCP:7000-7999 -sTCP:LISTEN`) to learn
which ports have listeners, then health-checks only those ports. If `lsof` is missing,
errors, or is blocked, Hub scans the full 7000–7999 range with bounded concurrency. An
empty `lsof` result means “no listeners” and does not trigger a full-range scan.

**Scan again** in the sheet re-runs the port scan and appends any new hits after the
registry-validated rows (same port is not duplicated).

If the Hub app is sandboxed, reading `~/.repoos/servers` may fail; discovery degrades to
the scan fallback without crashing. Distribution signing should grant read access to that
path (see signing tasks #0577–#0580).

`LocalServerDiscoveryTests` and `RunningServerRegistryDiscoveryTests` cover registry and
scan behaviour with fakes. An optional live test (`testLiveDiscoveryFindsLocalRepoOSWhenServingOn7559`)
skips unless `GET http://localhost:7559/api/health` reports `ok: true`.

## Project boundary

`macos/RepoOSHub.xcodeproj` is the native build entry point. Root commands such
as `bun run build`, `bun run test`, and the RepoOS web UI smoke test remain
unchanged and do not build this target. The macOS CI workflow runs the two
`xcodebuild` commands above on a macOS runner so Swift compile and unit-test
regressions are caught separately.
