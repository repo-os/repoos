---
id: "1207"
title: "QA pass: Deployments page and deploy flows with fixtures – states, errors, 375px"
type: bug
status: ready
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-18T22:47:30Z"
updated_at: "2026-11-18T22:47:33Z"
---
## Problem
Deployments has not been exercised since recent changes to environments and secrets.
## Desired UX
Deployment lists, status, logs and failure states are clear at 1280 and 375px.
## Acceptance criteria
- Headless Playwright only against the auth-less dev server (just serve-noauth from a scratch worktree); never open a visible browser or the user's Chrome. Fix bugs with tests.
- Commit docs/qa/2026-11-deployments-flows.md.
## Notes for AI
Do not touch repoos.toml. Never open a visible browser window.

## Activity

- 2026-11-18T22:47:30Z · created · t@t
- 2026-11-18T22:47:33Z · status inbox→ready
