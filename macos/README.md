# RepoOS Hub for macOS

This directory is a standalone native macOS shell for RepoOS. It is deliberately
independent from the root TypeScript package: the server and web application do
not import, build, or package anything from `macos/`, and the macOS target has
no third-party dependencies.

The first scaffold renders a harmless local placeholder workspace. It does not
load remote content, persist server records, use WebKit, expose a JavaScript
bridge, or access credentials. Server registry and isolated WebKit loading are
follow-up features covered by the macOS Hub architecture ADR.

## Requirements

- macOS 13 or later
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
