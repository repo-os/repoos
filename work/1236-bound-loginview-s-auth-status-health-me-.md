---
id: "1236"
title: "Easter eggs bundle: bound LoginView auth fetches (slow-server login spinner)"
type: bug
status: active
paths: [src/ui-app/src/views/LoginView.vue]
priority: p3
area: web
depends_on: ["1226"]
assigned_to: ai
created_by: t@t
branch: feat/easter-eggs-bundle-bound-loginview-auth-
created_at: "2026-11-19T16:18:14Z"
updated_at: "2026-11-19T17:22:30Z"
---
## Problem
QA pass #1226 bounded the boot-gating fetches in the web app, but `LoginView.checkStatus` still issues its own unbounded `fetch("/api/auth/status")` and `/api/auth/me` with no `AbortSignal` — a stalled connection leaves the login page's spinner up until the browser's default timeout, the same unbounded-fetch class the pass fixed elsewhere.

## Desired UX
When the server is slow or unreachable, the login page shows a plain-English status (never an endless spinner), recovers on its own, and stays usable at 375, 768 and 1280 px.

## Acceptance criteria
- `checkStatus` fetches are bounded with the same pattern as the boot path (timeout + plain-English failure state).
- Headless Playwright only, against fixtures and request interception; never a visible browser or stolen focus.
- Fix verified with tests under slow/500/offline responses.

## Notes for AI
- The #1226 QA doc (`docs/qa/2026-11-offline-slow-network-qa.md`) explicitly declared login screens out of scope; review passes 1 and 2 both recommended this follow-up.
- Do not touch repoos.toml.

## Shots
```json
[
{
"label": "Login page with bounded auth fetches — sign-in form renders normally",
"target": "default",
"route": "/login",
"highlight": ".login-form",
"state": "auth:login"
}
]
```

## Activity

- 2026-11-19T16:18:14Z · created · t@t
- 2026-11-19T16:18:15Z · needs_input
- 2026-11-19T16:18:24Z · body: Problem (added); Desired UX (added); Acceptance criteria (added); Notes for AI (added)
- 2026-11-19T16:18:24Z · needs_input
- 2026-11-19T16:24:11Z · title
- 2026-11-19T16:47:31Z · status inbox→ready
- 2026-11-19T16:47:33Z · status ready→active, branch
- 2026-11-19T16:47:33Z · note: agent fallback: codex + gpt-6-luna is paused (out of usage since 2026-11-19T07:09:32.657Z: Codex hit a provider quota or rate limit. Wait for the provider limit to reset, then retry. (CLI: error: You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purcha) — using opencode + opencode-go/glm-5.3-flash
- 2026-11-19T16:59:35Z · message_queued at 2026-11-19T16:59:35.826Z
- 2026-11-19T16:59:35Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-19T17:03:58Z · queued message undelivered for 4m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-19T17:03:59Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: That timed out. Let me run just that file directly with the UI app's config: · stderr: (empty)
- 2026-11-19T17:03:59Z · message_delivered: 1 message(s)
- 2026-11-19T17:04:35Z · message_queued at 2026-11-19T17:04:35.624Z
- 2026-11-19T17:04:35Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-19T17:07:43Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-19T17:07:44Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: That timed out. Let me run just that file directly with the UI app's config: · stderr: (empty)
- 2026-11-19T17:07:44Z · message_delivered: 1 message(s)
- 2026-11-19T17:09:35Z · message_queued at 2026-11-19T17:09:35.686Z
- 2026-11-19T17:09:35Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-19T17:10:50Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-19T17:12:32Z · body
- 2026-11-19T17:14:13Z · queued message undelivered for 5m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-19T17:14:14Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: All 12 pass, including my 3 new login scenarios. Now the scoped check: · stderr: (empty)
- 2026-11-19T17:14:14Z · message_delivered: 1 message(s)
- 2026-11-19T17:14:32Z · message_queued at 2026-11-19T17:14:32.478Z
- 2026-11-19T17:14:32Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-19T17:14:35Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-19T17:15:40Z · body
- 2026-11-19T17:16:31Z · body
- 2026-11-19T17:19:22Z · note: ui verification passed: 1 of 1 shot captured with clean console
- 2026-11-19T17:19:22Z · message_queued at 2026-11-19T17:19:22.703Z
- 2026-11-19T17:22:29Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-19T17:22:30Z · message_delivered: 1 message(s)
