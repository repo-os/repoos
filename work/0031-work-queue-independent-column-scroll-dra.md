---
id: "0031"
title: "Work queue: independent column scroll, drafts left of inbox, collapsible columns"
type: feature
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/0031-work-queue-scrolling-and-collapsible-cols
created_at: "2026-08-05T07:13:06Z"
updated_at: "2026-08-05T07:14:00Z"
---
## Activity

- 2026-08-05T07:13:06Z · created · unknown

## Problem

The Work Queue page is a single scrolling surface. Scrolling the board pushes
the "Work Queue" header and the New task button out of view, and every column
title scrolls away with its cards — you lose orientation once the list gets
long. Drafts (Proposed / Drafts) render BELOW the board, so they're easy to
miss. And all five status lists are always fully open, cluttering the desktop
view when you only care about one or two.

## Desired UX

Inspired by Fizzy.do (37signals) — the board should feel like a set of
independent lists, not one long page:

- Each column scrolls independently: card bodies scroll inside fixed-height
  columns while the page header (Work Queue / New task button) and every
  column title stay visible.
- Proposed / Drafts becomes the FIRST (leftmost) column in the same horizontal
  board — left of Inbox — not a below-board section.
- Column headers toggle their list open/closed. Closed = a slim colored bar
  (status dot + list name + live item count) that takes minimal space but stays
  visible; click it to expand back to full cards. Open/closed state is
  remembered per column across reloads.

## Acceptance criteria

- [ ] Column card bodies scroll independently (own `overflow-y`) on desktop;
      the page header, New task button, and all column headers remain pinned —
      scrolling a long column no longer scrolls the top matter away
- [ ] Proposed / Drafts is the leftmost column (left of Inbox) with its gray
      dot, "Proposed / Drafts" label, live count, and empty-state hint; the
      below-board `.draft-section` is gone
- [ ] Clicking a column header toggles collapse/expand; collapsed shows a slim
      colored bar with the status dot + name + live count; cards are hidden
      while collapsed
- [ ] Collapse state persists per column across reloads (e.g. localStorage)
- [ ] Open columns keep today's card behavior (click → task drawer) and empty
      state ("—" / drafts hint)
- [ ] Graceful on small screens: the board still stacks to one column and the
      page can scroll normally; collapse toggle still works
- [ ] `repoos check` passes; no new runtime dependencies

## Notes for AI

- Files: `src/ui-app/src/views/WorkView.vue` (board layout, remove
  `.draft-section`), `src/ui-app/src/components/BoardColumn.vue` (header
  click + collapsed state), `src/ui-app/src/style.css` (`.board`/`.col-head`/
  `.col-body` ~lines 211-217, `.draft-*` ~lines 289-292).
- `COLUMNS` in `src/ui-app/src/stores/repo.ts` drives the board and is used
  ONLY by WorkView — but keep drafts OUT of COLUMNS and render the draft
  column explicitly as the leftmost column via `repo.byStatus("draft")`, so
  nothing else (counts, search, status colors) changes.
- Independent scroll: constrain column height (e.g.
  `height: calc(100vh - <header + column-head> )`) with `overflow-y: auto` on
  the card body; keep each `.col-head` pinned inside its column. Mind the
  responsive breakpoints (`.board` is 5→3→1 columns at 1250px/760px).
- Collapse persistence: a client-side-only `localStorage` key (e.g.
  `repoos.board.collapsed`) storing the set of collapsed column ids. Default =
  all open so nothing changes for existing users.
- Pure view-layer change: do NOT touch `TaskCard.vue`, the drawer, or core
  task data.
- Related but independent: 0015 (draft status), 0022 (search), 0025 (shadcn-vue
  restyle — this task is layout-level; coordinate if 0025 changes `.board`/
  `.col-*` styles concurrently).
