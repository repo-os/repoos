---
id: "1182"
title: "QA pass: Android Hub web UI second pass – settings, add-server and error flows at 360px"
type: bug
status: ready
priority: p2
area: mobile
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-18T09:17:43Z"
updated_at: "2026-11-18T09:17:50Z"
---
## Problem
#1171 covered the main fixtures; add-server, settings and failure flows need another hands-on pass.
## Desired UX
Add-server, edit-server, settings, lock and offline flows look right at 360px and 412px with no clipped controls.
## Acceptance criteria
- Run bunx vite --port 5188 in mobile/ and drive these flows via fixtures; fix bugs with tests.
- Commit docs/qa/2026-11-android-hub-second-pass.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-18T09:17:43Z · created · t@t
- 2026-11-18T09:17:50Z · status inbox→ready
