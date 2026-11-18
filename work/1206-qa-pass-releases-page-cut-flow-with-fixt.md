---
id: "1206"
title: "QA pass: Releases page cut flow with fixtures – notes chooser, blockers, in-progress and failed states at 375px"
type: bug
status: ready
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-18T22:17:29Z"
updated_at: "2026-11-18T22:17:32Z"
---
## Problem
The Releases cut flow is the most consequential screen and changed a lot (AI notes, publish modes); phone width and failure states need another pass.
## Desired UX
Chooser, blockers, running, failed and done states are clear and usable at 1280 and 375px.
## Acceptance criteria
- Headless Playwright only against the auth-less dev server (just serve-noauth from a scratch worktree) with intercepted release APIs; NEVER publish a real release. Fix bugs with tests.
- Commit docs/qa/2026-11-releases-cut-flow.md.
## Notes for AI
Do not touch repoos.toml. Never open a visible browser window.

## Activity

- 2026-11-18T22:17:29Z · created · t@t
- 2026-11-18T22:17:32Z · status inbox→ready
