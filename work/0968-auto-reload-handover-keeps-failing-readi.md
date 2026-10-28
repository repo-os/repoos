---
id: "0968"
title: "Auto-reload handover keeps failing: readiness-based handshake, give up after N, Settings toggle"
type: bug
status: active
priority: p1
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/auto-reload-handover-keeps-failing-readi
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-10-27T12:03:03Z"
updated_at: "2026-10-28T18:29:04Z"
---
## Problem
The server's build-change auto-reload repeatedly failed: on 2026-10-27 the replacement process was killed by the 30 s handshake timeout 9 times in a row while the old process kept serving the old build, and each attempt dropped UI connections ("server connection issue"). Replacements need ~27-60 s to become ready on this machine. As a stopgap the launchd server now runs with REPOOS_NO_AUTO_RELOAD=1 (commit 4da413c4f) and drivers restart with `just revive`.

## Desired UX
A new build is picked up reliably without dropping the UI, or not at all; never a loop of failed handovers.

## Acceptance criteria
- [ ] Handshake timeout scales with measured boot time (or waits on a readiness signal) instead of a fixed 30 s.
- [ ] After N failed handovers the server stops retrying and shows "restart needed" in the UI instead of retrying forever.
- [ ] A Settings toggle for auto-reload replaces the env-var stopgap (getConfigSchema + Settings UI + docs + test).
- [ ] Tests cover slow-boot success and the give-up path.

## Notes for AI
src/server/reload.ts and server.ts (reloadEnabled). No server restarts, no previews, no repoos.toml edits.

## Activity

- 2026-10-27T12:03:03Z · created · njachowski@gmail.com
- 2026-10-28T16:44:00Z · cli_override, model_override
- 2026-10-28T16:44:25Z · status inbox→ready
- 2026-10-28T16:44:33Z · status ready→active, branch
- 2026-10-28T16:46:13Z · message_queued at 2026-10-28T16:46:13.918Z
- 2026-10-28T17:44:02Z · watchdog: check wait escalated · waiting: waiting for a local check slot (2 ahead, position 3); waiting behind #0956 check (pid 47788, alive), #0975 check (pid 95121, alive) for 15m · next step: let it finish — the wait clears itself when the check starts running; investigate only if it persists
- 2026-10-28T17:54:28Z · watchdog: check wait ended — cleared needs_input
- 2026-10-28T18:26:52Z · message_overdue: still queued after 60m without being delivered
- 2026-10-28T18:29:04Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
