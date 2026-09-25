---
id: "0499"
title: "Fix Work board column labels: editable inputs, moved to Advanced"
type: feature
status: active
needs_input: true
needs_input_reason: watchdog-stuck
priority: p2
area: general
assigned_to: ai
created_by: hello@repoos.org
branch: feat/fix-work-board-column-labels-editable-in
pm_model_override: opencode-go/deepseek-v4.1-flash
review_model_override: opencode-go/hy3
created_at: "2026-09-25T02:04:35Z"
updated_at: "2026-09-25T16:11:22Z"
check_retry_count: 2
last_check_failure: "[object Object]"
handoff_signal_retry_count: 1
dev_error_count: 3
---
The "Column label: …" rows in Settings expose no input at all — six rows render
just a title and description, with an empty control area (see screenshot). They
also live on the **General** tab, where they don't belong. Fix the control and
move the whole thing to **Advanced** as its own section titled **"Work board
column labels"**.

## What's actually broken (confirmed in source)

1. **No input is rendered.** `getConfigSchema()` (`src/core/config.ts`,
   ~line 1554) exposes six `board.columns.<status>` fields as
   `type: "string"`, `tier: "live"`, so they fall into `config.visibleFields`
   and then `generalFields` (`SettingsView.vue` ~line 407) — they render on the
   General tab. But the General tab template (~line 677) only branches on
   `select` → `Select` and `boolean` → `Switch`. There is no `string` branch, so
   a `string` field renders label + description and nothing else. That is the
   "no place to enter anything" report.
2. **Nothing would save anyway.** `buildBody()` (`SettingsView.vue` ~line 541)
   explicitly `continue`s on `board.columns.*` with the comment "raw TOML-only —
   never sent via the curated save." Even if an input existed, the value would
   be dropped.
3. **The Advanced tab already has the missing piece.** It renders
   `config.guardedFields` (~line 1166) and has `Input` branches for
   `type === "string"` and `type === "array"`. The server route
   `patchConfig` (`src/server/routes/config.ts` ~line 266) iterates
   `getConfigSchema()` and accepts `string` fields, and `writeConfig`
   (`src/core/config.ts` ~line 1776) already knows how to write the
   `[board.columns]` section. So the save path exists; it just isn't wired for
   these keys from the UI.

## Desired behavior

- **General tab:** the six column-label rows no longer appear there.
- **Advanced tab:** a dedicated `Card` section with `sec-label`
  **"Work board column labels"** (matching the existing Advanced card style),
  containing six labeled text inputs — one per canonical column: `draft`,
  `inbox`, `ready`, `active`, `review`, `done`.
  - Row label should use the friendly column name (e.g. "Draft column",
    "Inbox column") and the description should say these are display labels
    only — the canonical status IDs, transitions, and frontmatter never change.
  - Prefill each input with the resolved label (override, else default) and
    show the default in the placeholder/description.
- **Persistence:** editing a field saves through the existing Settings
  auto-save, writing `[board.columns]` in `repoos.toml`. Reloading the page and
  the board (Work, Dashboard, CLI `repoos list`) shows the new labels.
- **Blank = reset to default.** Clearing an input restores that column's
  default label.
- **Validation mirrors the parser.** Values are trimmed; max 40 characters; a
  label may not duplicate another column's (defaults included), matching
  `parseBoardColumns()` (`src/core/config.ts` ~line 505). Invalid input shows an
  inline error and is not persisted — don't let the parser silently fall back
  and leave the user thinking their label "didn't stick."
- **Deep links still work.** `?focus=board.columns.draft` (`?setting=` alias)
  and the ⌘K index must switch to the Advanced tab before focusing the field.

## Implementation notes

- `SettingsView.vue`
  - Exclude `board.columns.*` from `generalFields` (add a
    `!field.key.startsWith("board.columns.")` clause, or a `group === "board"`
    filter if you prefer to tag the schema).
  - Add a `boardColumnFields` computed (`config.visibleFields.filter(f =>
    f.key.startsWith("board.columns."))`) and render it in a new Advanced `Card`.
    Order the six rows `draft, inbox, ready, active, review, done`.
  - In `buildBody()`, stop skipping `board.columns.*`. Normalize each value: if
    blank after trim, submit that field's schema `default` (which equals
    `DEFAULT_COLUMN_LABELS[status]`). This satisfies the server's non-empty
    `string` rule (~line 280) and makes blank mean "default" without a server
    change — `writeConfig` then persists the label explicitly.
  - Add per-field validation state; block `scheduleAutoSave` (or skip the key)
    while any board-column value is invalid, and surface the error inline.
  - Add `board.columns.*` to `FIELD_TAB` (or teach the focus watcher the
    `board.columns.` prefix) so deep links land on Advanced.
- Server/parser: no change expected for the default-substitution approach. If
  you'd rather not write explicit default labels to `repoos.toml`, the
  alternative is to let `patchConfig` accept a blank `board.columns.*` value and
  have `writeConfig` delete that line; note this in the diff if you take it,
  since it widens the server surface.
- Keep `DEFAULT_COL_LABELS` in `src/ui-app/src/stores/config.ts` and
  `DEFAULT_COLUMN_LABELS` in `src/core/config.ts` in sync (already duplicated by
  design); consider a shared constant only if it doesn't cross the UI/core
  bundle boundary.

