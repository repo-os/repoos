---
id: "0855"
title: "Task: RepoOS Hub — Eliminate Native macOS Titlebar and Co…"
type: feature
status: draft
priority: p2
area: general
assigned_to: ""
created_by: hello@repoos.org
branch: ""
pm_cli_override: pi
pm_model_override: openrouter/deepseek/deepseek-v4.1-flash
created_at: "2026-10-19T15:35:14Z"
updated_at: "2026-10-19T15:35:14Z"
---
Task: RepoOS Hub — Eliminate Native macOS Titlebar and Consolidate Controls into Sidebar
Context
RepoOS Hub is our native macOS application, built with SwiftUI/AppKit. It provides a native sidebar for switching between multiple RepoOS servers, with the selected server's web UI displayed in the main content area.
Currently, the application has a traditional macOS titlebar containing:
- macOS traffic-light window controls (close/minimize/fullscreen)
- Sidebar visibility toggle
- Back navigation
- Forward navigation
- Refresh/reload
- Current server/project name (window title)
- Settings/menu access
This titlebar consumes unnecessary vertical space, particularly because the embedded RepoOS web application already has its own top navigation bar.
Goal: Remove the visible native macOS titlebar entirely while preserving the traffic-light controls, and relocate all useful toolbar functionality into the native macOS sidebar.
The result should look like a modern, polished macOS application with a full-height sidebar and minimal window chrome.
1. Window Layout
Modify the SwiftUI/AppKit window configuration to achieve the following:
- Remove the separate native macOS titlebar/toolbar row.
- Extend the native sidebar to the very top of the window.
- Keep the three native macOS traffic-light buttons (red/yellow/green) in their standard upper-left position.
- Position the sidebar's content appropriately below the traffic lights so nothing overlaps.
- Allow the main WebView content to occupy the additional vertical space freed by removing the titlebar.
- Preserve native macOS window behavior: dragging, resizing, minimizing, maximizing/fullscreen, and double-click titlebar behavior where applicable.
- Avoid introducing a custom or simulated titlebar.
- Use native SwiftUI/AppKit window APIs wherever possible.
Potential AppKit configuration:
window.titleVisibility = .hidden
window.titlebarAppearsTransparent = true
window.styleMask.insert(.fullSizeContentView)

These are implementation suggestions, not a requirement to use these exact APIs. Investigate the existing window architecture and choose the most reliable native implementation.
Important: The result should not simply be a transparent titlebar with the same empty vertical space. The actual content area must extend upward, reclaiming that space.
2. Native Sidebar Controls
Move the functionality currently provided by the native macOS toolbar into the native sidebar.
The sidebar should remain visually clean, compact, and consistent with the application's existing dark theme.
Use SF Symbols for iconography, native tooltips, and appropriate hover states.
Sidebar visibility toggle
- Add a small, visually unobtrusive sidebar toggle in the sidebar header area, near the top.
- It must collapse/hide the native sidebar, not the embedded RepoOS web application's sidebar.
- When the sidebar is hidden, provide an accessible way to reopen it without relying exclusively on keyboard shortcuts.
- Preserve the existing keyboard shortcut, if one exists.
- Avoid overlapping the macOS traffic-light controls.
Back and forward navigation
- Relocate the existing back and forward controls into the sidebar.
- Present them as a compact horizontal pair of icon buttons using SF Symbols (chevron.left, chevron.right).
- Disable them appropriately when navigation history is unavailable.
- Preserve the current navigation behavior and history.
- Use tooltips such as "Back" and "Forward".
Refresh/reload
- Move the refresh functionality into the sidebar alongside back/forward.
- Use arrow.clockwise or an equivalent SF Symbol.
- Refresh the currently selected server's WebView, preserving existing behavior.
- Provide a tooltip such as "Reload Page".
Settings
- Ensure native RepoOS Hub settings remain accessible from the sidebar.
- Use a gear icon (gearshape) with a tooltip.
- Prefer placing this in the sidebar footer, alongside existing application-level controls.
- Preserve any existing Settings window, menu, or functionality.
- Maintain the standard macOS Settings keyboard shortcut (⌘,) where applicable.
3. Remove Redundant Window Title
The current native titlebar displays the selected server/project name (e.g. divot).
Remove this visible title entirely.
It is redundant because:
1. The selected server is already highlighted in the native sidebar.
2. The embedded RepoOS web application already displays the selected project in its own header.
Do not replace it with another project name, app name, or breadcrumb in the native window chrome.
The internal NSWindow.title can remain populated if needed for accessibility, window management, or system integrations, but it should not be visually displayed.
4. Proposed Sidebar Organization
Preserve the existing sidebar hierarchy and server-switching functionality.
Suggested visual organization:
┌──────────────────────────┐
│ 🔴 🟡 🟢                │
│                          │
│  ‹   ›   ↻          ◧   │  ← Navigation + sidebar toggle
│                          │
│ PERSONAL                 │
│                          │
│ 🟢 RepoOS               │
│                          │
│ SERVERS                  │
│                          │
│ 🔴 squishy              │
│ 🔴 celleris             │
│ 🟢 pn                   │
│ 🟢 divot                │
│ 🟢 lightingai           │
│                          │
│                          │
│                          │
│                          │
│ ┌──────────────────────┐ │
│ │ Server Status        │ │
│ │ Tasks / Events       │ │
│ └──────────────────────┘ │
│                          │
│ Classic   Clear   Gen Z  │
│                          │
│ ⚙ Settings              │
│                          │
│ + Add server             │
└──────────────────────────┘

