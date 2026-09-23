---
id: "0486"
title: Add New story flow with PM-assisted story definitions
type: feature
status: draft
priority: p2
area: web + core + server
assigned_to: ai
created_by: hello@repoos.org
branch: ""
pm_cli_override: cursor
pm_model_override: composer-2.5
created_at: "2026-09-22T15:56:16Z"
updated_at: "2026-09-23T02:41:36Z"
---
## Problem

Stories (#0480) are **derived only from task `story` tags**. Until someone tags a task, a delivery slice does not appear on the Stories page at all — there is nowhere to capture the slice’s **name**, **intent**, or **scope** up front. Today the only path is typing a story name on an existing task (drawer datalist or `repoos update --story`).

Humans want the same lightweight “capture → shape with PM AI” flow they already have for **New task** (freeform PM) and **New input**, but for a **cross-area delivery slice** they plan to break into tasks later.

## Goal

When `[stories] enabled = true`, add a **New story** affordance on the Stories page that opens a panel matching the existing new-task / new-input dialog pattern. The human supplies an optional **story name** and a **freeform description**; **Create story** runs the **PM agent** (CLI/model from the selector above, defaulting to the configured PM agent) to flesh out the description and infer a name when the name field is empty. The result is **persisted in the repo** and shown on the Stories page; the story name is selectable when assigning tasks from the task drawer Story field.

## Product decisions (extends #0480)

#0480 deliberately avoided a parallel story ticket system. This feature **adds a small, git-tracked story-definition layer** without giving stories worktrees, agents, branches, or independent status:

- **Registered stories** — markdown files under a repo-root `stories/` directory (configurable path in a follow-up only if needed; **v1: fixed `stories/`** next to `work/` and `docs/`).
- **Derived roll-ups** — unchanged: task tags still drive counts, progress, completion, and ordering via `deriveStories`.
- **Merge rule for the Stories page** — show the union of (a) registered definitions and (b) story names that appear only on tasks. A registered story with **zero tasks** still appears as a card (0 tasks, no progress bar completion until tasks exist). Task-only names without a definition file behave exactly as today.
- **Display name** — use the normalized `name` from the definition file; task tags continue to use `normalizeStoryName` / case-insensitive grouping (#0480).
- **Description** — stored in the definition file body (markdown). Show a short excerpt on the story card and the full text when expanded (or in a dedicated sub-section — pick the pattern that fits existing card layout after #0485).

Do **not** introduce story statuses, manual “mark complete”, nested epics, or story-specific agents.

## UX — Stories page entry

- **Button:** `+ New story` in the page header actions, same **`Button variant="accent"` + `new-btn`** pattern as Work (“New task”) and Inputs (“New input”). Only when `stories.enabled === true` (same gate as the page itself).
- **Empty state:** when there are no stories yet, offer a secondary outline button (like Inputs’ “Submit your first input”) that opens the same panel.
- **Deep link (optional, nice-to-have):** `/stories?story=new` opens the panel and clears the param (mirror `?input=new` on Inputs). Not required for v1 if it slips scope.

## UX — New story panel

Implement as a teleported dialog panel consistent with `NewInputPanel.vue` / `NewDocPanel.vue` (registered in `App.vue`, width from `ui.drawerWidth`, resize handle, Cancel in header):

| Field | Control | Notes |
| --- | --- | --- |
| Story name | single-line text input | Optional. Placeholder e.g. “Project updates email”. If empty at submit time, PM must propose a concise name. |
| Description | textarea (~8–12 rows) | Required (trimmed non-empty). Freeform intent — outcomes, areas involved, constraints. Voice dictation optional if cheap to reuse `VoiceDictate`. |
| PM agent | `AgentModelControl` | Same grid/bar as New task freeform (`memory-key` e.g. `panel:new-story`). Default PM agent when unset. |
| Actions | Cancel / Create story | Cancel closes without writes. Create story disabled while saving or when description is empty. |

**While PM runs:** mirror New task freeform UX — spinner on primary button, optional streamed PM log (`freeformRuns` / existing SSE output pattern), durable run id so refresh does not lose in-flight work (#0403).

**On success:** close panel (or show a brief success state then close), refresh story list on the page, scroll/focus the new card if practical.

**On PM failure or timeout:** keep the human’s raw name + description visible; persist a **definition file without PM rewrite** (human name or `explanationTitle`-style fallback for name, description body = raw textarea). Surface error like New task’s `ff-error` (“PM agent failed: … — saved as-is”). Record usage in `sessions` per AGENTS.md.

**Duplicate names:** if a definition already exists for the same case-insensitive key, block create with a clear inline error (do not silently overwrite).

## PM prompt and output shape

Add a server/core freeform path analogous to `POST /api/tasks/freeform`, `POST /api/docs/freeform`, and `POST /api/skills/freeform`:

- Input: `{ name?: string, description: string, agent?, cli?, model? }`.
- PM writes a **story definition markdown file** with frontmatter at minimum:
  - `name` — final display name (respect human-provided name when present; otherwise PM-generated).
  - `created_at` / `created_by` — set by the system from auth/session, not the model.
- Body: PM-fleshed markdown (scope, outcomes, non-goals, open questions — same “helpful PM doc” tone as task/doc freeform, but **not** a task file).
- Filename: slug from normalized name; collision-safe (suffix `-2`, etc.).

Parse with the same frontmatter discipline as other generators (`hadFrontmatter` guard — do not treat chit-chat as success).

## Task drawer integration

When Stories is enabled, extend `storyOptions` (and the datalist) to include **registered story names** in addition to names seen on existing tasks, deduped case-insensitively. Selecting a name still only sets task frontmatter — no auto-linking beyond the shared name string.

## Server / index / SSE

- CRUD or create-only API for story definition files under `stories/`, auth-protected like other write routes.
- Index or lightweight loader so the UI and board payload can list definitions without scanning on every keystroke (follow existing docs/inputs indexing patterns).
- SSE/event refresh when a story file is created or updated so the Stories page updates live.

## Configuration and docs

- Gate all UI and API on `stories.enabled` (missing/false = no New story button, no story-definition writes, no regression to #0480 disabled behavior).
- Document in `user-docs/configuration.md`: story definition files, directory layout, and how they relate to task `story` tags.
- Update Stories page copy if it still says stories exist only via task tags.

## Acceptance criteria

- [ ] With `stories.enabled = true`, Stories header shows **New story** matching Work/Inputs styling; with stories disabled, no button and no new routes.
- [ ] Panel has story name input, description textarea, PM agent selector, Cancel, and Create story; Create runs PM by default and records session usage.
- [ ] Successful create adds a git-tracked file under `stories/` and the story appears on the Stories page **even with zero tagged tasks**, showing name + description excerpt.
- [ ] PM failure/timeout still creates a definition from the human’s text (no silent discard); error is visible in the panel.
- [ ] Duplicate story names (case-insensitive) are rejected with a clear message.
- [ ] Task drawer Story datalist includes registered names; tagging a task with that name joins the existing roll-up counts/progress.
- [ ] Stories with only task tags (no definition file) still render as today; merging does not double-count.
- [ ] Tests: core normalization/merge, API create + duplicate guard, PM parse success/failure, UI gate + form validation, drawer datalist includes registry; `repoos check` passes.

## Non-goals

- Editing or deleting story definitions in the UI (create-only v1; files can be edited in git).
- CLI `repoos story` commands (optional follow-up).
- Changing story completion rules, ordering semantics, or nav placement from #0480.
- Screenshots attachments on story create.

## Related

- #0480 — Stories page and task `story` field
- #0485 — Stories page styling (reuse shared page header; extend cards for description)
- #0403 — durable freeform PM runs
- #0400 — PM model selector defaults on new-task freeform

## Original prompt

Let's make a "new story" button in the same style as new task and new input, following the same style and general design. the PM AI should be used here to help turn a freeform story description into a fleshed out "story" and a story name if not provided by the human. There should be 1 text input for story name and 1 text area for freeform description. then the human can click "cancel"  or "create story", and create story will use the AI from the selector above (PM AI by default). and this story name and description will then be added  to the stories page, and users will be able to assign tasks to this story name from the story dropdown on task panel.

## Activity

- 2026-09-22T15:56:16Z · created · hello@repoos.org
- 2026-09-22T15:59:17Z · note: Freeform PM run failed: the opencode agent timed out after 180s
- 2026-09-23T02:40:29Z · pm_cli_override, pm_model_override
- 2026-09-23T02:40:31Z · pm_model_override
- 2026-09-23T02:41:36Z · title, area, body
