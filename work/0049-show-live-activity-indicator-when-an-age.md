---
id: "0049"
title: Show live activity indicator when an agent is working
type: feature
status: done
needs_merge: true
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/show-live-activity-indicator-when-an-age
created_at: "2026-08-06T17:24:13Z"
updated_at: "2026-08-11T15:19:56Z"
---
## Problem

While any agent (pm or engineer) is doing work, the UI shows only static
text — a disabled button or a fixed status line — with no visible sign that
the agent is actively working. Concretely:

- Creating a task via the freeform dialog calls `POST /api/tasks/freeform`,
  which runs the PM agent synchronously for up to ~3 minutes. While it runs,
  the drawer just shows `ui.saving` (static text) with zero indication of
  progress or activity.
- The engineer agent running a task (Start work) has the same problem.
- The new Move-to-done flow (which runs merge → build → check → done steps)
  shows no indication of activity either.

Users cannot tell whether the app is hung or the agent is working, which is
confusing during a 3-minute synchronous operation.

## Desired UX

- A clear animated activity indicator wherever an agent is working — e.g. a
  spinner, pulsing dots, or an animated progress bar that animates while work
  is in progress.
- The indicator replaces the current static "saving" / status-line text and
  appears on disabled buttons and status lines tied to agent work (freeform
  creation, Start work, Move-to-done).
- Ideally, live streaming feedback for the PM agent during freeform creation
  instead of a silent wait — show the agent's output/task progress as it
  arrives.
- Must work in both light and dark themes.
- Must not require a server restart.

## Acceptance criteria

- [ ] An animated activity indicator (spinner, pulsing dots, or progress bar) is shown wherever an agent is working: freeform task creation, Start work (engineer agent), and the Move-to-done flow.
- [ ] The static `ui.saving` / fixed status-line text is replaced by the indicator while agent work is in progress.
- [ ] The indicator animates (CSS animation) rather than rendering as static text.
- [ ] The indicator renders correctly in both light and dark themes.
- [ ] Live streaming feedback is shown during freeform task creation, using the existing SSE event stream (`/api/events`) and the existing `task.progress` and `agent.output` events — no polling.
- [ ] Works with zero new runtime dependencies.
- [ ] No server restart required to see the change (frontend-only or handled via hot rebuild).
- [ ] Existing behavior (freeform creation, Start work, Move-to-done) still works end-to-end.

## Notes for AI

- This deliverable is mostly frontend: Vue components plus CSS animation.
- Reuse the existing SSE event stream (`/api/events`) and the existing
  `task.progress` and `agent.output` events; do not add polling.
- Zero runtime dependencies is a hard constraint — do not add any.
- A tiny server change is allowed only if streaming PM output during freeform
  creation turns out to be necessary for good feedback; prefer reusing the
  existing event stream first.
- After any UI change, rebuild (`bun run build:ui` for speed, or `bun run build`)
  and keep a `repoos serve` running (e.g. `repoos serve --port 7171`) so the
  user can view the changes; verify with a browser probe before reporting done.
- Run `repoos check` and confirm it passes (build, typecheck, tests, UI smoke
  test) before moving the task to review.
- One task = one focused worktree.

## Scope

- Covers the activity indicator for agent work in the web UI and live feedback
  for freeform PM agent creation.
- Defers: any changes to agent execution itself, other flows beyond the three
  listed above, and any new runtime dependencies.

## Related

- Existing SSE event stream: `/api/events`
- Existing events: `task.progress`, `agent.output`
- Move-to-done flow (merge → build → check → done steps)

## Activity

- 2026-08-06T17:24:13Z · created · unknown
- 2026-08-11T03:51:04Z · status inbox→ready
- 2026-08-11T15:16:20Z · status ready→review
- 2026-08-11T15:19:20Z · needs_merge
- 2026-08-11T15:19:56Z · status review→done
