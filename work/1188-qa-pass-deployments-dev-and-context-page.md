---
id: "1188"
title: "QA pass: Deployments, Dev and Context pages – every state and action"
type: bug
status: review
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-deployments-dev-and-context-page
created_at: "2026-11-18T15:47:34Z"
updated_at: "2026-11-18T15:54:05Z"
---
## Problem
Deployments, Dev and Context pages have not had a recent hands-on QA pass.
## Desired UX
Each page loads with real and empty data, controls work, no console errors, at 1280 and 375 widths.
## Acceptance criteria
- Drive the auth-less dev server (just serve-noauth from a scratch worktree) headlessly only (headless Playwright, never open a visible browser or the user's Chrome); fix bugs with tests.
- Commit docs/qa/2026-11-deployments-dev-context.md.
## Notes for AI
Do not touch repoos.toml. Never open a visible browser window.

## Activity

- 2026-11-18T15:47:34Z · created · t@t
- 2026-11-18T15:47:42Z · status inbox→ready
- 2026-11-18T15:47:46Z · status ready→active, branch
- 2026-11-18T15:54:05Z · status active→review
