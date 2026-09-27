---
id: "0556"
title: Add task sorting to the Story panel Tasks tab
type: feature
status: ready
priority: p2
area: ui
assigned_to: ai
created_by: hello@repoos.org
branch: ""
review_model_override: opencode-go/hy3
created_at: "2026-09-27T15:56:03Z"
updated_at: "2026-09-27T16:13:59Z"
---
## Problem

The Story panel's Tasks tab (`StoryPanel.vue`, the `tasks` tab) renders `story.tasks` in whatever order the story's task list arrived — effectively unsorted for grouping purposes. The Work page, by contrast, has a sort dropdown with four modes (Most recently updated, Priority level, Task number newest, Task number oldest) that a user can pick from.

So within a story with more than a handful of tasks, there is no way to see them by recency, by task number, or grouped by priority — the exact ordering questions that matter when picking the next task to work on inside a story. Every other list in the product either has this control or is small enough not to need it; the Story panel is the gap.

## Desired UX

- The Story panel's **Tasks** tab gets a sort dropdown, visually and behaviorally identical to the Work page's sort dropdown (same `Select` / `SelectTrigger` / `SelectContent` / `SelectItem` composition, same size and placement idiom, same option labels).
- The four options are the Work page's set, unchanged in label and meaning:
  - Most recently updated
  - Priority level
  - Task number newest
  - Task number oldest
- Default is **Most recently updated**, matching the Work page default.
- Choosing an option immediately reorders the task list in place, without closing or reopening the panel and without moving the user off the Tasks tab.
- The chosen option persists across page reloads (localStorage), the same way the Work page's choice does.
- Task numbers compare numerically, so `#100` sorts above `#99`, not below it.
- The empty state ("no tasks on this story") and the per-status summary line in the Details tab are unaffected.

## Acceptance criteria

- [ ] The Story panel Tasks tab renders a sort dropdown using the same styled `Select` component and trigger styling as the Work page toolbar — no unstyled `<select>`.
- [ ] The dropdown offers exactly four options, labelled "Most recently updated", "Priority level", "Task number newest", "Task number oldest".
- [ ] "Most recently updated" orders by `updated_at` descending, with tasks missing `updated_at` sorted last.
- [ ] "Priority level" groups p0 → p1 → p2 → p3 in that order, and is stable within a priority group.
- [ ] "Task number newest" orders by the numeric value of the task id, descending.
- [ ] "Task number oldest" orders by the numeric value of the task id, ascending.
- [ ] Non-numeric task ids (e.g. legacy or tag-style ids) sort last under both task-number options rather than throwing or producing `NaN` ordering.
- [ ] The default selection on first open is "Most recently updated".
- [ ] The selected option is persisted to `localStorage` under its own key and restored on reload.
- [ ] Changing the option re-sorts the visible list immediately, with the panel and tab staying open.
- [ ] The Work page's own sort selection and behaviour are unchanged by this work.
- [ ] Reopening a different story shows that story's tasks in the currently selected sort order.
- [ ] A store test covers each sort mode (including the non-numeric-id case); the UI smoke test still passes with the new control.

## Notes for AI

- The sort machinery already exists in `src/ui-app/src/stores/repo.ts`: the `SortOrder` type (`"recent" | "current" | "taskNumberNewest" | "taskNumberOldest"`), the `SORT_ORDER_OPTIONS` array, the `taskNumberValue()` helper, and the comparator switch inside `byStatus()`. Reuse all four — do not duplicate a parallel set of options, labels, or comparators for the story list. The `"current"` mode reuses the backend's status/priority/id order, which is what "Priority level" means here; if that works cleanly, factor the shared comparators into a small exported helper (e.g. `sortTasks(tasks, order)`) that `byStatus()` and the new story path both call.
- Add a second, independent reactive value alongside `sortOrder` — e.g. `storySortOrder` / `setStorySortOrder` — persisted under a new `localStorage` key (following the existing `repoos.board.sortOrder` convention). It must not alias the board's `sortOrder`: the two surfaces are read independently, and sharing one ref would couple them.
- `StoryPanel.vue` currently iterates `story.tasks` directly (the `tab === 'tasks'` branch). Sort a derived array there rather than mutating the prop or the source list. Be aware the panel receives the story as a prop (`MergedStoryGroup<Task>`), not via the store — so either expose a store-level sorted accessor and read it in the panel, or sort in a `computed` in the panel using an exported comparator. Don't reach into `props.story` and reorder it in place.
- Follow the repo conventions: the custom styled dropdown for any new dropdown, `src/ui-app/src/style.css` for shared/teleported styles rather than a component `<style scoped>` block, and no `position: fixed` overlay outside a `<Teleport>`.
- Assumptions I made, since the request left them open:
  - The option set is exactly the Work page's existing four — the request's "priority level…" was trailing off but the intent reads as the same four options, so no new mode is being invented.
  - The story list's own persistence key is separate from the board's, so a user who prefers a different order on the board is not forced into the same choice inside a story panel.
  - Sorting is purely presentational and applies to the whole story's task list, not per-status sub-grouping — the Story panel's Tasks tab shows a flat list today and this change does not restructure it.
  - Default is "Most recently updated" (same as the board default) rather than preserving the incoming backend order.
- Rebuild the UI after the change (`bun run build:ui`) so the worktree build is fresh. Do not start a server or request a preview as part of finishing.
- No backend change, no schema change, and no new runtime dependency. If a genuinely new sort mode turns out to be needed, stop and file it rather than widening the option list silently.

## Scope

In scope:
- Sort control on the Story panel Tasks tab
- Reuse/extraction of the existing sort types, options and comparators
- A store value + persistence for the story panel's choice
- Store test coverage for the sort modes

Deferred:
- Any new sort modes beyond the four listed
- Server-side sorting, or making the sort order shareable/team-wide
- Per-status grouping, filters, or search inside the Story panel's Tasks tab
- Sorting on other drawers (task panel, input panel) or the story *list* view

## Original prompt

Let's add sorting to tasks on the Story panel Tasks tab. Use the same sorting dropdown style as the Work page. Options for sorting here should be: Last updated, task number up, task number down, priority level...

## Screenshots

![Screenshot-2026-09-27-at-23.07.45](/api/tasks/0556/attachments/screenshot-1.png)

## Activity

- 2026-09-27T15:56:03Z · created · hello@repoos.org
- 2026-09-27T15:56:04Z · screenshots
- 2026-09-27T15:56:41Z · status draft→inbox, title, area, body
- 2026-09-27T16:11:46Z · status inbox→ready
- 2026-09-27T16:13:59Z · review_model_override
