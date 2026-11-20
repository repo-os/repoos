---
id: "1273"
title: "QA pass: login, lock screen and session expiry flows"
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-login-lock-screen-and-session-ex
cli_override: claude code
model_override: haiku
created_at: "2026-11-20T07:06:52Z"
updated_at: "2026-11-20T08:27:32Z"
---
## Problem
Sweep sign-in, lock screen and session-expiry flows (code entry, errors, expired session, offline) for layout, wording and state bugs.

## Desired UX
Flows look and behave correctly at 375, 768 and 1280 widths: no overflow, clear labels, sensible error and loading states, visible keyboard focus.

## Acceptance criteria
- Walked headlessly (Playwright only, never a visible browser) at the three widths using dev login fixtures.
- Every issue found is fixed, covering the whole class of the problem.
- Scoped check passes once, then hand off.

## Notes for AI
Keep changes small. Never touch repoos.toml. Never open a visible browser. Never print or store real credentials.

## Shots
```json
[
{
"label": "Code step: 44px resend and change-email links, Verify spinner area",
"target": "default",
"route": "/login",
"highlight": ".login-actions",
"state": "auth:otp"
},
{
"label": "Email step: keyboard focus ring on the email input",
"target": "default",
"route": "/login",
"highlight": ".login-input",
"state": "auth:login"
}
]
```

## Activity

- 2026-11-20T07:06:52Z · created · t@t
- 2026-11-20T07:06:57Z · status inbox→ready
- 2026-11-20T07:06:58Z · cli_override, model_override
- 2026-11-20T07:06:59Z · status ready→active, branch
- 2026-11-20T07:40:42Z · message_queued at 2026-11-20T07:40:42.254Z
- 2026-11-20T07:40:42Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-20T07:41:46Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-20T07:43:48Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-20T07:43:48Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 143) · last assistant: The scoped check is still running in the background, and the Monitor will notify me when it exits. Once it does, I'll confirm the result, declare the UI shots, and hand off. · stderr: (empty)
- 2026-11-20T07:43:49Z · message_delivered: 1 message(s)
- 2026-11-20T07:46:52Z · message_queued at 2026-11-20T07:46:52.718Z
- 2026-11-20T07:46:52Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-20T07:46:56Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-20T07:50:03Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-20T07:50:03Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 143) · last assistant: The scoped check is running again from the start, and the Monitor will report when it exits. Once it passes I'll declare the UI shots and hand off. · stderr: (empty)
- 2026-11-20T07:50:04Z · message_delivered: 1 message(s)
- 2026-11-20T07:52:31Z · message_queued at 2026-11-20T07:52:31.506Z
- 2026-11-20T07:52:31Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-20T07:57:31Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-20T08:26:21Z · body
- 2026-11-20T08:26:31Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: I'm not handing off. The scoped `repoos check` fails at the `ui-smoke` step, so the task stays `active` and I have not emitted the handoff signal. **Blocker:** the UI smoke test fails on three console errors, none of them from this diff. T… · stderr: (empty)
- 2026-11-20T08:27:28Z · message_delivered: 1 message(s)
- 2026-11-20T08:27:32Z · message_queued at 2026-11-20T08:27:32.250Z
