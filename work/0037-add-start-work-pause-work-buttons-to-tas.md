---
id: "0037"
title: Add start work / pause work buttons to task cards
type: feature
status: done
priority: p1
area: web
assigned_to: ai
created_by: ""
branch: feat/0037-start-pause-work
created_at: "2026-08-06T09:29:18Z"
updated_at: "2026-08-06T10:57:58Z"
---
## Activity

- 2026-08-06T09:29:18Z · created · unknown

## Problem

Tasks are AI-assigned (`assigned_to: ai`), but moving a task from `ready` to
`active` today is a manual status edit that does nothing — no agent is ever
launched, and nothing stops when the work should pause. Getting an agent to
actually work on a task means leaving RepoOS, opening the coding agent manually,
pointing it at the task file, and creating the branch by hand. There is no
single "go" / "stop" affordance, so the roadmap describes work the repo never
performs.

## Desired UX

The task card (and the task drawer) gains a single context-dependent action
button that drives an AI agent:

- **Ready tasks** show a **Start work** button. Clicking it:
  - moves the task to `active` (same code path as `repoos mv`, so the Activity
    log is written);
  - launches the repo's default coding agent on the task: checks out / creates
    the task's worktree, and hands the agent the task file + its instructions as
    the mission;
  - marks the task as *running* in the UI.
- **Active tasks** show a **Pause work** button in the same spot. Clicking it:
  - signals the running agent to stop (graceful, then kill);
  - moves the task back to `ready` so it can be started again;
  - clears the running marker — no phantom "running" state.
- Exactly one of the two buttons is visible per task, driven purely by status
  (`ready` → Start, `active` → Pause). Other statuses show neither.

## Acceptance criteria

- [ ] A `ready` task shows a **Start work** button on its board card and in the
      task drawer
- [ ] Clicking **Start work** transitions the task to `active` with an Activity
      log entry
- [ ] Starting work launches the repo's default agent (the `engineer` agent from
      the Agents page) against the task, in the task's worktree, seeded with the
      task file and the agent's instructions
- [ ] An `active` task shows a **Pause work** button instead
- [ ] Clicking **Pause work** stops the running agent and returns the task to
      `ready`, with an Activity log entry
- [ ] If the agent process exits on its own (crash or completion), the UI stops
      showing "running" — the task is never stuck in a phantom running state
- [ ] `repoos check` passes

## Notes for AI

- **Status transitions**: reuse the existing `PATCH /api/tasks/:id` path in
  `src/server/server.ts` so start/pause emit the same events + Activity entries
  as `repoos mv`. Add explicit endpoints (e.g. `POST /api/tasks/:id/start` and
  `POST /api/tasks/:id/pause`) that transition status and then spawn/stop the
  agent.
- **Spawning the agent**: use `node:child_process` (zero runtime deps is a hard
  constraint — no process libraries). cwd is the repo root; the agent must run
  in the task's worktree (create it if missing, mirroring the branch logic on the
  existing edit path). The mission = task file path + the agent's `instructions`
  from the Agents config.
- **Agent identity**: reuse `#0035`'s agents — pick the `engineer` agent's
  `cli` + `model` (or a runtime default `opencode`). The Agents page already
  exposes `agentsMeta` on `/api/config`.
- **Process registry**: keep a map of running agents by task id (server-side).
  Pause must send a graceful stop, then SIGKILL on timeout; when a child exits,
  clear the registry and emit an SSE event so the UI drops the running marker.
- **SELF-HOSTING RULE**: this repo runs itself. A task with a broken agent
  config or a failed spawn must fail gracefully in the UI — never crash the
  server or break `repoos` startup. The spawn should be best-effort and
  async-firing (don't block the HTTP response on the agent).
- **UI**: buttons live in `WorkView` (board card + drawer). Use existing
  `Button` primitives and the SSE stream (`/api/events`) for running-state
  updates, mirroring how the board already live-updates.
- **Don't**: do not auto-commit/merge the agent's work on completion, don't
  stream agent output into the UI, don't add per-task agent selection — those
  are separate tasks.

## Scope

- **This task**: the Start/Pause action button (status-driven), agent
  launch/stop mechanics, running-state tracking, Activity log entries.
- **Defer to a SEPARATE task**: streaming agent output into the UI, auto-commit
  / auto-merge on completion, per-task agent overrides, a "paused" status.

## Related

- 0035 established the Agents page (`cli`/`model`/`instructions` per agent)
  this task launches; 0036 is building freeform task creation via the PM agent,
  the first consumer of the same launch mechanics.

## Activity

- 2026-08-06T10:33:13Z · status inbox→ready
- 2026-08-06T10:33:15Z · status ready→active
- 2026-08-06T10:41:00Z · status active→review · implementation on feat/0037-start-pause-work (d09a11e): POST /api/tasks/:id/start|pause, AgentRunner spawn/registry (SIGTERM→SIGKILL), ensureBranch, agent.running/exited SSE events, Start/Pause buttons on cards + drawer
- 2026-08-06T10:57:58Z · status review→done · signed off; merged to main
