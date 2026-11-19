---
updated_at: "2026-11-19T22:48:40Z"
review_passes: 4
id: "1243"
title: "QA pass: Agents page failure copy after the Jev routing switch and missing key"
type: bug
status: review
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-agents-page-failure-copy-after-t
cli_override: claude code
model_override: haiku
created_at: "2026-11-19T20:07:21Z"
review_rounds: 1
---
## Problem
After switching model routing to Jev, the Agents page routing tab and decisions list need a check for the missing-key and provider-failure wording and a recent-decisions list that is empty or all failures.
## Desired UX
A missing key or failing provider is explained in plain English with the next step; the decisions list shows an honest empty or failure state; keys stay masked.
## Acceptance criteria
- Headless Playwright only against fixtures; never open a visible browser; never use or print real keys.
- Fix issues with tests; commit docs/qa/2026-11-routing-failure-copy-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Shots
```json
[
{
"label": "Routing tab recent decisions list (failed-load notice is covered by WebKit fixture, not this board)",
"target": "default",
"route": "/agents?tab=model-routing",
"selector": ".mr-decisions",
"highlight": ".mr-decisions"
}
]
```

## Activity

- 2026-11-19T20:07:21Z · created · t@t
- 2026-11-19T20:07:25Z · status inbox→ready
- 2026-11-19T20:07:26Z · cli_override, model_override
- 2026-11-19T20:07:27Z · status ready→active, branch
- 2026-11-19T20:26:33Z · body
- 2026-11-19T20:27:28Z · body
- 2026-11-19T20:28:49Z · CTO nudge: held — handoff gate is running
- 2026-11-19T20:40:43Z · CTO nudge: held — handoff gate is running
- 2026-11-19T20:55:38Z · note: ui verification passed: 1 of 1 shot captured with clean console
- 2026-11-19T20:55:39Z · status active→review
- 2026-11-19T20:55:39Z · message_queued at 2026-11-19T20:55:39.266Z
- 2026-11-19T20:56:58Z · note: review pass 1: needs some work
- 2026-11-19T20:56:58Z · message_delivered: 1 message(s)
- 2026-11-19T20:56:59Z · status review→active
- 2026-11-19T20:57:01Z · CTO nudge: held — remote validation is running
- 2026-11-19T20:57:12Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (3991ce606) during finalization (#0734)
- 2026-11-19T21:05:43Z · message_queued at 2026-11-19T21:05:43.621Z
- 2026-11-19T21:05:43Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-19T21:07:02Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-19T21:07:20Z · body
- 2026-11-19T21:10:43Z · CTO nudge: held — handoff gate is running
- 2026-11-19T21:21:04Z · orphaned run process stopped · pid 54220 · /Applications/Xcode.app/Contents/Developer/usr/bin/git bundle create /var/folders/0r/4_d4rftj7t57174 · cpu 0s · age 10s
- 2026-11-19T21:25:58Z · CTO nudge: held — handoff gate is running
- 2026-11-19T21:41:07Z · note: ui verification passed: 1 of 1 shot captured with clean console
- 2026-11-19T21:41:08Z · status active→review
- 2026-11-19T21:41:08Z · message_queued at 2026-11-19T21:41:08.710Z
- 2026-11-19T21:42:00Z · note: review pass 2: good to go
- 2026-11-19T21:42:29Z · note: shots: skipped — 1 handoff shot already captured for this exact plan (b3940c000) during finalization (#0734)
- 2026-11-19T22:07:40Z · note: review pass 3: good to go
- 2026-11-19T22:47:45Z · message_overdue: still queued after 60m without being delivered
- 2026-11-19T22:48:40Z · note: review pass 4: good to go

