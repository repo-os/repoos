---
id: "0078"
title: "Add sort order control to Work Queue, default to most recently updated"
type: feature
status: ready
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-11T05:43:23Z"
updated_at: "2026-08-11T05:44:25Z"
---
## Problem

Tasks within each Work Queue column always render in a fixed order — status
rank, then priority rank, then task id (`src/core/indexer.ts:97-101`) — with
no way to change it. There's no way to see what's changed recently; a task
updated five minutes ago sits wherever its priority/id happens to place it,
mixed in with things untouched for weeks. Users need lists ordered by recency
by default, while still being able to fall back to the existing
priority-based order when that's more useful.

## Desired UX

- The Work Queue view gets a sort-order control (a dropdown, using the
  existing shadcn-vue `Select` component) in its header bar.
- Two options to start: **Most recently updated** (default) and **Current
  order** (the existing status → priority → id order).
- On first load, with no saved preference, the board sorts by most recently
  updated first.
- Changing the sort order re-sorts every column immediately, with no page
  reload.
- The chosen sort order is remembered across reloads, the same way collapsed
  column state is remembered today.

## Acceptance criteria

- [ ] A sort-order dropdown appears in the Work Queue header, offering "Most
      recently updated" and "Current order"
- [ ] Default sort (no saved preference) is "Most recently updated"
      (`updated_at` descending)
- [ ] "Current order" reproduces today's behavior: status rank, then priority
      rank, then task id
- [ ] Tasks with no `updated_at` sort to the bottom under "Most recently
      updated" rather than erroring or floating to the top
- [ ] Switching the dropdown re-orders all board columns immediately
- [ ] The selected sort order persists across page reloads (localStorage)
- [ ] `repoos check` passes; no new runtime dependencies

## Notes for AI

- Task rendering is `TaskCard v-for="t in repo.byStatus(col.id)"` in
  `src/ui-app/src/components/BoardColumn.vue:198`. `repo.byStatus`
  (`src/ui-app/src/stores/repo.ts:81`) is a plain status filter with no
  sorting — it preserves whatever order `/api/index` returned.
- The order tasks currently arrive in comes from the backend indexer
  (`src/core/indexer.ts:97-101`, `statusRank` → `priorityRank` → `id`). Do
  NOT remove or change this — it's the "Current order" option. Apply the new
  sort client-side, on top of `byStatus`'s output, rather than changing the
  backend.
- `updated_at` already exists on the `Task` type (`src/core/types.ts:61,88`,
  `src/ui-app/src/types.ts:27`) and is populated by `stampAndLog`-style
  writes (`src/core/task.ts:75`), but it's nullable and currently unused for
  sorting anywhere.
- Persist the preference with the same pattern `BoardColumn.vue` already
  uses for collapsed-column state (`localStorage` key
  `"repoos.board.collapsed"`, try/catch JSON parse/stringify — see
  `BoardColumn.vue:8,18-26,155-159`). Use a new key, e.g.
  `"repoos.board.sortOrder"`.
- Reuse the existing Select component
  (`src/ui-app/src/components/ui/select/`) for the dropdown instead of
  building a new one.
- Assumption: the sort order is a single global setting for the whole board,
  not per-column — the explanation didn't ask for independent per-column
  ordering, and a global control is simpler and matches how the collapsed
  state is scoped today.

## Scope

Covers the Work Queue board (`WorkView.vue` / `BoardColumn.vue`), the only
place task lists currently render — there's no separate backlog or
search-results list view to extend. Deferred: additional sort options beyond
these two (e.g. by title, by priority alone), per-column independent sort
order, and sorting for any future non-board list views.

## Related

- 0020 — established the Work Queue column ordering this task's "Current
  order" option preserves
- 0025 — adopted the shadcn-vue component library, source of the `Select`
  component this task reuses

## Activity

- 2026-08-11T05:43:23Z · created · unknown
- 2026-08-11T05:44:25Z · status inbox→ready
