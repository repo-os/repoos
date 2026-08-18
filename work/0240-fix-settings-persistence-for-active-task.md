---
id: "0240"
title: Fix Settings persistence for active-task limit and Jelly theme
type: bug
status: ready
priority: p1
area: ui
assigned_to: ai
created_by: ""
branch: ""
pm_model_override: default
created_at: "2026-08-17T04:51:24Z"
updated_at: "2026-08-18T15:27:47Z"
---
## Activity

- 2026-08-17T04:51:24Z · created · unknown
- 2026-08-18T15:22:08Z · pm_model_override

## Problem

Settings persistence has three bugs:

**1. maxActiveTasks type mismatch silently breaks ALL saves (the main persistence bug)**

`fillForm()` in `src/ui-app/src/stores/config.ts:190-197` sets `form.maxActiveTasks` to a **number** (from the server config, which reads TOML integers). But the server's PATCH handler at `src/server/routes/config.ts:146-156` validates select fields with `valid.includes(val as string)` — the options are `['1','2',...,'20']` (strings), so `valid.includes(5)` returns `false` → 400 error.

Because `buildBody()` in `SettingsView.vue:111-125` sends **all** schema fields on every auto-save, changing *any* setting triggers a 400 when the unchanged `maxActiveTasks` (still a number) is included. The user sees a save error, and their intended change is silently dropped. The only workaround is to re-select maxActiveTasks from the dropdown before saving anything else.

**2. Jelly theme missing from sidebar quick-switcher**

`src/ui-app/src/components/Sidebar.vue:55-80` renders three theme buttons: Classic, Clear, Gen Z. Jelly is a valid `UiTheme` with full CSS support (`src/ui-app/src/style.css:1216-1328`), a schema option (`src/core/config.ts:405`), and a type union member (`src/core/types.ts:26`), but has no button in the sidebar — only reachable via the full Settings page.

**3. Sidebar theme switch doesn't update `config.form.uiTheme`**

`setUiTheme()` in `src/ui-app/src/stores/config.ts:123-132` updates `uiTheme.value` (the reactive ref the sidebar reads for button highlighting) and persists to the server, but does **not** update `config.form.uiTheme`. Compare with `setTheme()` at line 146 which does update `form.theme`. After switching from the sidebar, navigating to Settings shows the **old** theme in the dropdown.

## Desired UX

1. Changing any setting (e.g. toggling ntfy) persists correctly without requiring the user to re-select maxActiveTasks first.
2. Jelly appears as a fourth button in the sidebar theme switcher, styled identically to Classic/Clear/Gen Z.
3. After switching themes from the sidebar, the Settings page dropdown reflects the current theme.

## Acceptance criteria

- [ ] `fillForm()` converts select field values to strings so `form.maxActiveTasks` is always a string (e.g. `"5"`, not `5`)
- [ ] Auto-save after changing an unrelated setting succeeds without a 400 error
- [ ] Existing `whisper-config.test.ts` test ("persists the active-task limit as a number and keeps Jelly after reload") still passes
- [ ] Sidebar renders a Jelly button alongside Classic/Clear/Gen Z
- [ ] Sidebar Jelly button is visually active when `config.uiTheme === 'jelly'`
- [ ] Clicking sidebar Jelly button persists the theme and updates the Settings dropdown
- [ ] `repoos check` passes

## Notes for AI

**Files to touch:**

- `src/ui-app/src/stores/config.ts` — fix `fillForm()` to stringify select fields (line ~195), and fix `setUiTheme()` to update `form.uiTheme` (line ~127)
- `src/ui-app/src/components/Sidebar.vue` — add Jelly button (after line 79)
- `src/ui-app/tests/whisper-config.test.ts` — verify existing test still passes; consider adding a test for the string coercion path

**Do NOT:**
- Change the server-side PATCH handler or TOML writer — they work correctly
- Modify the schema definitions in `src/core/config.ts`
- Add runtime dependencies
- Touch `dist/` (it is gitignored)

## Activity

- 2026-08-18T15:27:47Z · body
