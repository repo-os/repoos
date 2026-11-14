---
check_retry_count: 2
last_check_failure: "repoos check at 2026-11-14T21:07:45.909Z: repoos check failed: ui verification failed (2 issue(s)): [missing-target] Hub server list (Android, dark classic) (target \"default\"): highlight [data-testid=\"hub-server-list\"] matched nothing on /?fixture=many&platform=android&appearance=dark&theme=classic (http://127.0.0.1:41679/?fixture=many&platform=android&appearance=dark&theme=classic); [missing-target] Hub Settings (iOS, light gruvbox) (target \"default\"): highlight [data-testid=\"hub-settings\"] matched nothing on /?fixture=settings&platfor… (truncated)"
id: "1120"
title: "RepoOS Hub app: native-looking server picker, web color themes with light/dark, better icons, and a Settings page"
type: feature
status: active
needs_input: true
needs_input_reason: needs-human-step
human_step_override: Cleared needs-human-step flag (sticky until acceptance criteria change)
human_step_override_key: f531bd01
priority: p2
area: mobile
assigned_to: ai
created_by: t@t
branch: feat/repoos-hub-app-native-looking-server-pic
cli_override: cursor
model_override: composer-2.5
created_at: "2026-11-14T16:53:29Z"
updated_at: "2026-11-14T21:07:45Z"
dev_error_count: 3
---
## Problem
The RepoOS Hub Capacitor shell (mobile/, iOS and Android) is bare bones. Nick's current Android build (screenshot attached) shows a single dark theme, a "Device lock" panel pushed inline above the server list, text-arrow reorder buttons and a pencil glyph that look like web controls, flat unstyled server cards, and a plain "+ Add server" button. It has no color themes and no light mode, and the icons are not the set used by the web app. The device lock and any future preferences have nowhere proper to live. (The screenshot also shows the old "RepoOS" title, so it is a build from before the September "RepoOS Hub" rename.)

## Desired UX
The shell feels like a native app on each platform and matches the web app: the same color themes as the web UI plus light, dark and follow-system modes; polished server cards with a clear reachability indicator, large touch rows, and reorder and edit that feel native (long-press drag handle or edit mode, edit in a bottom sheet); a good empty state for a first run; better icons that match the web app (lucide); and Settings as its own page opened from the header, holding Appearance (theme, light/dark/system), Device lock, and About (version, rename note). The add-server flow is a proper page or sheet with inline validation (HTTPS-only, reachability check) as today.

## Acceptance criteria
1. Settings is its own page with a back affordance; it contains Appearance (theme picker using the web app theme set, and a light/dark/system switch), Device lock, and About. Device lock leaves the server list screen.
2. Reuse the web app theme tokens (mobile/src/design-tokens and the src/ui-app theme definitions) so every web theme works in the shell in light and dark wherever the web app offers both; no hard-coded colors outside tokens; text contrast meets the same floor the web contrast audit uses. Theme and mode persist in Capacitor Preferences and apply before first paint (no flash).
3. Server list: redesigned cards (avatar tile, name, host, reachability dot or label, chevron), native-feeling press states, safe-area padding, large touch targets, a drag-handle or edit-mode reorder instead of tiny arrow glyphs, edit and delete in a bottom sheet, and a first-run empty state with an obvious Add server action.
4. Icons: replace text glyphs with lucide icons (same set as the web app, tree-shaken); change the app icon and splash only if the current ones clash with the new look.
5. Platform feel: Material-style details on Android (ripple, elevation, system bar theming through the status-bar plugin) and iOS-style details on iOS (large title, grouped lists), selected by platform and sharing components; haptics used sparingly (reorder, delete).
6. Preserve every current behaviour: HTTPS-only add with the reachability check, local-only storage of the server list, isolated WebView open, lock screen, the minSdkVersion 26 notes; no new network calls; no new runtime dependencies beyond the icon set unless justified in the report.
7. Tests for theme and mode persistence, the server list states (empty, one, many, unreachable) and Settings navigation; screenshots at 390x844 for light and dark with at least two themes, in Android and iOS styling, captured with repoos shot against the repoos-mobile-dev target (port 5174).
8. Scope boundary: this task ends at browser-target screenshots, passing tests and, when the Android build tools are present, a successful `just build-android`. Installing the build on a phone and checking iOS hardware are separate follow-ups for Nick; list them in the report and do not claim them as done.

## Notes for AI
Read docs/mobile-architecture.md, docs/adr/0011-mobile-web-ui.md (the native shell stays a thin picker and lock; the server-served web UI is the in-server experience) and mobile/README.md. Do not add RepoOS server screens to the shell. Keep the shell small and fast. Related tasks: #0300 (mobile testing, keep), #0302 and #0304 (likely rewrite or close per the ADR); do not edit them.

## Shots
```json
[
{
"label": "Hub server list (Android, dark classic)",
"target": "default",
"route": "/?fixture=many&platform=android&appearance=dark&theme=classic",
"highlight": "[data-testid=\"hub-server-list\"]",
"viewportWidth": 390,
"viewportHeight": 844
},
{
"label": "Hub Settings (iOS, light gruvbox)",
"target": "default",
"route": "/?fixture=settings&platform=ios&appearance=light&theme=gruvbox",
"highlight": "[data-testid=\"hub-settings\"]",
"viewportWidth": 390,
"viewportHeight": 844
}
]
```

