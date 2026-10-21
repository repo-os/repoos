# Hub layout snapshots

The macOS Hub (`macos/RepoOSHub`) has no browser preview, so a reviewer cannot
see a layout change without building and running the app. `HubSnapshotTests`
closes that gap: it renders key SwiftUI views offscreen with `NSHostingView` +
AppKit bitmap caching and writes PNGs that RepoOS can attach to a task as
evidence. It is a direct application of the approach Divot uses for its
popovers (`PopoverSnapshotTests` / `docs/popover-snapshot-testing.md`).

## What gets rendered

| Snapshot | View | Why |
| --- | --- | --- |
| `hub-sidebar-*` | `ServerSidebarView` | The navigation row, server rows, badges/affordances, and the add/Settings footer — the surface that changes most. |
| `hub-summary-*` | `ServerDetailsPopover` | The server summary: health, address, runtime details, and the attention counts (the "summary view"). |
| `hub-tabs-top-bar-*` | `HubServerTabStrip` | The compact Chrome-style tab strip used in Tabs mode, including its traffic-light inset and window-control-adjacent layout. |

Each view is rendered at a fixed size. The handoff set
(`HUB_SNAPSHOT_SET=shots`) writes the light appearance; a full manual run writes
light and dark.

**These are content renders, not window renders.** The sidebar's AppKit-backed
`List` is attached to a borderless offscreen host window so its rows lay out,
but that window is never shown, ordered front, or made key. An offscreen bitmap
has no visible window, titlebar, toolbar, traffic lights, safe areas, or frame
restoration, so a snapshot can show that the content is laid out correctly but
cannot show how a real window sizes or ornaments it. When the question is the
window itself — traffic-light placement, a real titlebar/tab-strip overlap,
full-screen geometry — use an XCUITest that presents the real window and
attaches a screenshot with `XCTAttachment`. A content snapshot is not a
substitute for that check.

## Running it

```sh
# Light and dark, into macos/.build/snapshots/ (gitignored)
macos/scripts/hub-snapshots.sh

# The reduced handoff set (light only)
HUB_SNAPSHOT_SET=shots macos/scripts/hub-snapshots.sh

# A specific directory
HUB_SNAPSHOT_DIR=/tmp/hub-shots macos/scripts/hub-snapshots.sh
```

Under the hood the script runs:

```sh
xcodebuild -project macos/RepoOSHub.xcodeproj \
  -scheme RepoOSHub \
  -destination 'platform=macOS' \
  -derivedDataPath macos/.derived-data \
  -only-testing:RepoOSHubTests/HubSnapshotTests \
  CODE_SIGNING_ALLOWED=NO test
```

The tests are gated by `HUB_SNAPSHOT_DIR`:

- **Unset — normal test run:** every snapshot test throws `XCTSkip`, so
  `xcodebuild test` (and CI) is unchanged.
- **Set — snapshot run:** PNGs are written into that directory. On a machine
  with no usable graphics context the render is blank and the test skips with a
  clear message instead of failing.
- `HUB_SNAPSHOT_SET=shots` narrows the output to the light appearance; any
  other value (or unset) writes light and dark.

`HUB_SNAPSHOT_DIR` must be an ignored location: inside a `.build` directory,
ending in `snapshots`, or exactly the RepoOS shot directory under
`.attachments/`. A tracked destination aborts the run so rendered images can
never be committed.

## RepoOS handoff integration

RepoOS collects these through a `[[shot.targets]]` command capture target.
`repoos.toml` is human-owned config and RepoOS's landability check rejects a
task branch that changes it, so the row is applied on main separately rather
than carried by a feature branch. The row is:

```toml
[[shot.targets]]
name = "RepoOS Hub"
paths = ["macos/RepoOSHub/**", "macos/RepoOSHubTests/**", "macos/RepoOSHub.xcodeproj/**", "macos/scripts/hub-snapshots.sh"]
command = "HUB_SNAPSHOT_SET=shots bash macos/scripts/hub-snapshots.sh"
outputGlob = ["**/*.png"]
requires = "xcodebuild"
timeoutMs = 600000
```

RepoOS selects it from the **changed paths**, not the task's `area`: a diff that
touches Hub sources (or its tests/project) gets the PNGs attached to the task as
shots at handoff; a task that touches none of those paths — including a
docs-only `macos` task — skips the target cleanly instead of paying for an Xcode
build. `requires = "xcodebuild"` turns a missing Xcode toolchain into a visible
`shots: skipped` note rather than a failed handoff. Declared `## Shots` entries
can name the target explicitly (`"target": "RepoOS Hub"`) and narrow the files
with `glob`.

A shot is local evidence, not a golden baseline: nothing compares it to a
stored image, and macOS version/font/DPI differences change the pixels.

## Adding a view

Add a `test…Snapshot()` method to
`macos/RepoOSHubTests/HubSnapshotTests.swift` that builds the view with fixture
state and calls `capture(_:size:content:)`. Keep the fixture deterministic
(fixed entries and dates, `attentionAggregationEnabled: false`) and prefer a
view that already exists in the app; if a view is `private` only so tests
cannot reach it, make it internal with a comment explaining why, as with
`ServerDetailsPopover`.
