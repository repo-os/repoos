---
id: "1208"
title: "QA pass: pairing, login and session screens – OTP, expired sessions, sign-out, mobile widths"
type: bug
status: active
priority: p2
area: [web, server]
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-pairing-login-and-session-screen
created_at: "2026-11-18T22:47:38Z"
updated_at: "2026-11-18T23:00:18Z"
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

## Shots
```json
[
{
"label": "Login fields with accessible names and announced errors",
"target": "default",
"route": "/login",
"highlight": ".login-card"
}
]
```

## Activity

- 2026-11-18T22:47:38Z · created · t@t
- 2026-11-18T22:47:41Z · status inbox→ready
- 2026-11-18T22:47:43Z · status ready→active, branch
- 2026-11-18T22:53:35Z · body
- 2026-11-18T22:55:53Z · body
- 2026-11-18T23:00:14Z · CTO nudge: held — handoff gate is running
- 2026-11-18T23:00:18Z · note: ui verification failed: ui verification failed (2 issue(s)): [missing-target] Login fields with accessible names and announced errors (target "default"): highlight .login-card matched nothing on /login (http://127.0.0.1:34587/); [route] Login fields with accessible names and announced errors: declared route /login but the browser landed on / (login or redirect?) (captured http://127.0.0.1:34587/) (http://127.0.0.1:34587/)
- 2026-11-18T23:00:18Z · message_queued at 2026-11-18T23:00:18.440Z