This is a conceptual layout, not a pixel-perfect specification.
The engineering agent should adapt it to the existing sidebar structure, spacing, and design language.
Design priorities:
- Minimal chrome: No unnecessary visual containers, borders, or toolbars.
- Compact controls: Navigation buttons should be small and aligned consistently.
- Native appearance: SF Symbols, macOS hover states, keyboard shortcuts, and accessibility.
- Consistent spacing: Match the existing sidebar's padding and visual rhythm.
- Clear hierarchy: Server navigation should remain the primary purpose of the sidebar.
Do not let the new buttons visually dominate the server list.
5. Sidebar Collapsed State
Pay particular attention to the behavior when the native sidebar is hidden.
Requirements:
- The main WebView should expand to use the available horizontal space.
- A small, accessible control must remain available to reopen the native sidebar.
- This control should not obscure the embedded web application's interactive elements.
- The three macOS traffic-light buttons must remain visible and functional.
- Ideally, preserve the existing sidebar visibility state across application restarts if that behavior already exists.
Choose an implementation that works naturally with the existing SwiftUI/AppKit window architecture.
6. Preserve Existing Functionality
This task is primarily a native macOS UI/layout refactor, not a change to the embedded RepoOS web application.
Do not modify the web application's header, navigation, routing, or styling.
Preserve:
- Server switching and connection status.
- Existing server list and server management controls.
- Back/forward navigation history.
- WebView reload behavior.
- Settings functionality.
- Sidebar visibility behavior.
- Keyboard shortcuts.
- Existing sidebar footer components.
- Native window controls and lifecycle behavior.
Avoid introducing unnecessary new dependencies.
7. Acceptance Criteria
The task is complete when:
- [ ] No separate native macOS titlebar or toolbar row is visible.
- [ ] The native sidebar extends to the top edge of the window.
- [ ] The standard red/yellow/green macOS window controls remain in the upper-left corner.
- [ ] The main content area reclaims the vertical space previously occupied by the titlebar.
- [ ] The current server/project name is no longer displayed in native window chrome.
- [ ] Back, forward, and refresh controls are accessible from the native sidebar.
- [ ] A sidebar visibility toggle is available and works correctly.
- [ ] Users can reopen the sidebar when it is collapsed.
- [ ] Native Settings are accessible from the sidebar.
- [ ] Existing keyboard shortcuts continue to function.
- [ ] Native window dragging, resizing, fullscreen, and minimizing continue working.
- [ ] No controls overlap the macOS traffic lights.
- [ ] No regression in server switching, WebView navigation, or connection management.
- [ ] The interface looks polished in both light and dark appearance, if both are supported.
- [ ] The layout works at smaller window sizes.
8. Implementation Guidance
Before making changes:
1. Inspect the existing SwiftUI/AppKit application entry point and window configuration.
2. Identify how the native sidebar is implemented.
3. Locate the existing toolbar actions and determine how they interact with the active WebView.
4. Identify any macOS-version-specific constraints.
5. Implement the smallest maintainable change that achieves the requested layout.
Prefer native macOS window APIs over custom titlebar implementations.
Avoid hardcoded traffic-light offsets unless absolutely necessary. Prefer layout approaches that respect the window's safe areas and standard window-control positions.
Test the behavior in normal, fullscreen, and sidebar-collapsed states.
Deliverable: A working implementation within the existing RepoOS Hub codebase, with no changes required to the embedded RepoOS web application.
One additional design recommendation
I would have the PM explicitly consider two different sidebar control positions:
Top of sidebar: Back / Forward / Reload / Sidebar toggle.
Bottom of sidebar: Settings.
This keeps navigation near the content it controls, while treating Settings as an application-level action.
I'd also encourage the engineer to investigate using NSTitlebarAccessoryViewController or native SwiftUI toolbar/sidebar APIs where appropriate, rather than immediately building everything with custom AppKit views.
The important distinction is that we want to eliminate wasted vertical space, not merely hide the titlebar's background. That's the part I'd make sure the PM and coding agent understand.

