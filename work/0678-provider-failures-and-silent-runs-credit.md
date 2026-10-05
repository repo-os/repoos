---
id: "0678"
title: "Provider failures and silent runs: credit/402 alerts, degenerate-output detection, sleep-aware watchdog"
type: feature
status: inbox
priority: p2
area: server
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-10-05T16:58:38Z"
updated_at: "2026-10-05T17:16:50Z"
---
## Problem

- OpenRouter credit ran out mid-run (HTTP 402 `insufficient credits`); engineer sessions simply died and the board gave no alert.
- On heavier tasks DeepSeek via opencode+DeepInfra produced two new failure modes: a run that ended in a runaway loop of `<` tokens (1.4 MB log) and an agent looping on "I'll call the shell tool now ... emitting" without ever calling it; also a request that went silent for 10+ min.
- An agent looked hung for 32 min (log silent; the staleness watchdog did not flag it). The owner's laptop may have been asleep: unknown whether the watchdog counts sleep as a stall.

## Desired UX

- Provider errors (402/credit, auth, rate limit, model unavailable) become a visible notice and a `needs input` reason, not a dead session.
- Detect repetition/degenerate output (same token or line repeated beyond a threshold, or log growth with no tool calls) and stop and retry once, then raise a notice.
- The watchdog compares process liveness and output against awake time (ignore system sleep) and auto-restarts or surfaces a silent run.

## Acceptance criteria

- Tests with stub agents: 402 output -> notice; repeated-token output -> run stopped and flagged; silent run -> flagged after the configured idle time; a simulated sleep gap does not trigger a false stall.
- `repoos check` passes.

## Notes for AI

Evidence comes from building a real 30-task project (opex, a Vue + Bun + Postgres app) with cheap agents on one laptop over ~9 hours. Read `AGENTS.md` first. Never hand-edit work/*.md; use RepoOS commands or APIs. Verify any claim you rely on against the current source before changing behaviour. Where a related task exists it is listed under "See also"; coordinate rather than duplicate.

## Activity

- 2026-10-05T16:58:38Z · created · unknown
- 2026-10-05T17:16:50Z · story
