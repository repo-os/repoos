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
updated_at: "2026-11-19T02:48:39Z"
handoff_signal_retry_count: 2
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
"highlight": ".resource-panel",
"state": "system:pressureNormal",
"viewportWidth": 1280,
"viewportHeight": 900
},
{
"label": "Warning pressure at 1280px",
"target": "default",
"route": "/",
"selector": ".resource-panel",
"highlight": ".resource-panel",
"state": "system:pressureWarning",
"viewportWidth": 1280,
"viewportHeight": 900
},
{
"label": "Critical pressure at 1280px",
"target": "default",
"route": "/",
"selector": ".resource-panel",
"highlight": ".resource-panel",
"state": "system:pressureCritical",
"viewportWidth": 1280,
"viewportHeight": 900
},
{
"label": "Normal pressure panel at 375px",
"target": "default",
"route": "/",
"selector": ".resource-panel",
"highlight": ".resource-panel",
"state": "system:pressureNormal",
"viewportWidth": 375,
"viewportHeight": 900
},
{
"label": "Warning pressure panel at 375px",
"target": "default",
"route": "/",
"selector": ".resource-panel",
"highlight": ".resource-panel",
"state": "system:pressureWarning",
"viewportWidth": 375,
"viewportHeight": 900
},
{
"label": "Critical pressure panel at 375px",
"target": "default",
"route": "/",
"selector": ".resource-panel",
"highlight": ".resource-panel",
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
- 2026-11-19T01:15:19Z · note: ui verification passed: 6 of 6 shots captured with clean console
- 2026-11-19T01:15:19Z · message_queued at 2026-11-19T01:15:19.319Z
- 2026-11-19T01:18:31Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-19T01:18:45Z · message_delivered: 1 message(s)
- 2026-11-19T01:19:31Z · body
- 2026-11-19T01:26:14Z · note: adopted orphaned engineer pid 94919
- 2026-11-19T01:32:45Z · body
- 2026-11-19T01:32:59Z · status active→review
- 2026-11-19T01:45:04Z · note: ui verification passed: 6 of 6 shots captured with clean console
- 2026-11-19T01:45:07Z · note: review pass 2: good to go
- 2026-11-19T01:45:09Z · message_queued at 2026-11-19T01:45:09.191Z
- 2026-11-19T01:47:37Z · status review→active
- 2026-11-19T01:47:39Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-19T01:47:40Z · message_delivered: 1 message(s)
- 2026-11-19T01:58:20Z · message_queued at 2026-11-19T01:58:20.824Z
- 2026-11-19T02:01:12Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-19T02:01:33Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-19T02:01:34Z · message_delivered: 1 message(s)
- 2026-11-19T02:29:46Z · CTO nudge: held — machine under pressure (CPU idle is 0% (below 5%) — holding new work until the machine has idle CPU; system load is high (3.5× per CPU, limit 3×) — waiting for headroom before starting more work)
- 2026-11-19T02:38:47Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: I couldn’t safely request handoff: the latest `REPOOS_CHECK_CHANGED=main repoos check` **failed at the tests step**. Static checks, build, contrast, and UI smoke passed. The failing test cases occurred during the high-load run; the debugge… · stderr: Reading additional input from stdin...
- 2026-11-19T02:45:30Z · message_queued at 2026-11-19T02:45:30.413Z
- 2026-11-19T02:46:12Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-19T02:48:39Z · watchdog: restarting engineer because a queued message waited 3m with no live process
