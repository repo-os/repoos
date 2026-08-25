---
id: "0290"
title: Add keyboard shortcuts to navigate task list (j/k/h/l) and open a task (Enter)
type: feature
status: review
priority: p2
area: ui
assigned_to: ai
created_by: hello@repoos.org
branch: feat/add-keyboard-shortcuts-to-navigate-task-
model_override: default
pm_model_override: default
review_model_override: default
created_at: "2026-08-24T21:39:20Z"
updated_at: "2026-08-25T14:17:10Z"
review_passes: 2
review_rounds: 1
handoff_signal_retry_count: 1
---
## Goal

Make it fast to move through tasks in a list view using only the keyboard and then open a task, without reaching for the mouse.

## Suggested shortcuts

Gmail/GitHub-style: `j` / `k` for vertical movement, `h` / `l` for horizontal movement, `Enter` to open the highlighted task.

- `j` / `Down` — move highlight down one task
- `k` / `Up` — move highlight up one task
- `h` / `Left` — move highlight left (previous column/group)
- `l` / `Right` — move highlight right (next column/group)
- `Shift+j` / `Shift+k` — move a page (chunk) at a time
- `Enter` — open the currently highlighted task
- `Esc` — close the currently open task panel first; only when no panel is open does it clear the highlight

> If the board has global command-palette shortcuts already, prefer reusing/extending those rather than inventing a parallel system. This spec is deliberately vi/arrow-oriented, but the core requirement is: up/down/left/right moves focus across the board, Enter opens.

## Requirements

1. The list gains a single, visible highlight (a keyboard focus row), distinct from the hover style.
2. Key handling covers the task list view(s) that exist in the UI (the board/dashboard and/or the fuller work list) — wire up the primary list(s) and note any others as follow-ups, or implement across all list surfaces if the focus/keyboard layer is shared.
3. Highlight is constrained to the tasks currently on screen (moves within the visible/loaded list, not into virtualized gaps). Pagination-aware: scrolling or paging updates what is reachable.
4. `Enter` opens the highlighted task (same behavior as clicking it).
5. `Esc` behavior is two-stage:
   - If a task panel is open, `Esc` closes the panel and keeps the task card highlighted.
   - If no panel is open, `Esc` clears the highlight.
6. Shortcuts are ignored when focus is in an `input`/`textarea`/`contenteditable`, so typing task notes is unaffected.
7. The highlighted row is revealed/scrolled into view if it goes off-screen.
8. No change to existing single-key interactions (e.g. any shortcut the app already binds).
9. Keyboard navigation is opted in/out via a Settings toggle (default off for the general user, but discoverable as a power-user/superuser setting). When off, no highlight and no key handling beyond existing app shortcuts.

## Acceptance criteria

- Focusing a list and pressing `j`/`k`/`h`/`l` moves a visible highlight; arrows (`Down`/`Up`/`Left`/`Right`) do the same.
- `Shift+j`/`Shift+k` moves by a larger step.
- Pressing `Enter` opens the highlighted task.
- With a task open, pressing `Esc` closes the panel and leaves the card highlighted; pressing `Esc` again (no panel open) clears the highlight.
- Typing inside any text field does not trigger navigation.
- The keyboard-nav toggle appears in Settings and defaults to off; nav only activates when enabled.
- `repoos check` passes (build, typecheck, tests, UI smoke test).
- Update the UI smoke test or add a focused keyboard test if the harness supports dispatching key events.

## Out of scope / deferred

- Keyboard support in the command palette (if separate) unless trivially shared.
- Global shortcuts that work when focus is outside the app/list.
- Mobile/touch (keyboard-driven lists are a desktop affordance).
- Persisting the highlight/selection itself (pick it up as a follow-up only if cheap).

## Notes

- `area` is `ui` (UI interaction change).
- Confirm the exact list component(s) and whether they share a common keyboard/focus layer before implementing, to avoid duplicating handlers.
- For horizontal nav (`h`/`l`), the board columns are the likely grouping; if a list view has no horizontal dimension, document that it degrades gracefully (highlight moves to adjacent item or is a no-op).

## Reviewer feedback (round 2)

Three requested changes from human review of the preview:

1. **Add horizontal navigation.** Support `h`/`l` and `Left`/`Right` to move between columns/groups, not just vertical `j`/`k`.
2. **Fix `Esc` semantics.** When a task panel is open, `Esc` must close the panel and keep the card highlighted — not unselect the card. Only a second `Esc` (no panel open) clears the highlight.
3. **Add a Settings toggle.** Keyboard nav should be opt-in (default off) for power users, not forced on everyone.

## Activity

- 2026-08-25T11:18:39Z · body
- 2026-08-25T14:01:27Z · model_override
- 2026-08-25T14:01:46Z · pm_model_override
- 2026-08-25T14:11:24Z · model_override
- 2026-08-25T14:15:47Z · status active→review
