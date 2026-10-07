---
id: "0729"
title: "Detect and recover hung validation containers on runner hosts (kill, retry on another host, isolate the bun cache per run); CTO safe action"
type: bug
status: active
priority: p1
area: server
story: "Autopilot: the CTO handles the routine, humans handle exceptions"
assigned_to: ai
created_by: ""
branch: feat/detect-and-recover-hung-validation-conta
created_at: "2026-10-07T02:05:35Z"
updated_at: "2026-10-07T05:10:05Z"
---
## Problem

On 2026-10-06/07 validation containers hung with the host idle (load about 0), the log looping 'error: Module not found "/repo/node_modules/vitest/dist/workers/forks.js"': thinkpad (container vibrant_grothendieck, 17:36Z, cancelled by hand, container left running) and bee (container jovial_wu, ~23:49Z: the run took 2404 s then failed, container still running 48 minutes later). Probable cause: the shared named volume repoos-bun-cache written by concurrent runs. Nothing detected it; a human noticed.

## Desired UX

- VERIFY FIRST: reproduce or confirm the cause (concurrent writers to repoos-bun-cache) from the run logs and validate.sh.
- A hang detector: a run whose output has not changed for N minutes while the host is idle (configurable, default about 5 min) is killed (docker rm -f of THAT run's container only), recorded as outcome 'hung' with the last log lines, and retried once on another host.
- Per-run (or per-slot) cache isolation so concurrent runs cannot corrupt each other's installs, or a lock around installs; stale containers from finished/cancelled runs are removed when the run ends or at probe time.
- The Remote runners tab shows 'hung' runs and the cleanup.

## Acceptance criteria

- Tests for the detector (idle output + idle host -> kill + retry), for container cleanup on cancel, and for cache isolation. docs/remote-validation.md updated. repoos check passes.

## Notes for AI

Do not touch the owner's hosts from the engineer session. Related: #0717, #0720, #0725.

## Framing (2026-10-07)

The hang recovery (kill that run's container, retry once on another host) is a CTO safe action (#0688 allowlist, rate limited, audited), not new driver logic.

## Activity

- 2026-10-07T02:05:35Z · created · unknown
- 2026-10-07T02:10:58Z · story
- 2026-10-07T02:11:13Z · title, body
- 2026-10-07T04:34:35Z · status inbox→ready
- 2026-10-07T04:38:48Z · status ready→active, branch
- 2026-10-07T04:42:36Z · note: Driver observed current-server reproduction: #0712 close-out started2026-10-07T04:01:19.634Z, thinkpad upload finished04:01:38Z; no final gate result before timeout after2411s at04:41:40. Cancellation API returned200 at04:31:02Z but remote await continued. New0712 job enqueued04:32 remains queued behind it. This supports current hang/cancellation symptom; shared-bun-cache corruption remains an unproven cause for THIS run (no current missing-worker evidence established). Independently verify diagnosis against current main and running build, record SHA/version and still/partly/already-fixed/misdiagnosed before implementing or approving cross-repo reports. Do not directly touch owner hosts/config; preserve logs and test scoped behavior.
- 2026-10-07T04:51:23Z · note: Driver04:50 current-main diagnosis for cancellation/requeue: integration-job.ts enqueue treats existing.cancelled as stale and overwrites task-keyed job with startedAt:null and no cancelled flag BEFORE prior process returns. Remote close-out awaits runRemotePreReviewGate then checks isCancelled(taskId), so old process observes replacement record, loses cancellation, and updateJob can write its phases into new record. Live0712 exactly shows new enqueuedAt04:32 with phasevalidating but startedAtnull; old run timedout2411s then passed fallback304s04:46:45, main driftresync04:47:31 launched another fullgate04:47:57. Treat generation/running-attempt ownership as a separate verified current-code risk; do not assume shared Bun cache is sole cause. Need regression for cancel->requeue while old remote await still live, old attempt cannot mutate/publish/delete new job, cancellation propagates to remote await. No production recovery by fileediting/hostkill.
- 2026-10-07T05:04:59Z · note: Driver recovery assessment05:04: healthy full gates still take295–304s (#0679 landed,0712 fallback passed), so desired5–6min is plausible; delays are stuckremoteawait + lostcancel/requeue + repeatedmaindrift gate. Current729 uncommitteddiff includes done.ts/remote-validation abort/cleanup, but integration-job.ts/orchestrator.ts ownership files are not modified yet: ensure cancel->requeue while oldawaitalive is covered by regression or explicitly separate followup; do not claim cache isolation alone fixes lostflag/newrecordmutation. Preserve boundedcancel+per-attempt identity before wider CTO/UI scope. Owner must authorize direct host recovery; driver has not killedcontainers/restartedserver/changedconfiguration.
- 2026-10-07T05:08:21Z · note: Owner-authorized recovery05:07: confirmed onbee three abandoned0712containers by artifact mounts/starttimes, all sharingrepoos-bun-cache:37868edddfbf(/artifacts/0712-05a05ddc,04:47:59),3a3dfd946962(0712-d979207f,02:59:31),d727277d2748(0712-c83f1abb,02:10:11). Latestlog repeated missing forks.js; older serverattempts had timedout/fallback/completed butcontainerspersisted. Removed onlythese0712containers; current0733b661fb4c38ee untouched. Latest712remove releasedoldawait05:07:01;733started05:07:02;712ONEretryqueuedafterterminal. Confirms orphan cleanup failure, not yet proof cache concurrent-writer rootcause. No serverrestart/config/cache-volume deletion.
- 2026-10-07T05:10:05Z · body
