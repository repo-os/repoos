---
id: "1278"
title: "Work board: move search into the header row, half width, drop the search chip"
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/work-board-move-search-into-the-header-r
cli_override: claude code
model_override: haiku
created_at: "2026-11-20T08:46:27Z"
updated_at: "2026-11-20T15:46:14Z"
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

## Screenshots

![Desktop Work board: search input sits on its own row with a Search: web chip below it](/api/tasks/1278/attachments/att_d4a18ac1-98bd-4293-ba28-05f20b090486.webp)

## Activity

- 2026-11-20T08:46:27Z · created · t@t
- 2026-11-20T08:46:30Z · screenshots
- 2026-11-20T08:46:44Z · status inbox→ready
- 2026-11-20T15:06:49Z · cli_override, model_override
- 2026-11-20T15:07:04Z · status ready→active, branch
- 2026-11-20T15:46:14Z · message_queued at 2026-11-20T15:46:14.989Z
