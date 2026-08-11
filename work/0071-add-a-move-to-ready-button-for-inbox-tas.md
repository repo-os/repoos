---
id: "0071"
title: "Add a \"Move to ready\" button for inbox tasks in the task panel"
type: feature
status: done
priority: p2
area: ui
assigned_to: ai
created_by: ""
branch: feat/add-a-move-to-ready-button-for-inbox-tas
created_at: "2026-08-11T03:20:53Z"
updated_at: "2026-08-11T05:17:08Z"
---
## Problem

The task detail panel (`TaskDrawer.vue`) gives dedicated, one-click action buttons for moving a task forward from several statuses — "Start work" for `ready`, "Pause work" for `active`, and "Move to done" for `review` (`src/ui-app/src/components/TaskDrawer.vue:766-824`). For `inbox` tasks, though, there's no equivalent shortcut: the only way to advance a task from `inbox` to `ready` inside the panel is the generic "move to" status `Select` dropdown. That's inconsistent with how every other actionable status is handled, and it's slower than the single click available elsewhere (and on the board's `TaskCard`, which already has a "Move to ready" action for `inbox` — `src/ui-app/src/components/TaskCard.vue:45-50`).

## Desired UX

When the panel is showing a task whose status is `inbox`, display a primary "Move to ready" button in the same action-button area used by the other statuses (directly below the "move to" label/Select, matching the placement and styling of the `ready`/`active`/`review` buttons). Clicking it calls the same status-change path the Select already uses (`setStatus` → `repo.setStatus(ui.active, "ready")`) and moves the task straight to `ready` — no extra confirmation step, consistent with "Start work" and "Pause work" (only "Move to done" has a confirm step, because it's destructive/merges a branch).

## Acceptance criteria

- [ ] When `ui.active.status === 'inbox'`, the task panel shows a "Move to ready" button in the action area below the "move to" Select, styled/placed consistently with the existing `ready`/`active`/`review` action buttons.
- [ ] Clicking "Move to ready" calls `repo.setStatus(ui.active, "ready")` (reusing the existing `setStatus` helper already wired to the Select) and updates the task's status without a confirmation dialog.
- [ ] The button is disabled while `ui.saving` is true, matching the disabled behavior of the other action buttons.
- [ ] The button does not appear for any other status, and existing buttons for `ready`, `active`, and `review` are unaffected.
- [ ] The "move to" Select dropdown continues to work as an alternative way to change status for all statuses, including `inbox`.

## Notes for AI

- Primary file: `src/ui-app/src/components/TaskDrawer.vue`. Add a new conditional block (`v-if="ui.active.status === 'inbox'"`) near the existing `ready`/`active` block at lines 766-790, following the same `class="field"` / `Button` structure.
- Reuse the existing `setStatus(status: string)` function (`TaskDrawer.vue:136`) rather than adding a new store call — call it with `"ready"`.
- Pick an icon consistent with the existing icon set already imported in this file (e.g. an arrow-forward style icon, similar in spirit to `TaskCard.vue`'s move icon at `src/ui-app/src/components/TaskCard.vue:42`); reuse whatever is already imported/available before adding a new icon import.
- Match button `variant` conventions used nearby — "Start work" uses `variant="accent"`, "Pause work" uses `variant="outline"`. Use your judgment for a sensible variant (e.g. `outline` or `accent`) consistent with the app's visual hierarchy for a non-destructive forward-progress action; there's no explicit user preference here.
- Do not touch `TaskCard.vue` — its `inbox` → `Move to ready` action already exists and is out of scope.
- Do not add a confirmation step; this action is non-destructive and should stay single-click like "Start work"/"Pause work".

## Scope

Covers only the task detail panel (`TaskDrawer.vue`). Does not change the board card actions, the status Select's list of options, or behavior for any status other than `inbox`.

## Activity

- 2026-08-11T03:20:53Z · created · unknown
- 2026-08-11T03:51:09Z · status inbox→ready
- 2026-08-11T13:12:00Z · status ready→review
- 2026-08-11T05:17:08Z · status review→done
