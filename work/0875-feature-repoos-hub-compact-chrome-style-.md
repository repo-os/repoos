---
id: "0875"
title: Add compact Chrome-style server tabs to RepoOS Hub
type: feature
status: ready
priority: p2
area: macos
assigned_to: ai
created_by: hello@repoos.org
branch: ""
cli_override: cursor
model_override: composer-2.5
pm_cli_override: cursor
pm_model_override: grok-4.7-low
created_at: "2026-10-20T13:31:37Z"
updated_at: "2026-10-21T01:41:02Z"
---
## Problem

RepoOS Hub switches between configured servers with a native left sidebar. That layout is the only navigation mode. There is no compact horizontal, Chrome-style tab strip where each tab is a server.

The window chrome must stay one row. A previous conceptual mockup put a separate titlebar above the tabs; that layout is wrong. Traffic lights and server tabs have to share the same vertical band, with the embedded WebView starting immediately underneath. A second native titlebar or toolbar row is the failure mode this task exists to avoid.

Sidebar mode already carries Back, Forward, Reload, the sidebar toggle, and Settings. Tabs mode has to keep those reachable without growing a second row or adding an address bar.

## Desired UX

The user picks an application-level **Server navigation layout**: **Sidebar** or **Tabs**. Sidebar stays the default and keeps working as it does today. The choice persists across restarts. Switching is immediate, keeps the same server and session state, does not recreate WebViews or disconnect servers, and leaves the currently selected server selected.

**Sidebar** is the existing vertical server list, unchanged.

**Tabs** is one native horizontal row, about 40–48 px tall (adjust only as macOS window-control geometry and accessibility require). It looks like this:

