---
id: "0995"
title: "Easter eggs bundle: card integrating text, skeleton shapes, Done column order"
type: chore
status: inbox
priority: p3
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-31T13:08:01Z"
updated_at: "2026-10-31T16:23:04Z"
---
## Items
- [ ] **E1 · Card integrating text clamp** (web) — the board card's live integrating/progress line wraps to about nine lines; clamp it to at most three with an ellipsis and let a click open the task panel for the full text. Source: human report with screenshot (#0990 card).
- [ ] **E2 · Page skeletons match their pages** (web) — each page's loading skeleton should mirror the real layout (e.g. /work has 6 status columns, /inputs has 3), not a generic block. Source: human report.
- [ ] **E3 · Done column sorts by when the task reached done** (web) — the Done column currently sorts by `updated_at`, which any later write bumps (activity notes, flag clears, release records), so old done tasks jump back to the top. Sort Done by the timestamp of the last `status …→done` line in the task's activity log. Source: human report (#0970 sits at the top of Done though it reached done on 28 Oct).
- [ ] **E4 · Open any past review pass from the Review tab** (web) — the pass table lists every review pass but the rows are plain text and the body always shows the latest report. Make each row open that pass's stored report (`.repoos/reviews/<id>/<pass>.md`). Source: human report (#0970 has two stored passes).

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

## E2 · Page skeletons match their pages
### Problem
The loading skeletons are generic. /work always draws five equal columns, but the real board has six status columns (Draft, Inbox, Ready, Active, Review, Done); /inputs has three columns; other pages (stories, checks, releases, deployments, dev, secrets, agents, settings) each have their own shape, and the skeleton shows rows or cards that do not match what replaces them, so the page visibly jumps when data arrives.

### Desired UX
Each page's skeleton mirrors its real layout: the same number of columns, similar card heights and the same table or card grid, under the page title (kept at the top, see the earlier loading-title fix).

### Acceptance criteria
- [ ] /work shows six column skeletons matching the board's real column set, driven by the same column definition the board uses so they cannot drift.
- [ ] /inputs shows three columns; every other routed page uses a skeleton shaped like its real content (verify each page against its loaded layout).
- [ ] `loadingSkeletonKind` and `PageSkeleton` are the one place that chooses the shape; a test asserts the column count for /work and /inputs and that every route in `router.ts` has an explicit skeleton choice.
- [ ] No layout jump larger than a few pixels when data arrives on /work and /inputs (compare the skeleton and loaded column positions).

### Notes for AI
Web only. Read the column list from the board config rather than hard-coding six. Keep the page title above the skeleton (App.vue loading header). Reduced-motion behaviour stays as it is.

## E3 · Done column sorts by when the task reached done
### Problem
The Done column's "Most recently updated" order uses `updated_at`, which the server stamps on every write to a task file, not only on status changes. #0970 reached done on 2026-10-28T12:40Z but shows at the top of Done because later writes (a stale-flag clear, "message overdue" notes) bumped its `updated_at`. The order should mean "most recently finished".

### Desired UX
In the Done column, the most recently completed task is first. A later bookkeeping write never reorders it. Other columns keep their current behaviour.

### Acceptance criteria
- [ ] The Done column orders tasks by the timestamp of the LAST `status …→done` line in the task's activity log (for example `- 2026-10-28T12:40:39Z · status ready→done`), newest first.
- [ ] A task with no such line (old or hand-written files) falls back to `updated_at`, so nothing disappears or errors.
- [ ] A later write to a done task (an activity note, a flag clear, a release record) does not change its position; moving a task out of done and back in makes it the newest.
- [ ] The parsing lives in one shared helper used by the board and covered by tests, including a log with several done transitions and a log with none.
- [ ] Only the board's recent sort for the Done column changes; Priority, Task number and the other columns are unchanged.

### Notes for AI
Web only; the activity log is in the task body (`- <timestamp> · status A→B` lines) and is already available to the UI. Do not add a new frontmatter field and do not migrate any task files (AGENTS.md: never write work/*.md directly). Check the line format against real done tasks such as #0970 and #0988.

## E4 · Open any past review pass from the Review tab
### Problem
Every review pass is stored on disk at `.repoos/reviews/<task id>/<pass>.md` (with the latest also at `.repoos/reviews/<id>.md`), and the Review tab's table lists them all with time, reviewer, model and verdict. But the rows are not interactive and the report body below is always the latest pass, so older reports, including failed passes and their error text, cannot be read in the UI.

### Desired UX
Clicking (or keyboard-activating) a pass row shows that pass's report in the body, with the selected row highlighted and a clear way back to the latest. The default view stays the latest pass.

### Acceptance criteria
- [ ] Each row in the review history table is a keyboard-focusable control; selecting it renders that pass's stored report below.
- [ ] The latest pass is selected by default and a "Latest" control returns to it; the selection resets when the task changes.
- [ ] A failed pass shows its stored failure text instead of an empty report.
- [ ] The report for a pass is served from the stored per-pass file by an existing or new read-only route (documented in the CLI/API parity list if a route is added) and is covered by a test, including a pass that does not exist.
- [ ] Rows use the existing styled controls, no native title tooltips.

### Notes for AI
Start from `listReviewPasses` (`src/core/review-passes.js`) and the `review-history-table` markup in `TaskDrawer.vue`. Read-only; do not change how reports are written.

## Activity

- 2026-10-31T13:08:01Z · created · njachowski@gmail.com
- 2026-10-31T13:08:03Z · screenshots
- 2026-10-31T13:23:30Z · body: Items (added 1, removed 1)
- 2026-10-31T13:23:32Z · body: E2 · Page skeletons match their pages (added)
- 2026-10-31T13:23:40Z · title
- 2026-10-31T16:18:07Z · body: Items (added 1)
- 2026-10-31T16:18:09Z · body: E3 · Done column sorts by when the task reached done (added)
- 2026-10-31T16:18:11Z · title
- 2026-10-31T16:23:02Z · body: Items (added 1)
- 2026-10-31T16:23:04Z · body: E4 · Open any past review pass from the Review tab (added)
