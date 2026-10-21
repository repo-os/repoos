---
id: "0857"
title: Restore native macOS window controls
type: feature
status: done
priority: p2
area: [macos, desktop]
merged_commit: cf79b120958e638f489a184e543e29dd03e1fc6f
assigned_to: ai
created_by: hello@repoos.org
branch: feat/restore-native-macos-window-controls
cli_override: pi
model_override: openrouter/deepseek/deepseek-v4.1-flash
created_at: "2026-10-19T17:58:19Z"
updated_at: "2026-10-21T14:32:42Z"
last_close_out_gate_ms: 85418
last_close_out_gate_at: "2026-10-19T19:08:18.544Z"
review_passes: 1
---
## Problem

The recent titlebar removal cleaned up the expanded sidebar and content layout, but the native macOS close, minimize, and fullscreen buttons are no longer visible. The collapsed-sidebar toggle is also a grey, floating, rounded-square button that overlaps the upper-left corner of the web content.

## Desired UX

Keep the titlebar visually hidden and preserve the full-height sidebar and content layout. Restore the real native NSWindow traffic-light buttons in their standard upper-left location, visible and usable whether the sidebar is expanded or collapsed.

When the sidebar is collapsed, show a compact, subtle tab attached flush to the window’s left edge, near the existing toggle’s vertical position. The tab should be about 22–26 px wide, have rounded corners only on the right, and display a small right-pointing `chevron.right` SF Symbol. Hovering should provide a subtle visual state, and the control should have the accessibility label “Show Sidebar.” Clicking it restores the native sidebar.

## Acceptance criteria

- [ ] The close, minimize, and fullscreen controls are real native NSWindow standard window buttons in their standard upper-left location.
- [ ] The titlebar remains visually hidden; restoring the controls does not restore a visible titlebar or toolbar.
- [ ] The full-height sidebar and content layout are preserved without additional vertical whitespace.
- [ ] The native window buttons remain visible, clickable, and unobstructed with the sidebar both expanded and collapsed.
- [ ] Native window dragging, resizing, and fullscreen behavior are preserved.
- [ ] The collapsed-sidebar toggle is a 22–26 px wide tab flush against the window’s left edge, near its current vertical position, with rounding only on the right side.
- [ ] The tab uses a small `chevron.right` SF Symbol, subtle styling, a hover state, and the accessibility label “Show Sidebar.”
- [ ] Clicking the tab restores the native sidebar.
- [ ] The tab does not overlap the traffic-light buttons or block important WebView interactions.
- [ ] The tab and window controls behave correctly during resizing and fullscreen transitions.
- [ ] The embedded RepoOS web application is unchanged.

## Notes for AI

- Investigate whether `.titled` was removed from the window’s style mask or whether the standard window buttons were explicitly hidden.
- Use the native NSWindow buttons; do not create custom traffic-light recreations.
- Keep the titlebar visually hidden and do not introduce extra vertical space.
- Do not change the embedded RepoOS web application.
- Keep the collapsed toggle attached to the window edge and ensure it does not obstruct native controls or WebView interactions.

## Scope

Restore the native macOS window controls and refine the collapsed-sidebar toggle. Changes to the embedded web application are out of scope.

## Original prompt

