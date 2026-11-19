---
updated_at: "2026-11-19T23:49:04Z"
review_passes: 1
id: "1253"
title: "QA pass: Settings model providers and API key screens (masked values, save, errors)"
type: bug
status: review
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-settings-model-providers-and-api
cli_override: claude code
model_override: haiku
created_at: "2026-11-19T23:27:11Z"
---
## Problem
The model providers and API key screens have not had a recent check for masked values, saving, wrong keys and offline errors.
## Desired UX
Keys are never shown, only Saved / Not set; wrong or failing keys give plain-English errors with a next step; works at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only against fixtures with fake values; never use or print real keys; never write to the real .env.
- Fix issues with tests; commit docs/qa/2026-11-api-key-screens-qa.md.
## Notes for AI
Do not touch repoos.toml. Follow docs/api-keys.md.

## Shots
```json
[
{
"label": "Model providers tab: live key rows show Saved or Not set beside the title",
"target": "default",
"route": "/agents?tab=providers"
}
]
```

## Activity

- 2026-11-19T23:27:11Z · created · t@t
- 2026-11-19T23:27:18Z · status inbox→ready
- 2026-11-19T23:27:21Z · cli_override, model_override
- 2026-11-19T23:27:22Z · status ready→active, branch
- 2026-11-19T23:41:43Z · body
- 2026-11-19T23:43:49Z · body
- 2026-11-19T23:47:01Z · CTO nudge: held — handoff gate is running
- 2026-11-19T23:47:23Z · note: ui verification passed: 1 of 1 shot captured with clean console
- 2026-11-19T23:47:26Z · status active→review
- 2026-11-19T23:47:27Z · message_queued at 2026-11-19T23:47:27.097Z
- 2026-11-19T23:49:03Z · note: review pass 1: good to go

