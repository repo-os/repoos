---
id: "1208"
title: "QA pass: pairing, login and session screens – OTP, expired sessions, sign-out, mobile widths"
type: bug
status: inbox
priority: p2
area: [web, server]
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-18T22:47:38Z"
updated_at: "2026-11-18T22:47:38Z"
---
## Problem
Auth screens are the first thing users see and must work on phones.
## Desired UX
Login, code entry, expired-session and sign-out flows are clear and usable at 375px, with helpful errors.
## Acceptance criteria
- Headless Playwright only against the auth-less dev server (just serve-noauth from a scratch worktree); never open a visible browser or the user's Chrome. Fix bugs with tests.
- Commit docs/qa/2026-11-auth-screens.md.
## Notes for AI
Do not touch repoos.toml. Never open a visible browser window.

## Activity

- 2026-11-18T22:47:38Z · created · t@t
