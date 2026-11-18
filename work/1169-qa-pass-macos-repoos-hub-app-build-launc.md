---
id: "1169"
title: "QA pass: macOS RepoOS Hub app – build, launch, connect, and fix what is broken"
type: bug
status: review
priority: p2
area: macos
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-macos-repoos-hub-app-build-launc
cli_override: claude code
model_override: haiku
created_at: "2026-11-18T02:19:44Z"
updated_at: "2026-11-18T02:30:09Z"
---
## Problem
Nick reports the macOS Hub app has been unusable for weeks. Nobody has recently built and driven it.
## Desired UX
App builds, launches, discovers servers, connects, and shows projects/tasks without errors.
## Acceptance criteria
- Build with xcodebuild (CODE_SIGNING_ALLOWED=NO, own derivedDataPath); launch it; capture window-only screenshots (screencapture -l<windowid>, never the full screen).
- Fix every crash/blank/broken screen found, with tests where possible.
- Commit a record docs/qa/2026-11-macos-hub-qa.md listing what was checked and fixed.
## Notes for AI
Never capture the whole screen. Do not touch repoos.toml.

## Activity

- 2026-11-18T02:19:44Z · created · t@t
- 2026-11-18T02:20:04Z · status inbox→ready
- 2026-11-18T02:20:08Z · cli_override, model_override
- 2026-11-18T02:20:10Z · status ready→active, branch
- 2026-11-18T02:28:31Z · CTO nudge: held — handoff gate is running
- 2026-11-18T02:30:09Z · status active→review
