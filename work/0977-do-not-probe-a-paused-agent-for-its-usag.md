---
id: "0977"
title: Do not probe a paused agent for its usage limit until its reset time
type: bug
status: review
priority: p2
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/do-not-probe-a-paused-agent-for-its-usag
cli_override: cursor
model_override: grok-4.7-low
created_at: "2026-10-29T07:23:47Z"
updated_at: "2026-10-29T11:42:58Z"
---
## Problem
Mission Control's Recent failures fills with "Usage-Limit-Probe · antigravity · gemini … agy exited with code 3: Individual quota reached" every few minutes (seen 2026-10-28), although Antigravity is paused on the budget allowlist until its quota resets in ~147 h. Each probe spends a process start and buries real failures in the list.

## Desired UX
A paused agent or model is not probed at all while its `pausedUntil` is in the future (or while it is paused with no date). Probing resumes at or after the reset time, with backoff, and a probe that still reports a usage limit extends the pause instead of logging a failure every few minutes.

## Acceptance criteria
- No usage-limit probe runs for an allowlist entry that is paused (agent-level or model-level) before its `pausedUntil`; test.
- After `pausedUntil`, at most one probe per backoff interval (doubling, capped), and a usage-limit answer updates `pausedUntil` from the reset time in the error when one is given; test.
- Recent failures on Mission Control no longer list probe runs that only confirm a known pause.

## Notes for AI
Probe call site: search for the `usage-limit-probe` session type. Pause data: `[[budget.allowlist]]` `paused` / `pausedUntil` / `pausedModels`. Reset-time parsing already exists in `src/core/provider-usage-limit.ts` (`parseResetsIn`, `parseTryAgainAt`). Do not edit repoos.toml.

## Activity

- 2026-10-29T07:23:47Z · created · njachowski@gmail.com
- 2026-10-29T07:24:03Z · cli_override, model_override
- 2026-10-29T07:24:22Z · status inbox→ready
- 2026-10-29T07:24:29Z · status ready→active, branch
- 2026-10-29T11:42:58Z · status active→review
