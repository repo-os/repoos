---
id: "1238"
title: "QA pass: Deployments and Context pages with failures and long data at all screen sizes"
type: bug
status: review
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-deployments-and-context-pages-wi
cli_override: claude code
model_override: haiku
created_at: "2026-11-19T18:26:58Z"
updated_at: "2026-11-19T19:50:43Z"
engineer_stall_resume_log: "[{\"at\":\"2026-11-19T19:26:11.959Z\",\"reason\":\"handoff-deferred\"}]"
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
- 2026-11-19T19:26:11Z · handoff failed · remote validation failed: test failure: tests/checks-releases-data-responsive.test.ts > Checks and Releases long data (WebKit) > renders real page components with long data at 375 px on thinkpad — fix it in the feature branch and re-run the gate
- 2026-11-19T19:26:11Z · message_queued at 2026-11-19T19:26:11.677Z
- 2026-11-19T19:26:11Z · handoff failed · handoff recovery attempted · finalization failed
- 2026-11-19T19:26:11Z · watchdog: auto-resumed engineer to read a deferred handoff message · resume 1/3
- 2026-11-19T19:26:13Z · message_delivered: 1 message(s)
- 2026-11-19T19:31:33Z · body
- 2026-11-19T19:36:34Z · body
- 2026-11-19T19:39:09Z · CTO nudge: held — handoff gate is running
- 2026-11-19T19:40:34Z · note: ui verification passed: 1 of 1 shot captured with clean console
- 2026-11-19T19:40:35Z · message_queued at 2026-11-19T19:40:35.414Z
- 2026-11-19T19:41:22Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-19T19:43:42Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-19T19:43:43Z · message_delivered: 1 message(s)
- 2026-11-19T19:47:14Z · body
- 2026-11-19T19:49:09Z · CTO nudge: held — handoff gate is running
- 2026-11-19T19:50:42Z · note: ui verification passed: 1 of 1 shot captured with clean console
- 2026-11-19T19:50:43Z · status active→review
