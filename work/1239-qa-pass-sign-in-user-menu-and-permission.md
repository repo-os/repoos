---
id: "1239"
title: "QA pass: sign-in, user menu and permissions screens at all screen sizes"
type: bug
status: inbox
needs_input: true
needs_input_reason: needs-human-step
needs_input_detail: "Acceptance criteria mention a real device, physical hardware, accounts, credentials, or third-party registration — split that verification into a separate human-only task. (matched: credentials or keys — \"never use or print real credentials.\")"
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-19T18:27:10Z"
updated_at: "2026-11-19T18:27:11Z"
---
## Problem
The sign-in flow, user menu and users/permissions settings have not been QA-checked together at phone, tablet and desktop widths since recent changes.
## Desired UX
Sign-in, OTP entry, user menu and the users list work by keyboard and touch, with plain-English errors, at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only against the auth-less or dev-login fixtures; never open a visible browser; never use or print real credentials.
- Cover wrong code, expired code, locked-out and offline states; fix issues with tests.
- Commit docs/qa/2026-11-sign-in-users-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Activity

- 2026-11-19T18:27:10Z · created · t@t
- 2026-11-19T18:27:11Z · needs_input
