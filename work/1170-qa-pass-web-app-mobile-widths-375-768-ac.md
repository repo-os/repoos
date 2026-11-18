---
id: "1170"
title: "QA pass: web app mobile widths (375/768) across Work, Releases, Settings, Agents, Checks"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-web-app-mobile-widths-375-768-ac
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-18T02:19:49Z"
updated_at: "2026-11-18T05:09:41Z"
review_passes: 4
review_rounds: 2
---
## Problem
Mobile-width layout regressions are likely after recent UI changes.
## Desired UX
No horizontal scroll, clipped buttons, unreachable controls or overlapping drawers at 375px and 768px.
## Acceptance criteria
- Drive the auth-less dev server (just serve-noauth from a worktree) at 375 and 768 widths on the main pages.
- Fix issues found with tests; skip what #1157 already fixed.
- Commit docs/qa/2026-11-web-mobile-widths.md with findings.
## Notes for AI
Do not touch repoos.toml. Pages use full .main width.

## Shots
```json
[
{
  "label": "Work layout at 375px",
  "target": "default",
  "route": "/work",
  "highlight": ".work-page",
  "viewportWidth": 375,
  "viewportHeight": 844
},
{
  "label": "Work parked controls at 768px",
  "target": "default",
  "route": "/work",
  "highlight": ".parked-lists",
  "viewportWidth": 768,
  "viewportHeight": 844
},
{
  "label": "Settings layout at 375px",
  "target": "default",
  "route": "/settings",
  "highlight": ".settings-tabs",
  "viewportWidth": 375,
  "viewportHeight": 844
},
{
  "label": "Settings tab strip at 768px",
  "target": "default",
  "route": "/settings",
  "highlight": ".settings-tabs",
  "viewportWidth": 768,
  "viewportHeight": 844
}
]
```

## Activity

- 2026-11-18T02:19:49Z · created · t@t
- 2026-11-18T02:20:25Z · status inbox→ready
- 2026-11-18T02:20:30Z · cli_override, model_override
- 2026-11-18T02:20:33Z · status ready→active, branch
- 2026-11-18T02:41:04Z · body
- 2026-11-18T02:43:31Z · CTO nudge: held — handoff gate is running
- 2026-11-18T02:50:46Z · note: ui verification passed: 1 shot captured with clean console
- 2026-11-18T02:50:49Z · status active→review
- 2026-11-18T02:50:49Z · message_queued at 2026-11-18T02:50:49.631Z
- 2026-11-18T02:58:21Z · note: review pass 1: needs some work
- 2026-11-18T02:58:21Z · status review→active
- 2026-11-18T02:58:25Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-18T03:00:31Z · message_delivered: 1 message(s)
- 2026-11-18T03:04:30Z · body
- 2026-11-18T03:08:10Z · note: ui verification passed: 1 shot captured with clean console
- 2026-11-18T03:08:12Z · status active→review
- 2026-11-18T03:08:13Z · message_queued at 2026-11-18T03:08:13.041Z
- 2026-11-18T03:14:13Z · note: review pass 2: needs some work
- 2026-11-18T03:14:14Z · message_delivered: 1 message(s)
- 2026-11-18T03:14:14Z · status review→active
- 2026-11-18T03:17:43Z · body
- 2026-11-18T03:19:18Z · CTO nudge: held — handoff gate is running
- 2026-11-18T03:21:05Z · note: ui verification passed: 1 shot captured with clean console
- 2026-11-18T03:21:06Z · message_queued at 2026-11-18T03:21:06.105Z
- 2026-11-18T03:23:44Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-18T03:24:15Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-18T03:24:16Z · message_delivered: 1 message(s)
- 2026-11-18T03:27:43Z · body
- 2026-11-18T03:29:17Z · status active→review
- 2026-11-18T03:40:32Z · cli_override, model_override
- 2026-11-18T03:40:52Z · status review→active
- 2026-11-18T03:40:54Z · CTO nudge: held — handoff gate is running
- 2026-11-18T03:40:55Z · message_queued at 2026-11-18T03:40:55.165Z
- 2026-11-18T03:41:20Z · note: ui verification passed: 1 shot captured with clean console (1 shot warning)
- 2026-11-18T03:41:21Z · note: review pass 3: needs some work
- 2026-11-18T03:41:21Z · needs_input
- 2026-11-18T03:41:22Z · status active→review
- 2026-11-18T03:41:23Z · message_queued at 2026-11-18T03:41:23.054Z
- 2026-11-18T04:16:13Z · needs_input (review-rounds-exhausted) cleared for review again by hello@repoos.org
- 2026-11-18T04:17:23Z · note: review pass 4: needs some work
- 2026-11-18T04:21:12Z · note: ui verification passed: 1 shot captured with clean console
- 2026-11-18T04:41:04Z · message_overdue: still queued after 60m without being delivered
- 2026-11-18T05:09:02Z · status review→active
- 2026-11-18T05:09:04Z · message_delivered: 2 message(s)
- 2026-11-18T05:09:41Z · body