## Tests

- Extend `src/ui-app/tests/board-column-labels.test.ts` (or add a focused
  `SettingsView` test) to assert:
  - the six label fields render on the **Advanced** panel, not General;
  - typing a new label includes `board.columns.<status>` in the PATCH body;
  - clearing a field submits the column's default (not an empty string);
  - duplicate/over-length input is rejected and does not auto-save.
- Existing board-label rendering tests (WorkView/DashboardView) must stay green.

## Docs

- `user-docs/configuration.md` → **Board column labels** section (~line 262):
  add that the labels are editable from **Settings → Advanced → Work board
  column labels**, and that clearing a field restores the default.
- Check the Settings tab copy/docs for any statement that these are
  TOML-only; update it.

## Acceptance criteria

- [ ] General tab no longer shows the column-label rows.
- [ ] Advanced tab shows a "Work board column labels" section with six text
      inputs, each showing its resolved label.
- [ ] Editing a label and leaving the field persists it to `[board.columns]`
      and it appears on the board (UI + CLI `repoos list`).
- [ ] Clearing a label restores and persists its default.
- [ ] Over-length (>40) and duplicate labels are rejected with an inline error
      and are not stored.
- [ ] `?focus=board.columns.draft` opens Advanced with the field focused.
- [ ] `repoos check` passes.

## References

- Feature that introduced labels: #0396 (and #0395) — display-only renames via
  `repoos.toml`.
- `src/core/config.ts`: `DEFAULT_COLUMN_LABELS`, `parseBoardColumns`,
  `resolveColumnLabels`, `getConfigSchema`, `writeConfig`.
- `src/ui-app/src/views/SettingsView.vue`: `generalFields`, `buildBody`,
  Advanced panel, `FIELD_TAB`.
- `src/server/routes/config.ts`: `patchConfig`.
- Screenshot: `work/.attachments/0499/screenshot-1.png`.

## Original prompt

FYI the column labels in the settings (general) don't work, there's no place to enter anything. Let's fix that and move this to advanced as it's own section called "Work board column labels".

## Screenshots

![Screenshot-2026-09-22-at-10.18.22](/api/tasks/0499/attachments/screenshot-1.png)

## Activity

- 2026-09-25T02:04:35Z · created · hello@repoos.org
- 2026-09-25T02:04:36Z · screenshots
- 2026-09-25T02:07:36Z · note: Freeform PM run failed: the opencode agent timed out after 180s
- 2026-09-25T02:22:04Z · pm_model_override
- 2026-09-25T02:59:51Z · title, body
- 2026-09-25T05:53:39Z · review_model_override
- 2026-09-25T05:53:40Z · status draft→inbox
- 2026-09-25T05:53:42Z · status inbox→ready
- 2026-09-25T05:53:44Z · status ready→active, branch
- 2026-09-25T06:06:17Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-09-25T06:08:46Z · status active→review
- 2026-09-25T06:08:46Z · status review→active
- 2026-09-25T06:08:46Z · agent exited with an error (cursor) · Server finalization: check
- 2026-09-25T06:26:12Z · needs_input
- 2026-09-25T08:04:51Z · agent exited with an error (cursor) · RetriableError: Connection failed repeatedly
- 2026-09-25T15:37:44Z · needs_input
- 2026-09-25T15:49:19Z · handoff failed · check failed after 2 automatic retries · repoos check failed: [2m Test Files [22m [1m[32m1 passed[39m[22m[90m (1)[39m · [2m      Tests [22m [1m[32m1 passed[39m[22m[90m (1)[39m · [2m   Start at [22m 23:49:13 · [2m   Duration [22m 2.48s[2m (transform 369ms, setup 5ms, import 445ms, tests 1.79s, environment 189ms)[22m · error: script "test" exited with code 1 · ✔ ui-smoke  — ran package.json smoke script · ⏭ macos-hub-icon-transparency  — skipped — no changed path matches macos/RepoOSHub/Assets.xcassets/**, macos/scripts/generate-app-icons.swift, macos/scripts/verify-dock-icon-transparency.swift, macos/scripts/verify-dock-icon-transparency.sh · 1 check(s) failed.
- 2026-09-25T15:54:22Z · watchdog: escalated to needs_input · check-failed-after-retries · check failed after 2 automatic retries · repoos check failed: [2m Test Files [22m [1m[32m1 passed[39m[22m[90m (1)[39m · [2m      Tests [22m [1m[32m1 passed[39m[22m[90m (1)[39m · [2m   Start at [22m 23:49:13 · [2m   Duration [22m 2.48s[2m (transform 369ms, setup 5ms, import 445ms, tests 1.79s, environment 189ms)[22m · error: script "test" exited with code 1 · ✔ ui-smoke  — ran package.json smoke script · ⏭ macos-hub-icon-transparency  — skipped — no changed path matches macos/RepoOSHub/Assets.xcassets/**, macos/scripts/generate-app-icons.swift, macos/scripts/verify-dock-icon-transparency.swift, macos/scripts/verify-dock-icon-transparency.sh · 1 check(s) failed. · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-09-25T16:11:22Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