## Screenshots

![21f31e1d-image](/api/tasks/1120/attachments/att_7f3e2a85-0ca2-4bff-b79f-659408e2dacf.png)

## Activity

- 2026-11-14T16:53:29Z · created · t@t
- 2026-11-14T16:53:30Z · screenshots
- 2026-11-14T16:53:31Z · needs_input
- 2026-11-14T16:53:42Z · body: Acceptance criteria (added 6, removed 6)
- 2026-11-14T16:53:46Z · cli_override, model_override
- 2026-11-14T16:53:48Z · status inbox→ready
- 2026-11-14T16:53:49Z · status ready→active, branch
- 2026-11-14T16:53:51Z · needs_input
- 2026-11-14T16:53:55Z · agent exited with an error (codex) · Reading additional input from stdin...
- 2026-11-14T16:53:55Z · engineer crash recovery: resuming codex + gpt-6-luna (1/3 crashes in 30m) · Reading additional input from stdin...
- 2026-11-14T16:53:58Z · engineer crash recovery: resuming codex + gpt-6-luna (2/3 crashes in 30m) · Reading additional input from stdin...
- 2026-11-14T16:54:02Z · engineer crash recovery: surfaced instead of switching — a human-set task override (codex + gpt-6-luna) is pinned, so RepoOS did not replace it (3/3 crashes in 30m)
- 2026-11-14T17:04:03Z · cli_override, model_override
- 2026-11-14T17:04:04Z · needs_input
- 2026-11-14T17:07:45Z · body
- 2026-11-14T17:18:53Z · message_queued at 2026-11-14T17:18:53.181Z
- 2026-11-14T17:18:53Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-14T17:23:23Z · queued message undelivered for 5m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-14T17:23:23Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 143) · last assistant: no assistant message · stderr: (empty)
- 2026-11-14T17:23:23Z · needs_input
- 2026-11-14T17:23:23Z · message_delivered: 1 message(s)
- 2026-11-14T17:23:53Z · message_queued at 2026-11-14T17:23:53.398Z
- 2026-11-14T17:23:53Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-14T17:24:04Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-14T18:31:00Z · message_overdue: still queued after 60m without being delivered
- 2026-11-14T18:42:44Z · body
- 2026-11-14T18:48:53Z · CTO nudge: held — handoff gate is running
- 2026-11-14T19:15:16Z · engineer stopped by request
- 2026-11-14T19:15:17Z · needs_input
- 2026-11-14T19:15:17Z · needs_input
- 2026-11-14T19:15:29Z · needs_input
- 2026-11-14T19:32:23Z · message_queued at 2026-11-14T19:32:23.721Z
- 2026-11-14T19:32:26Z · message_delivered: 1 message(s)
- 2026-11-14T19:34:04Z · body
- 2026-11-14T19:43:53Z · message_queued at 2026-11-14T19:43:53.238Z
- 2026-11-14T19:43:53Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-14T19:45:02Z · message_queued at 2026-11-14T19:45:02.112Z
- 2026-11-14T19:45:34Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-14T19:48:43Z · queued message undelivered for 5m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-14T19:48:43Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 143) · last assistant: no assistant message · stderr: (empty)
- 2026-11-14T19:48:43Z · message_delivered: 2 message(s)
- 2026-11-14T19:48:53Z · message_queued at 2026-11-14T19:48:53.193Z
- 2026-11-14T19:48:53Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-14T19:50:04Z · body
- 2026-11-14T19:51:58Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-14T19:51:58Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 143) · last assistant: Checking worktree state and finishing verification so we can hand off. · stderr: (empty)
- 2026-11-14T19:51:58Z · needs_input
- 2026-11-14T19:51:58Z · message_delivered: 1 message(s)
- 2026-11-14T19:53:53Z · message_queued at 2026-11-14T19:53:53.191Z
- 2026-11-14T19:53:53Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-14T19:58:53Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-14T20:15:01Z · engineer stopped by request
- 2026-11-14T20:15:01Z · needs_input
- 2026-11-14T20:15:01Z · needs_input
- 2026-11-14T20:15:03Z · needs_input
- 2026-11-14T20:15:04Z · message_delivered: 1 message(s)
- 2026-11-14T20:21:53Z · body
- 2026-11-14T20:32:17Z · body
- 2026-11-14T20:43:53Z · CTO nudge: held — handoff gate is running
- 2026-11-14T20:52:43Z · needs_input
- 2026-11-14T21:07:42Z · note: ui verification failed: ui verification failed (2 issue(s)): [missing-target] Hub server list (Android, dark classic) (target "default"): highlight [data-testid="hub-server-list"] matched nothing on /?fixture=many&platform=android&appearance=dark&theme=classic (http://127.0.0.1:41679/?fixture=many&platform=android&appearance=dark&theme=classic); [missing-target] Hub Settings (iOS, light gruvbox) (target "default"): highlight [data-testid="hub-settings"] matched nothing on /?fixture=settings&plat
- 2026-11-14T21:07:43Z · message_queued at 2026-11-14T21:07:43.043Z
- 2026-11-14T21:07:45Z · message_delivered: 1 message(s)

