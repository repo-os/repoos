---
id: "0434"
title: "Docs debt: stale claims in AGENTS.md, docs/, and user-docs/"
type: chore
status: inbox
priority: p2
area: docs-debt
story: MacOS native app
assigned_to: unassigned
created_by: docs-debt-agent
branch: ""
created_at: "2026-09-19T02:09:23.307Z"
updated_at: "2026-09-21T20:11:34Z"
---
## Docs Debt Findings

The Docs Debt Agent verified concrete claims in `AGENTS.md`/`docs/`/`user-docs/` against the actual repo and found 1 that need a human decision.

### 1. `com.repoos.watchdog` checks `/api/health` every minute and kickstarts the service after three consecutive failed checks
- **Doc**: `docs/close-out-pipeline.md`:25
- **Kind**: missing-symbol
- **Severity**: high
- **Evidence**: Searched entire src/ directory for any implementation of a `com.repoos.watchdog` service or health watchdog mechanism. Found: (1) Only `com.repoos.serve.<id>` services are created by service-manager.ts; (2) No separate watchdog service spawned or configured; (3) LaunchAgent uses `KeepAlive` and restart mechanisms, not a separate health-checking daemon; (4) References to `com.repoos.watchdog` exist in close-out-pipeline.md (lines 25-27, 56, 58) but nowhere in the implementation code.
- **Suggested fix**: Either implement the watchdog service as documented, or update close-out-pipeline.md to accurately describe that health monitoring is handled through launchd's KeepAlive and crash-restart behavior rather than a separate watchdog service.

## Next Steps

1. Confirm each finding is real drift and not a deliberate, documented difference.
2. Update the doc(s) or the code so the two agree.
3. Move this task to done when complete.

## Activity

- 2026-09-21T20:11:34Z · story
