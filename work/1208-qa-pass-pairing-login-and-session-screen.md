---
id: "1208"
title: "QA pass: pairing, login and session screens – OTP, expired sessions, sign-out, mobile widths"
type: bug
status: review
priority: p2
area: [web, server]
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-pairing-login-and-session-screen
created_at: "2026-11-18T22:47:38Z"
updated_at: "2026-11-18T23:46:40Z"
check_retry_count: 1
last_check_failure: "repoos check at 2026-11-18T23:35:18.223Z: repoos check failed: reused check inputs changed during handoff — run the check again"
review_rounds: 1
routing_switches: 1
review_passes: 1
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
"label": "Login screen at 375px",
"target": "default",
"route": "/login",
"highlight": ".login-card",
"state": "auth:login",
"viewportWidth": 375,
"viewportHeight": 844
},
{
"label": "One-time code screen at 375px",
"target": "default",
"route": "/login",
"highlight": ".login-card",
"state": "auth:otp",
"viewportWidth": 375,
"viewportHeight": 844
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
- 2026-11-18T23:00:21Z · message_delivered: 1 message(s)
- 2026-11-18T23:00:46Z · body
- 2026-11-18T23:03:12Z · body
- 2026-11-18T23:05:53Z · note: ui verification passed: 1 shot captured with clean console
- 2026-11-18T23:05:54Z · status active→review
- 2026-11-18T23:05:54Z · message_queued at 2026-11-18T23:05:54.198Z
- 2026-11-18T23:06:22Z · note: review pass 1: needs some work
- 2026-11-18T23:06:22Z · message_delivered: 1 message(s)
- 2026-11-18T23:06:23Z · status review→active
- 2026-11-18T23:06:25Z · CTO nudge: held — remote validation is running
- 2026-11-18T23:09:30Z · body
- 2026-11-18T23:17:39Z · message_queued at 2026-11-18T23:17:39.447Z
- 2026-11-18T23:17:39Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-18T23:17:43Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-18T23:20:46Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-18T23:20:46Z · message_delivered: 1 message(s)
- 2026-11-18T23:33:35Z · body
- 2026-11-18T23:34:31Z · status active→review
- 2026-11-18T23:35:15Z · message_queued at 2026-11-18T23:35:15.054Z
- 2026-11-18T23:35:15Z · note: shots: failed — browser capture cancelled
- 2026-11-18T23:35:15Z · note: review pass 2: good to go
- 2026-11-18T23:35:18Z · message_delivered: 1 message(s)
- 2026-11-18T23:46:00Z · body
- 2026-11-18T23:46:40Z · message_queued at 2026-11-18T23:46:40.283Z
