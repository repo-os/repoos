---
id: "0359"
title: Add resolve actions to the inputs side panel
type: feature
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: ""
model_override: openrouter/deepseek/deepseek-v4.1-flash
created_at: "2026-09-15T18:30:36Z"
updated_at: "2026-09-15T18:32:04Z"
---
## Problem

Inputs are capture-only today. The side panel can move an input's status by
hand, but there is no way to act on it. The most common outcome — "this should
become a task" — currently means manually copying the input text into the
new-task flow, and nothing records the connection between the input and the
task it produced. The other outcome — "nothing to act on here" — leaves no
trace of why the input was closed. An input that has been handled is
indistinguishable from one that has been forgotten.

## Desired UX

The inputs side panel (the detail drawer for the selected input) gains two
action buttons:

- **Create task** — sends the input to the PM agent to flesh out into a
  properly spec'ed task (the same freeform flow used for new-task creation).
  Show a progress state while generation runs. On success the input moves to
  `processed` and the panel shows a link to the created task, so the user can
  see at a glance how the input was resolved; the link navigates to the task.
- **Do nothing** — moves the input to `processed` immediately and records that
  the resolution was to take no action.

A processed input always displays its resolution — either the link to the task
it became, or a "no action taken" note — and that record survives reloads.

## Acceptance criteria

- [ ] The inputs side panel shows "Create task" and "Do nothing" actions for inputs that are not already `processed`
- [ ] "Create task" sends the input's content to the PM agent and produces a real, well-formed task in `work/` (via the freeform task-creation path, not hand-assembled by the UI)
- [ ] After successful task creation the input's status becomes `processed`
- [ ] The panel shows a link to the created task and the link navigates to that task
- [ ] "Do nothing" moves the input to `processed` and records that the resolution was no action
- [ ] The resolution (task id or no-action) is persisted in the input file and rendered on processed inputs after a reload
- [ ] If PM generation fails, the input stays actionable with an error shown and its status unchanged — the capture is never lost
- [ ] `repoos check` passes

## Notes for AI

- Reuse the existing freeform machinery: `POST /api/tasks/freeform`
  (`src/server/routes/tasks.ts`) already drives the PM agent via `pmPrompt`
  and `parseGeneratedTask`, including failure fallbacks. Do NOT open a new
  one-shot LLM call site — every LLM call must record its usage in the
  `sessions` table (AGENTS.md), and the freeform path already does this.
- Input model and statuses (`new` | `reviewing` | `processed`) live in
  `src/core/input.ts`; HTTP routes in `src/server/routes/inputs.ts`; the
  detail drawer is the `activeInput` section of
  `src/ui-app/src/views/InputsView.vue`.
- Input frontmatter has no resolution fields today — add e.g.
  `resolved_task` / `resolution` keys and parse them in `listInputs`.
- Task creation must go through the normal create path; never hand-write a
  `work/*.md` file (AGENTS.md rule).
- Assumption: the two buttons are hidden on inputs already in `processed`
  (terminal state), and the existing manual status Select stays as-is.
- Assumption: what is sent to the PM agent is the input's text body;
  forwarding attachments is not required by this task.
- After any UI change, rebuild (`bun run build:ui`) so the worktree build is
  fresh.

## Scope

Covers: the two side-panel actions, PM-backed task creation wiring,
`processed` transition, and persistent resolution display (task link or
no-action note).

Deferred: bulk resolving multiple inputs at once, editing input content, and
any further actions beyond these two (the user flagged that other actions may
come later — that is future work, not this task).

## Related

- #0311 (freeform new-task flow), #0325 (background input creation), #0335
  (freeform PM flesh-out progress) — the flows this builds on.

## Original prompt

On Inputs a common result will be that we'll want to create a task from it (maybe there are other actions, but that's the main one, another one could be to do nothing and close it), so let's add some action buttons on the inputs side panel. Wire up the "create a task" action to send the input  to the PM agent to create a properly spec'ed task out of it. Then move it to processed state and show a link to the task so the user knows how it was resolved. For the "do nothing" action just move it to processed and note that the resolution was to do nothing.

## Activity

- 2026-09-15T18:30:36Z · created · hello@repoos.org
- 2026-09-15T18:31:34Z · model_override
- 2026-09-15T18:32:04Z · status draft→inbox, title, area, body
