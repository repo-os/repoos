---
id: "0187"
title: "Add logging across RepoOS — system, task-pipeline, and agent activity"
type: feature
status: inbox
priority: p1
area: core
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-14T05:15:53Z"
updated_at: "2026-08-14T05:15:53Z"
---
## Problem

RepoOS currently has undiagnosable errors — when something breaks, there isn't
enough logging to figure out what went wrong or why. This shows up in three
distinct ways:

1. **System-level failures** — errors and crashes ("things that kill it") in
   RepoOS itself aren't captured anywhere useful, making root-causing outages
   or hard failures guesswork.
2. **Task pipeline stalls** — tasks move through `active → review → done`, but
   when a task is slow or stuck, there's no log trail explaining what's going
   on or why it isn't progressing.
3. **Agent activity is opaque** — agents (Performance agent, Ross, CTO agent,
   Tech Debt agent, etc.) run without a record of what they're doing, so it's
   unclear whether they're working normally, stalled, or failing.

Without logging in all three areas, diagnosing problems means guessing or
reproducing issues live instead of reading a log.

## Desired UX

- A consistent, overall RepoOS logging solution that captures errors and
  fatal/crash-level events system-wide, in one place a human can go read
  after something goes wrong.
- Per-task logging: for any task, it should be quick and easy to see what's
  happened to it and why it's moving (or not moving) through the
  active → review → done pipeline — e.g. state transitions, timestamps, and
  any errors encountered while working on it.
- Per-agent logging: for each agent (Performance agent, Ross, CTO agent, Tech
  Debt agent, and others), a log of what the agent is doing and any problems
  it hits, so someone can tell at a glance whether an agent is healthy,
  stuck, or erroring.
- Diagnosing "why is this task/agent stuck or broken" should be a matter of
  reading logs, not reproducing the issue manually.

## Acceptance criteria

- [ ] A system-wide logging mechanism exists that captures errors and
      fatal/crash-level failures in RepoOS, with enough detail (timestamp,
      error, context) to diagnose the failure after the fact.
- [ ] Each task has an associated log (or log stream) covering its lifecycle
      through the active → review → done pipeline, including state
      transitions and errors encountered.
- [ ] It's possible to look at a given task and quickly determine its current
      state, how long it's been there, and what (if anything) is blocking it
      from progressing, using only the logs.
- [ ] Each agent (Performance agent, Ross, CTO agent, Tech Debt agent, and any
      other agents in the system) produces logs of its activity and any
      errors/problems it encounters.
- [ ] It's possible to look at a given agent's logs and tell whether it's
      currently healthy, idle, stuck, or failing.
- [ ] Logs are written somewhere discoverable and consistent (e.g. a common
      location/format) rather than scattered ad hoc per-component.
- [ ] Existing errors that previously went unlogged (crashes / silent
      failures) are now captured by this logging solution.

## Notes for AI

- This task is intentionally a "propose a solution" + implement task: start
  by researching current error handling and task/agent execution code to see
  what logging (if any) already exists, then design an overall logging
  approach (log format, storage/location, levels) before wiring it into the
  three areas: system errors, task pipeline, and agent activity.
- Assumption: "area: core" was chosen since this spans the whole system
  rather than one surface (web/cli/api) — reassign if the codebase has a
  more specific convention for cross-cutting infra work.
- Assumption: no specific log storage/format (e.g. structured JSON, flat
  files, a log table) was specified by the user — pick whatever fits
  RepoOS's existing architecture and state it as a design decision when
  implementing, rather than inventing a new storage system if one already
  exists.
- Find the actual list of agents in the codebase (Performance agent, Ross,
  CTO agent, Tech Debt agent were named as examples, not an exhaustive list)
  and make sure every agent gets the same logging treatment, not just the
  ones named.
- Do not build a full observability/metrics dashboard UI unless one already
  exists to extend — the acceptance criteria are about logs being captured
  and readable/diagnosable, not about a new visualization product.

## Scope

Covers: system-level error/crash logging, per-task lifecycle logging across
the active/review/done pipeline, and per-agent activity/error logging for all
agents in the system.

Defers: building new dashboards/UIs for visualizing logs, alerting/paging on
log events, and log retention/archival policy — these can be follow-up tasks
once basic logging exists.

## Activity

- 2026-08-14T05:15:53Z · created · unknown
