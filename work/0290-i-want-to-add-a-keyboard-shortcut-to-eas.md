---
id: "0290"
title: Add keyboard shortcuts to navigate task list (j/k) and open a task (Enter)
type: feature
status: done
priority: p2
area: ui
assigned_to: ai
created_by: hello@repoos.org
branch: feat/add-keyboard-shortcuts-to-navigate-task-
model_override: default
review_model_override: default
created_at: "2026-08-24T21:39:20Z"
updated_at: "2026-08-25T15:00:44Z"
---
## Goal

Make it fast to move through tasks in a list view using only the keyboard and then open a task, without reaching for the mouse.

## Suggested shortcuts

To keep it familiar (Gmail/GitHub-style), use `j` / `k` with optional `Shift` for faster movement, and `Enter` to open the highlighted task.

- `j` — move highlight down one task
- `k` — move highlight up one task
- `Shift+j` / `Shift+k` — move a page (chunk) at a time
- `Enter` — open the currently highlighted task
- `Esc` — clear the current highlight / close the open task and return focus to the list

Keep the arrows (`Up`/`Down`) as an equivalent to `j`/`k` for users who prefer them.

> If the board has global command-palette shortcuts already, prefer reusing/extending those rather than inventing a parallel system. This spec is deliberately arrow/vi-oriented, but the core requirement is: up/down moves focus in the list, Enter opens.

## Requirements

1. The list gains a single, visible highlight (a keyboard focus row), distinct from the hover style.
2. Key handling covers the task list view(s) that exist in the UI (the board/dashboard and/or the fuller work list) — wire up the primary list(s) and note any others as follow-ups, or implement across all list surfaces if the focus/keyboard layer is shared.
3. Highlight is constrained to the tasks currently on screen (moves within the visible/loaded list, not into virtualized gaps). Pagination-aware: scrolling or paging updates what is reachable.
4. `Enter` opens the highlighted task (same behavior as clicking it).
5. `Esc` clears the highlight without opening anything.
6. Shortcuts are ignored when focus is in an `input`/`textarea`/`contenteditable`, so typing task notes is unaffected.
7. The highlighted row is revealed/scrolled into view if it goes off-screen.
8. No change to existing single-key interactions (e.g. any shortcut the app already binds).

## Acceptance criteria

- Focusing a list and pressing `j`/`k` moves a visible highlight; arrows do the same.
- `Shift+j`/`Shift+k` moves by a larger step.
- Pressing `Enter` opens the highlighted task.
- Pressing `Esc` clears the highlight.
- Typing inside any text field does not trigger navigation.
- `repoos check` passes (build, typecheck, tests, UI smoke test).
- Update the UI smoke test or add a focused keyboard test if the harness supports dispatching key events.

## Out of scope / deferred

- Keyboard support in the command palette (if separate) unless trivially shared.
- Global shortcuts that work when focus is outside the app/list.
- Mobile/touch (keyboard-driven lists are a desktop affordance).

## Notes

- Suggest setting `area` to `ui` when moving out of draft (this is a UI interaction change).
- Confirm the exact list component(s) and whether they share a common keyboard/focus layer before implementing, to avoid duplicating handlers.

## Activity

- 2026-08-25T01:16:55Z · area, body
- 2026-08-25T05:49:44Z · status draft→inbox
- 2026-08-25T05:49:47Z · status inbox→ready
- 2026-08-25T05:49:52Z · status ready→active, branch
- 2026-08-25T09:39:17Z · status active→review
- 2026-08-25T09:55:36Z · review_model_override
- 2026-08-25T09:55:36Z · model_override
- 2026-08-25T15:00:44Z · status review→done, release:success
