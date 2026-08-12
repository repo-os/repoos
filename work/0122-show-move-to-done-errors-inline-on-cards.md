---
id: "0122"
title: Show move-to-done errors inline on cards and in the task panel
type: feature
status: active
priority: p2
area: ui
assigned_to: ai
created_by: ""
branch: feat/show-move-to-done-errors-inline-on-cards
created_at: "2026-08-12T05:51:20Z"
updated_at: "2026-08-12T13:52:10Z"
---
## Activity

- 2026-08-12T05:51:20Z · created · unknown


## Problem

When **Move to done** fails (for example because of a merge conflict), RepoOS
currently reports the failure in a global toast. The toast is visually detached
from the action that caused it, can obscure unrelated controls, and makes it
harder to tell which task failed when working from the board.

The failure should stay with the task and the button the user clicked. This is
especially important because **Move to done** is available in two places: on a
review task's Work card and inside the task panel.

## Desired UX

- If **Move to done** fails from a Work card, show a red-tinted inline error card
  immediately below that card's button.
- If it fails from the task panel, show the same error treatment immediately
  below the panel's **Move to done** button.
- Keep long messages compact by clamping the collapsed error to two lines.
  Clicking the error expands it to show the full message; clicking again
  collapses it.
- Do not also show a global toast for the same move-to-done failure. The error
  remains clearly associated with the task and does not disrupt the rest of the
  board.

## Acceptance criteria

- [ ] A failed **Move to done** action from a Work card renders a red-ish error
      card directly below the button on that task card.
- [ ] A failed **Move to done** action from the task panel renders the same
      error card directly below the button in the panel.
- [ ] The error displays the server-provided message, including useful details
      such as conflicting file names; it does not replace a specific error with
      generic copy.
- [ ] Collapsed errors occupy at most two lines. When the message overflows,
      the error is visibly interactive and clicking it expands the full text;
      clicking again collapses it.
- [ ] Short messages do not imply that expansion is available when there is
      nothing more to reveal.
- [ ] The interaction is keyboard accessible, exposes expanded/collapsed state
      to assistive technology, and does not rely on color alone to communicate
      that an error occurred.
- [ ] A move-to-done failure does not also create a global error toast. Toasts
      for other failed actions are unchanged.
- [ ] Retrying **Move to done** clears or replaces the previous inline error;
      a successful retry removes it. Errors do not leak onto another task card
      or remain after the task leaves `review`.
- [ ] Card and panel layouts remain stable and usable at narrow/mobile widths,
      including long unbroken paths or error text.
- [ ] Focused UI/store tests cover card placement, panel placement, two-line
      clamping/expansion, retry/success cleanup, and suppression of the duplicate
      toast.
- [ ] `repoos check` passes.

## Notes for AI

- This is a presentation change for **Move to done** errors, not a change to the
  done/merge workflow or its server response.
- Reuse one error-card component or shared styling/behavior so the Work card and
  task panel remain consistent.
- Keep the error scoped by task ID in shared state if both surfaces use the
  store; do not use one global string that can appear under the wrong task.
- Preserve existing feed/history behavior unless it would duplicate a visible
  toast; this task only requests replacing the global toast for move-to-done
  failures.
- Likely touch points: `src/ui-app/src/stores/repo.ts`, the Work task-card
  component, the task-panel/drawer component, shared UI styles/component, and
  focused tests.
- Related: #0069 introduced global mutation toasts and inline done-failure
  reporting; #0108 simplified the move-to-done interaction.

## Activity

- 2026-08-12T06:04:02Z · status inbox→ready
- 2026-08-12T11:34:12Z · status ready→active, branch
