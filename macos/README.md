# RepoOS Hub for macOS

This directory is a standalone native macOS shell for RepoOS. It is deliberately
independent from the root TypeScript package: the server and web application do
not import, build, or package anything from `macos/`, and the macOS target has
no third-party dependencies.

The scaffold ships a native sidebar workspace with a **local server registry**
(Application Support JSON). Adding or editing a server normalizes HTTPS origins
(or HTTP for a loopback development server such as `localhost:7171`),
calls `GET /api/health` with a 10-second timeout, and only then persists the
entry. Adding takes only an address; the Hub derives a sidebar name, and the
server's name, group, icon, color, and pin state remain editable from its
sidebar context menu. The main content area loads the selected server's RepoOS web UI in an
isolated `WKWebView` (per-server data store, no native JavaScript bridge), with
native back/forward/reload and a **⌘K quick switcher** for servers, recents, and
pinned task contexts. Authorized servers can expose compact **attention summaries**
via `GET /api/hub/v1/summary` (Hub read capability in Keychain); the sidebar shows
fresh/stale/unavailable state, badges, native notifications, and an optional Dock
badge total. See [`docs/native-hub-capabilities.md`](../docs/native-hub-capabilities.md)
and [`docs/native-hub-webkit.md`](../docs/native-hub-webkit.md)
for WebKit navigation, OAuth, and session behavior, and
[docs/macos-hub-navigation-retention.md](../docs/macos-hub-navigation-retention.md)
for recents and pinned-context retention rules.

## Requirements

- macOS 14 or later (per-server `WKWebsiteDataStore` identifiers)
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

## Project boundary

`macos/RepoOSHub.xcodeproj` is the native build entry point. Root commands such
as `bun run build`, `bun run test`, and the RepoOS web UI smoke test remain
unchanged and do not build this target. The macOS CI workflow runs the two
`xcodebuild` commands above on a macOS runner so Swift compile and unit-test
regressions are caught separately.
