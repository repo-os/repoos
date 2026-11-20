---
id: "1278"
title: "Work board: move search into the header row, half width, drop the search chip"
type: feature
status: review
needs_input: true
needs_input_reason: review-failed
needs_input_detail: "the opencode agent exited without output: error: OpenCode Go usage limit reached (monthly, resets in 1d 14h). To keep going now, turn on Extra Usage at https://opencode.ai/console/wrk_01KQ7ZAG4V1XEK1E46TJF13DFZ/go."
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/work-board-move-search-into-the-header-r
cli_override: claude code
model_override: haiku
created_at: "2026-11-20T08:46:27Z"
updated_at: "2026-11-20T16:22:11Z"
review_failed_report_retries: 2
---
## Problem
The new desktop board search (#1259) sits on its own row below the page title, takes a lot of width, and shows a redundant 'Search: web' chip under it while typing.

## Desired UX
- Move the search input into the page header row, in the spot currently held by the 'Client board' link (left of the Human / Held toggles).
- Hide the 'Client board' link on the Work page for now (do not delete the route or feature, only hide the link here).
- Make the search input about half its current width.
- Remove the 'Search: <text>' chip that appears below the input while typing. Other chips and the Clear filters action stay as they are for non-search filters; Clear filters must still clear the search.

## Acceptance criteria
- Desktop (720px and up): search lives in the header row, about half width, with the same behaviour (writes q to the URL, filters columns, clear button).
- The Client board link is not shown on the Work page; nothing else that links to it breaks.
- No search chip appears; Clear filters still works and still appears when a search is active.
- Phone queue layout unchanged unless it shares the removed chip, in which case remove the search chip there too.
- Headless WebKit fixtures at 375, 768 and 1280 widths updated; no horizontal overflow or wrapping collisions in the header row at 720-1000px.

## Notes for AI
Start from src/ui-app/src/components/BoardQueueSearch.vue and the Work view header. Never touch repoos.toml. Headless Playwright only.

## Shots
```json
[
{
"label": "Work board header: half-width search in the header row, no Search chip",
"target": "default",
"route": "/work?q=login",
"highlight": "[data-testid=\"board-queue-search\"]"
}
]
```

## Screenshots

![Desktop Work board: search input sits on its own row with a Search: web chip below it](/api/tasks/1278/attachments/att_d4a18ac1-98bd-4293-ba28-05f20b090486.webp)

## Activity

- 2026-11-20T08:46:27Z · created · t@t
- 2026-11-20T08:46:30Z · screenshots
- 2026-11-20T08:46:44Z · status inbox→ready
- 2026-11-20T15:06:49Z · cli_override, model_override
- 2026-11-20T15:07:04Z · status ready→active, branch
- 2026-11-20T15:46:14Z · message_queued at 2026-11-20T15:46:14.989Z
- 2026-11-20T15:46:15Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-20T15:49:24Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-20T15:49:25Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 143) · last assistant: The live run is still in remote validation on "thinkpad", so it hasn't reported a result yet. I'll wait for its completion notification. · stderr: (empty)
- 2026-11-20T15:49:25Z · message_delivered: 1 message(s)
- 2026-11-20T15:51:15Z · message_queued at 2026-11-20T15:51:15.102Z
- 2026-11-20T15:51:15Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-20T15:56:15Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-20T15:58:31Z · body
- 2026-11-20T16:00:09Z · queued message undelivered for 9m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-20T16:00:10Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 143) · last assistant: The gate is running. I'll wait for it to finish rather than poll. · stderr: (empty)
- 2026-11-20T16:00:10Z · message_delivered: 1 message(s)
- 2026-11-20T16:01:15Z · message_queued at 2026-11-20T16:01:15.786Z
- 2026-11-20T16:01:16Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-20T16:06:05Z · CTO nudge: held — handoff gate is running
- 2026-11-20T16:21:45Z · note: ui verification passed: 1 of 1 shot captured with clean console (1 shot warning)
- 2026-11-20T16:21:47Z · status active→review
- 2026-11-20T16:21:47Z · message_queued at 2026-11-20T16:21:47.986Z
- 2026-11-20T16:21:54Z · note: review pass 1: failed — no usable report
- 2026-11-20T16:22:03Z · note: review pass 2: failed — no usable report
- 2026-11-20T16:22:11Z · note: review pass 3: failed — no usable report
- 2026-11-20T16:22:11Z · needs_input
