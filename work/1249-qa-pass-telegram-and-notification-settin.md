---
id: "1249"
title: "QA pass: Telegram and notification settings screens and their messages"
type: bug
status: ready
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: ""
cli_override: claude code
model_override: haiku
created_at: "2026-11-19T21:46:55Z"
updated_at: "2026-11-19T21:47:00Z"
---
## Problem
The notification and Telegram settings screens and the messages they produce have not been checked for wording, error states and small-screen layout.
## Desired UX
Setup steps, test-message results and errors are plain English with a next step, and the screens fit at 375, 768 and 1280 px. No tokens are ever shown or logged.
## Acceptance criteria
- Headless Playwright only against fixtures; never open a visible browser; never contact Telegram or use real tokens.
- Fix issues with tests; commit docs/qa/2026-11-notifications-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T21:46:55Z · created · t@t
- 2026-11-19T21:46:59Z · status inbox→ready
- 2026-11-19T21:47:00Z · cli_override, model_override
