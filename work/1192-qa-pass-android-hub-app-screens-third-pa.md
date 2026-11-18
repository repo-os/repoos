---
id: "1192"
title: "QA pass: Android Hub app screens third pass – theme switching, long names and rotation at phone sizes"
type: bug
status: active
priority: p2
area: mobile
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-android-hub-app-screens-third-pa
created_at: "2026-11-18T17:47:42Z"
updated_at: "2026-11-18T17:55:19Z"
---
## Problem
Theme switching, very long server/project names and narrow/rotated layouts have not been checked in the Hub UI.
## Desired UX
All Hub themes and long names render without clipping at 360px and 412px, portrait and landscape.
## Acceptance criteria
- Run bunx vite --port 5188 in mobile/ headless only (headless Playwright; never open a visible browser or the user's Chrome). Fix bugs with tests.
- Commit docs/qa/2026-11-android-hub-third-pass.md.
## Notes for AI
Do not touch repoos.toml. Never open a visible browser window.

## Activity

- 2026-11-18T17:47:42Z · created · t@t
- 2026-11-18T17:47:45Z · status inbox→ready
- 2026-11-18T17:47:47Z · status ready→active, branch
- 2026-11-18T17:55:19Z · body
