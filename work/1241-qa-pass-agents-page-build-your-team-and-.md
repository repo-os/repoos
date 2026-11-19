---
id: "1241"
title: "QA pass: Agents page Build Your Team and scheduled tasks with long lists"
type: bug
status: review
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-agents-page-build-your-team-and-
cli_override: claude code
model_override: haiku
created_at: "2026-11-19T19:07:09Z"
updated_at: "2026-11-19T19:41:19Z"
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
- 2026-11-19T19:07:12Z · status inbox→ready
- 2026-11-19T19:07:14Z · cli_override, model_override
- 2026-11-19T19:07:15Z · status ready→active, branch
- 2026-11-19T19:23:44Z · body
- 2026-11-19T19:29:09Z · CTO nudge: held — handoff gate is running
- 2026-11-19T19:41:19Z · note: ui verification passed: 1 shot captured with clean console
- 2026-11-19T19:41:19Z · status active→review
