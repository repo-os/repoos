---
id: "0498"
title: Keep New input draft (text + screenshots) when the panel closes; add Clear buttons to New input and New task
type: feature
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: ""
pm_model_override: opencode/big-pickle
review_model_override: opencode/big-pickle
created_at: "2026-09-25T02:04:17Z"
updated_at: "2026-09-25T05:53:10Z"
---
## Problem

Starting a **New input** can take a while: you type a freeform explanation and often attach screenshots. But the moment the panel closes — to check something elsewhere — that work is silently destroyed. Reopening the panel (via the **New input** button or the ``?input=new`` deep link) shows a blank form: both the partially-written freeform text and the attached screenshots are gone, and there is no way to get them back.

The freeform **New task** flow behaves correctly — it deliberately keeps the partially-written explanation when the drawer closes and reopens (`TaskDrawer.vue` ~280-282: "Deliberately keep freeformText: the draft survives closing and reopening the drawer within a session. It is cleared only after a successful create.", from #0061). The **New input** panel does the opposite and wipes its draft at open time:

- `openNewInput()` in `src/ui-app/src/stores/ui.ts` resets `ui.inputText` and calls `clearScreenshots()` every time the panel opens.
- `NewInputPanel.vue` also `watch`es the panel-open flag and resets `ui.inputText = ""`, `submitted = false` and `clearScreenshots()` on open.

Closing the panel only flips `isNewInput` off; the next open then destroys whatever the user had typed and attached. Neither the New input form nor the freeform New task panel has a "Clear" button, so there is no deliberate way to discard a draft either — you can only lose it by accident.

## Desired UX

- A user who starts drafting a New input — text and/or screenshots — can close the panel, go do something else, and come back to find everything exactly as they left it, ready to continue and submit. Nothing is lost by closing the panel.
- The New input form has a visible **Clear** button at the top right of the freeform entry. It is the explicit, on-purpose way to discard a draft (text + attached screenshots); without it, partial work persists forever.
- The freeform **New task** panel gets the same **Clear** affordance (it has none today). Where New task already preserves partial input across close, "Clear" is the counterpart: a deliberate reset.

## Acceptance criteria

- [ ] A partially written freeform text in the New input panel survives closing the panel and reopening it in the same session — via either the **New input** button or the ``?input=new`` deep link.
- [ ] Screenshots attached in the New input panel are likewise preserved across close/reopen in the same session.
- [ ] Opening the **New task** panel (or another creation panel) does not wipe an in-progress New input draft, and vice versa — the input draft is isolated from the shared `pendingScreenshots` queue used by the New task flow (or the clears are scoped so the two panels never clobber each other).
- [ ] New input has a **Clear** button at the top right of the freeform entry. Clicking it clears the draft text AND the attached screenshots and returns the form to a pristine state (empty textarea, Submit disabled).
- [ ] The freeform **New task** panel has a matching **Clear** button at the top right of the "Describe the task" textarea that clears the freeform explanation and any pending screenshots.
- [ ] Successful submit still clears the draft so the next open starts clean (existing behavior), and a failed submit still restores the capture for retry (existing `submitInput` failure path).
- [ ] The `submitted` / "Creating your input" acknowledgment flow (#0325) is untouched: closing during in-flight creation keeps working, and "Create another input" returns to a clean form.
- [ ] Existing tests keep passing; new tests cover draft persistence across close/reopen, the Clear-button behavior (text + screenshots), and non-interference between the New input and New task drafts. Reference suite: `src/ui-app/tests/input-submit-ack.test.ts`.
- [ ] `repoos check` passes, including the UI smoke test; run `bun run build:ui` (or a full build) after the change so the worktree build is fresh.

## Notes for AI

- Files most likely to change:
  - `src/ui-app/src/stores/ui.ts` — stop wiping the input draft inside `openNewInput()` (~lines 213-222); consider giving the New input draft its own screenshot queue following the `pmScreenshots` precedent (~lines 176-183) so `openNewTask()`'s `clearScreenshots()` cannot clobber it.
  - `src/ui-app/src/components/NewInputPanel.vue` — remove the open-watch reset of text/screenshots (keep the `submitted` reset); add the Clear button at the top right of the freeform entry; keep the existing clear-after-`submit()`; keep the failure-recovery interplay with `repo.submitInput`.
  - `src/ui-app/src/components/TaskDrawer.vue` — add the Clear button to the freeform New task field header (the `.field-header` beside the "Describe the task" label) that clears `freeformText` and the pending screenshots.
  - Tests: extend/duplicate the patterns in `src/ui-app/tests/input-submit-ack.test.ts`.
- Reference behavior to copy: the freeform New task draft comment at `TaskDrawer.vue` ~280-282 and its open-watch — "draft survives closing and reopening … cleared only after a successful create". Apply the same pattern to `ui.inputText` + the input's screenshot queue.
- Mind the shared state: `ui.inputText` and `ui.pendingScreenshots` are shared between the New task and New input panels, and `openNewTask()` calls `clearScreenshots()`. Once the input draft persists this cross-talk becomes user-visible — isolate the input draft rather than relying on both panels never being opened in sequence.
- The `submitInput` failure path restores the capture into `ui.inputText`/`ui.pendingScreenshots` (`src/ui-app/src/stores/repo.ts` ~2284-2288) — keep that retry behavior working; verify it still holds with a persistent draft.
- Keep element IDs used by tests, voice dictate and deep links: `new-input-text`, `new-input-file`, `nt-freeform`.
- This task overlaps #0496 (New input panel styling standardization, currently in review) on `NewInputPanel.vue` — coordinate with its merge to avoid layout churn. Related persistence intent: #0382 (screenshots must never be lost).
- Repo conventions: dialogs are body-teleported so any new dialog CSS lives in `src/ui-app/src/style.css`; use the shared `Button` component; give Clear an explicit label/aria (e.g. "Clear draft").
- Do not auto-request a preview to verify — that is the human's call. Rebuild the UI (`bun run build:ui`) after changes.

## Scope

In scope: within-session persistence of the New input draft (text + attachments) across panel close/reopen; Clear buttons on the New input form and the freeform New task panel; isolating the input draft from the shared screenshot queue; tests.

Out of scope: persistence across a full page reload or tab close (localStorage/server-side draft storage — the freeform New task reference is session-only too, see #0061); styling changes to any panel (see #0496); behavior changes to the other creation panels (New story / New doc / New skill); the submitted-acknowledgment "Creating your input" flow itself.

## Related

- #0061 — Keep freeform new-task text when the drawer closes (the reference behavior to copy)
- #0325 — New input submit → acknowledgment flow (the panel structure this builds on)
- #0311 — Freeform new-task flow (acknowledgment + draft-survives-close pattern)
- #0496 — Standardize New input panel styling (touches the same component; coordinate)
- #0382 — Screenshots must never be lost (same persistence intent, PM chat)

## Original prompt

When I start to write a "new input" and need to close the panel to go somewhere else, when I come back what I had written in the "new input" free-form entry and what I had attached as screenshots were gone, please make it so it stays there for the user to come back and finish.  Also you could add a "clear" button to the top right of the freeform entry so the user has a way to clear if they want. also you can add a clear button on the "new task" if it's not there yet. currently the "new task" has the right behavior about not deleting a partially finished freeform entry, so copy that if you need to see an example.

## Activity

- 2026-09-25T02:04:17Z · created · hello@repoos.org
- 2026-09-25T02:07:18Z · note: Freeform PM run failed: the opencode agent timed out after 180s
- 2026-09-25T02:22:18Z · pm_model_override
- 2026-09-25T02:59:54Z · title, area, body
- 2026-09-25T03:00:06Z · status draft→inbox
- 2026-09-25T05:53:10Z · review_model_override
