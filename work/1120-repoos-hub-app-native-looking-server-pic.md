---
id: "1120"
title: "RepoOS Hub app: native-looking server picker, web color themes with light/dark, better icons, and a Settings page"
type: feature
status: ready
needs_input: true
needs_input_reason: needs-human-step
needs_input_detail: "Acceptance criteria mention a real device, physical hardware, accounts, credentials, or third-party registration — split that verification into a separate human-only task. (matched: on-device verification, device verification — \"Theme and mode persist on the device (Capacitor Preferences) and apply before first paint (no flash).\")"
priority: p2
area: mobile
assigned_to: ai
created_by: t@t
branch: ""
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-14T16:53:29Z"
updated_at: "2026-11-14T16:53:48Z"
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

## Screenshots

![21f31e1d-image](/api/tasks/1120/attachments/att_7f3e2a85-0ca2-4bff-b79f-659408e2dacf.png)

## Activity

- 2026-11-14T16:53:29Z · created · t@t
- 2026-11-14T16:53:30Z · screenshots
- 2026-11-14T16:53:31Z · needs_input
- 2026-11-14T16:53:42Z · body: Acceptance criteria (added 6, removed 6)
- 2026-11-14T16:53:46Z · cli_override, model_override
- 2026-11-14T16:53:48Z · status inbox→ready
