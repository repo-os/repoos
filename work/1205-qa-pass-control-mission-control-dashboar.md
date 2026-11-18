---
id: "1205"
title: "QA pass: Control (Mission Control) dashboard – every card, chart and empty state at desktop and 375px"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-control-mission-control-dashboar
created_at: "2026-11-18T21:47:29Z"
updated_at: "2026-11-18T21:57:35Z"
---
## Problem
The Control dashboard shows usage, costs and activity and has not had a recent pass.
## Desired UX
All cards and charts render with real, empty and error data and stay readable at 1280 and 375px.
## Acceptance criteria
- Headless Playwright only against the auth-less dev server (just serve-noauth from a scratch worktree); never open a visible browser or the user's Chrome. Fix bugs with tests.
- Commit docs/qa/2026-11-control-dashboard.md.
## Notes for AI
Do not touch repoos.toml. Never open a visible browser window.

## Shots
```json
[
{
"label": "Mission Control resource panel and process table",
"target": "default",
"route": "/",
"highlight": ".resource-panel"
}
]
```

## Activity

- 2026-11-18T21:47:29Z · created · t@t
- 2026-11-18T21:47:32Z · status inbox→ready
- 2026-11-18T21:47:34Z · status ready→active, branch
- 2026-11-18T21:53:46Z · body
- 2026-11-18T21:57:35Z · body
