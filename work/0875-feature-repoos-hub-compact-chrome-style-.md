---
id: "0875"
title: "# Feature: RepoOS Hub — Compact Chrome-Style Server Tabs"
type: feature
status: draft
priority: p2
area: general
assigned_to: ""
created_by: hello@repoos.org
branch: ""
pm_cli_override: cursor
pm_model_override: grok-4.7-low
created_at: "2026-10-20T13:31:37Z"
updated_at: "2026-10-20T13:31:37Z"
---
# Feature: RepoOS Hub — Compact Chrome-Style Server Tabs

## Objective

Add an alternative **Tabs navigation mode** to the native SwiftUI/AppKit RepoOS Hub macOS application.

Currently, RepoOS Hub uses a native left sidebar to display and switch between configured RepoOS servers.

We want users to choose between two navigation layouts:

- **Sidebar:** Existing vertical server list, preserved as-is.
- **Tabs:** New compact horizontal, Chrome-style server tabs.

**Critical design requirement: The entire tab interface must occupy ONE horizontal row, including the native macOS traffic-light buttons.**

Refer to the provided Google Chrome screenshot for the intended layout.

Do NOT implement a separate titlebar row above the tabs, as shown in the previous conceptual mockup.

## 1. Target Layout

The desired design should resemble:

