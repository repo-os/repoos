---
id: "0690"
title: "Scheduling: deterministic default picker for auto-engineering with an optional PM veto for conflicts"
type: feature
status: inbox
priority: p3
area: server
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-10-05T16:59:03Z"
updated_at: "2026-10-05T17:17:20Z"
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

## Activity

- 2026-10-05T16:59:03Z · created · unknown
- 2026-10-05T17:17:20Z · story