A few refinements I'd suggest:
- Navigation row: Back, forward, reload on the left; sidebar toggle on the far right. All icon-only buttons with tooltips.
- Traffic lights: Keep their native position and appearance. No custom rendering.
- Server list: Retain the exact visual style of your existing app, including status indicators, notification badges, and selected-server highlighting.
- Footer: Keep your existing Classic/Clear/Gen Z theme controls, build/version information, and Add Server button. Put Settings alongside these existing footer controls rather than replacing them.
- Collapsed sidebar: Show a small floating sidebar-toggle button in the upper-left of the content area, positioned so it doesn't overlap the traffic lights or WebView controls.
One correction to the drawing: Your actual sidebar is relatively narrow, so don't interpret the mockup as a request to widen it. The objective is to recover vertical space without increasing sidebar width.
I would also avoid making navigation controls too prominent. They should feel like subtle macOS utilities, not another navigation system competing with the RepoOS web UI.

## Original prompt

Task: RepoOS Hub — Eliminate Native macOS Titlebar and Consolidate Controls into Sidebar
Context
RepoOS Hub is our native macOS application, built with SwiftUI/AppKit. It provides a native sidebar for switching between multiple RepoOS servers, with the selected server's web UI displayed in the main content area.
Currently, the application has a traditional macOS titlebar containing:
- macOS traffic-light window controls (close/minimize/fullscreen)
- Sidebar visibility toggle
- Back navigation
- Forward navigation
- Refresh/reload
- Current server/project name (window title)
- Settings/menu access
This titlebar consumes unnecessary vertical space, particularly because the embedded RepoOS web application already has its own top navigation bar.
Goal: Remove the visible native macOS titlebar entirely while preserving the traffic-light controls, and relocate all useful toolbar functionality into the native macOS sidebar.
The result should look like a modern, polished macOS application with a full-height sidebar and minimal window chrome.
1. Window Layout
Modify the SwiftUI/AppKit window configuration to achieve the following:
- Remove the separate native macOS titlebar/toolbar row.
- Extend the native sidebar to the very top of the window.
- Keep the three native macOS traffic-light buttons (red/yellow/green) in their standard upper-left position.
- Position the sidebar's content appropriately below the traffic lights so nothing overlaps.
- Allow the main WebView content to occupy the additional vertical space freed by removing the titlebar.
- Preserve native macOS window behavior: dragging, resizing, minimizing, maximizing/fullscreen, and double-click titlebar behavior where applicable.
- Avoid introducing a custom or simulated titlebar.
- Use native SwiftUI/AppKit window APIs wherever possible.
Potential AppKit configuration:
window.titleVisibility = .hidden
window.titlebarAppearsTransparent = true
window.styleMask.insert(.fullSizeContentView)

