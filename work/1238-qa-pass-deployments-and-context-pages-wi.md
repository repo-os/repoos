---
id: "1238"
title: "QA pass: Deployments and Context pages with failures and long data at all screen sizes"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-deployments-and-context-pages-wi
cli_override: claude code
model_override: haiku
created_at: "2026-11-19T18:26:58Z"
updated_at: "2026-11-19T19:06:13Z"
---
## Problem
The Deployments and Context pages have not been checked with failed deployments, long logs and missing data at phone, tablet and desktop widths.
## Desired UX
Failures explain what happened in plain English with a next step, long content stays inside its own box, and nothing overflows at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only against fixtures; never open a visible browser or steal focus.
- Use fixtures for failed, empty and very long cases; fix issues with tests.
- Commit docs/qa/2026-11-deployments-context-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Shots
```json
[
{
"label": "Refused push: plain-English next step above the git output in a scrolling box",
"target": "default",
"route": "/deployments",
"highlight": ".dep-modal-error",
"state": "deployments:deployFailure"
}
]
```

## Activity

- 2026-11-19T18:26:58Z · created · t@t
- 2026-11-19T18:27:03Z · status inbox→ready
- 2026-11-19T18:27:04Z · cli_override, model_override
- 2026-11-19T18:27:06Z · status ready→active, branch
- 2026-11-19T18:47:28Z · body
- 2026-11-19T18:49:07Z · body
- 2026-11-19T18:51:13Z · CTO nudge: held — handoff gate is running
- 2026-11-19T19:03:04Z · CTO nudge: held — handoff gate is running
- 2026-11-19T19:06:13Z · CTO nudge: held — handoff gate is running
