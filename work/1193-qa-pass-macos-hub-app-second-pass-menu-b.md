---
id: "1193"
title: "QA pass: macOS Hub app second pass – menu bar, Cmd-K search, server add/edit and relaunch"
type: bug
status: ready
priority: p2
area: macos
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-18T18:17:35Z"
updated_at: "2026-11-18T18:17:38Z"
---
## Problem
#1169 covered build, launch and first-run; the menu bar, Cmd-K search and add/edit/relaunch flows need another pass.
## Desired UX
These flows work and look right in light and dark appearance.
## Acceptance criteria
- Build with xcodebuild (CODE_SIGNING_ALLOWED=NO, own derivedDataPath), launch, drive the flows; capture window-only screenshots (screencapture -l<windowid>, never the full screen and never commit PNGs). Fix bugs with tests.
- Commit docs/qa/2026-11-macos-hub-second-pass.md.
## Notes for AI
Do not touch repoos.toml. Signed-in project/task views are tracked in #1174 (human).

## Activity

- 2026-11-18T18:17:35Z · created · t@t
- 2026-11-18T18:17:38Z · status inbox→ready