```text
┌────────────────────────────────────────────────────────────────────────┐
│ 🔴 🟡 🟢  ▾  │ RepoOS │ divot │ lightingai │ celleris │ + │ ⚙ │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│               Selected RepoOS server's existing web UI                │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

The row contains the real macOS close, minimize, and fullscreen buttons (standard appearance, behavior, and placement — never fake traffic lights), a compact chevron/dropdown near those buttons, the server tabs, a `+` button after the last visible tab, and access to Settings. The native window title is hidden. There is no empty titlebar above the tabs and no separate browser-style address bar or navigation toolbar. The embedded WebView begins immediately below the strip.

Each configured server that is shown as a tab displays its name (for example `lightingai`, `divot`, `celleris`), a small connection-status indicator, and compact task/event notification badges where space permits. Tabs are compact and horizontal, with a polished browser-tab look rather than large cards, outlined panels, or a segmented control. Nothing wraps onto a second row for labels or status. The active tab is clearly indicated and visually connects to the WebView below. Inactive tabs stay subdued. Separators or background contrast stay subtle. Hover and pressed states are small. Light and dark macOS appearances both work, and the strip matches Hub's existing visual identity.

Selecting a tab switches to that server. Tabs are servers, not web pages: navigating inside a server's RepoOS web app does not open more tabs. Switching reuses the existing connection and WebView management, keeps per-server scroll position, navigation history, and active work, and does not reload a server just because the user changed tabs. Existing server status and notification information stay available. Tab order persists. Drag-and-drop reordering is in scope where it is practical.

The chevron menu (Chrome-style tab actions) holds Back, Forward, Reload, and navigation-mode switching. Settings stay on the macOS menu bar and may also appear in that menu. Existing keyboard shortcuts remain. Tab switching adds `⌘1`–`⌘9` and Control+Tab.

The `+` button opens a menu of configured servers plus an option to add a new server, and distinguishes servers that are already visible as tabs from the rest of the configured list. If tabs can be closed, closing one only hides that tab. It never deletes the configured server or its data. Every server-management action that exists today remains available in Tabs mode.

When the window is narrow or there are many servers, tabs shrink to a reasonable minimum width and long names truncate. If they still cannot fit, the strip scrolls horizontally or offers an overflow menu. The active tab, the traffic lights, and the `+` button stay reachable. Tabs never wrap to a second row.

Window dragging, resizing, fullscreen, and other standard macOS window interactions keep working. Buttons and tabs stay fully interactive and do not start an accidental window drag.

## Acceptance criteria

- [ ] The user can select Sidebar or Tabs as the server navigation layout.
- [ ] Sidebar is the initial default, and the choice is remembered across restarts.
- [ ] Switching layouts is immediate, does not restart Hub, does not recreate WebViews or disconnect servers, and keeps the selected server selected.
- [ ] Sidebar mode continues to work unchanged.
- [ ] Tabs mode is exactly one native horizontal row, about 40–48 px, shared with the real traffic lights.
- [ ] There is no separate native titlebar or toolbar row and no empty titlebar space above the tabs.
- [ ] Embedded web content starts immediately below the tab strip.
- [ ] Close, minimize, and fullscreen are the real macOS buttons, visible and functional, with standard appearance, behavior, and placement.
- [ ] The visible native window title is hidden. The window stays a titled window; `.titled` is not removed just to drop the titlebar.
- [ ] Dragging, resizing, and fullscreen still behave as standard macOS window interactions, and controls do not trigger accidental drags.
- [ ] Each visible server is a compact browser-style tab showing its name, a connection-status indicator, and notification badges where space permits.
- [ ] The active tab is clearly indicated and visually connects to the content below; inactive tabs are subdued. Light and dark appearances both work.
- [ ] Selecting a tab switches to that server's existing session without an unnecessary reload, preserving scroll position, navigation history, and in-progress work.
- [ ] A server never gains extra tabs because the user navigates inside its web app.
- [ ] Tab order persists. Drag-and-drop reorder works where practical.
- [ ] `⌘1`–`⌘9` and Control+Tab switch tabs. Existing keyboard shortcuts still work.
- [ ] `+` lists configured servers (distinguishing those already shown as tabs) and can add a new server.
- [ ] Closing a tab, if closing is offered, only hides it and never deletes the server or its data.
- [ ] Back, Forward, Reload, layout switching, and Settings stay reachable without a second toolbar row or an address bar.
- [ ] Overflow shrinks and truncates tabs, then scrolls or uses an overflow menu, always keeping the active tab, traffic lights, and `+` accessible, with no second row.
- [ ] The embedded RepoOS web application is unchanged.

## Notes for AI

This is entirely the SwiftUI/AppKit macOS shell. Do not modify the embedded RepoOS web application. Avoid new dependencies.

Before coding, inspect the current window architecture, the native sidebar and server-selection state, and the titlebar work in #0855 and #0857. `configureHubWorkspaceWindowChrome` in `macos/RepoOSHub/RepoOSHubApp.swift` already keeps a standard titled `NSWindow`, hides the title, and uses a transparent titlebar so the real traffic lights stay visible. Sidebar navigation controls live in `macos/RepoOSHub/HubSidebarControls.swift` and `ContentView.swift`. Server WebViews are `ServerWebWorkspaceView.swift`; the server list is `ServerSidebarView.swift`. Reuse server definitions and persistence, connection state, WebView lifecycle, active-server selection, task/event notifications, and native Settings.

Integrate a custom SwiftUI tab strip into the native titlebar area, using AppKit where needed. Investigate `.fullSizeContentView`, transparent titlebar configuration, titlebar accessories, and hosting approaches, and pick the one that gives the cleanest reliable single row. Do not remove `.titled` to eliminate the titlebar. Check the app's current minimum macOS version and record any limitation that blocks a single-row layout.

Reuse existing server connection and WebView management. Preserve per-server WebView state across tab switches and across layout switches.

Assumption: "where practical" for drag-and-drop means implement reorder if it fits the chosen titlebar hosting without fighting window dragging; if the hosting makes drag-reorder unreliable, persist order through another explicit control and say so in the task notes rather than shipping a drag that also moves the window.

Assumption: the gear in the layout sketch is optional Settings access. The macOS menu bar must keep Settings either way. The chevron menu is the required home for Back, Forward, Reload, and layout switching.

Assumption: closable tabs are allowed but not required. If a tab can close, hide-only is mandatory.

Implement incrementally so Sidebar keeps working. Test both layouts, switching between them, narrow windows, many servers, and native fullscreen. Update `user-docs/macos-hub.md` for the new layout setting.

Success means Hub feels like Chrome's compact tab bar, with each tab a RepoOS server, and native chrome using about one row of vertical space.

## Scope

In scope: the Tabs layout, the Sidebar/Tabs preference, single-row titlebar integration, tab appearance and overflow, server switching on top of existing sessions, the `+` server menu, hide-on-close if tabs close, the compact navigation menu, shortcuts, and persistence of layout and tab order.

Out of scope: changing the embedded web app, per-page browser tabs, an address bar, a second toolbar, deleting a server by closing its tab, and replacing Sidebar mode.

## Related

- #0855 — removed the visible native titlebar and moved controls into the sidebar
- #0857 — restored the real traffic-light buttons on the transparent titlebar
- `user-docs/macos-hub.md`
- `macos/RepoOSHub/RepoOSHubApp.swift`, `ContentView.swift`, `HubSidebarControls.swift`, `ServerSidebarView.swift`, `ServerWebWorkspaceView.swift`

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
- 2026-10-20T13:32:30Z · status draft→inbox, title, area, body: Problem (added); Desired UX (added); Acceptance criteria (added); Notes for AI (added); Scope (added); Related (added)
- 2026-10-20T13:40:11Z · cli_override, model_override
- 2026-10-20T13:40:14Z · model_override
- 2026-10-21T01:41:02Z · status inbox→ready
