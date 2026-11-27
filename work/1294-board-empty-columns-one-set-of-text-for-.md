---
id: "1294"
title: "Board empty columns: one set of text for all themes, plus a setting to override it"
type: feature
status: inbox
priority: p2
area: [web, core]
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-27T22:00:43Z"
updated_at: "2026-11-27T22:00:44Z"
---
## Problem

Empty Work Queue columns show different text in the Gen Z theme than in the other themes, Draft is forced to a bare dash, and there is no way to choose the text.

## Desired UX

Every theme shows the same plain text for an empty column:

| Column | Text |
| --- | --- |
| Draft | No drafts yet |
| Inbox | Nothing waiting in the inbox |
| Ready | Nothing ready to start |
| Active | Nothing in progress |
| Review | No tasks waiting for review |
| Done | Nothing finished yet |

Settings gains one text field, "Empty column text". When filled (for example `-`), every empty board column shows that string. When blank, each column shows its default above.

## Acceptance criteria

- The Gen Z empty-column strings are removed; all themes use the table above.
- Draft shows "No drafts yet", both on the full board and when the board is filtered to one status.
- A new project setting in the `[board]` section of `repoos.toml` stores the override, registered in `getConfigSchema()` with a Settings UI control on the appropriate tab.
- A non-empty value replaces the text in every empty Work Queue column; blank or whitespace restores the defaults. The change shows without a server restart.
- Gen Z keeps its empty-column styling (including the small gradient square); only the wording changes.
- Collapsed columns and the Inputs page are unchanged.
- Tests cover the defaults, the override, the blank value and the Settings control.
- User docs describing board settings are updated.
- The tracked `repoos.toml` is not edited by this task.

## Notes for AI

Start at `src/ui-app/src/components/BoardColumn.vue` (`GENZ_EMPTY`, `PLAIN_EMPTY`) and `src/ui-app/src/views/WorkView.vue` (the two `empty-text` dash props). Follow how `board.doneCollapsedByDefault` is wired through `src/core/config.ts` and `src/core/types.ts`. No new dependencies and no other new UI.

## Screenshots

![Work Queue empty columns](/api/tasks/1294/attachments/att_9fa54638-2b31-42d1-9d6d-1a0715b1271f.webp)

## Activity

- 2026-11-27T22:00:43Z · created · t@t
- 2026-11-27T22:00:44Z · screenshots
