---
id: "0328"
title: "Work Queue: collapse-empty-columns toggle + auto-open collapsed columns when tasks arrive"
type: feature
status: review
priority: p2
area: ui
assigned_to: ai
created_by: hello@repoos.org
branch: feat/work-queue-collapse-empty-columns-toggle
created_at: "2026-09-05T04:06:49Z"
updated_at: "2026-09-05T08:30:10Z"
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

**Auto-open on task arrival.** When a task moves into a collapsed column, that
column **automatically expands** so the arriving task is visible — regardless
of what caused the move (drag-and-drop, task-panel actions like "Move to
ready", or an SSE status change coming from another client or an agent). This
is deliberately one-directional: a column that becomes **empty** (its last
task moves out) is **not** auto-collapsed. Only the toggle button (and the
user) ever close columns.

## Acceptance criteria

- [ ] A toggle button renders in the Work Queue header, positioned to the left of the sort order `Select` and right-aligned with the existing header controls.
- [ ] With one or more empty columns expanded, clicking the button collapses exactly the empty columns (draft included when it has no tasks); non-empty columns are unaffected.
- [ ] When every empty column is collapsed, clicking the button expands all columns, including any that the user had individually collapsed.
- [ ] The "empty" determination uses the live task counts per status, including the draft column, not just the `COLUMNS` list.
- [ ] The resulting collapse state is persisted via the existing shared collapse state, so it survives reloads and stays consistent with manual column collapses.
- [ ] The board's keyboard navigation (task #0290) never highlights a card in a column hidden by the bulk collapse — i.e. it goes through the same shared collapsed-state source of truth, not a parallel one.
- [ ] When a task moves into a collapsed column, that column auto-expands and the moved task is visible (draft column included). Triggers cover every status change the board observes: drag-and-drop, task-panel actions, and SSE-driven updates.
- [ ] A column that becomes empty because its last task moved out is NOT auto-collapsed — collapse changes only ever come from the user or the toggle button.
- [ ] The auto-expand mutates the same shared collapse state (`boardCollapse.ts`) and persists, staying consistent with the toggle button, manual collapses, and keyboard navigation — no parallel collapsed-state source.
- [ ] The button has an accessible label/icon that makes both actions discoverable.
- [ ] `bun run build:ui` (or full `bun run build`) succeeds and `bun run test` passes.

## Notes for AI

- Placement target: the header action flex row in `src/ui-app/src/views/WorkView.vue` (the `div` containing the sort-order `Select` and "New task" `Button`); insert the new button before the `Select`.
- Reuse the shared collapse state in `src/ui-app/src/lib/boardCollapse.ts`. Add bulk operations there (e.g. `collapseAllEmpty(...)` / `expandAll(...)` and an `openIfCollapsed(statusId)`-style helper) that mutate `collapsedIds` and `persist()` — do **not** add a second source of truth, and do not bypass `BoardColumn`'s collapse handling.
- "Empty" is `repo.byStatus(id).length === 0`; remember the draft column is rendered separately from `COLUMNS` in `WorkView.vue` (see `DRAFT_COL`), so include it explicitly — `applyCollapseDefaults` in `boardCollapse.ts` already shows the correct iteration pattern.
- Auto-expand on arrival: watch the live per-status counts in `WorkView.vue` (or expose a `revealOnArrival(statusId, count)` helper in `boardCollapse.ts`) and, when a status transitions 0 → ≥1 tasks while its column is collapsed, remove that id from `collapsedIds` and `persist()`. It must react to observed count changes only — a collapsed empty column stays collapsed across unrelated re-renders and initial load (first-load behavior remains `applyCollapseDefaults`'s job, unchanged).
- Assumed defaults (not stated by the user — adjust only if contradicted):
  - "All columns open" in state 2 also re-opens individually collapsed **non-empty** columns, per the literal wording.
  - If there are no empty columns at all, the button acts as "open all" (vacuously all-empty-closed).
  - When a status filter is active (single-column `force-expand` view), the button is hidden or a no-op — the filtered view has nothing to collapse.
  - Auto-open is reactive (fires on arrival events), never on initial page load.
- Use the existing `src/ui-app/src/components/ui/button.vue` component for visual consistency; consider `variant`/icon-only styling that matches the header controls.
- A unit test for the new bulk functions in `src/ui-app/tests/` would be cheap and valuable, since `boardCollapse` is pure state logic. Cover the 0 → ≥1 auto-expand transition and the no-auto-close-on-empty case there too.
- Constraints: zero runtime dependencies (dev deps only); imports use `.js` extensions even for `.ts` source; rebuild the UI after any change.

## Scope

Covers: the toggle button, bulk collapse/expand behavior, auto-expand when a task moves into a collapsed column, persistence through the existing collapse state, and consistency with keyboard navigation.

Deferred: per-column visual redesigns, any server/API changes (this is client-only state), remembering the button's own last-used mode beyond what the collapse set already encodes, changes to the first-load "collapse empty by default" behavior (`applyCollapseDefaults`), and auto-close on empty (columns never close themselves).

## Related

- #0290 (board keyboard navigation — shares `boardCollapse.ts` collapsed-state source of truth)

## Original prompt

Let's add a button to the left of the sort order on the work queue that toggles all empty columns closed, or if all empty columns are closed then the button will instead make all columns open. This way the user can easily focus on columns with tasks.

## Activity

- 2026-09-05T04:06:49Z · created · hello@repoos.org
- 2026-09-05T04:08:24Z · status draft→inbox, title, area, body
- 2026-09-05T08:16:17Z · title, body
- 2026-09-05T08:18:47Z · status inbox→ready
- 2026-09-05T08:19:04Z · status ready→active, branch
- 2026-09-05T08:30:10Z · status active→review