These are implementation suggestions, not a requirement to use these exact APIs. Investigate the existing window architecture and choose the most reliable native implementation.
Important: The result should not simply be a transparent titlebar with the same empty vertical space. The actual content area must extend upward, reclaiming that space.
2. Native Sidebar Controls
Move the functionality currently provided by the native macOS toolbar into the native sidebar.
The sidebar should remain visually clean, compact, and consistent with the application's existing dark theme.
Use SF Symbols for iconography, native tooltips, and appropriate hover states.
Sidebar visibility toggle
- Add a small, visually unobtrusive sidebar toggle in the sidebar header area, near the top.
- It must collapse/hide the native sidebar, not the embedded RepoOS web application's sidebar.
- When the sidebar is hidden, provide an accessible way to reopen it without relying exclusively on keyboard shortcuts.
- Preserve the existing keyboard shortcut, if one exists.
- Avoid overlapping the macOS traffic-light controls.
Back and forward navigation
- Relocate the existing back and forward controls into the sidebar.
- Present them as a compact horizontal pair of icon buttons using SF Symbols (chevron.left, chevron.right).
- Disable them appropriately when navigation history is unavailable.
- Preserve the current navigation behavior and history.
- Use tooltips such as "Back" and "Forward".
Refresh/reload
- Move the refresh functionality into the sidebar alongside back/forward.
- Use arrow.clockwise or an equivalent SF Symbol.
- Refresh the currently selected server's WebView, preserving existing behavior.
- Provide a tooltip such as "Reload Page".
Settings
- Ensure native RepoOS Hub settings remain accessible from the sidebar.
- Use a gear icon (gearshape) with a tooltip.
- Prefer placing this in the sidebar footer, alongside existing application-level controls.
- Preserve any existing Settings window, menu, or functionality.
- Maintain the standard macOS Settings keyboard shortcut (⌘,) where applicable.
3. Remove Redundant Window Title
The current native titlebar displays the selected server/project name (e.g. divot).
Remove this visible title entirely.
It is redundant because:
1. The selected server is already highlighted in the native sidebar.
2. The embedded RepoOS web application already displays the selected project in its own header.
Do not replace it with another project name, app name, or breadcrumb in the native window chrome.
The internal NSWindow.title can remain populated if needed for accessibility, window management, or system integrations, but it should not be visually displayed.
4. Proposed Sidebar Organization
Preserve the existing sidebar hierarchy and server-switching functionality.
Suggested visual organization:
┌──────────────────────────┐
│ 🔴 🟡 🟢                │
│                          │
│  ‹   ›   ↻          ◧   │  ← Navigation + sidebar toggle
│                          │
│ PERSONAL                 │
│                          │
│ 🟢 RepoOS               │
│                          │
│ SERVERS                  │
│                          │
│ 🔴 squishy              │
│ 🔴 celleris             │
│ 🟢 pn                   │
│ 🟢 divot                │
│ 🟢 lightingai           │
│                          │
│                          │
│                          │
│                          │
│ ┌──────────────────────┐ │
│ │ Server Status        │ │
│ │ Tasks / Events       │ │
│ └──────────────────────┘ │
│                          │
│ Classic   Clear   Gen Z  │
│                          │
│ ⚙ Settings              │
│                          │
│ + Add server             │
└──────────────────────────┘

