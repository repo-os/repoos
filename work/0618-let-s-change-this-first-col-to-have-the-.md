---
id: "0618"
title: "Default first board column label to \"Draft\""
type: feature
status: review
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/default-first-board-column-label-to-draf
cli_override: pi
model_override: openrouter/deepseek/deepseek-v4.1-flash
created_at: "2026-10-01T18:08:13Z"
updated_at: "2026-10-01T18:24:26Z"
review_passes: 1
---
## Problem

The leftmost board column (`draft` status) ships with the default display label **Proposed / Drafts**. That string is long for a column header and does not match the succinct tone we want on the work board. Teams who want a different name can already override labels in `repoos.toml` under `[board.columns]`; the built-in default should be short.

## Desired UX

- On a fresh install (or any repo without a `board.columns.draft` override), the first column header reads **Draft**.
- Settings still exposes the same `board.columns.draft` control; saving a custom label continues to override the default.
- No change to status IDs, column order, or drag-and-drop behavior — display text only.

## Acceptance criteria

- [ ] `DEFAULT_COLUMN_LABELS.draft` in core config is **Draft** (not "Proposed / Drafts").
- [ ] UI fallbacks that hard-code the old default (e.g. store helpers, dashboard copy) use **Draft** so the board matches without a TOML override.
- [ ] Settings schema default/description for `board.columns.draft` reflects the new default.
- [ ] Tests that assert the draft column label expect **Draft** where they currently expect "Proposed / Drafts".
- [ ] `user-docs/configuration.md` (or other user-facing docs that list the default column labels) lists **Draft** for the first column.
- [ ] Existing repos that already set `board.columns.draft` in `repoos.toml` are unchanged (override still wins).

## Notes for AI

- Canonical default lives in `src/core/config.ts` (`DEFAULT_COLUMN_LABELS`); keep `src/ui-app/src/stores/config.ts` defaults in sync (duplicate today).
- Check `src/ui-app/src/stores/repo.ts`, `DashboardView.vue`, and `TaskDrawer.vue` — the drawer may special-case the old default string when showing a shorter "Draft" label; simplify or update that logic so it stays correct after the default changes.
- Do not rename the `draft` status ID, change `defaultStatus`, or reorder columns.
- Do not change this repo's `repoos.toml` `[board.columns]` unless needed for tests; local overrides are independent of code defaults.
- Run `bun run fmt` and scoped `repoos check --changed main` before handoff.

## Scope

- In scope: code defaults, UI fallbacks, tests, and user-docs for default column labels.
- Out of scope: renaming other columns, empty-state hint copy in `BoardColumn.vue`, or migrating every managed repo's `repoos.toml`.

## Related

- Prior column-label work: task #0396 / configurable `[board.columns]` (#0396).

## Original prompt

Let's change this first col to have the name "Draft" by default. I like short and succinct and user can rename in their toml anywan.

## Shots

```json
[{"target": "default", "route": "/work", "label": "Work board first column header reads Draft", "highlight": ".board-col:first-child .col-label"}, {"target": "default", "route": "/settings?tab=advanced", "label": "Settings draft column default reads Draft", "highlight": "#setting-board.columns.draft", "steps": [{"waitMs": 600}]}]
```

## Screenshots

![Screenshot-2026-09-30-at-14.40.25](/api/tasks/0618/attachments/screenshot-1.png)

## Activity

- 2026-10-01T18:08:13Z · created · hello@repoos.org
- 2026-10-01T18:08:14Z · screenshots
- 2026-10-01T18:08:22Z · cli_override
- 2026-10-01T18:08:40Z · status draft→inbox, title, area, body
- 2026-10-01T18:08:49Z · model_override
- 2026-10-01T18:08:51Z · status inbox→ready
- 2026-10-01T18:09:06Z · status ready→active, branch
- 2026-10-01T18:19:09Z · body
- 2026-10-01T18:23:42Z · status active→review
- 2026-10-01T18:24:26Z · note: shots: failed — capture of Settings draft column default reads Draft on "default" failed: goto: Timeout 30000ms exceeded.
