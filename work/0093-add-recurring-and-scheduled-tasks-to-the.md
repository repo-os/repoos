---
id: "0093"
title: Add recurring and scheduled tasks to the Agents page
type: feature
status: inbox
priority: p2
area: agent
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-11T14:22:06Z"
updated_at: "2026-08-11T15:37:46Z"
---
## Activity

- 2026-08-11T14:22:06Z · created · unknown
- 2026-08-11T15:37:46Z · updated · narrow the first release to one-time, daily, and weekly schedules


## Problem

RepoOS tasks can only be created or started manually. Repeated maintenance work
such as documentation audits, dependency reviews, health checks, and periodic
agent runs has to be remembered and recreated by a human each time. There is no
repo-native representation of a schedule, no scheduler in `repoos serve`, and
no place in the UI to see what will run next.

Task #0092 is an immediate example: the documentation should be checked for
implementation drift on a recurring basis, but today it can only be recorded as
a one-time task.

## Desired UX

The Agents page includes a Scheduled Tasks section where a user can create,
edit, enable, disable, run now, and delete schedules. A schedule combines a
task template with a cadence and timezone. When due, RepoOS creates a normal
markdown task through the existing task-creation path so the resulting work is
visible on the board, versioned in Git, and handled by the normal human/agent
lifecycle.

The UI shows each schedule's state, cadence, timezone, last run, next run, and
most recently created task. Missed runs and failures are visible rather than
silently discarded.

## Acceptance criteria

- [ ] Users can create one-time and recurring schedules from the Agents page,
      using a task template with title, specification, type, area, priority,
      assignee, and initial status.
- [ ] Recurrence supports one-time, daily, and weekly schedules,
      with an explicit IANA timezone and a readable next-run preview before
      saving.
- [ ] Schedule definitions are persisted in a repo-native, human-readable
      format and survive server restarts; any derived scheduler state remains
      disposable.
- [ ] When a schedule becomes due, RepoOS creates a standard `work/*.md` task
      through the existing core facade rather than writing an alternate task
      format or maintaining a second task database.
- [ ] A schedule can be enabled, disabled, edited, run immediately, and deleted
      from the UI. Destructive actions require the same confirmation patterns
      used elsewhere in RepoOS.
- [ ] The Agents page shows enabled state, cadence, timezone, last run, next
      run, last result, and a link to the latest generated task.
- [ ] Restart behavior is deterministic: a missed occurrence is handled once
      according to a documented catch-up policy, without duplicate tasks.
- [ ] Concurrent servers or rapid reloads cannot create the same scheduled
      occurrence twice.
- [ ] Schedule execution and failures are surfaced through the existing live
      event system so the UI updates without polling.
- [ ] A recurring documentation-audit schedule can be configured from task
      #0092's specification as an end-to-end example.
- [ ] The feature degrades cleanly when no schedules exist, adds no required
      hosted service, and introduces no runtime dependency without explicit
      approval.
- [ ] Tests cover schedule parsing, timezone/next-run calculation, restart
      catch-up, duplicate prevention, task creation, and UI error handling.
- [ ] `repoos check` passes, including the browser smoke test.

## Notes for AI

- Preserve the central invariant that generated tasks are ordinary Markdown
  files and Git remains the source of truth.
- Reuse `createRepoOS().createTask()` and the existing task mutation/event
  paths. Do not add a parallel scheduler-owned task store.
- Keep scheduling local-first. The initial implementation should run inside
  `repoos serve`; hosted cron infrastructure is out of scope.
- Decide and document the persisted schedule schema and missed-run policy
  before implementing the runtime loop. Preserve unknown fields on round-trip
  if the chosen format follows task/config conventions.
- Automatic agent execution should be an explicit schedule option, not an
  implicit consequence of assigning the generated task to `ai`.
- Keep the first implementation deliberately narrow: one-time, daily, and
  weekly recurrence. General cron-expression parsing is deferred because it
  adds substantial validation and timezone complexity under the zero-runtime-
  dependency constraint.

## Deferred

- Cron-expression schedules and sub-daily recurrence.
- Hosted or always-on scheduling outside a local `repoos serve` process.

## Related

- 0092 — recurring product-documentation audit use case