```text
┌────────────────────────────────────────────────────────────────────────┐
│ 🔴 🟡 🟢  ▾  │ RepoOS │ divot │ lightingai │ celleris │ + │ ⚙ │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│               Selected RepoOS server's existing web UI                │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

The traffic lights and server tabs share the same vertical space.

Target total native tab-strip height: approximately **40–48 px**, adjusted as necessary for macOS window-control geometry and accessibility.

The embedded WebView should begin immediately below the tab strip.

There must be no additional native titlebar or toolbar row.

## 2. Native Window Integration

RepoOS Hub is written in SwiftUI/AppKit.

Implement a custom SwiftUI tab strip integrated into the native `NSWindow` titlebar area, using AppKit as necessary.

Requirements:

- Keep the REAL native macOS close, minimize, and fullscreen buttons.
- Preserve their standard appearance, behavior, and placement.
- Do not render fake traffic-light buttons.
- Hide the visible native window title.
- Allow the tab strip to occupy the same row as the traffic lights.
- No empty titlebar space above the tabs.
- Preserve window dragging, resizing, fullscreen behavior, and standard macOS window interactions.
- Ensure buttons and tabs remain fully interactive without accidental window dragging.

Investigate `.fullSizeContentView`, transparent titlebar configuration, titlebar accessories, and appropriate hosting approaches.

Choose whichever native integration provides the cleanest, most reliable single-row layout.

Do not remove the `.titled` window style merely to eliminate the titlebar.

## 3. Tab Appearance

Follow the design principles of modern Chrome tabs on macOS.

Each configured RepoOS server can appear as a tab.

Each tab should display:

- Server name (e.g. `lightingai`, `divot`, `celleris`).
- Small connection-status indicator (green, red, etc.).
- Compact task/event notification badges where space permits.
- Clear but subtle active-tab styling.

Visual requirements:

- Compact, horizontally arranged tabs.
- No large cards or outlined rectangular panels.
- No second row for labels or status information.
- Active tab visually connects to the WebView below.
- Inactive tabs remain visually subdued.
- Subtle separators or background contrast.
- Small hover and pressed states.
- Consistent with RepoOS Hub's existing visual identity.
- Support both light and dark macOS appearances.

Prefer a polished browser-tab aesthetic rather than a segmented-control appearance.

## 4. Tab Behavior

Selecting a tab switches to the corresponding RepoOS server.

Requirements:

- Reuse the existing server connection and WebView management logic.
- Preserve per-server WebView state, including scroll position, navigation history, and active work.
- Avoid reloading servers unnecessarily when switching tabs.
- Preserve existing server status and notification information.
- Persist tab ordering.
- Support drag-and-drop tab reordering where practical.
- Provide keyboard shortcuts for switching tabs, such as `⌘1`–`⌘9` and `Control+Tab`.

**Tabs represent servers, not individual web pages.**

A server should not gain multiple tabs merely because the user navigates within its RepoOS web application.

## 5. Server Management

Add a compact `+` button after the last visible tab.

Clicking it should open a menu listing configured servers, with an option to add a new server.

Prefer to distinguish between:

- Configured servers.
- Servers currently visible as tabs.

If tabs are closable, closing a tab must only hide that tab, NEVER delete the configured server or its data.

All previously available server-management functionality must remain accessible in Tabs mode.

## 6. Navigation and Settings

The current Sidebar mode already includes Back, Forward, Reload, Sidebar Toggle, and Settings controls.

Tabs mode must preserve access to these functions without creating a second toolbar row.

Preferred solution:

- A compact chevron/dropdown near the traffic lights, similar to Chrome's tab-actions menu.
- Put Back, Forward, Reload, and navigation-mode switching in an accessible compact menu where appropriate.
- Keep application Settings available through the macOS menu bar and optionally through the same menu.
- Preserve existing keyboard shortcuts.

Do not add a separate browser-style address bar or navigation toolbar.

These are server-specific internal web applications; an address bar is unnecessary.

## 7. Sidebar / Tabs Layout Setting

Add a native RepoOS Hub setting:

**Server navigation layout**

- Sidebar
- Tabs

Requirements:

- Sidebar should initially remain the default.
- Remember the user's choice across restarts.
- Switching layouts should be immediate without restarting RepoOS Hub.
- Use the same server/session state in both layouts.
- Switching layouts must not unnecessarily recreate WebViews or disconnect servers.
- The server currently selected must remain selected when switching layouts.

This is an application-level preference, not a preference belonging to an individual RepoOS server.

## 8. Tab Overflow

RepoOS Hub may have many configured servers.

Design for narrow windows and large server lists.

Requirements:

- Tabs should shrink gracefully to a reasonable minimum width.
- Long server names should truncate.
- When tabs cannot fit, use horizontal scrolling or an overflow menu.
- Always keep the active tab accessible.
- Keep the native traffic lights unobstructed.
- Keep the `+` button accessible.
- Avoid wrapping tabs onto a second row under any circumstances.

One row is a hard constraint.

## 9. Architecture

Reuse existing RepoOS Hub infrastructure wherever possible:

- Server definitions and persistence.
- Server connection state.
- Existing WebView lifecycle.
- Active server selection.
- Task/event notifications.
- Native app Settings.

Do not modify the embedded RepoOS web application.

This feature belongs entirely to the SwiftUI/AppKit macOS shell.

Avoid unnecessary new dependencies.

## 10. Acceptance Criteria

- [ ] User can select Sidebar or Tabs navigation mode.
- [ ] Tabs mode occupies exactly one native horizontal row.
- [ ] Native traffic lights appear in the same row as tabs.
- [ ] No separate native titlebar or toolbar consumes additional vertical space.
- [ ] Existing embedded web content starts immediately below the tab strip.
- [ ] Each server appears as a compact browser-style tab.
- [ ] Active server is clearly indicated.
- [ ] Tabs switch between existing server sessions without unnecessary reloads.
- [ ] Connection and notification indicators are retained.
- [ ] Server management remains accessible.
- [ ] Existing Back/Forward/Reload/Settings functionality remains accessible.
- [ ] Overflow works without creating additional rows.
- [ ] Layout preference persists across restarts.
- [ ] Existing Sidebar mode continues working unchanged.
- [ ] Window dragging, resizing, and fullscreen behavior work correctly.
- [ ] Real macOS traffic-light buttons remain visible and functional.
- [ ] Light and dark appearances are supported.

## 11. Development Instructions

Before implementing:

1. Inspect the current RepoOS Hub SwiftUI/AppKit window architecture.
2. Review the existing native sidebar implementation and server-selection state.
3. Investigate the current titlebar customization, including the recent titlebar-removal changes.
4. Determine the most reliable way to integrate the tab strip into the native titlebar region.
5. Identify any compatibility limitations with the application's current minimum macOS version.

Implement incrementally, preserving existing functionality.

Test both layouts, switching between them, narrow windows, many servers, and native fullscreen.

**Success means RepoOS Hub feels like Chrome's compact tab bar, but each tab represents a separate RepoOS server. The native chrome should consume approximately one row of vertical space, not two.**

## Original prompt

# Feature: RepoOS Hub — Compact Chrome-Style Server Tabs

## Objective

Add an alternative **Tabs navigation mode** to the native SwiftUI/AppKit RepoOS Hub macOS application.

Currently, RepoOS Hub uses a native left sidebar to display and switch between configured RepoOS servers.

We want users to choose between two navigation layouts:

- **Sidebar:** Existing vertical server list, preserved as-is.
- **Tabs:** New compact horizontal, Chrome-style server tabs.

**Critical design requirement: The entire tab interface must occupy ONE horizontal row, including the native macOS traffic-light buttons.**

Refer to the provided Google Chrome screenshot for the intended layout.

Do NOT implement a separate titlebar row above the tabs, as shown in the previous conceptual mockup.

## 1. Target Layout

The desired design should resemble:

```text
┌────────────────────────────────────────────────────────────────────────┐
│ 🔴 🟡 🟢  ▾  │ RepoOS │ divot │ lightingai │ celleris │ + │ ⚙ │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│               Selected RepoOS server's existing web UI                │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

