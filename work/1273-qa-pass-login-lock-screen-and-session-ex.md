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
updated_at: "2026-11-20T07:43:48Z"
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
