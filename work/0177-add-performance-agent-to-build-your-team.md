---
id: "0177"
title: Add Performance Agent to Build Your Team
type: feature
status: ready
priority: p2
area: agent
assigned_to: ai
created_by: ""
branch: feat/add-performance-agent-to-build-your-team
created_at: "2026-08-13T15:43:27Z"
updated_at: "2026-08-14T00:03:08Z"
---
## Problem

Performance is a persistent concern: over time the app and its processes get
slower and less snappy, and that decay is easy to miss until it hurts. Today the
only pre-built agent in the "Build Your Team" section is the Tech Debt Agent, so
performance issues must be noticed and documented manually. There is no
dedicated agent that proactively keeps the app fast.

## Desired UX

A Performance Agent appears in the "Build Your Team" section on the agents page,
alongside the Tech Debt Agent, with:

- A card/component explaining what the agent does: keeps the app and its
  processes snappy and catches slowdowns before they compound
- Configuration for run frequency (once daily, once weekly, on-demand)
- A manual "Run Now" button to trigger an immediate run
- Once run, the agent scans the app/repo and surfaces performance concerns as
  tasks added to the Inbox list
- Shows the agent's status and when it last ran

## Acceptance criteria

- [ ] Performance Agent card displays in the "Build Your Team" section alongside the Tech Debt Agent
- [ ] Schedule selector allows the user to choose: Daily, Weekly, or Manual only
- [ ] "Run Now" button triggers immediate execution of the Performance Agent
- [ ] Performance Agent scans the repo and identifies performance concerns (slow endpoints or queries, large bundles or assets, blocking/busy work, repeated/duplicated computation, unbounded growth)
- [ ] Identified issues are created as tasks in the Inbox list
- [ ] Agent displays status (idle, running, completed) and last-run timestamp
- [ ] Agent configuration (schedule choice) persists across sessions

## Notes for AI

- Reuse the "Build Your Team" section, schedule selector, "Run Now" button, status/last-run display, and scheduled execution built for #0131; this task adds the Performance Agent as the second pre-built agent
- Follow the same scheduling and execution pattern as the Tech Debt Agent (daily/weekly/manual + run now), not a new mechanism
- Scan should look for measurable signs of slowdown or resource growth: slow endpoints or queries, large bundles/assets, blocking or busy-wait work, and duplicated or wasteful computation
- Task creation should include enough context (file paths, line numbers, relevant measurements) so users can act on the suggestions
- Store agent schedule/configuration in user settings or project config, consistent with the Tech Debt Agent
- Coordinate with the Tech Debt Agent to avoid creating duplicate tasks for overlapping findings (e.g. the tech-debt scan already flags "performance concerns")
- Scanning a large repo must not block the UI; keep the scan lightweight and consider running it off the request path
- Assumption: all "Build Your Team" UI/scheduling infrastructure from #0131 is already in place; this task only wires up the Performance Agent itself
- No runtime dependencies without explicit authorization

## Scope

**Included**: Performance Agent card in "Build Your Team", performance scan logic, schedule + "Run Now" wiring, and task creation to Inbox

**Deferred**: Additional pre-built agents, performance history or benchmark baselines, automated performance fixes, and advanced threshold tuning

## Related

- 0131 — Build Your Team section with Tech Debt Agent (the pattern this agent mirrors)

## Activity

- 2026-08-13T15:43:27Z · created · unknown
- 2026-08-13T15:44:09Z · status inbox→ready
- 2026-08-13T17:26:35Z · status ready→active, branch
- 2026-08-13T17:51:49Z · status active→review
- 2026-08-13T18:09:14Z · status review→done, release:success
- 2026-08-14T00:03:08Z · status done→ready
