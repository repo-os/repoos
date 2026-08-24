---
id: "0273"
title: "Cost ledger: reviewer and PM missing tokens/cost, only time shown"
type: bug
status: done
priority: p2
area: server
assigned_to: ai
created_by: ""
branch: feat/cost-ledger-reviewer-and-pm-missing-toke
model_override: default
created_at: "2026-08-24T15:56:39Z"
updated_at: "2026-08-24T20:43:49Z"
---
## Problem
In the tokens tab, the reviewer has only elapsed time, no token counts or cost, despite all agents (including the reviewer) using the same model. The PM agent has no time/token/cost info at all.

## Fix
Wire reviewer and PM turns into the same usage-extraction path used for the engineer (extractUsage / the ledger from #0175/#0176), so both show tokens and cost, not just time.

See src/server/agents.ts and the cost/time ledger.

## Activity

- 2026-08-24T15:59:39Z · body
- 2026-08-24T19:40:13Z · status inbox→ready
- 2026-08-24T19:40:19Z · status ready→active, branch
- 2026-08-24T20:18:36Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been emitted on its own line — the agent's final line must be exactly `::repoos-handoff-ready::` (see #0154/#0155 for signal-line rendering bugs)
- 2026-08-24T20:18:37Z · status review→active
- 2026-08-24T20:34:30Z · status active→review
- 2026-08-24T20:39:12Z · model_override
- 2026-08-24T20:40:24Z · status review→done, release:success
