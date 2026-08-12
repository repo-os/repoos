---
id: "0132"
title: Add search bar to model dropdowns
type: feature
status: ready
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-12T10:33:46Z"
updated_at: "2026-08-12T10:34:35Z"
---
## Problem

The model dropdown in the agent and per-task override pickers can show many entries — especially for opencode, which probes live `opencode models` output. As available models grow, scrolling through a long flat list without any filtering becomes frustrating. The user needs a way to narrow the list by typing.

## Desired UX

Every model `<Select>` dropdown in the UI gains a text input at the very top of its popover. Typing into that input filters the dropdown's visible `<SelectItem>` entries in real time using case-insensitive substring matching on the item's `label` (not its internal `value`). Items that don't match are hidden; items that do match remain selectable as normal. The "Default" option is never filtered out so there's always at least one safe fallback visible. The search input clears automatically when the popover closes so the next open starts with the full list.

The filter applies only to the model dropdown — other selects in the UI (e.g. the CLI picker) are unchanged.

## Acceptance criteria

- [ ] A search input appears at the top of the model select popover in the Agents page (both default and custom agent rows)
- [ ] A search input appears at the top of the model select popover in the TaskDrawer (both the freeform-creation tab and the Agent tab of the task detail)
- [ ] Typing filters the visible `<SelectItem>` entries by case-insensitive substring match on label; items clear and re-filter live on each keystroke
- [ ] The "Default" entry is never hidden by the filter
- [ ] Selecting a filtered item with keyboard or mouse works correctly and closes the popover
- [ ] The search text clears when the popover closes
- [ ] Keyboard focus moves naturally: input focuses on open, arrow keys navigate filtered items, Enter selects
- [ ] `repoos check` passes (build, typecheck, tests, UI smoke test)

## Notes for AI

- The Radix-Vue `Select` primitive does not ship a built-in search/combobox mode, so implement filtering by rendering an `<input>` as the first child inside `<SelectContent>` (before `<SelectViewport>`). Use `v-model` + a `computed` filtered list of the `modelsFor()` output, and iterate the computed list instead of the raw list when rendering `<SelectItem>`.
- The model options uniformly have shape `{ value: string; label: string; disabled: boolean }` from `config.modelsFor(cli, savedModel)`. Match against `m.label`, not `m.value`.
- Filter is case-insensitive: `m.label.toLowerCase().includes(query.toLowerCase())`.
- Always keep `m.value === "default"` visible regardless of the filter query.
- All instances use the same `<Select>` → `<SelectContent>` → `<SelectViewport>` → `<SelectItem>` structure. The cleanest approach is to add a new component (e.g. `ModelFilterInput.vue` or `SelectSearchGroup.vue`) that wraps the filtering logic and is slotted into the select popover, so it composes into every usage site without duplicating logic.
- Files that render the model dropdown and need the search input:
  - `src/ui-app/src/views/AgentsView.vue` — 2 select blocks (default agents ~line 317 and custom agents ~line 409)
  - `src/ui-app/src/components/TaskDrawer.vue` — 2 select blocks (freeform ~line 1002 and agent tab ~line 1546)
- The general-purpose `<SelectContent>` wrapper (`src/ui-app/src/components/ui/select/content.vue`) must not be modified — keep the search input out of the base select primitives.
- Do NOT add a runtime dependency. Radix-Vue is already in the project; do not add `@radix-vue/combobox` or any other package without explicit authorization.
- Assumption: the search clears on popover close by hooking `@update:open` (or similar) on the `<SelectRoot>`. Radix-Vue `SelectRoot` emits `@update:open` — use that to reset the filter query when the popover closes.

## Activity

- 2026-08-12T10:33:46Z · created · unknown
- 2026-08-12T10:34:35Z · status inbox→ready
