---
id: "1171"
title: "QA pass: Android Hub web UI fixtures (many servers, errors, offline) and fix issues"
type: bug
status: review
priority: p2
area: mobile
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-android-hub-web-ui-fixtures-many
cli_override: claude code
model_override: haiku
created_at: "2026-11-18T02:19:54Z"
updated_at: "2026-11-18T03:09:18Z"
review_rounds: 1
review_passes: 1
---
## Problem
The Android Hub Vite UI needs a fixture-driven QA sweep before device QA (#1162).
## Desired UX
Server picker, project list, error and offline states look correct at phone widths.
## Acceptance criteria
- Run bunx vite --port 5188 in mobile/ and open ?fixture=many&platform=android plus error/offline fixtures at 375px.
- Fix layout/state bugs found with tests.
- Commit docs/qa/2026-11-android-hub-fixtures.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-18T02:19:54Z · created · t@t
- 2026-11-18T02:20:59Z · status inbox→ready
- 2026-11-18T02:21:12Z · cli_override, model_override
- 2026-11-18T02:21:21Z · status ready→active, branch
- 2026-11-18T02:30:31Z · body
- 2026-11-18T02:38:31Z · CTO nudge: held — handoff gate is running
- 2026-11-18T02:55:13Z · status active→review
- 2026-11-18T02:55:14Z · message_queued at 2026-11-18T02:55:14.175Z
- 2026-11-18T02:55:14Z · note: shots: skipped — the diff (5 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-18T03:02:59Z · note: review pass 1: needs some work
- 2026-11-18T03:03:00Z · message_delivered: 1 message(s)
- 2026-11-18T03:03:00Z · status review→active
- 2026-11-18T03:07:22Z · body
- 2026-11-18T03:08:44Z · CTO nudge: held — handoff gate is running
- 2026-11-18T03:09:17Z · status active→review
- 2026-11-18T03:09:18Z · message_queued at 2026-11-18T03:09:18.054Z
- 2026-11-18T03:09:18Z · note: shots: skipped — the diff (7 changed paths) touches no capture target's globs — no UI change to capture
