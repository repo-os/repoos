---
id: "0857"
title: "Task: RepoOS Hub — Restore native traffic lights and refi…"
type: feature
status: draft
priority: p2
area: general
assigned_to: ""
created_by: hello@repoos.org
branch: ""
created_at: "2026-10-19T17:58:19Z"
updated_at: "2026-10-19T17:58:19Z"
---
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

## Activity

- 2026-10-19T17:58:19Z · created · hello@repoos.org
