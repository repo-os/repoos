---
id: "0030"
title: Color-code task results in the global search dropdown
type: feature
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/0030-color-coded-search-task-results
created_at: "2026-08-05T06:59:36Z"
updated_at: "2026-08-05T07:00:00Z"
---
## Activity

- 2026-08-05T06:59:36Z · created · unknown

## Problem

0022 added the global search bar (⌘K), grouping results into Tasks / Context
docs / Settings. Task results render as plain text — title + a `#id · status ·
area` subtitle — with no visual status cue. Searching for "setup" across many
tasks, you can't tell at a glance whether a hit is inbox/ready/active/review/done
without reading the status word. The board already communicates state with a
colored dot per status, so search should use the same signal.

## Desired UX

Task results in the search dropdown get the same status-colored dot the board
cards use, so state is readable at a glance. Docs and settings results are
unchanged. The existing status word in the subtitle stays (the dot supplements
it, never replaces it).

## Acceptance criteria

- [ ] Task search results show a small status-colored dot to the left of the
      title, using the EXISTING status color map — `statusColor()` /
      `STATUS_COLORS` in `src/ui-app/src/stores/repo.ts` (inbox slate, ready
      cyan, active purple, review orange, done green) — not a new palette
- [ ] Dot renders with the same `.cdot` class used by board cards
      (`BoardColumn.vue`), sized to fit the compact search row
- [ ] Doc and setting results render exactly as today
- [ ] Highlight (↑/↓), click, and keyboard-open behavior unchanged; the dot
      sits inside the highlighted row like a board card
- [ ] No dropdown layout regression (title/subtitle still truncate cleanly)
- [ ] `repoos check` passes; no new runtime dependencies

## Notes for AI

- `search.ts` already exposes the full `Task` object on task results
  (`r.task`), so status is available with no changes to the search layer.
- Touch: `src/ui-app/src/components/SearchBar.vue` (template — add the dot span
  for `r.kind === "task"`, likely alongside `.search-row-title`) and the
  dropdown styles in `src/ui-app/src/style.css` (`.search-row`, ~lines 142-150;
  `.cdot` is defined at ~line 215).
- Reuse `statusColor` from `src/ui-app/src/stores/repo.ts`; do NOT introduce a
  duplicate color map.
- Follow-on to 0022 (global search bar, in review); this task is independent
  scope and does not touch 0022's branch.
