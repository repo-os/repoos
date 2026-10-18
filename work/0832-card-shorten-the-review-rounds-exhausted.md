---
id: "0832"
title: "Card: shorten the review-rounds-exhausted summary (one short line, no duplicated verdict)"
type: chore
status: active
priority: p3
area: [web, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/card-shorten-the-review-rounds-exhausted
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-18T08:09:33Z"
updated_at: "2026-10-18T10:16:34Z"
last_close_out_gate_ms: 438673
last_close_out_gate_at: "2026-10-18T08:57:38.574Z"
review_passes: 1
---
## Problem
The task card shows the whole first line of the reviewer's Verdict section as `needs_input_detail` (`src/server/review.ts` ~1749), under the header "REVIEW STILL FINDING ISSUES". It is often a long paragraph and begins with `` `needs some work` — ``, which the header already says.

## Desired UX
- The reviewer's verdict line is `<verdict> — <at most 120 characters why>` (prompt change); details stay in the report.
- The card strips the leading verdict token, clamps to 2-3 lines, and the full verdict is reachable via the Review tab.
- Existing long stored details render clamped too.

## Acceptance criteria
- Test: a long detail is clamped; a leading verdict token is not repeated under the header.
- Test: the full text is still available in the Review tab.
- Light and dark shot of the card on a task with the flag (use a real fixture, not 9999).

## Notes for AI
Bundle-sized: a second small item may be added by the human before start. Source: driver discussion 2026-10-18.

## Shots
```json
[
{
"label": "Review card: review-rounds-exhausted summary clamped (light)",
"target": "default",
"route": "/work?status=review",
"highlight": "[data-task-id=\"0832\"] .tc-needs-detail",
"steps": [
{
"waitFor": "[data-task-id=\"0832\"] .tc-needs-detail"
}
],
"assert": [
{
"selector": "[data-task-id=\"0832\"] .tc-needs-detail",
"label": "detail omits duplicated verdict label",
"text": "contrast audit"
}
],
"state": "card:reviewRoundsExhausted",
"theme": "light"
},
{
"label": "Review card: review-rounds-exhausted summary clamped (dark)",
"target": "default",
"route": "/work?status=review",
"highlight": "[data-task-id=\"0832\"] .tc-needs-detail",
"steps": [
{
"waitFor": "[data-task-id=\"0832\"] .tc-needs-detail"
}
],
"assert": [
{
"selector": "[data-task-id=\"0832\"] .tc-needs-detail",
"label": "detail omits duplicated verdict in dark theme",
"text": "contrast audit"
}
],
"state": "card:reviewRoundsExhausted",
"theme": "dark"
}
]
```

## Activity

- 2026-10-18T08:09:33Z · created · njachowski@gmail.com
- 2026-10-18T08:19:03Z · status inbox→ready
- 2026-10-18T08:19:08Z · cli_override, model_override
- 2026-10-18T08:19:11Z · status ready→active, branch
- 2026-10-18T08:22:19Z · body
- 2026-10-18T08:23:00Z · body
- 2026-10-18T08:25:04Z · body
- 2026-10-18T08:42:23Z · status active→review
- 2026-10-18T08:43:26Z · note: review pass 1: good to go
- 2026-10-18T08:51:58Z · body
- 2026-10-18T08:53:27Z · body
- 2026-10-18T08:53:56Z · body
- 2026-10-18T08:54:53Z · body
- 2026-10-18T08:57:38Z · close-out gate completed in 439s
- 2026-10-18T08:58:14Z · body
- 2026-10-18T09:01:12Z · status review→active
- 2026-10-18T09:01:18Z · note: handoff requested (ui-review)
- 2026-10-18T09:09:31Z · CTO action: restart-stalled-agent (fresh) · agent exited without emitting the handoff signal
- 2026-10-18T09:24:31Z · message_queued at 2026-10-18T09:24:31.583Z
- 2026-10-18T09:24:34Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-18T09:34:07Z · body
- 2026-10-18T09:34:50Z · body
- 2026-10-18T09:35:57Z · body
- 2026-10-18T09:36:31Z · body
- 2026-10-18T10:16:34Z · body
