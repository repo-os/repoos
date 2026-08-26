# RepoOS mobile UX strategy

This document extends [`mobile-architecture.md`](./mobile-architecture.md).
That document defines the native shell, security boundary, and multi-server
picker. This document defines how the user experiences a connected server
inside the native iOS and Android app.

## Product direction

The mobile app is a focused, server-scoped client. It is not a compressed
version of the desktop web UI and it should not inherit the desktop chrome.
The primary mobile job is to open a server and work with its queue quickly.

The native shell owns server selection and mobile navigation. The connected
server owns RepoOS data and authentication. Shared data clients, types, and
domain state may be reused, but mobile screens should be composed separately
when the interaction model is different.

## Connected-server shell

After the user selects a saved server, the app enters a server-scoped shell:

```text
server picker
  └── repoos
      ├── Work
      ├── Search
      ├── More
      │   ├── Agents
      │   ├── Context
      │   ├── Activity
      │   └── Server connections
      └── Settings
```

The connected-server header is native and intentionally small:

- Back returns to the server picker.
- The server display name identifies the current connection.
- A status indicator shows whether the server is reachable.
- Tapping the server name opens a quick server switcher.

The existing desktop topbar, desktop sidebar, integration panel, and desktop
five-item tab bar are hidden in the mobile shell.

## Bottom navigation

The persistent mobile bar has exactly four destinations:

1. Work — the default and primary destination.
2. Search — task, context, and activity search designed for one-handed use.
3. More — a native bottom action sheet for secondary server features.
4. Settings — app and connection preferences.

More is an action sheet rather than a fifth navigation tab. Its rows should be
large touch targets and should dismiss predictably after navigation. Server
connections also remain available from the server-name switcher because
switching servers is a frequent action, not an obscure setting.

## Work is a separate mobile composition

The desktop Work board optimizes for density, columns, and simultaneous
visibility. Mobile Work should optimize for scanning and touch interaction:

- a single vertical queue rather than a multi-column board;
- readable task cards with status, priority, type, and updated time;
- a prominent, thumb-friendly New task action;
- compact sorting and filtering controls;
- task details presented as a mobile navigation page or bottom sheet;
- no desktop-only hover actions or tiny icon buttons.

The mobile view should reuse task data and mutations from the shared stores,
but it should not force the desktop board DOM and CSS to serve both products.

## Multiple servers and background state

Switching servers changes the visible server scope immediately. The previous
server's UI leaves the screen, but its session state does not need to be
discarded:

- each server has isolated cached data, authentication storage, filters, and
  navigation state;
- the active server gets the full live update stream;
- inactive servers retain lightweight status and cached data, and may retain a
  lightweight stream when an agent run or notification requires it;
- switching back restores the cached view immediately and refreshes quietly;
- when the app is backgrounded, live streams may suspend and reconnect on
  foreground;
- a failure in one server must not take down the shell or other connections.

The app should not keep every server's full UI or full event stream active by
default. Persistent per-server sessions plus selective live connectivity gives
fast switching without unnecessary battery, memory, or network cost.

## Implementation boundary

Use the existing Capacitor foundation and keep the mobile app in its own build.
Use Ionic Vue primitives where they provide platform behavior—page lifecycle,
safe areas, headers, navigation, action sheets, tabs, keyboard handling, and
gestures—while retaining RepoOS's visual language through custom tokens and
components.

Organize the implementation around three layers:

- shared API clients, types, stores, auth, and connection/session services;
- a native mobile shell for picker, header, tabs, action sheets, and lifecycle;
- mobile-specific screen compositions for Work, Search, Agents, Context, and
  task details.

Do not add mobile-only assumptions to the desktop shell. Do not make the
desktop view responsible for deciding whether it is secretly a native page.

## Delivery order

1. Define server-scoped session state and mobile route/lifecycle contracts.
2. Build the native connected-server shell and four-item navigation.
3. Build the mobile Work queue and mobile task detail flow.
4. Add selective background server status and restore behavior.
5. Extend the existing mobile testing task to cover navigation, switching,
   lifecycle, and session isolation.

The visual concept for this direction is the single-phone “Mobile navigation
concept” rendering produced during product exploration on 2026-08-27.
