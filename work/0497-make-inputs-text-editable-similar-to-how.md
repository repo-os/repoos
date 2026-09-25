---
id: "0497"
title: Make input text editable via an Edit Input modal
type: feature
status: review
priority: p2
area: ui
assigned_to: ai
created_by: hello@repoos.org
branch: feat/make-input-text-editable-via-an-edit-inp
created_at: "2026-09-25T02:03:08Z"
updated_at: "2026-09-25T03:15:02Z"
---
## Problem

Task specs are editable in place: the task drawer opens an "Edit spec" modal
(`SpecEditModal.vue`), the text is changed in a markdown textarea, and Save
persists it. Inputs have no equivalent — the text captured in an input
(the `body` of `inputs/*.md`) is read-only once created. The only mutable field
today is `status`: `PATCH /api/inputs/:id` (`src/server/routes/inputs.ts`) accepts
nothing else, and `updateInput` in `src/core/input.ts` only moves status.
Fixing a typo, trimming noise, or refining a captured idea currently requires
hand-editing the file, which the UI cannot express and which bypasses the
input-commit trail the API maintains.

## Desired UX

Editing an input feels exactly like editing a spec. From the input's detail
drawer in the Inputs view, the user opens an **Edit Input** modal — same shape
and behavior as the spec modal: a markdown textarea prefilled with the input's
current text, Cancel and Save actions, close on Escape or overlay click. Save
applies the new text through the API, the drawer re-renders with the saved
text, and the change is committed via the same input-commit path the server
already uses. No file hand-editing, no stale drawer.

## Acceptance criteria

- [ ] The input drawer offers an edit affordance for the input's text (e.g. an
      "Edit" button or pencil icon) that opens an "Edit Input" modal
- [ ] The modal mirrors the spec edit modal: markdown textarea prefilled with
      the current body, Cancel/Save actions, Escape and overlay-click close,
      keyboard reachable, voice-dictate support matching the spec modal
- [ ] Save persists the new text: the core input update path accepts a body
      change, the HTTP route carries it, and the store in
      `src/ui-app/src/stores/repo.ts` exposes an action for it
- [ ] After saving, the drawer and the inputs list reflect the new text
      without a manual reload
- [ ] Cancel (or closing without saving) leaves the input unchanged
- [ ] Nonexistent input → 404; empty/whitespace-only body → 400, in the
      route's existing validation style
- [ ] Tests cover the core update, the route, and the UI flow (`bun run test`)
- [ ] `repoos check` passes

## Notes for AI

- The pattern to mirror is `src/ui-app/src/components/SpecEditModal.vue`
  ("Edit spec"), opened from `TaskDrawer.vue`. Reuse it directly if its props
  fit, or add a sibling `InputEditModal.vue` next to it; keep modal CSS in
  `src/ui-app/src/style.css` alongside the existing `sm-modal` rules (search
  "Spec edit modal").
- Server side: extend rather than duplicate — teach `updateInput` /
  `patchInput` to accept an optional body alongside `status`, and keep going
  through `commitInput` so the activity trail stays consistent.
- The drawer lives inline in `src/ui-app/src/views/InputsView.vue`
  (deep-linked via `?input=`); the edit affordance belongs there.
- Any fixed/fullscreen overlay must be wrapped in `<Teleport to="body">` (or a
  Radix `DialogPortal`) — repo convention. Use the styled Dialog primitives in
  `src/ui-app/src/components/ui/dialog/*`, not an unstyled modal.
- Zero runtime dependencies.
- **Assumption:** "text" means the input's markdown body, and the edit affordance
  lives in the input detail drawer (the spec parallel — specs are edited from
  the task drawer). The title is not a separately editable field; since
  `createInput` derives the title from the body's first line, decide
  deliberately whether a body edit re-derives it and state the choice in the
  change description.

## Scope

Covers: editing an existing input's text via an "Edit Input" modal, plus the
backing core/server/store changes and tests. Deferred: editing the title as an
independent field, inline editing on the board card, batch edits, and editing
attachments.

## Related

- #0345 (inputs drawer and `?input=` deep-linking)
- Spec-editing precedent: `src/ui-app/src/components/SpecEditModal.vue`

## Original prompt

Make inputs text editable similar to how the task spec is editable (use a modal for editing too - Edit Input).

## Screenshots

![Screenshot-2026-09-23-at-00.33.42](/api/tasks/0497/attachments/screenshot-1.png)

## Activity

- 2026-09-25T02:03:08Z · created · hello@repoos.org
- 2026-09-25T02:03:08Z · screenshots
- 2026-09-25T02:05:09Z · status draft→inbox, title, area, body
- 2026-09-25T02:21:47Z · status inbox→ready
- 2026-09-25T03:01:09Z · status ready→active, branch
- 2026-09-25T03:15:02Z · status active→review
