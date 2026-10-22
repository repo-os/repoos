---
id: "0933"
title: Dead engineer left in the agent registry blocks the reviewer ('agent turn in progress')
type: bug
status: active
priority: p1
area: server
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/dead-engineer-left-in-the-agent-registry
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-10-22T08:22:48Z"
updated_at: "2026-10-22T10:12:56Z"
---
## Problem
2026-10-22: after #0918's engineer was killed by hand (pid 11479), .repoos/agents.json still listed it as a running engineer. The task reached review but no reviewer started for 12 minutes, and 'repoos review again' refused with 'Task #0918 has an agent turn in progress — wait for it to finish'. Recovery needed mv active + pause + a second handoff (another ~13 min).

## Desired UX
The registry is reconciled against process liveness (pid dead, or cwd gone) on every dispatch/review decision and by the watchdog every ~15 s; a dead entry is dropped immediately and the reviewer starts. 'No reviewer started' and 'waiting on a dead agent' must show on the task card.

## Acceptance criteria
- Test: registry entry whose pid is dead does not block review start, and is removed.
- Test: a live entry still blocks.

## Notes for AI
Related: #0921 (dead local-check slot holders), #0925 (cancel frees resources), #0869 (watchdog handoff after crash).

## Activity

- 2026-10-22T08:22:48Z · created · njachowski@gmail.com
- 2026-10-22T10:09:06Z · status inbox→ready
- 2026-10-22T10:09:11Z · cli_override, model_override
- 2026-10-22T10:09:12Z · status ready→active, branch
- 2026-10-22T10:12:56Z · body
