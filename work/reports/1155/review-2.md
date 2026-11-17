---
task: "1155"
pass: 2
at: "2026-11-17T15:23:28.855Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/repoos-hub-for-macos-is-broken-reproduce
state: ok
tree_identity: "4180a32c7:"
---
## Verdict
`good to go` — Round 1's selected-tab regression is fixed and the System-appearance surface drift is resolved for both SwiftUI and AppKit layers.

## Relevance
`still relevant` — `main` still returns `.white` for the System-preference shell and sidebar (matching Nick's screenshot), and no landed macOS commit supersedes this.

## Evidence
None

## Bugs
None found

No further findings of this class were found after grepping: `ContentView.shellBackground`, `ServerSidebarView.sidebarBackground` and row text, `HubServerTabStrip.stripColor`/`selectedTabColor`, both `appKitWindowBackgroundColor` overloads, `HubAppDelegate.applyAppKitAppearance`, `HubWindowChromeView.configureWindow`, `applyNativeSurfaceBackgrounds`, `DockIconAppearanceController`, `WorkspaceDetailView`/`ServerWebWorkspaceView` semantic backgrounds, every `cgColor`/`windowBackgroundColor` site in `macos/RepoOSHub`, both `RunningServerRegistryListOutcome` branches (`.unavailable`/`.hasFiles`), and every `LocalServerDiscovery.discover` call site in the tests. The round-1 finding (strip and tab sharing one colour) is genuinely fixed, not re-reported.

## Edge cases
- The repaint observer reads `window.effectiveAppearance` on `DistributedNotificationCenter`; if that notification is coalesced or missed (sleep/wake, display change) the AppKit frame can lag the SwiftUI flip until the next window event. Not reproducible without a live session.
- `emptyRegistrySource` points at a *nonexistent* directory, so those tests take the `.unavailable` branch, not `.empty`. Both run the fallback scan and `.hasFiles` is asserted separately, so coverage is correct — only the name is loose.
- Acceptance criterion 4 (add by URL → Healthy → open → relaunch) rests on prose; the `127.0.0.1:7171` alias left in Nick's real registry is disclosed. No crash log exists because the app did not crash.

## Could not verify (environment)
- The `repoos check` plan has no macOS test step, so `xcodebuild test` for `macos/RepoOSHubTests` was not re-run; the two new tests read consistently with the code paths they cover.

## Suggestions
- Attach before/after captures (`macos/scripts/hub-snapshots.sh` or manual) — this is a purely visual fix and `shots: skipped` is correct here, but the human has only prose plus the original broken screenshot to compare.
- `testShellAndSelectedTabSurfacesStayDistinctInBothAppearances` compares the *uncomposited* 8%-alpha label colour against the shell, so a 1% tint would also pass; composite over the strip and assert a rendered delta.
- Remove the now-unused no-argument `appKitWindowBackgroundColor` property — it still resolves against the global `HubSystemAppearance` and would reintroduce the drift if used.
- The 4→2-space reindent inflates the diff to ~1200 lines across four files; splitting it out would make this fix reviewable.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

