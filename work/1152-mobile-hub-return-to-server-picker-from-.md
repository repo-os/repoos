---
id: "1152"
title: "Mobile Hub: return to server picker from logo and show current project"
type: feature
status: active
priority: p1
area: [mobile, web]
assigned_to: ai
created_by: t@t
branch: feat/mobile-hub-return-to-server-picker-from-
created_at: "2026-11-17T05:37:20Z"
updated_at: "2026-11-17T07:47:21Z"
review_rounds: 1
routing_switches: 1
review_passes: 1
handoff_signal_retry_count: 2
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

## Shots
```json
[
{
"label": "Mobile Hub top bar (dark, 360px): project name, compact search, return logo",
"target": "default",
"route": "/work?repoos_hub=0123456789abcdef0123456789abcdef",
"highlight": ".topbar",
"theme": "dark",
"viewportWidth": 360,
"viewportHeight": 800
},
{
"label": "Mobile Hub top bar (light, 390px): project name, compact search, return logo",
"target": "default",
"route": "/work?repoos_hub=0123456789abcdef0123456789abcdef",
"highlight": ".topbar",
"theme": "light",
"viewportWidth": 390,
"viewportHeight": 844
},
{
"label": "Desktop top bar unchanged: branch label and full search",
"target": "default",
"route": "/work",
"highlight": ".topbar",
"theme": "light",
"viewportWidth": 1440,
"viewportHeight": 900
}
]
```

## Screenshots

![Screenshot-2026-11-17-at-13.34.11](/api/tasks/1152/attachments/att_910c023b-cbb3-4136-8322-14934d02d741.png)
![Screenshot-2026-11-17-at-13.34.17](/api/tasks/1152/attachments/att_5e389552-35fd-4515-8214-1a5d70a1da4a.png)

## Activity

- 2026-11-17T05:37:20Z · created · t@t
- 2026-11-17T05:37:20Z · screenshots
- 2026-11-17T05:50:10Z · status inbox→ready
- 2026-11-17T05:50:12Z · status ready→active, branch
- 2026-11-17T06:09:57Z · message_queued at 2026-11-17T06:09:57.531Z
- 2026-11-17T06:09:57Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-17T06:10:42Z · body
- 2026-11-17T06:11:37Z · body
- 2026-11-17T06:14:30Z · queued message undelivered for 5m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-17T06:14:30Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: Implementation and focused tests are in place, and both the web UI and mobile web bundles build. Now I'm running the scoped gate. · stderr: (empty)
- 2026-11-17T06:14:57Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-17T06:32:20Z · message_queued at 2026-11-17T06:32:20.604Z
- 2026-11-17T06:42:39Z · message_queued at 2026-11-17T06:42:39.998Z
- 2026-11-17T06:44:32Z · watchdog: check wait escalated · waiting: system load is high (9.2× per CPU, limit 3×) — waiting for headroom before starting more work; wait exceeds the handoff deadline for 30m · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-17T06:46:56Z · needs_input
- 2026-11-17T06:46:56Z · message_delivered: 1 message(s)
- 2026-11-17T06:48:47Z · queued message undelivered for 16m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-17T06:48:48Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: Implementation and focused tests are in place, and both the web UI and mobile web bundles build. Now I'm running the scoped gate. · stderr: (empty)
- 2026-11-17T06:48:48Z · message_delivered: 2 message(s)
- 2026-11-17T06:52:22Z · message_queued at 2026-11-17T06:52:22.008Z
- 2026-11-17T06:52:22Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-17T06:53:49Z · body
- 2026-11-17T06:56:45Z · note: ui verification passed: 2 of 2 shots captured with clean console (1 shot warning)
- 2026-11-17T06:56:46Z · message_queued at 2026-11-17T06:56:46.173Z
- 2026-11-17T06:57:21Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-17T06:59:48Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-17T06:59:49Z · message_delivered: 1 message(s)
- 2026-11-17T07:05:54Z · body
- 2026-11-17T07:10:46Z · body
- 2026-11-17T07:12:21Z · CTO nudge: held — handoff gate is running
- 2026-11-17T07:15:16Z · note: ui verification passed: 2 of 2 shots captured with clean console (1 shot warning)
- 2026-11-17T07:15:17Z · status active→review
- 2026-11-17T07:15:18Z · message_queued at 2026-11-17T07:15:18.215Z
- 2026-11-17T07:23:34Z · note: review pass 1: needs some work
- 2026-11-17T07:23:36Z · message_delivered: 1 message(s)
- 2026-11-17T07:23:36Z · status review→active
- 2026-11-17T07:29:35Z · body
- 2026-11-17T07:32:21Z · CTO nudge: held — remote validation is running
- 2026-11-17T07:42:07Z · body
- 2026-11-17T07:47:21Z · CTO nudge: held — remote validation is running
