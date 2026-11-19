---
id: "1241"
title: "QA pass: Agents page Build Your Team and scheduled tasks with long lists"
type: bug
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-19T19:07:09Z"
updated_at: "2026-11-19T19:07:09Z"
---
## Problem
Build Your Team, Scheduled Tasks and Reminders have not been checked with many entries and long names.
## Desired UX
Long lists and names stay readable, forms validate in plain English, and nothing overflows at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only against fixtures; never open a visible browser or steal focus.
- Use fixtures with 50+ entries and long names; fix issues with tests.
- Commit docs/qa/2026-11-agents-long-lists-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T19:07:09Z · created · t@t