The traffic lights and server tabs share the same vertical space.

Target total native tab-strip height: approximately **40–48 px**, adjusted as necessary for macOS window-control geometry and accessibility.

The embedded WebView should begin immediately below the tab strip.

There must be no additional native titlebar or toolbar row.

## 2. Native Window Integration

RepoOS Hub is written in SwiftUI/AppKit.

Implement a custom SwiftUI tab strip integrated into the native `NSWindow` titlebar area, using AppKit as necessary.

Requirements:

- Keep the REAL native macOS close, minimize, and fullscreen buttons.
- Preserve their standard appearance, behavior, and placement.
- Do not render fake traffic-light buttons.
- Hide the visible native window title.
- Allow the tab strip to occupy the same row as the traffic lights.
- No empty titlebar space above the tabs.
- Preserve window dragging, resizing, fullscreen behavior, and standard macOS window interactions.
- Ensure buttons and tabs remain fully interactive without accidental window dragging.

Investigate `.fullSizeContentView`, transparent titlebar configuration, titlebar accessories, and appropriate hosting approaches.

Choose whichever native integration provides the cleanest, most reliable single-row layout.

Do not remove the `.titled` window style merely to eliminate the titlebar.

## 3. Tab Appearance

Follow the design principles of modern Chrome tabs on macOS.

Each configured RepoOS server can appear as a tab.

Each tab should display:

- Server name (e.g. `lightingai`, `divot`, `celleris`).
- Small connection-status indicator (green, red, etc.).
- Compact task/event notification badges where space permits.
- Clear but subtle active-tab styling.

Visual requirements:

- Compact, horizontally arranged tabs.
- No large cards or outlined rectangular panels.
- No second row for labels or status information.
- Active tab visually connects to the WebView below.
- Inactive tabs remain visually subdued.
- Subtle separators or background contrast.
- Small hover and pressed states.
- Consistent with RepoOS Hub's existing visual identity.
- Support both light and dark macOS appearances.

Prefer a polished browser-tab aesthetic rather than a segmented-control appearance.

## 4. Tab Behavior

Selecting a tab switches to the corresponding RepoOS server.

Requirements:

- Reuse the existing server connection and WebView management logic.
- Preserve per-server WebView state, including scroll position, navigation history, and active work.
- Avoid reloading servers unnecessarily when switching tabs.
- Preserve existing server status and notification information.
- Persist tab ordering.
- Support drag-and-drop tab reordering where practical.
- Provide keyboard shortcuts for switching tabs, such as `⌘1`–`⌘9` and `Control+Tab`.

**Tabs represent servers, not individual web pages.**

A server should not gain multiple tabs merely because the user navigates within its RepoOS web application.

## 5. Server Management

Add a compact `+` button after the last visible tab.

Clicking it should open a menu listing configured servers, with an option to add a new server.

Prefer to distinguish between:

