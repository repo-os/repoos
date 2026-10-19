---
id: "0857"
title: Restore native macOS window controls
type: feature
status: ready
priority: p2
area: [macos, desktop]
assigned_to: ai
created_by: hello@repoos.org
branch: ""
cli_override: pi
model_override: openrouter/deepseek/deepseek-v4.1-flash
created_at: "2026-10-19T17:58:19Z"
updated_at: "2026-10-19T18:00:31Z"
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

## Activity

- 2026-10-19T17:58:19Z · created · hello@repoos.org
- 2026-10-19T17:58:44Z · status draft→inbox, title, area, body: Problem (added); Desired UX (added); Acceptance criteria (added); Notes for AI (added); Scope (added)
- 2026-10-19T17:59:07Z · cli_override, model_override
- 2026-10-19T18:00:29Z · model_override
- 2026-10-19T18:00:31Z · status inbox→ready
