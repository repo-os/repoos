---
id: "0940"
title: "Lesson: don’t invent resource thresholds; use RepoOS’s ow…"
type: feature
status: draft
priority: p2
area: general
assigned_to: ""
created_by: hello@repoos.org
branch: ""
created_at: "2026-10-23T16:56:10Z"
updated_at: "2026-10-23T16:56:10Z"
---
Lesson: don’t invent resource thresholds; use RepoOS’s own metrics.

An agent in the Divot driving session decided, on its own, that macOS “free swap” should block task starts, with a 1 GB floor. It then held tasks for about 30 minutes, and later invented a second gate (memory-pressure free % above 15%) without checking what RepoOS already had. That was wrong on both counts.

Rules for future agents:

Use RepoOS’s own gates. Its pressure guard (pressureGuard in the config: load per CPU, memory available, swap-used ratio, compressor, page-outs, PSI) is the decision point. If it’s disabled or its limits are wrong, report that to the human. Don’t substitute your own thresholds.
macOS metrics are misleading. macOS keeps a lot in swap during normal operation, so swap used or free swap says little about whether the machine is short of memory. vm.swapusage “free” is the unused part of the swap space, not a pressure signal. memory_pressure -Q (free %) and RepoOS’s own pressure state are the signals to trust, and even those should be read against RepoOS’s configured limits.
Don’t gate on numbers you chose. If a start needs a gate, the human sets it in config. Otherwise ask.

If the RepoOS pressure guard blocks a start, report the reason to the human. Don’t work around it by starting with a different threshold.

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
