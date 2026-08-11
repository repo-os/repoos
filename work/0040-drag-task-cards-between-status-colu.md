---
id: "0040"
title: Drag task cards between status columns on the Work board
type: feature
status: review
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/drag-task-cards-between-status-columns-o
created_at: "2026-08-06T10:30:00Z"
updated_at: "2026-08-11T00:11:28Z"
---
## Activity

- 2026-08-06T10:30:00Z · created · unknown

## Problem

Changing a task's status requires opening the task and switching it via the
status dropdown in the task drawer (`TaskDrawer.vue`). But the Work board
(`WorkView.vue`) already shows one column per status — the target state is
visible on the same screen. Click-into-a-drawer-then-pick is friction; the
natural board interaction is to grab a card and drop it on the target column.

## Desired UX

Drag a task card from its column onto any other status column and the card's
status updates immediately — same effect as the drawer dropdown, no navigation.

- `dragstart` on a card dims/ghosts it and marks it as being dragged.
- Dragging over a column highlights that column as a valid drop target.
- `drop` on a column changes the card's status to that column's status.
- Dropping on the card's own column is a no-op (status unchanged).
- All columns accept drops, including the Propose/Drafts column, matching the
  drawer dropdown's behavior (no artificial linear progression enforcement).
- The drawer dropdown stays as the keyboard/accessible path; drag-and-drop is an
  enhancement on top, never the only way to change status.

## Scope

- `src/ui-app/src/views/WorkView.vue` (board columns incl. `DRAFT_COL`, and the
  `BoardColumn` rendering): make cards `draggable`, wire `dragstart` /
  `dragover` / `dragleave` / `drop` handlers on cards and column bodies.
- Reuse the existing status mutation path: `repo.setStatus(t, status)` in
  `src/ui-app/src/stores/repo.ts` (calls `PATCH /api/tasks/:id { status }`) —
  no server changes needed. Give the drop visual feedback on the source card and
  the target column; clear highlights on `dragend`/`drop`.
- The filtered board view (`?status=` filter) keeps working; dragging is simply
  not offered when a single column is shown.
- **No runtime dependencies** — use the native HTML5 drag-and-drop API, not a
  drag library (repo has a zero-runtime-deps constraint).
- Reordering cards *within* a column is out of scope (no ordering field exists;
  status remains the only ordering dimension). Note it as a possible follow-on.

## Success criteria

- Dragging a card to another column changes the task's status in the frontmatter
  (verify via `repoos show` after a reload); the card renders in the new column.
- Same-column drop does nothing (no PATCH fired).
- Drag affordances render cleanly and reset on `dragend` (no stuck highlights).
- `repoos check` passes green (incl. headless-browser UI smoke test).

## Activity

- 2026-08-10T23:53:54Z · status inbox→ready
- 2026-08-10T23:59:08Z · status ready→active
- 2026-08-11T00:11:28Z · status active→review
- 2026-08-11T00:11:28Z · follow-on noted: reordering cards within a column (no ordering field; status stays the only ordering dimension)
