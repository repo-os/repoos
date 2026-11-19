---
updated_at: "2026-11-19T22:21:41Z"
review_passes: 1
id: "1248"
title: "QA pass: Inputs and Context uploads with large, wrong-type and failing files"
type: bug
status: review
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-inputs-and-context-uploads-with-
cli_override: claude code
model_override: haiku
created_at: "2026-11-19T21:26:57Z"
---
## Problem
Uploads on the Inputs and Context pages have not been checked with very large files, wrong types, duplicate names and failing uploads.
## Desired UX
Every rejected or failed upload says what went wrong and what to do in plain English, progress is visible, and nothing is half-saved at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only against fixtures and mocked responses; never open a visible browser; never commit binaries under work/ or inputs/.
- Fix issues with tests; commit docs/qa/2026-11-uploads-failures-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T21:26:57Z · created · t@t
- 2026-11-19T21:27:01Z · status inbox→ready
- 2026-11-19T21:27:03Z · cli_override, model_override
- 2026-11-19T21:27:04Z · status ready→active, branch
- 2026-11-19T21:42:30Z · body
- 2026-11-19T21:42:46Z · note: adopted orphaned engineer pid 61756
- 2026-11-19T21:47:01Z · CTO nudge: held — handoff gate is running
- 2026-11-19T22:01:00Z · note: ui verification passed: 1 shot captured with clean console
- 2026-11-19T22:01:01Z · message_queued at 2026-11-19T22:01:01.602Z
- 2026-11-19T22:01:11Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-19T22:04:02Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-19T22:04:03Z · message_delivered: 1 message(s)
- 2026-11-19T22:16:15Z · body
- 2026-11-19T22:17:45Z · CTO nudge: held — handoff gate is running
- 2026-11-19T22:19:04Z · note: ui verification passed: 1 shot captured with clean console
- 2026-11-19T22:19:05Z · status active→review
- 2026-11-19T22:19:05Z · message_queued at 2026-11-19T22:19:05.414Z
- 2026-11-19T22:21:41Z · note: review pass 1: good to go

