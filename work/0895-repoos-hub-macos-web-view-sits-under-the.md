---
id: "0895"
title: "RepoOS Hub (macOS): web view sits under the top bar in tabs mode (UI cut off), and sidebar mode shows two collapse buttons"
type: bug
status: active
priority: p2
area: macos
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/repoos-hub-macos-web-view-sits-under-the
created_at: "2026-10-21T08:37:10Z"
updated_at: "2026-10-21T12:48:08Z"
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
