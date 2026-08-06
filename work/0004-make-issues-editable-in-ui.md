---
id: "0004"
title: Make issues editable in UI
type: feature
status: review
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: "feat/0004-edit-task-panel"
created_at: "2026-05-29T00:00:00Z"
updated_at: "2026-08-06T07:58:00Z"
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
- branch (text input)
- body — the spec markdown (monospace textarea, edited verbatim)
- status — keeps its existing instant-apply select (already shipped)

**Save model (recommended): explicit Save button.**
- Edits stage into a local draft; the drawer shows a Save/Cancel row.
- Save issues ONE `PATCH /api/tasks/:id` with only the changed fields → one
  disk write, one `task.updated` SSE event, one "updated #id (title, area…)"
  feed entry, `updated_at` bumped once.
- Save is disabled when nothing changed (dirty-tracking).
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

- [ ] title, type, priority, area, assigned_to, branch, and body are all
      editable from the drawer and persist to the task file on Save
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
