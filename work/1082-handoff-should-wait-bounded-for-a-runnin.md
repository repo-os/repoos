---
id: "1082"
title: Handoff should wait (bounded) for a running self-check instead of failing 'A check is running; wait for it to finish'
type: bug
status: inbox
priority: p1
area: [server, core]
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
cli_override: cursor
model_override: composer-2.5
created_at: "2026-11-09T20:11:19Z"
updated_at: "2026-11-09T23:28:11Z"
---
## Problem
Since #1061 landed (check-gate lock), a handoff whose commit step runs while the engineer's own `repoos check` still holds the lock fails immediately with "git add failed: A check is running; wait for it to finish." (seen on #1073 and #1076 on 2026-11-10 around 03:00). The handoff does not wait or retry, so the task looks stuck until an engineer notices and re-requests handoff. Several tasks hit this at the same time and sat for 40+ minutes.

## Desired UX
A handoff that arrives while a self-check is running waits for it (bounded, for example up to the check's own timeout, with a visible "waiting for the running check to finish" state) and then proceeds; it fails only if the wait times out. The engineer never needs to retry by hand.

## Acceptance criteria
1. The handoff commit step (and any other server git operation refused by the lock for a reason that is just 'a check is running') waits for lock release with bounded polling, not an immediate failure; the task shows a plain-English waiting state.
2. If the holder process is dead or the lock is stale, recovery runs first and the handoff proceeds.
3. Tests: handoff during a running check waits and succeeds; times out cleanly; stale lock is recovered.
4. Docs: docs/check-run-history.md and user-docs/check.md describe the behaviour.

## Notes for AI
Look at `src/server/check-gate-lock.ts` (`CHECK_GATE_WRITE_REFUSAL`), `src/server/handoff.ts` (commit step) and `src/core/git.ts` (the guarded git add/commit). Do not edit repoos.toml.

## Activity

- 2026-11-09T20:11:19Z · created · njachowski@gmail.com
- 2026-11-09T23:28:11Z · cli_override, model_override
