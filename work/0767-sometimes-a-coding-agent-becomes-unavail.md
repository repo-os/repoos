---
last_close_out_gate_ms: 3146
last_close_out_gate_at: "2026-10-20T05:54:12.087Z"
id: "0767"
title: Define centralized coding agent recovery
type: spec
status: review
priority: p2
area: [agent, web]
assigned_to: ai
created_by: hello@repoos.org
branch: feat/define-centralized-coding-agent-recovery
cli_override: github copilot
model_override: default
created_at: "2026-10-13T12:38:26Z"
updated_at: "2026-10-20T05:54:12Z"
review_passes: 2
review_rounds: 1
---
## Problem

When a coding agent or model becomes unavailable or starts failing, its configuration may need to be changed wherever it is used. Finding and updating each use individually is inconvenient and can lead to further failures.

## Desired UX

Provide a clear way to recover from agent or model failures across the product. Consider both a view of configured coding agent and model combinations—including where each is used, such as an agent or task override—with a way to change them together, and a global fallback combination used when the configured choice fails. Recommend the approach that best addresses the problem.

## Acceptance criteria

- [ ] Identify the coding agent and model combinations that can be configured and where they are used.
- [ ] Evaluate centralized visibility and bulk replacement against a global default fallback.
- [ ] Specify a recommended approach and its user experience for recovering when an agent or model stops working.
- [ ] Document the decision and enough behavior detail to guide implementation.

## Notes for AI

The explanation leaves open whether recovery should use centralized bulk changes, a global fallback, or another approach. Treat this as a design task: examine the existing product configuration and recommend a solution without assuming either proposed option is required.

## Scope

This task covers deciding and documenting the recovery experience. Implementation is deferred until the approach is agreed.

## Original prompt

Sometimes a coding agent becomes unavailable (e.g. you ran out of usage credits for the month) or it's having a problem and you need to turn it off everywhere and replace it with another coding agent + model combo that works. We might need to have a tab in the agents that shows all currently set coding agent + model combos (and where they're being used, e.g. which agent or which task override etc) and change them all at once if say for example a coding agent or model stops working and you don't want to get hit by random agent/model failures that you need to hunt down and change one-by-one. Or another option would be to set a global default fallback agent+model which gets used whenever there's this kind of error. Let's think about it...because it's fairly common.

## Activity

- 2026-10-13T12:38:26Z · created · hello@repoos.org
- 2026-10-13T12:38:48Z · status draft→inbox, title, area, type, body
- 2026-10-20T04:27:02Z · status inbox→ready
- 2026-10-20T04:27:05Z · cli_override, model_override
- 2026-10-20T04:27:09Z · status ready→active, branch
- 2026-10-20T04:30:06Z · body
- 2026-10-20T04:38:56Z · status active→review
- 2026-10-20T04:38:56Z · note: shots: skipped — the diff (3 changed paths) touches no capture target's globs — no UI change to capture
- 2026-10-20T04:39:44Z · note: review pass 1: needs some work
- 2026-10-20T04:39:45Z · status review→active
- 2026-10-20T04:42:01Z · body
- 2026-10-20T04:49:20Z · status active→review
- 2026-10-20T04:49:22Z · note: shots: skipped — the diff (3 changed paths) touches no capture target's globs — no UI change to capture
- 2026-10-20T04:49:59Z · note: review pass 2: good to go
- 2026-10-20T05:54:12Z · close-out gate completed in 3s

