---
id: "1252"
title: "QA pass: error pages, 404 routes and deep links to tasks, tabs and settings"
type: bug
status: done
priority: p2
area: web
merged_commit: c5c12bc8bad5028fbd92f2eb4e15efcd2fe69b4f
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-error-pages-404-routes-and-deep-
cli_override: claude code
model_override: haiku
created_at: "2026-11-19T22:27:09Z"
updated_at: "2026-11-20T01:13:17Z"
last_close_out_gate_ms: 1077226
last_close_out_gate_at: "2026-11-20T01:04:28.427Z"
review_passes: 1
---
## Problem
Unknown routes, deleted or archived task links and deep links to tabs and settings sections have not been checked.
## Desired UX
A bad link shows a friendly plain-English page with a way back; valid deep links open the right tab or drawer and survive reload at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only against fixtures; never open a visible browser.
- Cover 404, archived and deleted tasks, wrong tab ids and reload; fix issues with tests.
- Commit docs/qa/2026-11-deep-links-404-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T22:27:09Z · created · t@t
- 2026-11-19T22:27:14Z · status inbox→ready
- 2026-11-19T22:27:16Z · cli_override, model_override
- 2026-11-19T22:27:17Z · status ready→active, branch
- 2026-11-19T22:32:48Z · body
- 2026-11-19T23:07:46Z · CTO nudge: held — handoff gate is running
- 2026-11-19T23:19:20Z · note: ui verification passed: 1 shot captured with clean console
- 2026-11-19T23:19:22Z · status active→review
- 2026-11-19T23:19:23Z · message_queued at 2026-11-19T23:19:23.047Z
- 2026-11-19T23:21:22Z · note: review pass 1: good to go
- 2026-11-20T00:27:11Z · message_overdue: still queued after 60m without being delivered
- 2026-11-20T01:04:28Z · close-out gate completed in 1077s
- 2026-11-20T01:05:17Z · status done→done, release:success
- 2026-11-20T01:13:17Z · message_dropped: 1 queued message(s) discarded — task is done
