---
id: "1101"
title: "Flaky test: remote-host-pool 'times out while deferred and removes stale dead-pid queue entries' fails under load (from #1099)"
type: bug
status: inbox
priority: p2
area: server
assigned_to: ""
created_by: t@t
branch: ""
created_at: "2026-11-13T05:55:54Z"
updated_at: "2026-11-13T05:55:54Z"
---
## Problem
src/ui-app/tests/remote-host-pool.test.ts "times out while deferred and removes stale dead-pid queue entries" (added by #1099) passes alone on main (2.1s) but fails in the full-file run and in remote validation on a loaded machine: `expect(readdirSync(waitDir)).toEqual([String(process.pid)])` (line ~2447). It blocked #1081 twice remotely on 2026-11-13 even though the task does not touch remote validation.

## Acceptance criteria
- The test (or the lock-wait cleanup it covers) is deterministic under load: no fixed 10s timeout or timing-dependent directory listing; reproduce by running the whole file alongside other suites.
- Document the cause in docs/debugging-check-failures.md.

## Notes for AI
It passes in isolation, so look for a race between stale-entry cleanup and the live-pid entry, or a timing budget (waitSecs 2 vs the 7s assertion) that breaks when the machine is busy. Do not just raise the timeout.

## Activity

- 2026-11-13T05:55:54Z · created · t@t
