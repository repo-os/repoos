---
id: "0968"
title: "Auto-reload handover keeps failing: readiness-based handshake, give up after N, Settings toggle"
type: bug
status: inbox
priority: p1
area: core
assigned_to: ""
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-27T12:03:03Z"
updated_at: "2026-10-27T12:03:03Z"
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
