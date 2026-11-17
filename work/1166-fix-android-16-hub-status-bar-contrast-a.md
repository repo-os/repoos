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
created_at: "2026-11-17T17:55:45Z"
updated_at: "2026-11-17T17:55:47Z"
---
## Problem\nOn Android 16 (API 36), the Hub theme changes the status-bar icon style but the status bar background remains a light system strip. In dark appearance, white status icons become nearly invisible against that light strip. The status bar color API is ignored for apps targeting API 36, so the native edge-to-edge treatment needs a platform-aware fix.\n\n## Reproduction\n1. Install RepoOS Hub Dev on an Android 16 device or emulator.\n2. Open Settings and choose Dark appearance.\n3. Observe the system status bar above the app.\n\n## Expected\nStatus bar background and icon colors maintain readable contrast with the active Hub theme without covering the top content.\n\n## Evidence\nCaptured on the Pixel 8 API 36 emulator during task #1159: theme-classic-dark.png. The white status icons are faint against the light status-bar strip.\n

## Screenshots

![Dark theme status bar has pale background and low-contrast white icons](/api/tasks/1166/attachments/att_bfeae21b-50ac-4757-b9e6-c6c6a5f3c7f6.png)

## Activity

- 2026-11-17T17:55:45Z · created · t@t
- 2026-11-17T17:55:46Z · screenshots
- 2026-11-17T17:55:47Z · needs_input
