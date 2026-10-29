---
id: "0977"
title: Do not probe a paused agent for its usage limit until its reset time
type: bug
status: active
needs_input: true
needs_input_reason: dev-error
needs_input_detail: "Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh"
priority: p2
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/do-not-probe-a-paused-agent-for-its-usag
cli_override: cursor
model_override: grok-4.7-low
created_at: "2026-10-29T07:23:47Z"
updated_at: "2026-10-29T08:12:02Z"
dev_error_count: 3
engineer_crash_log: "[{\"cli\":\"cursor\",\"model\":\"grok-4.7-low\",\"at\":\"2026-10-29T07:51:57.197Z\",\"kind\":\"dev-error\"},{\"cli\":\"cursor\",\"model\":\"grok-4.7-low\",\"at\":\"2026-10-29T08:11:02.388Z\",\"kind\":\"dev-error\"}]"
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
- 2026-10-29T07:35:34Z · agent exited with an error (cursor) · Cannot use this model: grok-4.7-low. Available models:
- 2026-10-29T07:35:34Z · engineer crash recovery: resuming cursor + grok-4.7-low (1/3 crashes in 30m) · Cannot use this model: grok-4.7-low. Available models:
- 2026-10-29T08:09:54Z · engineer crash recovery: resuming cursor + grok-4.7-low (2/12 crashes in 30m) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-10-29T08:12:02Z · engineer crash recovery: resuming cursor + grok-4.7-low (2/12 crashes in 30m) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
