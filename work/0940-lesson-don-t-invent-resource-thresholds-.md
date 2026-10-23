---
id: "0940"
title: Use RepoOS pressure guard for start decisions
type: spec
status: ready
priority: p2
area: [agent, core, docs]
assigned_to: ai
created_by: hello@repoos.org
branch: ""
cli_override: cursor
model_override: composer-2.5
review_cli_override: opencode
review_model_override: opencode-go/mimo-v2.6-flash
created_at: "2026-10-23T16:56:10Z"
updated_at: "2026-10-23T16:58:47Z"
---
## Problem

An agent used self-chosen macOS swap and memory-pressure thresholds to block task starts, despite RepoOS already having a configurable pressure guard. This delayed task starts and bypassed the configured decision point. macOS swap usage, especially `vm.swapusage` free space, is not by itself a reliable signal of memory pressure.

## Desired UX

Agents rely on RepoOS’s configured `pressureGuard` when deciding whether resource pressure should block a task start. If the guard blocks a start, the agent reports the reason to the human. If the guard is disabled or its configured limits appear unsuitable, the agent reports that to the human rather than substituting its own thresholds.

## Acceptance criteria

- [ ] Agent guidance makes `pressureGuard` the decision point for resource-related start blocking, using its configured limits and signals.
- [ ] Guidance prohibits introducing self-chosen numeric thresholds to block starts or working around a guard decision with a different threshold.
- [ ] Guidance explains that `vm.swapusage` free space is unused swap capacity, not a pressure signal, and that macOS may retain swap during normal operation.
- [ ] Guidance says to interpret `memory_pressure -Q` free percentage and RepoOS’s pressure state against RepoOS’s configured limits.
- [ ] When `pressureGuard` blocks a start, the agent reports the reason to the human; when it is disabled or its limits seem wrong, the agent asks the human to address the configuration rather than inventing another gate.

## Notes for AI

- Inspect existing pressure-guard behavior and agent guidance before changing anything; use RepoOS’s existing metrics and configured limits rather than creating a parallel gate.
- Do not change guard limits or defaults, or add a new threshold, unless explicitly required by the existing configuration.
- Keep the change focused on the start-decision rules described here.

## Scope

This task covers agent behavior and guidance for resource-related task-start decisions. It does not request new resource metrics or changes to the pressure guard’s configured limits.

## Original prompt

Lesson: don’t invent resource thresholds; use RepoOS’s own metrics.

An agent in the Divot driving session decided, on its own, that macOS “free swap” should block task starts, with a 1 GB floor. It then held tasks for about 30 minutes, and later invented a second gate (memory-pressure free % above 15%) without checking what RepoOS already had. That was wrong on both counts.

Rules for future agents:

Use RepoOS’s own gates. Its pressure guard (pressureGuard in the config: load per CPU, memory available, swap-used ratio, compressor, page-outs, PSI) is the decision point. If it’s disabled or its limits are wrong, report that to the human. Don’t substitute your own thresholds.
macOS metrics are misleading. macOS keeps a lot in swap during normal operation, so swap used or free swap says little about whether the machine is short of memory. vm.swapusage “free” is the unused part of the swap space, not a pressure signal. memory_pressure -Q (free %) and RepoOS’s own pressure state are the signals to trust, and even those should be read against RepoOS’s configured limits.
Don’t gate on numbers you chose. If a start needs a gate, the human sets it in config. Otherwise ask.

If the RepoOS pressure guard blocks a start, report the reason to the human. Don’t work around it by starting with a different threshold.

## Activity

- 2026-10-23T16:56:10Z · created · hello@repoos.org
- 2026-10-23T16:56:51Z · status draft→inbox, title, area, type, body: Problem (added); Desired UX (added); Acceptance criteria (added); Notes for AI (added); Scope (added)
- 2026-10-23T16:58:06Z · cli_override, model_override
- 2026-10-23T16:58:07Z · model_override
- 2026-10-23T16:58:16Z · review_cli_override, review_model_override
- 2026-10-23T16:58:21Z · review_cli_override
- 2026-10-23T16:58:45Z · review_model_override
- 2026-10-23T16:58:47Z · status inbox→ready
