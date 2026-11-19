---
id: "1210"
title: "QA pass: system resource panel, pressure guard banners and Control stats under high load fixtures"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-system-resource-panel-pressure-g
created_at: "2026-11-18T23:47:41Z"
updated_at: "2026-11-19T01:13:11Z"
handoff_signal_retry_count: 1
review_rounds: 1
routing_switches: 1
review_passes: 1
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

## Shots
```json
[
{
"label": "Normal pressure at 1280px",
"target": "default",
"route": "/",
"selector": ".resource-panel",
"state": "system:pressureNormal",
"viewportWidth": 1280,
"viewportHeight": 900
},
{
"label": "Warning pressure at 1280px",
"target": "default",
"route": "/",
"selector": ".resource-panel",
"state": "system:pressureWarning",
"viewportWidth": 1280,
"viewportHeight": 900
},
{
"label": "Critical pressure at 1280px",
"target": "default",
"route": "/",
"selector": ".resource-panel",
"state": "system:pressureCritical",
"viewportWidth": 1280,
"viewportHeight": 900
},
{
"label": "Normal pressure panel at 375px",
"target": "default",
"route": "/",
"selector": ".resource-panel",
"state": "system:pressureNormal",
"viewportWidth": 375,
"viewportHeight": 900
},
{
"label": "Warning pressure panel at 375px",
"target": "default",
"route": "/",
"selector": ".resource-panel",
"state": "system:pressureWarning",
"viewportWidth": 375,
"viewportHeight": 900
},
{
"label": "Critical pressure panel at 375px",
"target": "default",
"route": "/",
"selector": ".resource-panel",
"state": "system:pressureCritical",
"viewportWidth": 375,
"viewportHeight": 900
}
]
```

## Activity

- 2026-11-18T23:47:41Z · created · t@t
- 2026-11-18T23:47:47Z · status inbox→ready
- 2026-11-18T23:47:51Z · status ready→active, branch
- 2026-11-19T00:22:45Z · body
- 2026-11-19T00:28:59Z · note: adopted orphaned engineer pid 66279
- 2026-11-19T00:34:19Z · body
- 2026-11-19T00:38:58Z · CTO nudge: held — handoff gate is running
- 2026-11-19T00:49:07Z · note: ui verification passed: 1 shot captured with clean console
- 2026-11-19T00:49:08Z · status active→review
- 2026-11-19T00:49:09Z · message_queued at 2026-11-19T00:49:09.071Z
- 2026-11-19T00:49:49Z · note: review pass 1: needs some work
- 2026-11-19T00:49:50Z · status review→active
- 2026-11-19T00:49:52Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-19T00:55:03Z · message_queued at 2026-11-19T00:55:03.497Z
- 2026-11-19T00:56:07Z · message_delivered: 1 message(s)
- 2026-11-19T00:59:11Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The review found no code defects. It requires declared captures for normal, warning, and critical pressure at both 1280×900 and 375×900, with the mobile panel scrolled into view. I haven’t changed the source or re-handed off. `repoos updat… · stderr: 2026-11-19T00:58:28.070617Z ERROR codex_core::tools::router: error=failed to parse function arguments: unknown field `question`, expected `title` or `options` at line 1 column 137 2026-11-19T00:58:30.966130Z ERROR codex_core::tools::router: error=failed to parse function arguments: duplicate field `title` at line 1 co…
- 2026-11-19T00:59:24Z · message_delivered: 1 message(s)
- 2026-11-19T00:59:46Z · body
- 2026-11-19T01:12:01Z · body
- 2026-11-19T01:13:11Z · CTO nudge: held — handoff gate is running
