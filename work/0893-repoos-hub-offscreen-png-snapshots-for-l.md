---
id: "0893"
title: "RepoOS Hub: offscreen PNG snapshots for layout checks, with a shot target in repoos.toml"
type: feature
status: ready
priority: p2
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-21T07:08:04Z"
updated_at: "2026-10-21T08:38:06Z"
---
## Problem
RepoOS Hub (macos/RepoOSHub) has no way to capture images of its views for review. Divot already renders its popovers offscreen to PNG in tests and collects them as handoff evidence. Hub has no equivalent, so reviewers can't see Hub layout changes without running the app.

## Desired UX
- A snapshot test target for the Hub that renders key views offscreen (NSHostingView, cached to PNG). It is gated by environment variables, the same way Divot's PopoverSnapshotTests are (DIVOT_SNAPSHOT_DIR / DIVOT_SNAPSHOT_SET). Hub tests stay windowless and never order a window front.
- A [[shot.targets]] entry in repoos.toml that runs the snapshot command at handoff and collects the PNGs (outputGlob **/*.png), so the captures become the task's evidence.
- Start with the views the Hub changes most often: the sidebar, the summary view, and the top bar in Tabs mode (the compact Chrome-style tab strip with the traffic lights and the sidebar toggle), so layout bugs like #0895 (web view under the top bar, a duplicated collapse button) are visible in review. Add more later.

## Acceptance criteria
- Running the Hub snapshot command writes PNGs for the chosen views into the snapshot directory, and no test shows a real window.
- A handoff that touches Hub views produces those PNGs as task shots, and the shot target is skipped cleanly when the Hub target has no changed paths.
- The snapshot tests run only when the environment variables are set, so the normal test run is unchanged.
- Note in the task that offscreen snapshots show the view's content, not how a real window sizes itself, and say when a real-window check is needed instead (XCUITest with XCTAttachment).
- docs/ page for the Hub or its test workflow is updated to describe the snapshot command.

## Notes for AI
- Reference implementation: Divot's PopoverSnapshotTests and scripts/snapshots.sh in ~/code/nick/divot (see docs/popover-snapshot-testing.md there). Reuse the approach, not the code.
- Hub sources are under macos/RepoOSHub; its tests are under macos/RepoOSHubTests.
- Do not add a runtime dependency. Snapshot code belongs in the test target only.

## Activity

- 2026-10-21T07:08:04Z · created · njachowski@gmail.com
- 2026-10-21T07:47:33Z · status inbox→ready
- 2026-10-21T08:38:06Z · body: Desired UX (added 1, removed 1)
