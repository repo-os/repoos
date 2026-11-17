---
id: "1166"
title: Fix Android 16 Hub status-bar contrast across themes
type: bug
status: inbox
needs_input: true
needs_input_reason: underspecified
needs_input_detail: "missing sections: Problem, Acceptance criteria, Notes for AI"
priority: p2
area: mobile
assigned_to: ai
created_by: t@t
branch: ""
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-17T17:55:45Z"
updated_at: "2026-11-17T18:23:40Z"
---
## Problem
On Android 16 (API 36), the Hub theme changes the status-bar icon style but the status-bar background remains a light system strip. In Dark appearance, white status icons are nearly invisible against that light strip. Android 16 ignores the status-bar color request for apps targeting API 36, so the native edge-to-edge treatment needs a platform-aware fix.

## Acceptance criteria
- Status-bar text and icons remain readable in both Light and Dark appearance on Android 16.
- The status bar background matches the active Hub theme where the platform allows it.
- Top content remains below the status bar and does not overlap it.
- Verify with emulator screenshots in Light and Dark appearances.

## Reproduction
1. Install RepoOS Hub Dev on an Android 16 device or emulator.
2. Open Settings and choose Dark appearance.
3. Observe the system status bar above the app.

## Evidence
Captured on the Pixel 8 API 36 emulator during task #1159: `theme-classic-dark.png`. White status icons appear faint against the light status-bar strip.

## Notes for AI
This issue was observed on Android 16 (API 36), target SDK 36, with Android System WebView 133.0.6943.137. A trial using `StatusBar.setOverlaysWebView({ overlay: true })` generated a Capacitor safe-area injection error and left the app view blank, so that approach was reverted. Find a fix that preserves the Hub's safe-area layout.

## Screenshots

![Dark theme status bar has pale background and low-contrast white icons](/api/tasks/1166/attachments/att_bfeae21b-50ac-4757-b9e6-c6c6a5f3c7f6.png)
![Dark theme status icons nearly disappear against the light Android 16 status bar](/api/tasks/1166/attachments/att_842272d3-a648-4d4b-8812-d220baba3186.png)

## Activity

- 2026-11-17T17:55:45Z · created · t@t
- 2026-11-17T17:55:46Z · screenshots
- 2026-11-17T17:55:47Z · needs_input
- 2026-11-17T17:56:16Z · body: Problem (added); Acceptance criteria (added); Reproduction (added); Evidence (added); Notes for AI (added); Problem\nOn Android 16 (API 36), the Hub theme changes the status-bar icon style but the status bar background remains a light system strip. In dark appearance, white status icons become nearly invisible against that light strip. The status bar color API is ignored for apps targeting API 36, so the native edge-to-edge treatment needs a platform-aware fix.\n\n## Reproduction\n1. Install RepoOS Hub Dev on an Android 16 device or emulator.\n2. Open Settings and choose Dark appearance.\n3. Observe the system status bar above the app.\n\n## Expected\nStatus bar background and icon colors maintain readable contrast with the active Hub theme without covering the top content.\n\n## Evidence\nCaptured on the Pixel 8 API 36 emulator during task #1159: theme-classic-dark.png. The white status icons are faint against the light status-bar strip.\n (removed)
- 2026-11-17T17:56:18Z · screenshots
- 2026-11-17T18:23:40Z · cli_override, model_override
