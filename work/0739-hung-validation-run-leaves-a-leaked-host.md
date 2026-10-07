---
id: "0739"
title: "Hung validation run leaves a leaked host slot: 'HUNG · KILLING' never clears, and the run's bundle file is left on the host"
type: bug
status: active
priority: p1
area: server
story: "Autopilot: the CTO handles the routine, humans handle exceptions"
assigned_to: ai
created_by: ""
branch: feat/hung-validation-run-leaves-a-leaked-host
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-07T14:04:05Z"
updated_at: "2026-10-07T16:07:09Z"
close_out_repair_count: 1
review_passes: 5
review_rounds: 1
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
- 2026-10-07T14:04:20Z · status inbox→ready
- 2026-10-07T14:04:21Z · status ready→active, branch
- 2026-10-07T14:11:03Z · note: Driver independent WIP review under owner fix-it authorization: gateFinished must do more than stop watchdog: bound lingering transport after parsed gate exit N, preserve actual failure and suppress infra retry. Test split-chunk marker plus runRemote pending until abort. Kill must settle/release even when kill dependency never resolves or throws; explicit timeout arg alone is not enough with injected deps. Bind activeRunAbort to execution generation rather than taskId alone, stale completion must not delete/abort newer run. Preserve diagnostic evidence before artifact cleanup. Message rejected busy, so findings persisted for next turn/reviewer; require these regressions before approving. No host/server changes.
- 2026-10-07T14:17:17Z · body
- 2026-10-07T14:17:56Z · body
- 2026-10-07T14:23:53Z · status active→review
- 2026-10-07T14:23:53Z · note: shots: skipped — the diff (4 changed paths) touches no [[preview.paths]] globs — no UI change to capture
- 2026-10-07T14:25:09Z · note: review pass 1: good to go
- 2026-10-07T14:28:35Z · status review→active
- 2026-10-07T14:30:43Z · body
- 2026-10-07T14:37:27Z · body
- 2026-10-07T14:37:30Z · note: Additional current evidence14:37Z: #730 mini run started14:22:32 last output14:23:07; owner otherdriver recorded SSH timeout/unreachable14:35, cancelled/requeuedjob14:35:36, but runners APIstill oldmini activeRun0730. Unknown/unavailable load must NOT disable bounded no-output/liveness detection indefinitely; include regression for unavailable host stats and cancellation cleanup. Do not SSH/changehosts. Existingboundedownershipfix applies, preserve realgate failures.
- 2026-10-07T14:38:46Z · body
- 2026-10-07T14:39:34Z · status active→review
- 2026-10-07T14:39:34Z · note: shots: skipped — the diff (4 changed paths) touches no [[preview.paths]] globs — no UI change to capture
- 2026-10-07T14:41:22Z · note: review pass 2: needs some work
- 2026-10-07T14:41:45Z · note: Independent driver currentcommit inspection14:42: killHungRun/finalizeHungKill still directly await exec.runRemote with timeout argument; no local Promise.race/deadline, so injected kill neverresolves stillblocks finally slotrelease. GateLinger timer only calls abort callback, main exec.runRemote neverresolves if abort callbackdoesnotsettle; need bounded settlement/realgate result. Require explicit fake deps IGNORING timeout/regAbort tests, not just fakesreturntimedOut. Do not mark these acceptance blockers green as edgecases.
- 2026-10-07T15:02:59Z · status review→active
- 2026-10-07T15:05:05Z · body
- 2026-10-07T15:21:59Z · body
- 2026-10-07T15:23:08Z · body
- 2026-10-07T15:25:15Z · body
- 2026-10-07T15:25:45Z · status active→review
- 2026-10-07T15:25:46Z · note: shots: skipped — the diff (4 changed paths) touches no [[preview.paths]] globs — no UI change to capture
- 2026-10-07T15:26:49Z · note: review pass 3: good to go
- 2026-10-07T15:30:56Z · note: Independent15:30 inspection: gate-exit no-op abort Promise.race now fixed; hard kill deadline fixed. Remaining blocker: run=await Promise.race only exec.runRemote + gateLingerPromise. onHung assigns hangRecovery but never resolves a raced terminal promise; finalizeHungKill calls abortMain and releaseSlot, so main runRemote that ignores abort STILL leaves validate() pending forever even though slot is released. Manual kill same issue unless generation abort callback settles validator. Add test MAIN SSH never resolves + abort NOOP + no gate marker; trigger watchdog/manual kill, require validate() settles bounded AND exact slot cleared, preserving hung/cancelled classification. Do not approve current green report until this case passes. No edits while pending handoff; repair after terminal.
- 2026-10-07T15:33:28Z · status review→active
- 2026-10-07T15:34:43Z · body
- 2026-10-07T15:37:08Z · status active→review
- 2026-10-07T15:37:09Z · note: shots: skipped — the diff (4 changed paths) touches no [[preview.paths]] globs — no UI change to capture
- 2026-10-07T15:38:22Z · note: review pass 4: needs some work
- 2026-10-07T15:38:22Z · status review→active
- 2026-10-07T15:43:21Z · body
- 2026-10-07T15:44:49Z · body
- 2026-10-07T15:52:53Z · status active→review
- 2026-10-07T15:52:53Z · note: shots: skipped — the diff (4 changed paths) touches no [[preview.paths]] globs — no UI change to capture
- 2026-10-07T15:53:28Z · note: review pass 5: good to go
- 2026-10-07T16:05:27Z · status review→active
- 2026-10-07T16:05:27Z · note: close-out repair: merge-conflict
- 2026-10-07T16:07:09Z · body
