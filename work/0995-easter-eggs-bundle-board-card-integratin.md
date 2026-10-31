---
id: "0995"
title: "Easter eggs bundle: board card integrating status clamped to three lines"
type: chore
status: inbox
priority: p3
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-31T13:08:01Z"
updated_at: "2026-10-31T13:23:30Z"
---
## Items
- [ ] **E1 · Card integrating text clamp** (web) — the board card's live integrating/progress line wraps to about nine lines; clamp it to at most three with an ellipsis and let a click open the task panel for the full text. Source: human report with screenshot (#0990 card).
- [ ] **E2 · Page skeletons match their pages** (web) — each page's loading skeleton should mirror the real layout (e.g. /work has 6 status columns, /inputs has 3), not a generic block. Source: human report.

## E1 · Card integrating text clamp

### Problem
While a task is moving to done, the board card shows the whole remote-validation progress string in a narrow monospace column, for example "integrating · uploading bundle to thinkpad · 88 MB / 204 MB (43%) · 3.7 MB/s · ~32s left · attempt 1 · 128s in stage · full bundle (mirror empty) · 4m 00s". At card width it wraps to nine lines and is hard to read. The string is built in `src/server/remote-validation.ts` (around the "full bundle (mirror empty)" label); the card text itself is rendered in the web UI.

### Desired UX
At most three lines on the card, ellipsis when it overflows. The full text is one click away in the task panel (Debug, Status details), where it should appear in full. No native title tooltip.

### Acceptance criteria
- [ ] The card shows no more than three lines of the integrating/progress status, with an ellipsis when it overflows.
- [ ] Clicking it opens the task panel; the full, untruncated text is visible in Debug, Status details.
- [ ] The most useful parts survive the clamp: put the stage and percentage first so they are what remains visible.
- [ ] A test covers the clamp and the full text in the panel.

### Notes for AI
Web only; do not change what the server sends. Use the existing styled tooltip (`data-tip`) if a hover explanation is wanted, never `title`.

## Screenshots

![Board card while Moving to done: the integrating status wraps to nine lines](/api/tasks/0995/attachments/att_1cc7d0b4-2156-4094-a835-ff3ea4a136a7.png)

## Activity

- 2026-10-31T13:08:01Z · created · njachowski@gmail.com
- 2026-10-31T13:08:03Z · screenshots
- 2026-10-31T13:23:30Z · body: Items (added 1, removed 1)