- Configured servers.
- Servers currently visible as tabs.

If tabs are closable, closing a tab must only hide that tab, NEVER delete the configured server or its data.

All previously available server-management functionality must remain accessible in Tabs mode.

## 6. Navigation and Settings

The current Sidebar mode already includes Back, Forward, Reload, Sidebar Toggle, and Settings controls.

Tabs mode must preserve access to these functions without creating a second toolbar row.

Preferred solution:

- A compact chevron/dropdown near the traffic lights, similar to Chrome's tab-actions menu.
- Put Back, Forward, Reload, and navigation-mode switching in an accessible compact menu where appropriate.
- Keep application Settings available through the macOS menu bar and optionally through the same menu.
- Preserve existing keyboard shortcuts.

Do not add a separate browser-style address bar or navigation toolbar.

These are server-specific internal web applications; an address bar is unnecessary.

## 7. Sidebar / Tabs Layout Setting

Add a native RepoOS Hub setting:

**Server navigation layout**

- Sidebar
- Tabs

Requirements:

- Sidebar should initially remain the default.
- Remember the user's choice across restarts.
- Switching layouts should be immediate without restarting RepoOS Hub.
- Use the same server/session state in both layouts.
- Switching layouts must not unnecessarily recreate WebViews or disconnect servers.
- The server currently selected must remain selected when switching layouts.

This is an application-level preference, not a preference belonging to an individual RepoOS server.

## 8. Tab Overflow

RepoOS Hub may have many configured servers.

Design for narrow windows and large server lists.

Requirements:

- Tabs should shrink gracefully to a reasonable minimum width.
- Long server names should truncate.
- When tabs cannot fit, use horizontal scrolling or an overflow menu.
- Always keep the active tab accessible.
- Keep the native traffic lights unobstructed.
- Keep the `+` button accessible.
- Avoid wrapping tabs onto a second row under any circumstances.

One row is a hard constraint.

## 9. Architecture

Reuse existing RepoOS Hub infrastructure wherever possible:

- Server definitions and persistence.
- Server connection state.
- Existing WebView lifecycle.
- Active server selection.
- Task/event notifications.
- Native app Settings.

Do not modify the embedded RepoOS web application.

This feature belongs entirely to the SwiftUI/AppKit macOS shell.

Avoid unnecessary new dependencies.

## 10. Acceptance Criteria

- [ ] User can select Sidebar or Tabs navigation mode.
- [ ] Tabs mode occupies exactly one native horizontal row.
- [ ] Native traffic lights appear in the same row as tabs.
- [ ] No separate native titlebar or toolbar consumes additional vertical space.
- [ ] Existing embedded web content starts immediately below the tab strip.
- [ ] Each server appears as a compact browser-style tab.
- [ ] Active server is clearly indicated.
- [ ] Tabs switch between existing server sessions without unnecessary reloads.
- [ ] Connection and notification indicators are retained.
- [ ] Server management remains accessible.
- [ ] Existing Back/Forward/Reload/Settings functionality remains accessible.
- [ ] Overflow works without creating additional rows.
- [ ] Layout preference persists across restarts.
- [ ] Existing Sidebar mode continues working unchanged.
- [ ] Window dragging, resizing, and fullscreen behavior work correctly.
- [ ] Real macOS traffic-light buttons remain visible and functional.
- [ ] Light and dark appearances are supported.

## 11. Development Instructions

Before implementing:

1. Inspect the current RepoOS Hub SwiftUI/AppKit window architecture.
2. Review the existing native sidebar implementation and server-selection state.
3. Investigate the current titlebar customization, including the recent titlebar-removal changes.
4. Determine the most reliable way to integrate the tab strip into the native titlebar region.
5. Identify any compatibility limitations with the application's current minimum macOS version.

Implement incrementally, preserving existing functionality.

Test both layouts, switching between them, narrow windows, many servers, and native fullscreen.

**Success means RepoOS Hub feels like Chrome's compact tab bar, but each tab represents a separate RepoOS server. The native chrome should consume approximately one row of vertical space, not two.**

## Activity

- 2026-10-20T13:31:37Z · created · hello@repoos.org
