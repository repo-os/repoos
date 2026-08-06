---
id: "0036"
title: Freeform task creation via the PM agent
type: feature
status: review
priority: p1
area: web
assigned_to: ai
created_by: ""
branch: feat/0036-freeform-task-creation
created_at: "2026-08-06T08:47:55Z"
updated_at: "2026-08-06T21:36:00Z"
---
## Activity

- 2026-08-06T08:47:55Z · created · unknown
- 2026-08-06T09:05:00Z · spec fleshed out: freeform explanation → PM agent
  writes the task file; manual form kept, toggleable in settings · ai
- 2026-08-06T09:05:00Z · status inbox→ready
- 2026-08-06T21:36:00Z · implemented: freeform drawer default + tabs, PM-agent
  invocation via POST /api/tasks/freeform, no-agent/agent-failure draft fallback,
  defaultTaskMode settings toggle; repoos check green · ai
- 2026-08-06T21:36:00Z · status ready→review

## Problem

Creating a task today forces the user through the manual form in the "New task"
drawer — title, type, priority, area, assignee, branch, body — and everything
must be filled in up front. That is fine for a chore but hostile to real
thinking: when I want to capture a task the way I'm describing it in
conversation (freeform, rough, long-form), there is nowhere to just *say* it.
Meanwhile 0035 adds the concept of a PM agent whose whole job is turning rough
ideas into structured task files. The task drawer should let the PM agent do
that conversion, not make the user hand-format markdown.

## Desired UX

The **New task** drawer gains a freeform flow as its default:

- **Default — freeform textarea**: one large textarea where the user types the
  task however it comes out, exactly like explaining it to a person
  ("make issues editable in the UI…", "I keep losing my cursor…"). A Create
  button sends the explanation to the configured **PM agent**, which returns a
  fully fleshed-out, formatted task markdown file (title, type, priority, area,
  body, acceptance criteria — following the existing `work/*.md` conventions).
  The created task appears on the board like any other.
- **Manual form still available**: a toggle in Settings (`defaultTaskMode`, or
  equivalent) switches the New-task drawer between the freeform flow and the
  existing manual form. The freeform textarea flow is the **default**.
- **PM-agent reminder**: when the freeform flow is used but no PM agent is
  configured (or it's toggled off on the Agents page from 0035), the drawer
  shows a clear inline notice pointing to the Agents page to set up the PM
  agent, and falls back to letting the user save the raw explanation as a
  draft task rather than failing silently.
- The freeform result should be shown/editable before or after creation where
  practical (e.g. the generated task opens in the drawer's edit view so the
  user can tweak it) — at minimum, creating must not destroy the user's
  explanation if the agent fails.

## Acceptance criteria

- [ ] New task drawer defaults to a freeform textarea flow; the manual form
      remains reachable
- [ ] Submitting the freeform explanation routes through the PM agent (0035)
      and produces a formatted `work/<id>-<slug>.md` task file with a fleshed
      out body + acceptance criteria
- [ ] A settings option toggles between freeform (default) and manual creation;
      the choice persists and is honored on the next drawer open
- [ ] When no PM agent is configured/enabled, the drawer shows a reminder to
      set one up on the Agents page AND still lets the user create the task
      from the raw explanation (fallback), so input is never lost
- [ ] A failure/error in the agent call leaves the user's explanation intact in
      the textarea with a visible error
- [ ] `repoos check` passes

## Notes for AI

- **Depends on 0035** (Agents page + config). The PM agent is the
  `pm` default agent from 0035; read its configured coding agent + model when
  invoking it. If 0035 isn't merged yet, stub the read behind its future config
  shape and note the coupling.
- **Agent invocation**: RepoOS runs agents/assistants itself (opencode/claude
  code are invoked as subprocesses or via their CLIs, matching how the repo is
  already driven). The agent's prompt must include the repo's task-file
  conventions (frontmatter schema, sections, activity log) so the output drops
  straight into `work/`. Prefer writing the returned file via the existing
  create/write path (`POST /api/tasks` / `createTask`) rather than parsing and
  re-serializing.
- **Do NOT lose input**: the raw explanation must persist (draft/body) if the
  agent call fails or returns unusable output. The fallback should still create
  a task (raw text as the body) so the capture is never lost.
- **Settings**: add a config field for the task-mode default (e.g.
  `defaultTaskMode: "freeform" | "manual"`) via the existing config schema
  (`src/core/config.ts`) and Settings page — same pattern as other toggles.
- **UI**: the New-task drawer lives in `src/ui-app/src/components/TaskDrawer.vue`
  (`ui.isNew` branch). The freeform flow can be a second mode in that drawer.

## Scope

- **This task**: freeform textarea flow in the New-task drawer, PM-agent
  invocation, settings toggle, PM-agent-missing reminder + fallback.
- **Defer to a SEPARATE task**: per-task agent overrides, editing the generated
  task in-conversation (multi-turn refinement), streaming the agent's output.

## Related

- 0035 (Agents page) provides the PM agent this task consumes.
- 0004 (editable tasks) gives the drawer edit view the generated task opens in.
