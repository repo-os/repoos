---
id: "1255"
title: "QA pass: update banner, version display and release notes modal at all screen sizes"
type: bug
status: ready
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: ""
cli_override: claude code
model_override: haiku
created_at: "2026-11-19T23:27:47Z"
updated_at: "2026-11-19T23:27:59Z"
---
## Problem
The update-available banner, version display and release notes modal have not been checked since the restart fix.
## Desired UX
The banner and modal explain what is new in plain English, restart or dismiss works, and everything fits at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only against fixtures; never open a visible browser; never restart a real server.
- Cover supervised, hand-run, failure and dismissed states; fix issues with tests.
- Commit docs/qa/2026-11-update-banner-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T23:27:47Z · created · t@t
- 2026-11-19T23:27:55Z · status inbox→ready
- 2026-11-19T23:27:59Z · cli_override, model_override
