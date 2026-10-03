---
id: "0634"
title: Add delete buttons to input and story side panels
type: feature
status: review
priority: p2
area: [web, server]
assigned_to: ai
created_by: hello@repoos.org
branch: feat/add-delete-buttons-to-input-and-story-si
model_override: openrouter/openrouter/auto-beta
review_cli_override: opencode
review_model_override: openrouter/openrouter/pareto-code
created_at: "2026-10-03T08:00:36Z"
updated_at: "2026-10-03T11:02:26Z"
review_passes: 2
review_rounds: 1
---
## Problem

The task side panel exposes a **Delete task** control at the bottom of the Details tab (destructive button in the shared `.delete-zone`, with a confirmation dialog). Inputs and stories have side panels with the same drawer pattern, but there is no equivalent way to remove an input or a story from the UI. Users must delete files manually or leave unwanted records in place.

## Desired UX

- **Input side panel** (`InputsView` detail drawer): add a **Delete input** button at the **bottom left** of the panel, visually and structurally aligned with **Delete task** (`Button` `variant="destructive"` `size="sm"` inside `.delete-zone` in `TaskDrawer.vue`).
- **Story side panel** (`StoryPanel.vue`): add a **Delete story** button in the same position and styling—bottom left on the **Details** tab (where story metadata already lives), matching the task panel layout.
- Clicking either delete control opens a **shared-dialog** confirmation (same pattern as `DeleteTaskDialog.vue`: body-teleported `ui/dialog/*`, Cancel + destructive confirm, busy/disabled while the request runs). Never use native `alert()` / `confirm()`.
- On confirm, the input or story is removed through the server (like `DELETE /api/tasks/:id`), the panel closes, and the list/index updates without a full reload.

## Acceptance criteria

- [ ] Input detail drawer shows **Delete input** at the bottom left in a `.delete-zone` consistent with the task Details tab.
- [ ] Story panel **Details** tab shows **Delete story** at the bottom left with the same button and zone styling as **Delete task**.
- [ ] Both actions use a confirmation modal patterned on `DeleteTaskDialog` (title, description naming the item, Cancel, destructive confirm, loading label while deleting).
- [ ] `DELETE` API routes exist for inputs and stories (or equivalent server handlers), mirroring task delete: remove the backing file(s), update the live index, return success; 404 when missing.
- [ ] `repo` store exposes `deleteInput` / `deleteStory` (or one shared helper) wired to those routes; SSE/index refresh removes the item from Inputs and Stories views.
- [ ] After a successful delete, the open panel closes and deep links (`?input=`, `?story=`) clear appropriately.
- [ ] UI tests or route tests cover happy path and not-found; `repoos check --changed main` passes.
- [ ] Rebuild UI after changes (`bun run build:ui` or full build).

## Notes for AI

- **Reference implementation:** `TaskDrawer.vue` (`openDeleteConfirm`, `deleteTask`, `.delete-zone` ~lines 4509–4517), `DeleteTaskDialog.vue`, `repo.deleteTask` + `deleteTask` in `src/server/routes/tasks.ts` / `deleteTaskFile` in `src/server/write.ts`.
- **Input panel** lives in `src/ui-app/src/views/InputsView.vue` (dialog drawer, no tab strip)—place the delete zone at the bottom of `.drawer-body.input-detail`, not only when status is `processed`.
- **Story panel** is `src/ui-app/src/components/StoryPanel.vue`; put the delete zone on the **Details** tab content (`.story-panel-facts`), not on Story / PM / Tasks tabs, to match where **Delete task** sits.
- **Backend:** `src/core/input.ts` has no `deleteInput` today; story definitions live under `stories/` via `src/core/story-definition-files.ts` with no delete helper yet. Add core + route handlers and register them in `src/server/server.ts` (document new routes in the file header comment block). Reuse path guards / commit patterns used for task and input writes. `input-enrichment.test.ts` already assumes an input may be deleted while PM runs—deletion should remain safe (no crash; in-flight enrichment should fail gracefully).
- **Story delete semantics (assumption):** remove the story **definition file** when the story is registered; if the story exists only as a task tag with no `stories/*.md` file, either hide **Delete story** or show a clear confirmation that only the definition can be removed—pick the behavior that matches how registered vs derived stories are represented in `MergedStoryGroup`, and document the choice in a short code comment if non-obvious. Do **not** silently retag or delete tasks unless product logic already exists elsewhere.
- Prefer a small shared confirm component or parameterized dialog over three copy-pasted modals, but keep copy specific (“Delete input?”, “Delete story?”).
- Follow AGENTS.md: styled dialogs only, `data-overlay-layer` on any custom teleport overlay, no `repoos serve` / preview unless the human asks.
- Task **#0634** may include a screenshot of the task **Delete task** placement; match that layout.

