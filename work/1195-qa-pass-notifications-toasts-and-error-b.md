---
id: "1195"
title: "QA pass: notifications, toasts and error banners across the app"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-notifications-toasts-and-error-b
created_at: "2026-11-18T18:47:48Z"
updated_at: "2026-11-18T19:11:44Z"
---
## Problem
Notifications and error banners are generated from many places and may be inconsistent or stale.
## Desired UX
Notifications, toasts, banners and their dismissals are clear, accessible and never stuck.
## Acceptance criteria
- Drive the auth-less dev server (just serve-noauth from a scratch worktree) with headless Playwright only; never open a visible browser or the user's Chrome. Fix bugs with tests.
- Commit docs/qa/2026-11-notifications-banners.md.
## Notes for AI
Do not touch repoos.toml. Never open a visible browser window.

## Activity

- 2026-11-18T18:47:48Z · created · t@t
- 2026-11-18T18:47:51Z · status inbox→ready
- 2026-11-18T18:47:53Z · status ready→active, branch
- 2026-11-18T18:52:42Z · body
- 2026-11-18T18:55:34Z · body
- 2026-11-18T18:59:14Z · CTO nudge: held — handoff gate is running
- 2026-11-18T19:11:44Z · note: ui verification passed: 1 shot captured with clean console
