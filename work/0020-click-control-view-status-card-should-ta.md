---
id: "0020"
title: Click Control View status card should take you to filtered work list
type: feature
status: done
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: "feat/0020-status-card-filter"
created_at: "2026-06-03T17:59:39Z"
updated_at: "2026-08-06T07:10:00Z"
---
## Activity

- 2026-06-03T17:59:39Z · created · unknown
- 2026-08-06T06:58:00Z · status inbox→active · spec added + order fix folded in
- 2026-08-06T07:05:00Z · status active→review · implemented; repoos check green
- 2026-08-06T07:10:00Z · merged to main · ai

## Problem

Mission Control's status cards are decorative: they show live counts but do
nothing when clicked, so there's no way to jump from a count to the actual
tasks. Separately, the cards are ordered differently from the Work Queue
columns — the dashboard shows active, ready, review, done, inbox, draft while
the board runs draft → inbox → ready → active → review → done. The mismatch
reads as a bug even though both are intentional orders.

## Desired UX

- Status cards on Mission Control follow the same order as the Work Queue
  columns: draft, inbox, ready, active, review, done.
- Clicking a status card navigates to the Work Queue filtered to that status
  (`/work?status=active`), showing just that column. A clear affordance
  returns to the full board.
- Cards read as clickable (hover affordance) and are keyboard-focusable;
  activation works with Enter/Space.

## Acceptance criteria

- [ ] Stat cards ordered draft, inbox, ready, active, review, done (matches the
      board's column order)
- [ ] Clicking a card navigates to `/work?status=<id>` and the board shows only
      that status's column
- [ ] The filtered view shows a "Show all statuses" control that clears the
      filter back to the full board
- [ ] An unknown/invalid status query behaves like no filter (full board)
- [ ] Cards are keyboard-focusable with Enter/Space activation; hover shows a
      click affordance
- [ ] `repoos check` passes; no new runtime dependencies

## Notes for AI

- Order + click live in `src/ui-app/src/views/DashboardView.vue` (the
  `stat-grid`, ~lines 17-50): reorder the six `StatCard` blocks and wrap each
  in a `<router-link :to="{ path: '/work', query: { status: '<id>' } }">`.
  An anchor is free accessibility (focus, Enter, context-menu) — do NOT add
  JS click handlers.
- WorkView (`src/ui-app/src/views/WorkView.vue`) renders the board. Read the
  route query and, when a valid status is present, render only the matching
  column (`DRAFT_COL` for `draft`, the matching `COLUMNS` entry otherwise)
  plus a clear-filter control (`router-link` back to `/work`).
- Add a `forceExpand` prop to `BoardColumn.vue` so the filtered column renders
  expanded even if that status is collapsed in saved board state.
- New styles (`/work` filter bar, `.stat-link` hover) go in
  `src/ui-app/src/style.css`, layered, reusing existing tokens.
- Status ids: draft, inbox, ready, active, review, done.
