---
id: "0832"
title: "Card: shorten the review-rounds-exhausted summary (one short line, no duplicated verdict)"
type: chore
status: review
priority: p3
area: [web, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/card-shorten-the-review-rounds-exhausted
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-18T08:09:33Z"
updated_at: "2026-10-18T08:42:23Z"
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
"highlight": "[data-task-id=\"9999\"] .tc-needs-detail",
"steps": [
{
"waitFor": "[data-task-id=\"9999\"] .tc-needs-detail"
}
],
"assert": [
{
"selector": "[data-task-id=\"9999\"] .tc-needs-detail",
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
"highlight": "[data-task-id=\"9999\"] .tc-needs-detail",
"steps": [
{
"waitFor": "[data-task-id=\"9999\"] .tc-needs-detail"
}
],
"assert": [
{
"selector": "[data-task-id=\"9999\"] .tc-needs-detail",
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
