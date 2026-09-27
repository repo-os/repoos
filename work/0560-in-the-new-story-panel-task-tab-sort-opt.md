---
id: "0560"
title: Add status sort and status colors to the story panel task tab
type: feature
status: done
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/add-status-sort-and-status-colors-to-the
cli_override: opencode
model_override: opencode-go/glm-5.3-flash
review_model_override: opencode-go/hy3
created_at: "2026-09-27T17:51:49Z"
updated_at: "2026-09-27T19:09:18Z"
review_passes: 1
---
## Problem

The **Tasks** tab of the story panel has a sort dropdown with four modes
(Most recently updated, Priority level, Task number newest, Task number oldest)
but no way to group or order a story's tasks by where they are in the flow. A
story whose work is spread across `ready`, `active` and `review` has to be read
row by row to answer "what's left?".

The status text on each row is also visually inert: the status pill renders in
a neutral dim gray with a default border, so the only status signal is a 7px
dot. On the work page the same statuses are strongly color-coded via
`COLUMNS`/`statusColor`, so a user reads a board column's status at a glance but
has to squint at the story panel's pills.

## Desired UX

- The story panel Tasks sort dropdown gains a **"Status"** option alongside the
  existing four. Selecting it orders the rows by the pipeline stage
  `draft → inbox → ready → active → review → done`, so a story's tasks read as a
  natural progression.
- Within one status the existing order is preserved (the sort is stable, so
  rows don't jump around arbitrarily between renders).
- Each row's status pill is colored with the same status color used by the work
  board columns: the label text takes the status color and the border is a
  matching tint. `ready` is cyan, `active` violet, `review` amber, `done` green,
  `inbox` slate, `draft` faint. The existing dot keeps using the same
  `statusColor(task.status)` source of truth, so dot and pill can never diverge.
- Both the sort choice and the colors survive a page reload, and the sort
  choice stays independent of the work board's own sort choice (separate
  `localStorage` keys already exist for this).

## Acceptance criteria

- [ ] `SortOrder` in `src/ui-app/src/stores/repo.ts` includes a new `status`
      member, and `SORT_ORDER_OPTIONS` includes an entry for it with a label
      matching the pipeline order in the dropdown.
- [ ] `sortTasks(tasks, "status")` returns tasks grouped by status in
      `draft, inbox, ready, active, review, done` order, stable within a group,
      and does not mutate its input array.
- [ ] The persisted-value whitelist in `readSortOrderFromKey` accepts the new
      value, so a user who picks "Status" keeps it after a reload instead of
      silently falling back to `recent`.
- [ ] The story panel's sort dropdown renders the new option and selecting it
      reorders the visible task rows immediately.
- [ ] The work board's own sort dropdown is unchanged — "Status" is offered
      there only if it is already shared deliberately; otherwise the new mode
      must not appear on the board.
- [ ] The status pill in each story-panel task row is rendered in its status
      color, using the store's `statusColor()` (the same values as the work page
      column colors), with the border tinted from that same color.
- [ ] A status with no configured color falls back without throwing, matching
      the existing `statusColor` fallback.
- [ ] Unit tests cover the new sort mode (including stability within a status
      and the non-numeric/unknown-status path) and the pill's color binding.
- [ ] `bun run fmt` is clean and `repoos check --changed main` passes.
- [ ] The UI bundle is rebuilt (`bun run build:ui`) so the worktree build is
      fresh.

## Notes for AI

**Files to touch**

- `src/ui-app/src/stores/repo.ts` — `SortOrder` type, `SORT_ORDER_OPTIONS`,
  `readSortOrderFromKey` validation, `sortTasks` switch, and the
  `STATUS_COLORS`/`statusColor` exports are all here. Reuse `statusColor()`;
  do not add a second color table for statuses.
- `src/ui-app/src/components/StoryPanel.vue` — the Tasks tab markup
  (`sortedStoryTasks` rows and the `story-panel-task-status` span) and its
  imports.
- `src/ui-app/src/style.css` — the `.story-panel-task-status` rule. Per repo
  convention, shared/global styling for this component lives in `style.css`,
  not a `<style scoped>` block.
- `src/ui-app/tests/repo-sort-order.test.ts` and
  `src/ui-app/tests/story-panel.test.ts` — extend these rather than adding a
  new suite.

**Status order source of truth.** `STATUS_ORDER`
(`["draft","inbox","ready","active","review","done"]`) is duplicated in
`StoryPanel.vue`, `StoriesView.vue` and `WorkView.vue`. Use the pipeline order
for the sort; if extracting a shared constant is a one-line, low-risk cleanup
that removes a real copy-paste risk, do it — but do not refactor those three
files' behavior as part of this task.

**Assumptions picked (state them in the PR body if either is wrong)**

- The status dot already exists and already uses `statusColor`, so "color code
  the statuses" is interpreted as coloring the **status label pill**, not adding
  a new indicator.
- The pill is colored via an inline `style` bound to `statusColor(task.status)`,
  matching the existing dot. A `color-mix` tint for the border is preferred over
  a hard-coded rgba so the border tracks the color. Keep the tinted text
  readable — `repoos check` runs CSS layering and theme-contrast guards, so if a
  tint on a low-contrast status (e.g. `inbox` slate) fails the contrast guard,
  keep the label text at the status color and lighten the border rather than
  weakening the whole rule.

**Constraints**

- The story panel's sort preference and the work board's sort preference must
  remain independent (`repoos.storyPanel.sortOrder` vs
  `repoos.board.sortOrder`) — existing tests assert this.
- Any new dropdown here is the existing Radix `Select`; do not introduce an
  unstyled `<select>`.
- Do not add a runtime dependency.
- Do not auto-request a preview; previews are the human's call.

## Scope

**In:** the new `Status` sort mode for the story panel Tasks tab, its
persistence, and status coloring of the task-row status pill.

**Deferred:** color-coding task status anywhere else (task drawer, search
results, story cards on `StoriesView`); drag-and-drop reordering of the story
panel task list; grouping the rows under status headers when sorting by status;
adding a sort-by-status mode to the work board.

## Related

- `src/ui-app/src/stores/repo.ts` — `COLUMNS`, `STATUS_COLORS`, `statusColor`
  (work-page status colors) and `SORT_ORDER_OPTIONS`/`sortTasks`.
- `src/ui-app/tests/repo-sort-order.test.ts` — existing sort and
  per-surface-persistence tests this task extends.
- AGENTS.md, "UI sitemap" and "Conventions" — dropdown and shared-CSS rules.

## Original prompt

In the new Story panel task tab sort options add a sort by task status, and while you're at it color code the task statuses (the same colors as shown on the status columns on the work page).

## Screenshots

![Screenshot-2026-09-28-at-01.51.32](/api/tasks/0560/attachments/screenshot-1.png)

## Activity

- 2026-09-27T17:51:49Z · created · hello@repoos.org
- 2026-09-27T17:51:50Z · screenshots
- 2026-09-27T17:52:55Z · status draft→inbox, title, area, body
- 2026-09-27T18:47:01Z · cli_override, model_override
- 2026-09-27T18:47:04Z · model_override
- 2026-09-27T18:47:08Z · review_model_override
- 2026-09-27T18:47:08Z · status inbox→ready
- 2026-09-27T18:47:09Z · status ready→active, branch
- 2026-09-27T18:53:27Z · status active→review
- 2026-09-27T19:09:18Z · status review→done, release:success