## Scope

In scope: delete buttons, confirm dialogs, server delete paths, store wiring, and tests for input and registered-story deletion.

Out of scope: bulk delete, undo, archiving, and changing enrichment or PM behavior beyond handling delete during in-flight runs.

## Related

- Task drawer delete pattern and `DeleteTaskDialog.vue`
- Story side panel (#0502) — `StoryPanel.vue`
- Input numbering tests note behavior after file removal (`src/ui-app/tests/input-numbering.test.ts`)

## Original prompt

Let's add a "Delete input" button at the bottom left of the input side panel (similar to the "delete task" button on the task panel bottom left). Also while we're at it let's add a "Delete story" button to the story side panel in the bottom left as well (use same styling/structure for all of these delete buttons to match the delete task button).

## Screenshots

![Screenshot-2026-10-03-at-15.33.46](/api/tasks/0634/attachments/screenshot-1.png)

## Shots
```json
[
  {
    "label": "Input detail drawer with Delete input control",
    "target": "default",
    "route": "/inputs",
    "highlight": ".input-detail .delete-zone",
    "steps": [
      {
        "click": ".input-row:nth-child(1)"
      },
      {
        "waitMs": 300
      }
    ]
  },
  {
    "label": "Story Details panel with Delete story control",
    "target": "default",
    "route": "/stories",
    "highlight": ".story-panel-facts .delete-zone",
    "steps": [
      {
        "click": ".story-head:nth-child(1)"
      },
      {
        "waitMs": 300
      },
      {
        "click": ".drawer-tabs .tab-btn:nth-child(4)"
      },
      {
        "waitMs": 300
      }
    ]
  }
]
```

## Activity

- 2026-10-03T08:00:36Z · created · hello@repoos.org
- 2026-10-03T08:00:37Z · screenshots
- 2026-10-03T08:01:34Z · status draft→inbox, title, area, body
- 2026-10-03T08:13:58Z · review_cli_override
- 2026-10-03T08:21:41Z · review_model_override
- 2026-10-03T08:21:57Z · status inbox→ready
- 2026-10-03T08:21:58Z · status ready→active, branch
- 2026-10-03T08:51:13Z · body: section Shots
- 2026-10-03T09:50:37Z · status active→review
- 2026-10-03T09:50:43Z · note: shots: failed — capture of Input drawer with Delete input at bottom left on "default" failed: click: Error: strict mode violation: locator('.input-row') resolved to 14 elements:
- 2026-10-03T09:51:53Z · status review→active
- 2026-10-03T10:07:50Z · status active→review
- 2026-10-03T10:07:59Z · note: shots: failed — capture of Input drawer with Delete input at bottom left on "default" failed: click: Error: strict mode violation: locator('.input-row') resolved to 14 elements:
- 2026-10-03T10:25:18Z · review_cli_override, review_model_override
- 2026-10-03T10:25:21Z · review_model_override
- 2026-10-03T10:26:06Z · model_override
- 2026-10-03T10:26:47Z · status review→active
- 2026-10-03T10:31:25Z · body: section Shots
- 2026-10-03T10:31:36Z · body: section Shots
- 2026-10-03T10:31:42Z · status active→review
- 2026-10-03T10:32:01Z · note: shots: failed — capture of Story Details panel with Delete story control on "default" failed: click: Timeout 5000ms exceeded.
- 2026-10-03T10:47:03Z · status review→active
- 2026-10-03T11:02:26Z · status active→review
