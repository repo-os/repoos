---
id: "0729"
title: "Detect and recover hung validation containers on runner hosts (kill, retry on another host, isolate the bun cache per run); CTO safe action"
type: bug
status: review
priority: p1
area: server
story: "Autopilot: the CTO handles the routine, humans handle exceptions"
assigned_to: ai
created_by: ""
branch: feat/detect-and-recover-hung-validation-conta
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-07T02:05:35Z"
updated_at: "2026-10-07T09:27:31Z"
last_handoff_failure_fingerprint: "check|the worktree changed while the gate was running (HEAD moved from afd774dc to 282c0c91) — the check result no longer describes what is committed, so the handoff was refused. Nothing was lost: the change is still in the worktree. Re-run the handoff once the worktree is stable."
last_handoff_failure_sha: afd774dc2b28ebd2b3cf4007b79467803438f340
review_passes: 3
error: "script \\"test\\" exited with code 1 — fix it in the feature branch and re-run the gate. The same worktree can be resumed and retried.\""
review_rounds: 1
dev_error_count: 1
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

## Shots
```json
[
  {
    "label": "Checks Remote runners tab",
    "target": "default",
    "route": "/checks?tab=remote",
    "highlight": ".rr-panel"
  }
]
```

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
- 2026-10-07T05:10:41Z · note: CONFIRMED CURRENT ROOT CAUSE05:09: installed validate.sh and main scripts/remote-runner/validate.sh lines46-53 startup loops ALL $HOME/.repoos-validate.* and rm-rf each without checking livecontainers. A concurrent/new run deletes another ACTIVE /repo mount. Current733containerb661fb4c38ee artifact0733-a4cab256 /home/nick/.repoos-validate.2DVaje/repo: initially installed422deps/build/tests, then forks.jsmissing; dockerexec-w/tmp ls shows /repo empty and node_modules absent. Earlier712dockerexec failedcwdoutside mount. This is strong directevidence of working-directory deletion, NOT proofshared-cache corruption. Include regression concurrentrunB startup preservesactiveA workspace. Ownerauthorizedoperationalrecovery; driverpreparingbackup+disableunsafeinstalledstartup sweep only, retainownrunEXITcleanup; no source/maincommit.
- 2026-10-07T05:11:51Z · body
- 2026-10-07T05:12:43Z · body: section Shots
- 2026-10-07T05:15:31Z · note: Owner installed emergencybee fix05:15 verified sha2560801359952ad988407de02eaf448a353409eb18a6ef6b90bbf74904aaa2bb345 andbash-nPASS. RemovedunsafeALLworkspace startup sweep, ownrunEXITcleanup retained; backup /opt/repoos/validate.sh.before-recovery-20261007. Thisoperationalguard MUSTland in source via729 withconcurrentactiveworkspace regression, not be overwrittenbyunfixedrunnerrefresh. Thinkpad/mini notchanged (exactauthorization/sudo pending). Current712controlledrunonbee started05:12 butcancelledflagtrue; letitend,noflagclearing/requeuewhilealive.733previousfailedterminal, onecontrolledretryqueuedafterfix.
- 2026-10-07T05:19:48Z · note: All THREE installed runner scripts now repaired byowner; independentlyverifiedbee/thinkpad/mini sameSHA2560801359952ad988407de02eaf448a353409eb18a6ef6b90bbf74904aaa2bb345 andbash-nPASS. Backup on each /opt/repoos/validate.sh.before-recovery-20261007. No sourcefixlandedyet: preserveunsafe-active-workspace startup deletion regression and deploysafety. Current712runbegan05:12 beforeguardinstallation, cancelledflagretained; nextcontrolled733 queued05:15 willstartwithfixedscript. Avoidmanualjobflagreset/requeuewhilealive.
- 2026-10-07T05:21:01Z · handoff failed · remote validation failed: remote validation failed (exit 1) — ""
 ❯ tests/agent-serve-guard.test.ts:110:22
    108|       // Guidance points the agent at the managed preview — the one sa…
    109|       // way to verify a UI.
    110|       expect(stderr).toMatch(/may not launch `repoos serve`/i);
       |                      ^
    111|       expect(stderr).toMatch(/preview/i);
    112|     } finally {
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed | 427 passed | 1 skipped (429)
      Tests  1 failed | 5171 passed | 15 skipped (5187)
   Start at  05:14:38
   Duration  272.42s (transform 6.61s, setup 2.38s, import 50.98s, tests 221.70s, environment 242.93s)
 RUN  v4.1.10 /repo/src/ui-app
 ✓ tests/boot-timing.test.ts (2 tests) 413ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  05:19:11
   Duration  2.46s (transform 1.20s, setup 11ms, import 1.50s, tests 413ms, environment 468ms)
error: script "test" exited with code 1 — fix it in the feature branch and re-run the gate
- 2026-10-07T05:26:56Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: remote validation failed (exit 1) — "" · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-07T05:26:57Z · status review→active
- 2026-10-07T05:31:56Z · status active→review
- 2026-10-07T05:31:57Z · note: shots: skipped — 1 handoff shot already captured during finalization (#0680)
- 2026-10-07T05:32:31Z · note: BLOCKING DRIVER DIFF FINDING05:32: independent gitdiff main --scripts/remote-runner/validate.sh shows this branch STILL RETAINS the old for_stale ALL .repoos-validate.* startup rm-rf loop. New not-running-container sweep/cache isolation does NOT protect ACTIVEworkdirs from that loop. Do NOTapprove/land/deploy this branch until it removes/restricts startupworkspace sweep and adds concurrent-active-workspace preservation regression. Ownerinstalledguardall3 is alreadyverified operationally; taskmustpreserve equivalentguard inSOURCE. A release fromcurrentmain orcurrent729branch would reintroduce rootcause onrunnerinstallation. Fullgatepassed265smini doesnotverifythisconcurrency property. Respectpendinghandoff/reviewfreeze: returnactiveviaAPI beforefixes, coordinatewriter first.
- 2026-10-07T05:33:01Z · note: review pass 1: needs some work
- 2026-10-07T05:33:01Z · status review→active
- 2026-10-07T06:23:40Z · agent exited with an error (opencode) · ✗ Server finalization stopped at check: remote validation failed: remote validation failed (exit 1) — ""
 ❯ tests/agent-serve-guard.test.ts:110:22
    108|       // Guidance points the agent at the managed preview — the one sa…
    109|       // way to verify a UI.
    110|       expect(stderr).toMatch(/may not launch `repoos serve`/i);
       |                      ^
    111|       expect(stderr).toMatch(/preview/i);
    112|     } finally {
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed | 427 passed | 1 skipped (429)
      Tests  1 failed | 5171 passed | 15 skipped (5187)
   Start at  05:14:38
   Duration  272.42s (transform 6.61s, setup 2.38s, import 50.98s, tests 221.70s, environment 242.93s)
 RUN  v4.1.10 /repo/src/ui-app
 ✓ tests/boot-timing.test.ts (2 tests) 413ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  05:19:11
   Duration  2.46s (transform 1.20s, setup 11ms, import 1.50s, tests 413ms, environment 468ms)
error: script "test" exited with code 1 — fix it in the feature branch and re-run the gate. The same worktree can be resumed and retried.
- 2026-10-07T06:24:23Z · needs_input
- 2026-10-07T06:24:24Z · cli_override, model_override
- 2026-10-07T06:26:37Z · body
- 2026-10-07T06:27:36Z · body
- 2026-10-07T06:28:16Z · status active→review
- 2026-10-07T06:28:17Z · note: shots: skipped — 1 handoff shot already captured during finalization (#0680)
- 2026-10-07T06:29:16Z · note: review pass 2: good to go
- 2026-10-07T06:33:26Z · handoff failed · remote validation failed: remote validation failed (exit 1) —  ❯ tests/config-docs.test.ts:35:21
     33|     const normalized = configurationDoc.replace(/\[\]/g, "");
     34|     const missing = SUPPORTED_TOML_KEYS.filter((key) => !normalized.in…
     35|     expect(missing).toEqual([]);
       |                     ^
     36|   });
     37|
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯
 Test Files  1 failed | 427 passed | 1 skipped (429)
      Tests  2 failed | 5179 passed | 15 skipped (5196)
   Start at  06:28:48
   Duration  272.96s (transform 6.49s, setup 2.35s, import 50.91s, tests 221.43s, environment 244.29s)
 RUN  v4.1.10 /repo/src/ui-app
 ✓ tests/boot-timing.test.ts (2 tests) 422ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  06:33:22
   Duration  2.29s (transform 1.05s, setup 11ms, import 1.31s, tests 422ms, environment 470ms)
error: script "test" exited with code 1
[validate] gate exit 1 — fix it in the feature branch and re-run the gate
- 2026-10-07T08:58:17Z · status review→active
- 2026-10-07T09:00:56Z · body: section Shots
- 2026-10-07T09:02:46Z · body
- 2026-10-07T09:03:51Z · body
- 2026-10-07T09:04:45Z · note: Driver review blocker: rvFixture=hung-runs currently swaps host data in production RemoteRunnersPanel.vue without a preview-only guard. This introduces a diagnostic product mode solely for screenshots and can leave real moveHost controls bound to fixture-hosts when hostPoolEditable is true. Remove production query-fixture plumbing and dedicated src fixture; capture labeled evidence in a temporary Playwright harness with route-intercepted /api/remote-validation/status only, no production state or config writes. Do not handoff until addressed. Existing source hang fix remains scope. --json
- 2026-10-07T09:05:26Z · body
- 2026-10-07T09:06:10Z · status active→review
- 2026-10-07T09:06:10Z · note: shots: skipped — 2 shots already captured — an engineer-made capture pre-empts the automatic one
- 2026-10-07T09:07:39Z · note: review pass 3: good to go
- 2026-10-07T09:12:40Z · status review→active
- 2026-10-07T09:13:50Z · body: section Shots
- 2026-10-07T09:15:50Z · body
- 2026-10-07T09:22:05Z · handoff failed · ui-review handoff failed at check · the worktree changed while the gate was running (HEAD moved from afd774dc to 282c0c91) — the check result no longer describes what is committed, so the handoff was refused. Nothing was lost: the change is still in the worktree. Re-run the handoff once the worktree is stable.
- 2026-10-07T09:26:10Z · status active→review
- 2026-10-07T09:26:11Z · note: shots: skipped — 4 shots already captured — an engineer-made capture pre-empts the automatic one
- 2026-10-07T09:27:31Z · note: review pass 4: good to go
