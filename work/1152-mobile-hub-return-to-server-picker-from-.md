---
id: "1152"
title: "Mobile Hub: return to server picker from logo and show current project"
type: feature
status: ready
priority: p1
area: [mobile, web]
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-17T05:37:20Z"
updated_at: "2026-11-17T05:50:10Z"
---
## Problem
In RepoOS Hub on mobile, a connected server can accumulate many pages of navigation history and the user must repeatedly go back to leave the server and return to the native Hub server picker. On narrow screens the top bar also hides the current project name while giving an oversized search field significant width. The attached desktop and mobile screenshots show the current top bar.

## Desired UX
On a phone inside the native RepoOS Hub, tapping the RepoOS logo at top left returns directly to the Hub server picker regardless of the current server navigation depth. The current project name is visible in the mobile top bar, and search uses a compact icon button. The ordinary browser and desktop experience remains appropriate.

## Acceptance criteria
- In the Android and iOS native Hub context, activating the RepoOS logo from any connected server screen returns to the native server picker in one action, not through accumulated WebView history.
- Use an explicitly scoped and secure native bridge or existing supported navigation contract; do not allow arbitrary pages or untrusted origins to control the native shell. Preserve safe behavior in a regular browser and on desktop.
- Show the current project name on narrow phone screens alongside a compact accessible search icon button; support long project names, touch targets, screen readers, both light and dark themes, and no horizontal overflow.
- Preserve current top-bar actions and search behavior; add focused tests for native and normal-browser behavior and narrow-screen layout. Rebuild all affected UI and mobile assets.
- Add review shots for the mobile top bar where supported.

## Notes for AI
Inspect the existing Hub server WebView architecture and navigation security before choosing the bridge. The screenshots are the user’s references. Coordinate with the mobile layout tasks and do not assume that content running in the connected server has native shell privileges. Avoid altering project color-picker semantics accidentally.

## Screenshots

![Screenshot-2026-11-17-at-13.34.11](/api/tasks/1152/attachments/att_910c023b-cbb3-4136-8322-14934d02d741.png)
![Screenshot-2026-11-17-at-13.34.17](/api/tasks/1152/attachments/att_5e389552-35fd-4515-8214-1a5d70a1da4a.png)

## Activity

- 2026-11-17T05:37:20Z · created · t@t
- 2026-11-17T05:37:20Z · screenshots
- 2026-11-17T05:50:10Z · status inbox→ready
