---
id: "1195"
title: "QA pass: notifications, toasts and error banners across the app"
type: bug
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-18T18:47:48Z"
updated_at: "2026-11-18T18:47:48Z"
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
