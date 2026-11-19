---
id: "1212"
title: "QA pass: Hub and web app copy review – wording, plain-English errors and consistent terminology"
type: chore
status: active
priority: p3
area: [web, mobile, macos]
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-hub-and-web-app-copy-review-word
created_at: "2026-11-19T00:47:39Z"
updated_at: "2026-11-19T01:16:02Z"
review_rounds: 1
routing_switches: 1
review_passes: 1
---
## Problem
Wording across the web app and Hub apps may be inconsistent or jargon-heavy (infra terms in user-facing errors).
## Desired UX
Errors and labels use plain English and consistent names for the same things (server, project, runner, agent).
## Acceptance criteria
- Read UI strings in src/ui-app, mobile/ and macos/; fix the worst jargon and inconsistencies with tests where strings are asserted; headless browsers only, never visible.
- Commit docs/qa/2026-11-copy-review.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T00:47:39Z · created · t@t
- 2026-11-19T00:47:42Z · status inbox→ready
- 2026-11-19T00:47:44Z · status ready→active, branch
- 2026-11-19T00:54:50Z · body
- 2026-11-19T00:58:15Z · note: ui verification passed: 1 shot captured with clean console
- 2026-11-19T00:58:16Z · status active→review
- 2026-11-19T00:58:16Z · message_queued at 2026-11-19T00:58:16.919Z
- 2026-11-19T00:59:00Z · note: review pass 1: needs some work
- 2026-11-19T00:59:01Z · status review→active
- 2026-11-19T00:59:03Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-19T00:59:11Z · message_delivered: 1 message(s)
- 2026-11-19T00:59:28Z · CTO nudge: held — remote validation is running
- 2026-11-19T01:08:13Z · body
- 2026-11-19T01:08:58Z · CTO nudge: held — handoff gate is running
- 2026-11-19T01:12:47Z · note: ui verification passed: 1 shot captured with clean console (1 shot warning)
- 2026-11-19T01:12:48Z · message_queued at 2026-11-19T01:12:48.503Z
- 2026-11-19T01:13:12Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-19T01:16:01Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-19T01:16:02Z · message_delivered: 1 message(s)
