---
id: "0328"
title: Add collapse-empty-columns toggle button to the Work Queue header
type: feature
status: inbox
priority: p2
area: ui
assigned_to: ai
created_by: hello@repoos.org
branch: ""
created_at: "2026-09-05T04:06:49Z"
updated_at: "2026-09-05T04:08:24Z"
---
## Problem

The Work Queue board renders one column per status (draft, inbox, ready,
active, review, done). Columns can be collapsed individually, but there is no
one-click way to clear the board down to only the columns that actually have
tasks. Users who want to focus on populated statuses must collapse empty
columns one at a time, and there is equally no single click to bring every
column back.

## Desired UX

On the Work Queue page, a button sits immediately to the **left of the sort
order dropdown** in the header action row (before the "New task" button's
group, same flex row). Its behavior is a two-state toggle:

1. **If at least one empty column is currently expanded** → clicking collapses
   every empty column at once. Columns containing tasks are left untouched.
2. **If all empty columns are already collapsed** → clicking instead expands
   **all** columns (empty and non-empty), restoring the full board.

The result is a single button that lets the user snap between "focus on
columns with tasks" and "show everything". The change takes effect immediately
on the visible board, and the resulting collapse state persists like manual
collapses do today (same localStorage-backed state).

## Acceptance criteria

- [ ] A toggle button renders in the Work Queue header, positioned to the left of the sort order `Select` and right-aligned with the existing header controls.
- [ ] With one or more empty columns expanded, clicking the button collapses exactly the empty columns (draft included when it has no tasks); non-empty columns are unaffected.
- [ ] When every empty column is collapsed, clicking the button expands all columns, including any that the user had individually collapsed.
- [ ] The "empty" determination uses the live task counts per status, including the draft column, not just the `COLUMNS` list.
- [ ] The resulting collapse state is persisted via the existing shared collapse state, so it survives reloads and stays consistent with manual column collapses.
- [ ] The board's keyboard navigation (task #0290) never highlights a card in a column hidden by the bulk collapse — i.e. it goes through the same shared collapsed-state source of truth, not a parallel one.
- [ ] The button has an accessible label/icon that makes both actions discoverable.
- [ ] `bun run build:ui` (or full `bun run build`) succeeds and `bun run test` passes.

## Notes for AI

- Placement target: the header action flex row in `src/ui-app/src/views/WorkView.vue` (the `div` containing the sort-order `Select` and "New task" `Button`); insert the new button before the `Select`.
- Reuse the shared collapse state in `src/ui-app/src/lib/boardCollapse.ts`. Add bulk operations there (e.g. `collapseAllEmpty(...)` / `expandAll(...)`) that mutate `collapsedIds` and `persist()` — do **not** add a second source of truth, and do not bypass `BoardColumn`'s collapse handling.
- "Empty" is `repo.byStatus(id).length === 0`; remember the draft column is rendered separately from `COLUMNS` in `WorkView.vue` (see `DRAFT_COL`), so include it explicitly — `applyCollapseDefaults` in `boardCollapse.ts` already shows the correct iteration pattern.
- Assumed defaults (not stated by the user — adjust only if contradicted):
  - "All columns open" in state 2 also re-opens individually collapsed **non-empty** columns, per the literal wording.
  - If there are no empty columns at all, the button acts as "open all" (vacuously all-empty-closed).
  - When a status filter is active (single-column `force-expand` view), the button is hidden or a no-op — the filtered view has nothing to collapse.
- Use the existing `src/ui-app/src/components/ui/button.vue` component for visual consistency; consider `variant`/icon-only styling that matches the header controls.
- A unit test for the new bulk functions in `src/ui-app/tests/` would be cheap and valuable, since `boardCollapse` is pure state logic.
- Constraints: zero runtime dependencies (dev deps only); imports use `.js` extensions even for `.ts` source; rebuild the UI after any change.

## Scope

Covers: the toggle button, bulk collapse/expand behavior, persistence through the existing collapse state, and consistency with keyboard navigation.

Deferred: per-column visual redesigns, any server/API changes (this is client-only state), remembering the button's own last-used mode beyond what the collapse set already encodes, and changes to the first-load "collapse empty by default" behavior (`applyCollapseDefaults`).

## Related

- #0290 (board keyboard navigation — shares `boardCollapse.ts` collapsed-state source of truth)

## Original prompt

Let's add a button to the left of the sort order on the work queue that toggles all empty columns closed, or if all empty columns are closed then the button will instead make all columns open. This way the user can easily focus on columns with tasks.

## Activity

- 2026-09-05T04:06:49Z · created · hello@repoos.org
- 2026-09-05T04:08:24Z · status draft→inbox, title, area, body
