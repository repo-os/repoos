---
id: "1204"
title: "QA pass: Inputs and Context pages – uploads, docs ingestion and empty states"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-inputs-and-context-pages-uploads
created_at: "2026-11-18T20:47:45Z"
updated_at: "2026-11-18T22:15:14Z"
review_rounds: 1
routing_switches: 1
routing_escalations: 1
last_check_failure: "repoos check at 2026-11-18T21:27:46.766Z: repoos check failed: reused check inputs changed during handoff — run the check again"
review_passes: 2
---
## Problem
Inputs and Context pages have not had a hands-on pass.
## Desired UX
Uploads, lists, previews and empty or error states work at 1280 and 375px.
## Acceptance criteria
- Headless Playwright only against the auth-less dev server (just serve-noauth from a scratch worktree); never open a visible browser or the user's Chrome. Fix bugs with tests.
- Commit docs/qa/2026-11-inputs-context.md.
## Notes for AI
Do not touch repoos.toml. Never open a visible browser window.

## Shots
```json
[
{
"label": "Inputs list at 1280px",
"target": "default",
"route": "/inputs",
"highlight": ".inputs-header",
"viewportWidth": 1280,
"viewportHeight": 900
},
{
"label": "Inputs list at 375px",
"target": "default",
"route": "/inputs",
"highlight": ".inputs-header",
"viewportWidth": 375,
"viewportHeight": 812
},
{
"label": "Context docs at 1280px",
"target": "default",
"route": "/repo",
"highlight": ".repo-grid",
"viewportWidth": 1280,
"viewportHeight": 900
},
{
"label": "Context docs at 375px",
"target": "default",
"route": "/repo",
"highlight": ".repo-grid",
"viewportWidth": 375,
"viewportHeight": 812
}
]
```

## Activity

- 2026-11-18T20:47:45Z · created · t@t
- 2026-11-18T20:47:48Z · status inbox→ready
- 2026-11-18T20:47:50Z · status ready→active, branch
- 2026-11-18T20:54:35Z · body
- 2026-11-18T20:58:51Z · body
- 2026-11-18T21:05:50Z · body
- 2026-11-18T21:06:51Z · CTO nudge: held — handoff gate is running
- 2026-11-18T21:09:25Z · note: ui verification passed: 2 of 2 shots captured with clean console
- 2026-11-18T21:09:27Z · status active→review
- 2026-11-18T21:09:27Z · message_queued at 2026-11-18T21:09:27.234Z
- 2026-11-18T21:10:07Z · note: review pass 1: needs some work
- 2026-11-18T21:13:17Z · note: ui verification passed: 2 of 2 shots captured with clean console
- 2026-11-18T21:17:31Z · status review→active
- 2026-11-18T21:17:33Z · message_delivered: 1 message(s)
- 2026-11-18T21:18:40Z · body
- 2026-11-18T21:26:23Z · body
- 2026-11-18T21:27:04Z · status active→review
- 2026-11-18T21:27:43Z · note: review pass 2: needs some work
- 2026-11-18T21:27:43Z · message_queued at 2026-11-18T21:27:43.663Z
- 2026-11-18T21:27:43Z · note: shots: failed — browser capture cancelled
- 2026-11-18T21:27:43Z · message_delivered: 1 message(s)
- 2026-11-18T21:27:44Z · status review→active
- 2026-11-18T21:27:46Z · message_queued at 2026-11-18T21:27:46.665Z
- 2026-11-18T21:29:22Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-18T21:29:51Z · note: adopted orphaned engineer pid 83274
- 2026-11-18T21:31:36Z · queued message undelivered for 4m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-18T21:31:36Z · status active→review
- 2026-11-18T21:31:36Z · phantom runner detected: no live process, restarted
- 2026-11-18T21:31:36Z · message_delivered: 1 message(s)
- 2026-11-18T21:31:37Z · note: handoff requested (cli)
- 2026-11-18T21:34:50Z · CTO nudge: held — handoff gate is running
- 2026-11-18T21:41:53Z · body
- 2026-11-18T21:53:41Z · note: ui verification passed: 4 of 4 shots captured with clean console
- 2026-11-18T21:53:42Z · status active→review
- 2026-11-18T22:00:16Z · status review→active
- 2026-11-18T22:11:43Z · body
- 2026-11-18T22:15:14Z · CTO nudge: held — handoff gate is running
