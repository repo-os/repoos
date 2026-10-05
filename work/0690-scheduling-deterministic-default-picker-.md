---
handoff_signal_retry_count: 2
id: "0690"
title: "Scheduling: deterministic default picker for auto-engineering with an optional PM veto for conflicts"
type: feature
status: active
priority: p3
area: server
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: feat/scheduling-deterministic-default-picker-
created_at: "2026-10-05T16:59:03Z"
updated_at: "2026-10-05T19:54:48Z"
---
## Problem

`autoEngineeringMode` asks the PM agent (an LLM call per trigger) which ready tasks to start. When the dependency graph is explicit the choice is almost mechanical, and an LLM adds cost, non-determinism, and a failure mode (the code has a `pm-unavailable` outcome: a flaky free model can stall dispatch). The real judgment is (a) planning the graph and (b) avoiding conflicts between tasks that run in parallel (two tasks editing the same files caused merge conflicts in practice).

## Desired UX

- Default selection is deterministic: eligible = ready, dependencies done, not needsInput/archived/held; order by priority, then critical-path weight (number of transitive dependents), then creation order; take as many as free slots.
- Optional PM pass (`autoEngineering.pmVeto = true`) runs only when there are more eligible tasks than slots AND two candidates share an area or declared paths; it may only reorder or defer, never invent work, and its decision is recorded with a rationale.
- Support a `hold` flag/label so a task can be excluded from auto-start.

## Acceptance criteria

- Pure selection function with unit tests (priority, critical path, ties, holds, conflicts); decision records show which picker ran; Settings UI control; docs. `repoos check` passes.

## Notes for AI

Evidence comes from building a real 30-task project (opex, a Vue + Bun + Postgres app) with cheap agents on one laptop over ~9 hours. Read `AGENTS.md` first. Never hand-edit work/*.md; use RepoOS commands or APIs. Verify any claim you rely on against the current source before changing behaviour. Where a related task exists it is listed under "See also"; coordinate rather than duplicate.

## Story context
This task is part of the story **Field report: first agent-driven project run (opex)** (story #0008, `stories/field-report-first-agent-driven-project-run-opex.md` in this repo). Read that file first: it holds the background of the run that produced this task, the facts already established for your theme (with the evidence), the decisions the owner has already made, the known uncertainties, and the list of sibling tasks you should coordinate with. Verify its facts against the current source before relying on them, and say in the task notes if you find anything in it that is wrong or out of date.

## Docs follow-up
The playbook page `user-docs/running-with-agents.md` (landed on main) describes the CURRENT behaviour that this task changes. When this task lands, update the page: section 1, the sentence saying 'which task next' is almost mechanical (priority, then longest downstream chain, then age). In short: make it match the shipped picker. Keep the page accurate rather than aspirational; if this task is declined, leave the page as is. (This replaces the open task 0689, which is being removed.)

## Activity

- 2026-10-05T16:59:03Z · created · unknown
- 2026-10-05T17:17:20Z · story
- 2026-10-05T17:17:21Z · body: section Story context
- 2026-10-05T17:32:30Z · body: section Docs follow-up
- 2026-10-05T19:54:41Z · status inbox→ready
- 2026-10-05T19:54:48Z · status ready→active, branch