Task: RepoOS Hub — Restore native traffic lights and refine collapsed sidebar toggle
The recent titlebar removal was largely successful, but two UI issues remain.
Issue 1: Missing native window controls
The standard macOS traffic-light buttons (close, minimize, fullscreen) have disappeared.
Restore all three native window buttons in their standard upper-left location without bringing back the visible titlebar or toolbar.
Requirements:
- Preserve the current full-height sidebar and content layout.
- Keep the titlebar visually hidden.
- Use real native NSWindow standard window buttons, not custom recreations.
- Investigate whether .titled was removed from the window's style mask or whether the standard buttons were explicitly hidden.
- Ensure the window buttons are visible, clickable, and unobstructed.
- Preserve native window dragging, resizing, and fullscreen behavior.
- Verify the buttons remain visible when the sidebar is expanded and collapsed.
Issue 2: Collapsed sidebar toggle appearance
The current collapsed-sidebar toggle is a grey, floating, rounded-square button overlapping the upper-left corner of the web content.
Replace it with a compact, edge-attached tab.
Requirements:
- Position it flush against the left edge of the window.
- Keep approximately the same vertical position as the existing toggle.
- Make it roughly half the current width (target 22–26 px).
- Use a small right-pointing SF Symbol chevron (chevron.right).
- Rounded corners only on the right side.
- No gap between the tab and the window edge.
- Use subtle styling that complements the native sidebar.
- Include a hover state and an accessibility label: "Show Sidebar".
- Clicking the tab should restore the native sidebar.
- The tab must not overlap the traffic-light buttons or block important WebView interactions.
- Ensure it behaves correctly during resizing and fullscreen transitions.
Acceptance criteria: Both changes are implemented without restoring the native titlebar, without introducing additional vertical whitespace, and without changing the embedded RepoOS web application.
My overall assessment: The new expanded sidebar already looks substantially cleaner than the original. Once the traffic lights are restored and the collapsed toggle is refined, I think you'll have a genuinely polished native macOS shell for RepoOS.

## Screenshots

![Expanded sidebar: restored native close/minimize/fullscreen buttons in the standard upper-left position, with no visible titlebar or toolbar row and the full-height sidebar/content layout preserved.](/api/tasks/0857/attachments/att_444e6ffd-2629-4275-8e11-de3217336d5e.png)
![Collapsed sidebar: the 24 px edge-attached chevron.right tab sits flush against the window's left edge below the traffic lights; native window buttons stay visible and unobstructed.](/api/tasks/0857/attachments/att_08981abc-06f2-4187-9e8d-cf0ff5a5153c.png)
![Collapsed tab hover state: a subtle translucent fill appears under the chevron on hover.](/api/tasks/0857/attachments/att_5d62a589-a42f-4cca-a4a5-380502743b04.png)

## Activity

- 2026-10-19T17:58:19Z · created · hello@repoos.org
- 2026-10-19T17:58:44Z · status draft→inbox, title, area, body: Problem (added); Desired UX (added); Acceptance criteria (added); Notes for AI (added); Scope (added)
- 2026-10-19T17:59:07Z · cli_override, model_override
- 2026-10-19T18:00:29Z · model_override
- 2026-10-19T18:00:31Z · status inbox→ready
- 2026-10-19T18:00:34Z · status ready→active, branch
- 2026-10-19T18:07:54Z · message_queued at 2026-10-19T18:07:54.611Z
- 2026-10-19T18:07:54Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-19T18:42:53Z · body
- 2026-10-19T18:51:51Z · screenshots
- 2026-10-19T18:52:21Z · screenshots
- 2026-10-19T18:52:48Z · screenshots
- 2026-10-19T18:53:45Z · body
- 2026-10-19T19:02:02Z · status active→review
- 2026-10-19T19:02:02Z · note: shots: skipped — Docs site skipped: no docs shot declared
- 2026-10-19T19:05:49Z · note: review pass 1: good to go
- 2026-10-19T19:08:18Z · close-out gate completed in 85s
- 2026-10-19T19:08:23Z · status review→done, release:success
- 2026-10-19T19:17:35Z · message_overdue: still queued after 60m without being delivered
- 2026-10-19T19:46:47Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T04:26:30Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T11:08:21Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T15:31:57Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T16:09:58Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T17:21:45Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T18:33:41Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T19:47:06Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T20:10:44Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T21:10:05Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T21:57:02Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T22:12:33Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T23:15:30Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T23:17:43Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T00:05:53Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T01:05:52Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T02:04:03Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T04:15:07Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T08:22:55Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T11:51:32Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T11:59:36Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T13:14:35Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T14:32:42Z · message_overdue: still queued after 60m without being delivered
