---
id: "1207"
title: "QA pass: Deployments page and deploy flows with fixtures – states, errors, 375px"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-deployments-page-and-deploy-flow
created_at: "2026-11-18T22:47:30Z"
updated_at: "2026-11-18T23:10:16Z"
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

## Shots
```json
[
{
"label": "Deployment with local environment binding",
"target": "default",
"route": "/deployments",
"highlight": ".dep-env-binding",
"state": "deployments:environmentBinding"
},
{
"label": "Refused deploy remains in confirmation",
"target": "default",
"route": "/deployments",
"highlight": "[role=\"alert\"]",
"state": "deployments:deployFailure"
}
]
```

## Activity

- 2026-11-18T22:47:30Z · created · t@t
- 2026-11-18T22:47:33Z · status inbox→ready
- 2026-11-18T22:47:35Z · status ready→active, branch
- 2026-11-18T22:53:48Z · body
- 2026-11-18T23:05:56Z · message_queued at 2026-11-18T23:05:56.428Z
- 2026-11-18T23:05:56Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-18T23:06:25Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-18T23:10:16Z · queued message undelivered for 4m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-18T23:10:16Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code unknown) · last assistant: The local scoped rerun has passed formatting, lint, and build and is progressing through the same test set. It has reached the reviewer integration tests without an early failure; I’ll report the final result once UI smoke and remaining st… · stderr: Reading additional input from stdin... 2026-11-18T22:51:30.065746Z ERROR codex_core::tools::router: error=write_stdin failed: Unknown process id 0
