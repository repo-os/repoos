---
id: "0273"
title: "Cost ledger: reviewer and PM missing tokens/cost, only time shown"
type: bug
status: ready
priority: p2
area: server
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-24T15:56:39Z"
updated_at: "2026-08-24T19:40:13Z"
---
## Problem
In the tokens tab, the reviewer has only elapsed time, no token counts or cost, despite all agents (including the reviewer) using the same model. The PM agent has no time/token/cost info at all.

## Fix
Wire reviewer and PM turns into the same usage-extraction path used for the engineer (extractUsage / the ledger from #0175/#0176), so both show tokens and cost, not just time.

See src/server/agents.ts and the cost/time ledger.

## Activity

- 2026-08-24T15:59:39Z · body
- 2026-08-24T19:40:13Z · status inbox→ready
