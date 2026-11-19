---
id: "1252"
title: "QA pass: error pages, 404 routes and deep links to tasks, tabs and settings"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-error-pages-404-routes-and-deep-
cli_override: claude code
model_override: haiku
created_at: "2026-11-19T22:27:09Z"
updated_at: "2026-11-19T23:19:20Z"
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
