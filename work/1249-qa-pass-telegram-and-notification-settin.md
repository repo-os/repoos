---
id: "1249"
title: "QA pass: Telegram and notification settings screens and their messages"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-telegram-and-notification-settin
cli_override: claude code
model_override: haiku
created_at: "2026-11-19T21:46:55Z"
updated_at: "2026-11-19T22:50:54Z"
review_rounds: 1
review_passes: 1
---
## Problem
The notification and Telegram settings screens and the messages they produce have not been checked for wording, error states and small-screen layout.
## Desired UX
Setup steps, test-message results and errors are plain English with a next step, and the screens fit at 375, 768 and 1280 px. No tokens are ever shown or logged.
## Acceptance criteria
- Headless Playwright only against fixtures; never open a visible browser; never contact Telegram or use real tokens.
- Fix issues with tests; commit docs/qa/2026-11-notifications-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Shots
```json
[
{
"label": "Notifications tab: ntfy topic row",
"target": "default",
"route": "/settings?tab=notifications",
"highlight": "#setting-ntfyTopic"
}
]
```

## Activity

- 2026-11-19T21:46:55Z · created · t@t
- 2026-11-19T21:46:59Z · status inbox→ready
- 2026-11-19T21:47:00Z · cli_override, model_override
- 2026-11-19T21:47:01Z · status ready→active, branch
- 2026-11-19T22:12:05Z · body
- 2026-11-19T22:13:06Z · body
- 2026-11-19T22:13:58Z · CTO nudge: held — handoff gate is running
- 2026-11-19T22:32:00Z · note: ui verification passed: 1 of 1 shot captured with clean console
- 2026-11-19T22:32:01Z · status active→review
- 2026-11-19T22:32:02Z · message_queued at 2026-11-19T22:32:02.002Z
- 2026-11-19T22:34:08Z · note: review pass 1: needs some work
- 2026-11-19T22:34:08Z · message_delivered: 1 message(s)
- 2026-11-19T22:34:09Z · status review→active
- 2026-11-19T22:41:53Z · body
- 2026-11-19T22:47:46Z · message_queued at 2026-11-19T22:47:46.822Z
- 2026-11-19T22:47:47Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-19T22:50:11Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-19T22:50:54Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
