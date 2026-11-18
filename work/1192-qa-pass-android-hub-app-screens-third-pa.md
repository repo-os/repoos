---
id: "1192"
title: "QA pass: Android Hub app screens third pass – theme switching, long names and rotation at phone sizes"
type: bug
status: review
priority: p2
area: mobile
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-android-hub-app-screens-third-pa
created_at: "2026-11-18T17:47:42Z"
updated_at: "2026-11-18T18:01:25Z"
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
- 2026-11-18T17:58:06Z · body
- 2026-11-18T17:59:30Z · watchdog: check wait escalated · waiting: waiting for a Playwright slot — position 2 (1 ahead); slot holder 74680 is dead for 14s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-18T17:59:45Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-18T18:00:56Z · status active→review
- 2026-11-18T18:00:56Z · message_queued at 2026-11-18T18:00:56.928Z
- 2026-11-18T18:00:57Z · note: shots: skipped — the diff (4 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-18T18:01:25Z · note: review pass 1: good to go