This is a conceptual layout, not a pixel-perfect specification.
The engineering agent should adapt it to the existing sidebar structure, spacing, and design language.
Design priorities:
- Minimal chrome: No unnecessary visual containers, borders, or toolbars.
- Compact controls: Navigation buttons should be small and aligned consistently.
- Native appearance: SF Symbols, macOS hover states, keyboard shortcuts, and accessibility.
- Consistent spacing: Match the existing sidebar's padding and visual rhythm.
- Clear hierarchy: Server navigation should remain the primary purpose of the sidebar.
Do not let the new buttons visually dominate the server list.
5. Sidebar Collapsed State
Pay particular attention to the behavior when the native sidebar is hidden.
Requirements:
- The main WebView should expand to use the available horizontal space.
- A small, accessible control must remain available to reopen the native sidebar.
- This control should not obscure the embedded web application's interactive elements.
- The three macOS traffic-light buttons must remain visible and functional.
- Ideally, preserve the existing sidebar visibility state across application restarts if that behavior already exists.
Choose an implementation that works naturally with the existing SwiftUI/AppKit window architecture.
6. Preserve Existing Functionality
This task is primarily a native macOS UI/layout refactor, not a change to the embedded RepoOS web application.
Do not modify the web application's header, navigation, routing, or styling.
Preserve:
- Server switching and connection status.
- Existing server list and server management controls.
- Back/forward navigation history.
- WebView reload behavior.
- Settings functionality.
- Sidebar visibility behavior.
- Keyboard shortcuts.
- Existing sidebar footer components.
- Native window controls and lifecycle behavior.
Avoid introducing unnecessary new dependencies.
7. Acceptance Criteria
The task is complete when:
- [ ] No separate native macOS titlebar or toolbar row is visible.
- [ ] The native sidebar extends to the top edge of the window.
- [ ] The standard red/yellow/green macOS window controls remain in the upper-left corner.
- [ ] The main content area reclaims the vertical space previously occupied by the titlebar.
- [ ] The current server/project name is no longer displayed in native window chrome.
- [ ] Back, forward, and refresh controls are accessible from the native sidebar.
- [ ] A sidebar visibility toggle is available and works correctly.
- [ ] Users can reopen the sidebar when it is collapsed.
- [ ] Native Settings are accessible from the sidebar.
- [ ] Existing keyboard shortcuts continue to function.
- [ ] Native window dragging, resizing, fullscreen, and minimizing continue working.
- [ ] No controls overlap the macOS traffic lights.
- [ ] No regression in server switching, WebView navigation, or connection management.
- [ ] The interface looks polished in both light and dark appearance, if both are supported.
- [ ] The layout works at smaller window sizes.
8. Implementation Guidance
Before making changes:
1. Inspect the existing SwiftUI/AppKit application entry point and window configuration.
2. Identify how the native sidebar is implemented.
3. Locate the existing toolbar actions and determine how they interact with the active WebView.
4. Identify any macOS-version-specific constraints.
5. Implement the smallest maintainable change that achieves the requested layout.
Prefer native macOS window APIs over custom titlebar implementations.
Avoid hardcoded traffic-light offsets unless absolutely necessary. Prefer layout approaches that respect the window's safe areas and standard window-control positions.
Test the behavior in normal, fullscreen, and sidebar-collapsed states.
Deliverable: A working implementation within the existing RepoOS Hub codebase, with no changes required to the embedded RepoOS web application.
One additional design recommendation
I would have the PM explicitly consider two different sidebar control positions:
Top of sidebar: Back / Forward / Reload / Sidebar toggle.
Bottom of sidebar: Settings.
This keeps navigation near the content it controls, while treating Settings as an application-level action.
I'd also encourage the engineer to investigate using NSTitlebarAccessoryViewController or native SwiftUI toolbar/sidebar APIs where appropriate, rather than immediately building everything with custom AppKit views.
The important distinction is that we want to eliminate wasted vertical space, not merely hide the titlebar's background. That's the part I'd make sure the PM and coding agent understand.

A few refinements I'd suggest:
- Navigation row: Back, forward, reload on the left; sidebar toggle on the far right. All icon-only buttons with tooltips.
- Traffic lights: Keep their native position and appearance. No custom rendering.
- Server list: Retain the exact visual style of your existing app, including status indicators, notification badges, and selected-server highlighting.
- Footer: Keep your existing Classic/Clear/Gen Z theme controls, build/version information, and Add Server button. Put Settings alongside these existing footer controls rather than replacing them.
- Collapsed sidebar: Show a small floating sidebar-toggle button in the upper-left of the content area, positioned so it doesn't overlap the traffic lights or WebView controls.
One correction to the drawing: Your actual sidebar is relatively narrow, so don't interpret the mockup as a request to widen it. The objective is to recover vertical space without increasing sidebar width.
I would also avoid making navigation controls too prominent. They should feel like subtle macOS utilities, not another navigation system competing with the RepoOS web UI.

## Activity

- 2026-10-19T15:35:14Z · created · hello@repoos.org
