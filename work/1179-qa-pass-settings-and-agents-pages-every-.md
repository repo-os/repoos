---
id: "1179"
title: "QA pass: Settings and Agents pages – every control saves, validates and survives reload"
type: bug
status: active
priority: p2
area: [web, server]
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-settings-and-agents-pages-every-
created_at: "2026-11-18T06:47:46Z"
updated_at: "2026-11-18T08:37:21Z"
review_rounds: 2
routing_switches: 1
routing_escalations: 1
review_passes: 2
handoff_signal_retry_count: 2
---
## Problem
Settings and Agents pages have many controls added over time; some may not save or validate.
## Desired UX
Each Settings tab control saves, shows validation errors clearly, and persists after reload; the Agents page shows accurate state.
## Acceptance criteria
- Drive the auth-less dev server (just serve-noauth from a worktree, never against the real repo config) through every Settings tab and the Agents page.
- Fix bugs found with tests; commit docs/qa/2026-11-settings-agents.md.
## Notes for AI
Do not touch repoos.toml.

## Shots
```json
[
{
"label": "Spend threshold validation error",
"target": "default",
"route": "/settings?tab=notifications",
"highlight": "#spend-alert-error",
"steps": [
{
"fill": "#setting-attention\\.spendAlertUsd input",
"text": "-1"
},
{
"waitFor": "#spend-alert-error"
}
]
}
]
```

## Activity

- 2026-11-18T06:47:46Z · created · t@t
- 2026-11-18T06:48:02Z · status inbox→ready
- 2026-11-18T06:48:09Z · status ready→active, branch
- 2026-11-18T07:39:03Z · body
- 2026-11-18T07:43:21Z · CTO nudge: held — handoff gate is running
- 2026-11-18T07:43:45Z · status active→review
- 2026-11-18T07:43:46Z · message_queued at 2026-11-18T07:43:46.038Z
- 2026-11-18T07:43:46Z · note: shots: skipped — the diff (3 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-18T07:44:11Z · note: review pass 1: needs some work
- 2026-11-18T07:44:12Z · message_delivered: 1 message(s)
- 2026-11-18T07:44:12Z · status review→active
- 2026-11-18T08:02:14Z · body
- 2026-11-18T08:05:02Z · body
- 2026-11-18T08:09:44Z · body
- 2026-11-18T08:13:22Z · CTO nudge: held — handoff gate is running
- 2026-11-18T08:22:04Z · note: ui verification passed: 1 shot captured with clean console
- 2026-11-18T08:22:05Z · status active→review
- 2026-11-18T08:22:05Z · message_queued at 2026-11-18T08:22:05.873Z
- 2026-11-18T08:22:44Z · note: review pass 2: needs some work
- 2026-11-18T08:22:44Z · message_delivered: 1 message(s)
- 2026-11-18T08:22:44Z · status review→active
- 2026-11-18T08:22:47Z · CTO nudge: held — remote validation is running
- 2026-11-18T08:23:22Z · note: Review round 2 requested a Notifications validation screenshot; resuming to add targeted capture evidence and recheck.
- 2026-11-18T08:23:52Z · body
- 2026-11-18T08:26:56Z · body
- 2026-11-18T08:28:22Z · CTO nudge: held — handoff gate is running
- 2026-11-18T08:29:50Z · note: ui verification passed: 1 of 1 shot captured with clean console
- 2026-11-18T08:29:50Z · message_queued at 2026-11-18T08:29:50.482Z
- 2026-11-18T08:32:56Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-18T08:32:57Z · message_delivered: 1 message(s)
- 2026-11-18T08:37:21Z · body
