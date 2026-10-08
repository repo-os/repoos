---
id: "0732"
title: "CTO conversation: show reports once, render Markdown, and add timestamp popups"
type: bug
status: review
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/cto-conversation-show-reports-once-rende
model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-10-07T02:45:50Z"
updated_at: "2026-10-08T16:03:01Z"
---
## Problem
The CTO Board Monitor renders the latest saved report above its conversation history and also renders the same agent output in the history as plain text. This duplicates the report, exposes Markdown syntax, and collapses its line breaks.

## Desired UX
Show each CTO report once in chronological conversation history alongside human messages and monitoring markers. Preserve earlier runs rather than showing only the latest report. Render assistant replies and reports with the existing safe Markdown renderer and consistent chat styling. Preserve human messages, diagnostics, tool-call rows, copy behavior, and scrolling.

On timestamp hover, show a styled popup containing human relative time (for example, 12 seconds ago, 5 minutes ago, or 2 hours ago) and the local weekday/date (for example, Wed, 4 Aug). Make it accessible through keyboard focus and touch, and keep relative time accurate while the panel is open. Use the shared styled tooltip/popover approach rather than native title tooltips.

## Acceptance criteria
- Each completed monitoring run appears once as a formatted report; later runs preserve earlier reports and add their own once.
- Existing saved latest reports remain readable after reload when session history is missing, without duplicating reports already present in history.
- Markdown headings, lists, emphasis, and code render correctly; human messages remain plain text.
- Timestamp popups correctly show seconds/minutes/hours and the local weekday/date, with hover, keyboard, and touch access.
- Verify the CTO panel visually; add focused behavior tests for deduplication/fallback and timestamp formatting. Rebuild the UI, update directly affected documentation, and pass repoos check before review.

## Notes for AI
src/ui-app/src/components/CTOPanel.vue separately renders report.markdown through renderMarkdown and conversation rows through plain text interpolation. src/server/cto.ts saves the latest report and retains up to 2,000 session entries. Account for streamed output, reloads, and legacy saved-report-only data when removing duplication. Keep this scoped to the CTO panel.

## Shots
```json
[
{
"label": "CTO panel: two monitoring runs, each report shown once as Markdown",
"target": "default",
"route": "/",
"highlight": ".cto-log",
"steps": [
{
"click": "[data-test-id=\"floating-head-cto\"]"
},
{
"waitMs": 500
}
]
},
{
"label": "CTO timestamp popup: relative age + local weekday/date",
"target": "default",
"route": "/",
"highlight": ".msg-time",
"steps": [
{
"click": "[data-test-id=\"floating-head-cto\"]"
},
{
"waitMs": 500
},
{
"click": ".msg-time"
},
{
"waitMs": 300
}
]
}
]
```

## Activity

- 2026-10-07T02:45:50Z · created · unknown
- 2026-10-07T02:45:51Z · needs_input
- 2026-10-07T02:46:07Z · body
- 2026-10-07T03:55:56Z · needs_input
- 2026-10-08T15:29:00Z · status inbox→ready
- 2026-10-08T15:29:16Z · model_override
- 2026-10-08T15:29:19Z · status ready→active, branch
- 2026-10-08T15:43:53Z · body
- 2026-10-08T15:45:30Z · body
- 2026-10-08T15:49:01Z · body: section Shots
- 2026-10-08T15:49:59Z · body
- 2026-10-08T15:51:47Z · body
- 2026-10-08T16:01:55Z · status active→review
- 2026-10-08T16:02:30Z · note: click .msg-time: click: Error: strict mode violation: locator('.msg-time') resolved to 8 elements: on /
- 2026-10-08T16:03:01Z · note: review pass 1: needs some work
