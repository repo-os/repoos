---
task: "1155"
pass: 1
at: "2026-11-17T15:07:52.110Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/repoos-hub-for-macos-is-broken-reproduce
state: ok
tree_identity: "3ad6687c8:"
---
## Verdict
`needs some work` — Tabs layout loses the selected-tab surface: the strip and tab fills now resolve to the same colour.

## Relevance
`still relevant` — the hard-coded white System-preference sidebar is still on `main`, and no landed macOS commit since the report addresses it.

## Evidence
None

## Bugs
- **Class: appearance consolidation collapsed distinct surfaces** — `macos/RepoOSHub/HubServerTabStrip.swift:190-196`: `stripColor` and `contentColor` both return `shellBackgroundColor(for:)`, so the selected tab's `HubServerTabShape().fill(contentColor)` (line 256) is the same colour as the 40pt strip behind it. Before this change the light strip was 0.90 grey with a white selected tab (0.08 vs 0.12 in dark); Tabs mode now has no selected-tab pill — only `.primary`/`.secondary` text and weight distinguish it. Give the tab its own appearance-aware surface (e.g. keep the strip on a slightly offset surface) instead of mapping both to the shell colour.

No further findings of this class were found after grepping: `ContentView.shellBackground`, `ServerSidebarView.sidebarBackground`, `WorkspaceDetailView`/`ServerWebWorkspaceView` semantic backgrounds, `HubSettingsView` `preferredColorScheme`, `HubWindowChromeView.configureWindow`, `HubAppDelegate.applyAppKitAppearance`, the tab’s hover/selected fills, `HubAppAppearanceTests`/`HubSnapshotTests`, and every `registrySource` call site in `LocalServerDiscoveryTests`/`RunningServerRegistryDiscoveryTests`.

## Edge cases
- The new theme-change observer repaints AppKit surfaces only when the preference is `.system`, and re-reads `AppleInterfaceStyle` at notification time; if the global default lags the distributed notification, the native frame can keep the old scheme while SwiftUI’s `colorScheme` already flipped.
- `testSystemWindowSurfaceResolvesForBothMacAppearances` covers `windowBackgroundColor`, not `shellBackgroundColor(for:)`, so a future view-level literal colour would not be caught. I re-ran that test plus both modified discovery suites: all pass, and the live-7559 test skips correctly.
- The engineer’s `127.0.0.1:7171` addition remains in Nick’s real Hub registry (disclosed).

## Suggestions
- Attach the before/after window screenshots the report describes; the drawer has no captures, so the visual result rests on prose.
- Merge or rename `stripColor`/`contentColor` once the distinction is restored, so the intent is explicit.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

