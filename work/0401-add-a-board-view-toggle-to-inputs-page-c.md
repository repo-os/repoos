---
id: "0401"
title: Add board view toggle to Inputs page
type: feature
status: review
needs_input: true
needs_input_reason: review-failed
priority: p2
area: ui
assigned_to: ai
created_by: hello@repoos.org
branch: feat/add-board-view-toggle-to-inputs-page
cli_override: github copilot
model_override: default
review_cli_override: github copilot
review_model_override: default
created_at: "2026-09-18T04:26:52Z"
updated_at: "2026-09-18T04:54:05Z"
review_rounds: 1
review_passes: 1
handoff_signal_retry_count: 1
---
## Problem

The Inputs page only offers a list view. There is no board layout, so inputs cannot be scanned and worked the same way tasks are on the Work page — by status columns with the same board look and collapsible columns.

## Desired UX

On the Inputs page, the user can switch between the existing list view and a board view.

In board view, inputs are shown in columns in the same visual style as the task board on the Work page. Columns are collapsible the same way task-board columns are (click a column header/cap to collapse or expand).

Switching views does not remove list-view behavior; both modes remain available via the toggle.

## Acceptance criteria

- [ ] Inputs page has a control to toggle between list view and board view
- [ ] List view continues to work as it does today
- [ ] Board view lays out inputs in columns in the same board style as the Work page task board
- [ ] Board columns are individually collapsible / expandable, matching task-board collapse behavior
- [ ] Existing input open / resolve / status flows still work from board view (cards remain actionable)

## Notes for AI

- Primary surface: `src/ui-app/src/views/InputsView.vue` (list + status filters today). Mirror patterns from `src/ui-app/src/views/WorkView.vue`, `src/ui-app/src/components/BoardColumn.vue`, and `src/ui-app/src/lib/boardCollapse.ts`.
- **Assumption:** Board columns are the existing input statuses (`new`, `reviewing`, `processed`) already defined on the Inputs page — same labels/colors where practical.
- **Assumption:** Default to list view on first visit; persist the chosen view (e.g. localStorage) so the preference survives reload. If collapse state is persisted, use a **separate** key from the task board so the two boards do not share collapse state.
- Reuse existing board/collapse UI rather than inventing a new column component, unless inputs need a thin adapter (input cards vs task cards).
- Do not change input status model, API, or resolve flows beyond what’s needed to render and use the board.
- Do not remove or regress the current list + status filter UX.

## Scope

**In:** List/board toggle on Inputs; board layout styled like the Work board; collapsible columns.

**Out:** New input statuses; redesign of input detail/resolve drawer; unrelated Work-board changes.

## Original prompt

Add a board view toggle to inputs page (currently there's only a list view). Do it in the same board style as the task board on the work page. In the board view columns should be collapsible just like on the tasks board.

## Activity

- 2026-09-18T04:26:52Z · created · hello@repoos.org
- 2026-09-18T04:27:32Z · status draft→inbox, title, area, body
- 2026-09-18T04:31:52Z · model_override
- 2026-09-18T04:31:57Z · review_cli_override, review_model_override
- 2026-09-18T04:31:58Z · review_model_override
- 2026-09-18T04:32:14Z · status inbox→ready
- 2026-09-18T04:33:09Z · status ready→active, branch
- 2026-09-18T04:44:18Z · status active→review
- 2026-09-18T04:45:34Z · status review→active
- 2026-09-18T04:49:05Z · status active→review
- 2026-09-18T04:49:06Z · status review→active
- 2026-09-18T04:49:12Z · needs_input
- 2026-09-18T04:53:20Z · cli_override, model_override
- 2026-09-18T04:53:24Z · cli_override
- 2026-09-18T04:53:43Z · cli_override
- 2026-09-18T04:53:56Z · review_cli_override, review_model_override
- 2026-09-18T04:54:04Z · status active→review
