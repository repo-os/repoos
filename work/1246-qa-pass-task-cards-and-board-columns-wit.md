---
id: "1246"
title: "QA pass: task cards and board columns with long titles, many labels and odd states"
type: bug
status: done
priority: p2
area: web
merged_commit: ca0077b83096df440142480c7403a799b76c8676
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-task-cards-and-board-columns-wit
cli_override: claude code
model_override: haiku
created_at: "2026-11-19T21:06:54Z"
updated_at: "2026-11-19T21:42:17Z"
last_close_out_gate_ms: 809300
last_close_out_gate_at: "2026-11-19T21:42:17.760Z"
review_passes: 1
---
## Problem
Task cards and board columns have not been checked with very long titles, many labels, unusual statuses (held, paused, needs-input, archived) and missing fields.
## Desired UX
Every card state renders cleanly and consistently with no overlap or clipping at 375, 768 and 1280 px.
## Acceptance criteria
- Headless Playwright only against fixtures; never open a visible browser or steal focus.
- Use fixtures for every state and extreme content; fix issues with tests.
- Commit docs/qa/2026-11-task-cards-states-qa.md.
## Notes for AI
Do not touch repoos.toml.

## Shots
```json
[
{
"label": "Human-assigned card with a long handle wraps inside the card",
"target": "default",
"route": "/work",
"highlight": ".task-card",
"state": "card:humanStep"
}
]
```

## Activity

- 2026-11-19T21:06:54Z · created · t@t
- 2026-11-19T21:06:57Z · status inbox→ready
- 2026-11-19T21:06:58Z · cli_override, model_override
- 2026-11-19T21:06:59Z · status ready→active, branch
- 2026-11-19T21:14:53Z · body
- 2026-11-19T21:16:03Z · body
- 2026-11-19T21:19:10Z · note: ui verification passed: 1 of 1 shot captured with clean console
- 2026-11-19T21:19:11Z · status active→review
- 2026-11-19T21:19:11Z · message_queued at 2026-11-19T21:19:11.388Z
- 2026-11-19T21:20:38Z · note: review pass 1: good to go
- 2026-11-19T21:42:17Z · close-out gate completed in 809s

