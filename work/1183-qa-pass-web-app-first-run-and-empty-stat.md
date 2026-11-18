---
id: "1183"
title: "QA pass: web app first-run and empty states – new project, no tasks, no agents, offline server"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-web-app-first-run-and-empty-stat
created_at: "2026-11-18T10:17:38Z"
updated_at: "2026-11-18T10:34:51Z"
---
## Problem
First-run, empty and error states are rarely exercised and likely have rough edges.
## Desired UX
Empty board, no agents configured, server offline and failed-load states show clear guidance, at 1280 and 375 widths, with no console errors.
## Acceptance criteria
- Drive the auth-less dev server (just serve-noauth from a scratch worktree) and fixtures for these states; fix bugs with tests.
- Commit docs/qa/2026-11-empty-states.md.
## Notes for AI
Do not touch repoos.toml.

## Shots
```json
[
{
"label": "Empty work board guidance",
"target": "default",
"route": "/work",
"highlight": "[data-testid=\"work-empty-state\"]",
"state": "work:empty"
},
{
"label": "Work board failed-load recovery",
"target": "default",
"route": "/work",
"highlight": "[data-testid=\"work-load-error\"]",
"state": "work:failedLoad"
}
]
```

## Activity

- 2026-11-18T10:17:38Z · created · t@t
- 2026-11-18T10:17:41Z · status inbox→ready
- 2026-11-18T10:17:43Z · status ready→active, branch
- 2026-11-18T10:24:33Z · body
- 2026-11-18T10:34:51Z · message_queued at 2026-11-18T10:34:51.349Z
- 2026-11-18T10:34:51Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
