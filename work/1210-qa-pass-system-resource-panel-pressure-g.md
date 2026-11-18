---
id: "1210"
title: "QA pass: system resource panel, pressure guard banners and Control stats under high load fixtures"
type: bug
status: ready
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-18T23:47:41Z"
updated_at: "2026-11-18T23:47:47Z"
---
## Problem
Resource and pressure displays (warning, critical, swap/compressor numbers) need a hands-on pass in all states.
## Desired UX
Normal, warning and critical pressure states are clearly explained and readable at 1280 and 375px.
## Acceptance criteria
- Headless Playwright only against the auth-less dev server with fixtures (just serve-noauth from a scratch worktree); never open a visible browser. Fix bugs with tests.
- Commit docs/qa/2026-11-pressure-states.md.
## Notes for AI
Do not touch repoos.toml. Never open a visible browser window.

## Activity

- 2026-11-18T23:47:41Z · created · t@t
- 2026-11-18T23:47:47Z · status inbox→ready
