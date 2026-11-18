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
updated_at: "2026-11-18T02:51:43Z"
review_passes: 1
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
- 2026-11-18T02:30:10Z · message_queued at 2026-11-18T02:30:10.287Z
- 2026-11-18T02:30:10Z · note: shots: skipped — the diff (3 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-18T02:32:57Z · note: review pass 1: needs some work
- 2026-11-18T02:47:35Z · status review→active
- 2026-11-18T02:47:37Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-18T02:47:37Z · message_delivered: 1 message(s)
- 2026-11-18T02:51:36Z · status active→review
- 2026-11-18T02:51:37Z · note: shots: skipped — the diff (9 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-18T02:51:43Z · message_queued at 2026-11-18T02:51:43.250Z
