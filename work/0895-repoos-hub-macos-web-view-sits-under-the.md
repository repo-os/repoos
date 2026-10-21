---
id: "0895"
title: "RepoOS Hub (macOS): web view sits under the top bar in tabs mode (UI cut off), and sidebar mode shows two collapse buttons"
type: bug
status: review
priority: p2
area: macos
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/repoos-hub-macos-web-view-sits-under-the
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-10-21T08:37:10Z"
updated_at: "2026-10-21T14:15:01Z"
review_rounds: 1
review_passes: 1
handoff_signal_retry_count: 1
---
## Problem
Two layout problems in the native macOS app (RepoOS Hub), both visible in the new Window layout modes:

1. **Tabs mode: the web view sits UNDER the top bar instead of below it.** The embedded RepoOS web app starts at the very top of the window, behind the tab strip / traffic-light area, so the top of the web UI is cut off. In the screenshots the RepoOS header row (logo, wordmark, server chip, search) is partly hidden behind the traffic lights, and in the tab-strip view the sidebar-collapse button is drawn on top of the "RepoOS" tab label.
2. **Sidebar mode: the sidebar collapse button appears twice.** One copy sits in the top row next to the traffic-light buttons, another sits below it next to the back / forward / refresh buttons. Only one is wanted.

## Desired UX
- In tabs mode the web view's top edge starts at the bottom of the tab strip. No part of the web UI is hidden behind the tab strip, the toolbar or the traffic lights, in both full-screen and windowed layouts, light and dark.
- In sidebar mode there is exactly one sidebar collapse button: the one next to back / forward / refresh. Remove the one in the traffic-light row.
- In tabs mode nothing is drawn over the "RepoOS" tab label (the collapse control must not overlap a tab).

## Acceptance criteria
- The web view's frame (or its safe-area / content inset) accounts for the full title-bar and tab-strip height in both layouts, and the page's top row is fully visible; verify against the screenshots attached to this task and a real Hub build.
- One sidebar collapse button in sidebar mode, in the back/forward/refresh row; no duplicate in the title-bar row; the tabs-mode toolbar has no collapse button overlapping a tab.
- No regression for window resize, full screen, or switching between sidebar and tabs modes at runtime (no relaunch).
- A layout test or snapshot check where the harness allows it (see #0893 for offscreen snapshots); otherwise a short manual verification note in the task.

## Notes for AI
Native code is under macos/RepoOSHub (window/toolbar setup and the Tabs mode from #0875, plus the sidebar view). The title bar looks like a full-size content view, so the web view needs a top inset (safe-area or `contentLayoutGuide`) equal to the tab-strip height. The three reporter screenshots are attached to this task: 1.png shows the tab strip with the collapse button over the first tab, 2.png shows the top of the web UI cut off in a windowed layout, 3.png shows sidebar mode with the collapse button in both rows.

## Verification (engineer)
- New `HubWorkspaceChromeTests` hosts the real composition — `NavigationSplitView` detail → `HubWorkspaceChrome` → page, with the scene's `HubWindowChromeView` background — in a real `fullSizeContentView` NSWindow that is never ordered front. It asserts Tabs-mode page top == 46 (the strip's bottom edge), Sidebar-mode page top == 0 (reclaimed titlebar band), that the toolbar SwiftUI installs after scene setup is hidden once laid out, and that its automatic sidebar-toggle item is gone. A second test installs a toolbar late and re-runs layout: it is re-hidden and loses the toggle.
- `xcodebuild -scheme RepoOSHub ... test` on Xcode 26.6 / macOS 26.5.2: build succeeds, 164 tests pass. `LocalServerDiscoveryTests` (7) fail on this machine because the live `~/.repoos/servers/7171.json` registry makes discovery use its registry path instead of the tests' fake port scan; unrelated to this diff and reproducible without it. `repoos check --changed main` passes.
- Not verified by the engineer: pixel-level appearance in a running Hub window — the agent harness has no display, so a real Hub build was not watched. Reviewer/human check on a real build: windowed and full screen, light and dark, Tabs and Sidebar, and switching layout at runtime; confirm the page header clears the strip and only one sidebar toggle is present.

## Screenshots

![Tabs mode: the sidebar collapse button is drawn over the RepoOS tab](/api/tasks/0895/attachments/att_3acc8c47-27c9-4b61-8d96-3042886db432.png)
![Windowed layout: the top of the web UI is cut off behind the title bar and traffic lights](/api/tasks/0895/attachments/att_2d87281e-7286-4518-8f09-8adbdcb94885.png)
![Sidebar mode: the collapse button appears twice (title-bar row and back/forward/refresh row)](/api/tasks/0895/attachments/att_c5be048e-59f8-4617-809d-d124d0314c16.png)

## Activity

- 2026-10-21T08:37:10Z · created · njachowski@gmail.com
- 2026-10-21T08:37:37Z · screenshots
- 2026-10-21T08:37:46Z · screenshots
- 2026-10-21T08:37:55Z · screenshots
- 2026-10-21T11:37:53Z · status inbox→ready
- 2026-10-21T12:36:14Z · status ready→active, branch
- 2026-10-21T12:48:08Z · body
- 2026-10-21T12:48:58Z · body: Verification (engineer) (added)
- 2026-10-21T12:48:58Z · message_queued at 2026-10-21T12:48:58.690Z
- 2026-10-21T12:49:08Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-21T12:51:33Z · body
- 2026-10-21T12:51:55Z · body: Verification (engineer) (added 3, removed 3)
- 2026-10-21T12:51:56Z · message_queued at 2026-10-21T12:51:56.086Z
- 2026-10-21T12:53:44Z · body
- 2026-10-21T12:56:25Z · handoff_deferred: 2 queued message(s) must be read before review
- 2026-10-21T12:56:26Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-21T12:56:26Z · message_delivered: 2 message(s)
- 2026-10-21T13:09:10Z · status active→ready
- 2026-10-21T13:09:13Z · cli_override, model_override
- 2026-10-21T13:09:15Z · status ready→active
- 2026-10-21T13:27:10Z · handoff failed · remote validation failed: test failure: tests/agent-review.test.ts > agent review before human sign-off (#0101) > returns a task to active when review findings are auto-bounced to the engineer, tests/agent-review.test.ts > agent review before human sign-off (#0101) > flags needs_input instead of parking silently once auto-bounce rounds are used up, tests/agent-review.test.ts > agent review before human sign-off (#0101) > does not re-raise an exhausted-rounds flag dismissed during the review on thinkpad — fix it in the feature branch and re-run the gate
- 2026-10-21T13:32:00Z · note: handoff requested (ui-review)
- 2026-10-21T13:40:28Z · status active→review
- 2026-10-21T13:40:28Z · note: shots: skipped — Docs site skipped: no docs shot declared
- 2026-10-21T13:41:36Z · note: review pass 1: needs some work
- 2026-10-21T13:41:37Z · status review→active
- 2026-10-21T14:15:01Z · status active→review
