---
id: "0732"
title: "CTO conversation: show reports once, render Markdown, and add timestamp popups"
type: bug
status: inbox
needs_input: true
needs_input_reason: underspecified
needs_input_detail: "missing sections: Problem, Desired UX, Acceptance criteria, Notes for AI"
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-10-07T02:45:50Z"
updated_at: "2026-10-07T02:45:51Z"
---
The CTO Board Monitor currently displays the latest saved report above the conversation history, while the same agent output also appears as an unformatted text bubble. This duplicates the report and exposes Markdown syntax with collapsed line breaks.

Requested behavior:
- Show each CTO report once in chronological conversation history, alongside human messages and monitoring markers. Keep past runs available rather than reducing the panel to only the latest report.
- Render assistant replies and reports as Markdown with the existing safe renderer and consistent chat styling. Preserve human messages, diagnostic rows, tool-call rows, copy behavior, and scroll behavior.
- On timestamp hover, show a styled popup containing human relative time (for example, 12 seconds ago, 5 minutes ago, or 2 hours ago) and the local weekday/date (for example, Wed, 4 Aug). Support keyboard focus and touch access; use the shared styled tooltip/popover approach rather than native title tooltips. Refresh relative time so it stays accurate while the panel is open.
- Preserve access to an existing saved latest report when historical session output is unavailable, without introducing a duplicate when that report is already represented in the history.

Implementation context: src/ui-app/src/components/CTOPanel.vue separately renders report.markdown through renderMarkdown and conversation rows through plain text interpolation. src/server/cto.ts saves a latest report and retains up to 2,000 session entries.

Acceptance and verification:
- A completed monitoring run has one formatted report in the conversation; a later run preserves earlier reports and adds its own once.
- Existing saved-report-only data remains readable after reload.
- Markdown headings, lists, emphasis, and code render correctly without formatting human messages as assistant Markdown.
- Timestamp popup displays correct seconds/minutes/hours and local weekday/date, and is usable by hover, keyboard, and touch.
- Verify the CTO panel visually and add focused behavior tests for report deduplication/fallback and timestamp formatting. Rebuild UI, check directly affected documentation, and pass repoos check before requesting review.

## Activity

- 2026-10-07T02:45:50Z · created · unknown
- 2026-10-07T02:45:51Z · needs_input
