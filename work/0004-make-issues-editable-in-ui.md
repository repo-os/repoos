---
id: "0004"
title: Make issues editable in UI
type: feature
status: review
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/0004-edit-task-panel
created_at: "2026-05-29T00:00:00Z"
updated_at: "2026-08-06T08:03:43Z"
---
## Activity

- 2026-05-29T00:00:00Z · created · (migrated)
- 2026-06-19T06:32:34Z · status inbox→ready
- 2026-08-06T07:46:22Z · spec fleshed out: full edit form in task drawer · ai
- 2026-08-06T07:50:00Z · status ready→active
- 2026-08-06T07:58:00Z · status active→review

## Problem

The task drawer is read-only except for the status select. Editing a task's
title, type, priority, area, assignee, branch, or spec body requires hand-
editing the `work/*.md` file outside the app (filesystem, git, or an agent).
The server plumbing for all of these already exists — `TaskPatch` /
`patchTaskFile` in `src/server/write.ts` handles `status, title, priority,
area, assignedTo, branch, type, body` and records each change in the task's
activity log — but the UI never calls it except for status. The gap is the
drawer, not the backend.

## Desired UX

The task drawer's detail view becomes an edit form. Every user-owned field is
editable; identity and server-managed metadata stay read-only.

**Editable fields:**
- title (text input)
- type (select: feature / bug / chore / spec / refactor)
- priority (select: p0 / p1 / p2 / p3)
- area (text input)
- assigned_to (select: unassigned / ai / human, plus free text)
- body — the spec markdown (monospace textarea, edited verbatim)
- status — keeps its existing instant-apply select (already shipped)

**Branch is derived, not typed.** The branch field is read-only in the UI. It
is auto-derived from the title (`feat/<slugified-title>`) and written on Save
— but only when the branch is unset or was itself previously derived. An
explicit branch such as `feat/0026-delete-tasks` is never clobbered by a
title edit.

**Title + branch lock once a task is in flight.** Title and branch are frozen
(rendered read-only) once the task's status is `active`, `review`, or `done` —
renaming a task you're already working on would break its git branch and
agent references. They stay editable while the task is `inbox`/`draft`/`ready`.

**Spec is a card, not a textarea.** The body renders as a readable card. Click
it to expand it into a large monospace textarea; Save applies it and collapses
back to the card.

**Save model (recommended): explicit Save button.**
- Edits stage into a local draft; nothing is written until Save.
- While the draft is dirty, a highlighted callout bar appears at the BOTTOM of
  the drawer (a footer pinned under the scroll area): an amber dot + "Unsaved
  changes · Save to apply your edits" plus Cancel/Save buttons. It is hidden
  entirely when the draft matches the on-disk task.
- Save issues ONE `PATCH /api/tasks/:id` with only the changed fields → one
  disk write, one `task.updated` SSE event, one "updated #id (title, area…)"
  feed entry, `updated_at` bumped once. The bar disappears on save.
- Cancel (or closing the drawer) discards the draft; a task is never written
  to disk mid-edit.
- Status remains instant-apply and is NOT part of the draft (existing
  behavior, so `task.updated` from a status change must not clobber the
  draft's dirty state).

**Not editable (rendered as read-only metadata):**
- `id` and `path` — identity, derived from the filename. Renaming a task is a
  separate feature.
- `created_at` / `updated_at` — server-managed timestamps.
- `created_by` — attribution set at creation.
- `assignee` — derived from `assigned_to`; editing the assignee means editing
  `assigned_to`.
- git facts (branch exists, last commit) — live server metadata.
- unknown frontmatter (`extra`) — preserved on write, not surfaced in the UI.

## Acceptance criteria

- [ ] title, type, priority, area, assigned_to, and body are all editable from
      the drawer and persist to the task file on Save
- [ ] branch is read-only; a planning-stage title edit derives
      `feat/<slugified-title>` on Save, and an explicit branch is preserved
- [ ] title and branch render read-only once status is active/review/done
- [ ] spec body renders as a readable card; clicking it opens a large
      textarea, and Save applies and collapses it
- [ ] Save sends a single PATCH with only the changed fields; no-op (disabled)
      when the draft matches the on-disk task
- [ ] After Save: the file on disk reflects the edits, the feed logs an
      "updated #id (…)" entry, `updated_at` bumps, and other connected
      clients update live (existing `task.updated` SSE path)
- [ ] Closing the drawer without Save discards the draft and changes nothing
      on disk
- [ ] A concurrent `task.updated` for the open task (e.g. an agent edit) does
      not silently clobber unsaved draft edits
- [ ] Non-editable fields render read-only: id, path, created_at, updated_at,
      created_by, assignee (derived), git facts
- [ ] `repoos check` passes

## Notes for AI

- **Server needs no changes.** `TaskPatch` + `patchTaskFile`
  (`src/server/write.ts`) already validate, merge, activity-log, and write
  every editable field. `PATCH /api/tasks/:id` (`src/server/server.ts:321`)
  re-parses and returns the fresh task.
- **UI store:** generalize `setStatus` (`src/ui-app/src/stores/repo.ts:152`)
  into a `patchTask(id, fields)` action reusing `JSON_OPTS("PATCH", …)`.
- **Store → drawer resync:** the `task.updated` handler
  (`src/ui-app/src/stores/repo.ts:92`) already calls `ui.open(e.task)` for the
  active task. The drawer must merge that into its draft WITHOUT marking the
  form dirty when it matches (and without stomping edits the user is typing).
  Simplest robust approach: keep an explicit `dirty` flag keyed on the
  non-status fields; resync only when the draft is clean, or on Save.
- **Draft lifecycle:** copy task fields into local reactive state when the
  drawer opens (`ui.open` / `ui.openTask`), not on every render.
- **Body editing:** a plain `<textarea>` of the raw markdown is acceptable; a
  markdown preview is out of scope.
- `repoos check` runs the compiled `dist/` — rebuild (`bun run build`) before
  trusting output, and regenerate screenshots (`node
  scripts/capture-screenshots.mjs`) after any `src/ui-app` change.
- The previous "Mission Control" work established the pattern this builds on:
  status card ordering + clickable statuses (0020) and the delete-with-confirm
  drawer action (0026).

## Scope

- **This task**: the drawer edit form (editable fields above + explicit Save),
  wired through the existing PATCH path and `task.updated` SSE.
- **Defer to a SEPARATE task**: editing/adding tags, markdown preview or
  rich-text body editor, renaming a task (changing id/path), editing
  `created_by`, editing unknown frontmatter keys, drag-to-reorder status
  moves.

## Related

- 0026 established the drawer danger-zone + confirm pattern and the
  `deleteTaskFile` write path; this task extends the same drawer's editing
  surface.
- Completes the edit story that today only works via direct file editing.

## Activity

- 2026-08-06T08:03:40Z · title
- 2026-08-06T08:03:43Z · title
- 2026-08-06T08:45:00Z · refined UX: branch auto-derived from title (not typed),
  title+branch locked once status is active+, spec renders as a click-to-edit
  card · ai
- 2026-08-06T09:05:00Z · save bar moved from the top to a highlighted callout
  footer at the bottom of the drawer, shown only while the draft is dirty · ai
