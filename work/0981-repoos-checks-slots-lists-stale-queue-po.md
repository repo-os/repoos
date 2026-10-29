---
id: "0981"
title: repoos checks slots lists stale queue positions after a check got its slot
type: bug
status: active
priority: p2
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/repoos-checks-slots-lists-stale-queue-po
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-10-29T14:44:37Z"
updated_at: "2026-10-29T14:45:09Z"
---
## Problem
`repoos checks slots` printed "queue position 3: #0973, waiting 1431s" while slot 1 was free and the real waiter directory (`~/.repoos/local-check-slots/.queue`) was empty (2026-10-28). The position comes from queue-marker files under `.repoos/queue-markers/` that are not cleared when a check gets its slot or dies, so the listing shows waits that ended long ago. Drivers and humans read it as a stuck queue.

## Desired UX
The slots listing shows only real, current waiters, with true positions.

## Acceptance criteria
- A local-check queue marker is removed when its check acquires a slot, finishes, or is killed (signal handler), and the listing ignores markers whose process is gone or that are older than any real wait.
- Positions are computed from live waiters, not stored at write time.
- Tests: a marker for a check that acquired its slot is not listed; a marker from a dead pid is not listed; two live waiters show positions 1 and 2.

## Notes for AI
`src/commands/checks.ts` (listing), `src/core/local-gates.ts` and `src/core/local-queue-marker.ts` (markers), `src/core/cross-process-slots.ts` (slots and waiters). Markers may need the waiter pid recorded. Do not edit repoos.toml.

## Activity

- 2026-10-29T14:44:37Z · created · njachowski@gmail.com
- 2026-10-29T14:45:02Z · cli_override, model_override
- 2026-10-29T14:45:06Z · status inbox→ready
- 2026-10-29T14:45:09Z · status ready→active, branch
