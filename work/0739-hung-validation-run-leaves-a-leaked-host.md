---
id: "0739"
title: "Hung validation run leaves a leaked host slot: 'HUNG · KILLING' never clears, and the run's bundle file is left on the host"
type: bug
status: inbox
priority: p1
area: server
story: "Autopilot: the CTO handles the routine, humans handle exceptions"
assigned_to: ai
created_by: ""
branch: ""
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-07T14:04:05Z"
updated_at: "2026-10-07T14:04:17Z"
---
## Problem

2026-10-07: #0737's close-out run on thinkpad was flagged hung at 13:54:13Z (log: 'remote validation run for #0737 looks hung on thinkpad — killing repoos-validate-0737-e6c83475'). Verified over ssh at 14:03Z: no container exists on thinkpad and no validate process, but the server still reports the run as in flight (activeRuns hung:true, startedAt 13:33:30Z, UI 'HUNG · KILLING' counting up past 29 minutes), so thinkpad shows 1/2 in flight and a slot stays occupied until the server restarts. The run's uploaded bundle ~/.repoos-0737-ad4fca45.bundle is also still on the host (validate.sh only removes it via its EXIT trap, which a killed container never ran). Related earlier cases: bee run flagged hung 13:32:54Z after the gate had already finished with exit 1 (container lingered ~11 min), and the retry on another host masked the real test failure.

## Desired UX

- A kill is a bounded operation: if the container is gone (or the kill command exits), the run is finished, its slot is released and its in-flight entry removed immediately; if the kill itself hangs, time out (e.g. 30 s), log it and release the slot anyway, and report the host as degraded.
- After a kill, the server removes the run's leftover files on the host (bundle, artifacts dir, lock slot) via a separate cleanup ssh call; on every host probe, stale ~/.repoos-<task>-*.bundle files older than a day are pruned.
- A run whose gate already printed its exit status (`[validate] gate exit N`) is never classified as hung: it is a finished failure and is reported with its real cause, not retried on another host as 'transient'.

## Acceptance criteria

- Tests: kill completion releases the slot and clears the entry; a kill that hangs times out and releases; a run past its gate exit is not 'hung'; cleanup removes bundle and artifacts. docs/remote-validation.md updated. repoos check passes.

## Notes for AI

Read #0729's detector and kill path in src/server/remote-validation.ts and the run bookkeeping that feeds the Remote runners tab. Do not touch the owner's hosts from the engineer session.

## Activity

- 2026-10-07T14:04:05Z · created · unknown
- 2026-10-07T14:04:17Z · cli_override, model_override
