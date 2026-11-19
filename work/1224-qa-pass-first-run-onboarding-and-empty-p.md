---
id: "1224"
title: "QA pass: first-run onboarding and empty-project states at all screen sizes"
type: bug
status: ready
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-19T07:48:01Z"
updated_at: "2026-11-19T07:48:18Z"
---
## Problem
A brand-new project (no tasks, no agents configured, no runners) has not been QA-checked for what a new user sees.
## Desired UX
Empty Work, Agents and Checks pages explain what to do next in plain English and work at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only against fixtures; never open a visible browser or steal focus.
- Check each empty state and first-run path; fix wording, layout and dead links with tests.
- Commit docs/qa/2026-11-first-run-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T07:48:01Z · created · t@t
- 2026-11-19T07:48:18Z · status inbox→ready
