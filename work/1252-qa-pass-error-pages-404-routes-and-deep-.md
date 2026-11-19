---
id: "1252"
title: "QA pass: error pages, 404 routes and deep links to tasks, tabs and settings"
type: bug
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-19T22:27:09Z"
updated_at: "2026-11-19T22:27:09Z"
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
