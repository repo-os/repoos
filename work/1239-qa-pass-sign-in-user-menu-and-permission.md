---
id: "1239"
title: "QA pass: sign-in, user menu and permissions screens at all screen sizes"
type: bug
status: active
needs_input: true
needs_input_reason: needs-human-step
needs_input_detail: "Acceptance criteria mention a real device, physical hardware, accounts, credentials, or third-party registration — split that verification into a separate human-only task. (matched: credentials or keys — \"never use or print real credentials.\")"
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-sign-in-user-menu-and-permission
cli_override: claude code
model_override: haiku
created_at: "2026-11-19T18:27:10Z"
updated_at: "2026-11-19T18:55:26Z"
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

## Shots
```json
[
{
"label": "OTP entry step after the sign-in fixes",
"target": "default",
"route": "/login",
"highlight": ".login-form",
"state": "auth:otp"
},
{
"label": "Security tab users row with the styled role dropdown",
"target": "default",
"route": "/settings?tab=security",
"highlight": ".auth-add-row"
}
]
```

## Activity

- 2026-11-19T18:27:10Z · created · t@t
- 2026-11-19T18:27:11Z · needs_input
- 2026-11-19T18:27:15Z · status inbox→ready
- 2026-11-19T18:27:17Z · cli_override, model_override
- 2026-11-19T18:27:18Z · status ready→active, branch
- 2026-11-19T18:40:16Z · body
- 2026-11-19T18:41:07Z · body
- 2026-11-19T18:41:49Z · CTO nudge: held — handoff gate is running
- 2026-11-19T18:55:26Z · note: ui verification passed: 2 of 2 shots captured with clean console
