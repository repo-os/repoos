---
id: "0070"
title: Keep paused tasks in Active status instead of reverting to Ready
type: bug
status: ready
priority: p2
area: ui
assigned_to: ai
created_by: ""
branch: feat/keep-paused-tasks-in-active-status-inste
cli_override: claude code
model_override: sonnet
created_at: "2026-08-11T03:17:31Z"
updated_at: "2026-08-11T18:59:04Z"
---
## Problem

Clicking "Pause work" on a task card in the Active column stops the running
agent but also moves the task's status back to `ready`. This loses the
task's place in the board: a paused task looks identical to one that was
never started, and the user has to remember it was mid-flight. Pausing
should stop the agent without demoting the task's status.

Relevant code:
- `src/server/server.ts` — `POST /api/tasks/:id/pause` handler (doc comment
  around line 19, logic around line 559/687) currently transitions the task
  `active -> ready`.
- `src/ui-app/src/stores/repo.ts` — `pauseWork()` (line 236) calls that
  endpoint.
- `src/ui-app/src/components/TaskCard.vue` — the `active` entry in the
  `ACTIONS` map (lines 57-62) renders the "Pause work" button and its title
  text ("Stop the agent and return the task to ready"), which is also
  inaccurate once this changes.

## Desired UX

- When a task is `active` and the user clicks "Pause", the agent process is
  stopped (unchanged), but the task's status stays `active`.
- The action button on an active-but-paused task changes its label to
  "Restart work" (in place of "Pause work"), so the user can resume the
  agent from where it left off.
- Clicking "Restart work" relaunches the agent on the task, keeping it in
  `active`.

## Acceptance criteria

- [ ] Pausing an `active` task stops the agent but leaves `task.status` as
      `active` (does not fall back to `ready`).
- [ ] The task card button for a paused, still-`active` task reads "Restart
      work" instead of "Pause work".
- [ ] Clicking "Restart work" resumes/relaunches the agent for that task
      and the task remains `active`.
- [ ] The board/column view still shows the task under "Active" the whole
      time — it never visually reappears in "Ready" as a side effect of
      pausing.
- [ ] Existing pause behavior (stopping the underlying agent process, any
      "running" indicator on the card) still works correctly, just without
      the status change.

## Notes for AI

- This requires distinguishing "active and running" from "active and
  paused" as a UI/state concept, since `task.status` alone no longer tells
  you whether the agent is currently running. Check how
  `repo.isRunning(task.id)` (used in `TaskCard.vue` line 141) is derived —
  it likely already tracks the running-agent set separately from
  `task.status`, which is probably the right signal to drive the "Pause
  work" vs "Restart work" label instead of introducing a new status value.
- Do NOT introduce a new task status (e.g. `paused`) unless the running vs.
  not-running distinction truly can't be expressed with the existing
  running-agent tracking — the task only asks for status to stop reverting
  to `ready`, not for a new column/state.
- Update the button's `title` tooltip text in `TaskCard.vue` to match the
  new behavior (it currently says "Stop the agent and return the task to
  ready").
- Update the `/api/tasks/:id/pause` handler's doc comment in
  `src/server/server.ts` (currently documents `active -> ready`) to reflect
  that the task stays `active`.
- "Restart work" should reuse the same relaunch path as "Start work" for a
  `ready` task, just without touching status.

## Activity

- 2026-08-11T03:17:31Z · created · unknown
- 2026-08-11T03:51:07Z · status inbox→ready
- 2026-08-11T18:34:40Z · status ready→active, branch
- 2026-08-11T18:36:22Z · status active→ready
- 2026-08-11T18:36:27Z · status ready→active
- 2026-08-11T18:57:27Z · cli_override, model_override
- 2026-08-11T18:59:04Z · status active→ready
