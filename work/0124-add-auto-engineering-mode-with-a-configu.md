---
id: "0124"
title: Add auto-engineering mode with a configurable active-task target
type: feature
status: ready
priority: p2
area: agent
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-12T06:02:20Z"
updated_at: "2026-08-12T06:03:55Z"
---
## Activity

- 2026-08-12T06:02:20Z · created · unknown


## Problem

RepoOS can run several engineering tasks in parallel, but keeping that pipeline
full is manual. When an active task moves to `review`, a human must notice the
newly available capacity, inspect every `ready` task, choose the best next work,
and click **Start work**. Ready work can sit idle even though an engineer slot is
available.

There is also no configurable policy for how many tasks RepoOS should keep
active. Automating task selection without a server-enforced limit would risk
starting too many agents when several task transitions happen close together.

## Desired UX

- Settings includes an **Auto-engineering mode** toggle, off by default, and a
  configurable **Maximum active tasks** value that defaults to `3`.
- While enabled, RepoOS watches the count of tasks whose status is `active`. If
  the count drops below the configured maximum, the PM agent reviews the full
  `ready` queue and chooses which task or tasks should start now, up to the
  available capacity.
- The selected tasks are started through RepoOS's normal **Start work** flow so
  they receive the configured engineer, worktree, context, and lifecycle
  handling exactly as if a human started them.
- Reconciliation runs when an `active` task moves to `review` and when an
  `inbox` task moves to `ready`, provided capacity remains. Enabling the mode or
  changing its maximum also evaluates the queue immediately.
- The Control page shows the mode's current state and latest decision. If there
  is capacity but no `ready` work, it clearly alerts the human that automatic
  engineering is waiting for more ready tasks.

## Acceptance criteria

- [ ] RepoOS config and Settings UI expose an **Auto-engineering mode** boolean,
      defaulting to off, and an integer **Maximum active tasks** setting,
      defaulting to `3`.
- [ ] The maximum is validated as a safe positive integer. Invalid config or UI
      input fails clearly and cannot create an unbounded launch policy.
- [ ] With the mode off, task transitions behave exactly as today and never
      invoke the PM agent or automatically start work.
- [ ] With the mode on, an `active → review` transition calculates available
      capacity and invokes the configured PM agent when at least one slot and
      one `ready` task exist.
- [ ] With the mode on, an `inbox → ready` transition does the same evaluation
      when the active-task maximum has not been reached.
- [ ] Enabling the mode, lowering/raising the maximum, and server startup/reload
      reconcile current state once so automation does not depend on a future
      transition to begin or recover.
- [ ] The PM agent receives all current `ready` tasks with enough task metadata
      and specification context to compare them, plus the exact number of open
      slots. It returns a structured selection of zero or more task IDs and a
      concise rationale, never more IDs than available slots.
- [ ] Before each selected task starts, the server re-reads task state and the
      active count. Only tasks still in `ready` are started, and the configured
      maximum is never exceeded even with concurrent transitions, human starts,
      repeated events, or duplicate PM output.
- [ ] Selected tasks use the existing server-owned Start work path rather than
      directly patching status. Normal engineer resolution, worktree creation,
      context generation, errors, events, and activity history are preserved.
- [ ] If there are fewer ready tasks than open slots, RepoOS may start only the
      available PM-selected tasks and leaves the remaining capacity visible.
- [ ] If capacity is available but there are no `ready` tasks, no PM run is
      launched. The Control page displays a visible state such as **Waiting for
      ready tasks**, prompting the human to add or promote work.
- [ ] If no PM agent is configured, the PM run fails, or it returns no suitable
      selection, RepoOS starts nothing, records the reason, and surfaces an
      actionable Control-page status instead of silently looping or choosing a
      task arbitrarily.
- [ ] The Control page shows whether auto-engineering is on, the configured
      maximum, current active count/open slots, whether the PM is deciding, and
      the latest decision/error/waiting state. Updates arrive live through the
      existing event/store path.
- [ ] Reconciliation is single-flight or serialized and coalesces bursts of
      qualifying events. It does not repeatedly ask the PM about unchanged
      queue state or start the same task twice.
- [ ] Disabling the mode prevents new automatic selections immediately but does
      not pause, cancel, or demote tasks it previously started.
- [ ] Tests cover disabled behavior, both required transition triggers, enable
      and config-change reconciliation, default/custom maxima, multi-slot
      selection, no-ready waiting state, missing/failing PM agent, stale PM
      choices, simultaneous triggers, human-start races, and restart recovery.
- [ ] `repoos check` passes.

## Notes for AI

- Count persisted `status: active` tasks for this policy, including a paused
  task that intentionally remains active. Do not invent a new task status.
- Treat the configured number as a hard maximum, not merely a dashboard target.
  The PM can choose fewer tasks when its reasoning says none or only some are
  suitable, but the reason must be visible.
- Keep orchestration server-owned. Do not implement this as browser polling or
  require the Settings/Control page to remain open.
- Reuse the configured `pm` and `engineer` roles and the existing task-start
  endpoint/service. The PM selects work; the engineer assigned by normal start
  resolution implements it.
- Persist a compact last-run record (time, trigger, candidate IDs, selection,
  rationale/outcome) or otherwise make it available for Control-page hydration
  and diagnosis after refresh. Avoid storing raw unbounded transcripts in
  config.
- Likely touch points: config schema/defaults and settings serialization,
  Settings UI, task status-transition/start orchestration in the server, PM
  prompt/result parsing, live events/store state, Control page, and focused
  server/UI tests.
- Coordinate with #0112's Agent Supervisor rather than making auto-engineering
  responsible for diagnosing or restarting unhealthy active agents. This task
  fills available policy slots; supervision owns health and recovery.

## Activity

- 2026-08-12T06:03:55Z · status inbox→ready
