---
id: "0981"
title: repoos checks slots lists stale queue positions after a check got its slot
type: bug
status: active
needs_input: true
needs_input_reason: check-wait
needs_input_detail: "waiting: system load is high (6.8× per CPU, limit 3×) — waiting for headroom before starting more work; additional signals: memory compressor use is high (32%, limit 35%) for 12m"
hold: true
hold_reason: "Driver landing by hand (Nick, 2026-10-30)"
hold_by: driver
hold_at: "2026-10-29T17:38:32.174Z"
priority: p2
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/repoos-checks-slots-lists-stale-queue-po
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-10-29T14:44:37Z"
updated_at: "2026-10-29T17:38:32Z"
handoff_signal_retry_count: 1
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
- 2026-10-29T15:06:30Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-29T16:46:22Z · watchdog: check wait escalated · waiting: system load is high (6.8× per CPU, limit 3×) — waiting for headroom before starting more work; additional signals: memory compressor use is high (32%, limit 35%) for 12m · next step: let it finish — the wait clears itself when the check starts running; investigate only if it persists
- 2026-10-29T17:38:32Z · engineer stopped by request
- 2026-10-29T17:38:32Z · held, held-reason, held-by, held-at
