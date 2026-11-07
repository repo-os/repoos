---
id: 1049
title: "Remote validation: stop killing healthy runs as hung; keep evidence; reap leaked containers"
type: bug
status: active
priority: p0
area: server
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/remote-validation-stop-killing-healthy-r
cli_override: codex
model_override: gpt-6-luna
review_cli_override: github copilot
created_at: "2026-11-07T03:30:53Z"
updated_at: "2026-11-07T11:11:20Z"
check_retry_count: 2
last_check_failure: "repoos check at 2026-11-07T08:53:19.245Z: repoos check failed: ui verification failed (2 issue(s)): [missing-target] Task debug events with expanded remote details (target \"default\"): state \"drawer:debugLogs\" did not render on target \"default\" — /work has no open drawer/dialog (declare the route that opens it, e.g. /work?task=9999&tab=changes) (http://127.0.0.1:50620/work?shotState=drawer%3AdebugLogs); [missing-target] Task debug events with expanded remote details (target \"default\"): highlight .debug-event matched nothing on /work (htt… (truncated)"
review_rounds: 1
review_passes: 1
engineer_stall_resume_log: "[{\"at\":\"2026-11-07T04:41:31.843Z\",\"reason\":\"handoff-deferred\"},{\"at\":\"2026-11-07T05:53:23.454Z\",\"reason\":\"handoff-deferred\"},{\"at\":\"2026-11-07T07:19:30.902Z\",\"reason\":\"clean-exit-without-handoff\"},{\"at\":\"2026-11-07T09:38:04.474Z\",\"reason\":\"clean-exit-without-handoff\"},{\"at\":\"2026-11-07T09:51:34.771Z\",\"reason\":\"clean-exit-without-handoff\"}]"
---
## Problem

Remote validation runs are repeatedly killed as "hung" and retried on other hosts, burning 20+ minutes per task before falling back to local. Observed 2026-11-06/07 on #1046 (hung on thinkpad, bee and mini in turn, three times over), #1045 and #1047 (hung at 02:57, 03:04, 03:10, 03:11 UTC). When a run did stream output it passed (thinkpad 626 s and 836 s), and a live run showed no output gap over 20 s through install, build and all 680 tests.

Findings from the investigation (no single root cause proven):

- Every killed run was killed about 6.5 min after it started, so the server saw no output from the first moment.
- At 03:09 UTC a run for #1047 passed on thinkpad while an earlier #1047 run on the same host was declared hung, which argues for a stalled stream on one run, not a host failure.
- The Mac's link to the runners is flaky: ssh "Operation timed out", RTT 5-15 s, throughput probes under the 200 KB/s floor, repeatedly over several days. The server itself did not stall (no log gaps).
- `detectHungRun` in `src/server/remote-validation.ts` decides from the Mac's view of the output stream plus a second-ssh load probe. When the probe fails, load is "unknown" and the run is killed after the 5-minute threshold regardless of host state.
- The container is removed on kill, so the cause of the silence cannot be inspected afterwards.
- Seven validation containers on thinkpad (#0991, #1004, #1007, #1016, #1034) have been running 2-7 days and are never reaped.
- The system log line "remote validation host thinkpad marked unavailable: degraded: bun install EACCES" at 02:00 UTC is a test case's JSON output (from `remote-host-pool.test.ts`) captured into the log, not a real host failure.

## Desired UX

- A healthy run is not killed because the Mac-to-host link or the load probe is flaky.
- When a run is killed as hung, the cause can be found afterwards: container logs and state are saved and shown in the task's remote-validation events or Runners tab.
- The runners tab and logs say which condition fired (stream silent, host idle, probe failed) in plain words.
- Leaked containers on runners are cleaned up automatically and visibly.

## Acceptance criteria

- A failed or timed-out load probe is treated as "unknown, not idle": it never by itself marks a run hung. Table-driven tests in the style of the existing `detectHungRun` tests cover probe-failed, probe-slow and probe-ok cases.
- Before a hung run's container is removed, its last N lines of `docker logs` plus `docker inspect` state are captured and attached to the event, and a test proves the capture happens before removal.
- The hang decision consults the host's own view (for example `docker logs --since` or container CPU on the host) as well as the local stream, so a stalled ssh pipe alone does not kill a progressing container; tests cover a stalled stream with a progressing container.
- Containers older than the run cap (25 min) that no active run owns are removed by a reaper on each host, with a log line and a test.
- The log line that mixes test output into a host-degraded message is fixed so only a real degraded reason is recorded, with a test.
- The kill reason recorded in the event states which condition fired.
- Docs (`docs/remote-validation.md`) updated for the new hang rules.

## Notes for AI

- Start in `src/server/remote-validation.ts`: `detectHungRun`, `HangWatchdog`, the load sampling timer near the run setup (`loadTimer`, `loadUnknownSince`), and `finalizeHungKill`.
- Look at where the "marked unavailable: degraded" message is built and why the captured stream text ends up in it.
- Do not pick new numeric thresholds for memory or swap; this is only about hang detection and cleanup (see the resource-pressure rule in AGENTS.md).
- Evidence: `.repoos/logs/system.log` (warn lines "looks hung", link probe failures) and `repoos api GET /api/tasks/1046/remote-validation/events`.

## Shots
```json
[
{
"label": "Task debug events with expanded remote details",
"target": "default",
"route": "/work?task=9999&tab=debug",
"highlight": ".debug-event[data-debug-event^=\"remote-\"]",
"state": "drawer:debugLogs"
}
]
```

## Activity

- 2026-11-07T03:30:53Z · created · njachowski@gmail.com
- 2026-11-07T03:51:05Z · cli_override, model_override
- 2026-11-07T03:51:12Z · model_override
- 2026-11-07T03:51:16Z · review_cli_override
- 2026-11-07T03:51:17Z · review_model_override
- 2026-11-07T03:51:17Z · status inbox→ready
- 2026-11-07T03:51:19Z · status ready→active, branch
- 2026-11-07T04:04:03Z · CTO nudge: held — handoff gate is running
- 2026-11-07T04:12:50Z · handoff failed · remote validation failed: test failure: tests/remote-host-pool.test.ts > hung run recovery end to end (#0729) > shows hung · killing on the active run while the kill SSH is still pending (#0735), tests/remote-host-pool.test.ts > hung run recovery end to end (#0729) > kills a stalled run's container and retries it on another host, tests/remote-host-pool.test.ts > hung run recovery end to end (#0729) > settles validate when hang kill completes but main SSH never resolves and abort is a no-op (#0739) on mini — fix it in the feature branch and re-run the gate
- 2026-11-07T04:12:50Z · message_queued at 2026-11-07T04:12:50.933Z
- 2026-11-07T04:14:03Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-07T04:19:06Z · message_delivered: 1 message(s)
- 2026-11-07T04:19:08Z · CTO action: restart-stalled-agent (resume) · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/remote-host-pool.test.ts > hung run recovery end to end (#0729) > shows hung · killing on the active run while the kill SSH is still pending (#0735), tests/remote-host-pool.test.ts > hung run recovery end to end (#0729) > kills a stalled run's container and retries it on another host, tests/remote-host-pool.test.ts > hung run recovery end to end (#0729) > settles validate when hang kill completes but main SSH never resolves and abort is a no-op (#0739) on mini — fix it in the feature branch and re-run the gate
- 2026-11-07T04:34:03Z · CTO nudge: held — handoff gate is running
- 2026-11-07T04:41:20Z · handoff failed · remote validation failed: test failure: tests/agent-review.test.ts > agent review before human sign-off (#0101) > persists partial output as incomplete when no verdict is present, tests/remote-host-pool.test.ts > remote gate profiles (#0970) > sends phase pre-review and explicit profile undefined to the browser gate, tests/remote-host-pool.test.ts > remote gate profiles (#0970) > sends phase close-out and explicit profile undefined to the browser gate on mini — fix it in the feature branch and re-run the gate
- 2026-11-07T04:41:21Z · message_queued at 2026-11-07T04:41:21.355Z
- 2026-11-07T04:41:31Z · watchdog: auto-resumed engineer to read a deferred handoff message · resume 1/3
- 2026-11-07T04:41:35Z · message_delivered: 1 message(s)
- 2026-11-07T05:09:03Z · CTO nudge: held — handoff gate is running
- 2026-11-07T05:19:34Z · message_queued at 2026-11-07T05:19:34.732Z
- 2026-11-07T05:19:37Z · message_delivered: 1 message(s)
- 2026-11-07T05:31:20Z · note: adopted orphaned engineer pid 83257
- 2026-11-07T05:33:59Z · message_queued at 2026-11-07T05:33:59.269Z
- 2026-11-07T05:36:19Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-07T05:41:22Z · message_delivered: 1 message(s)
- 2026-11-07T05:41:24Z · CTO action: restart-stalled-agent (resume) · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/remote-host-pool.test.ts > hung run recovery end to end (#0729) > shows hung · killing on the active run while the kill SSH is still pending (#0735), tests/remote-host-pool.test.ts > hung run recovery end to end (#0729) > kills a stalled run's container and retries it on another host, tests/remote-host-pool.test.ts > hung run recovery end to end (#0729) > settles validate when hang kill completes but main SSH never resolves and abort is a no-op (#0739) on mini — fix it in the feature branch and re-run the gate
- 2026-11-07T05:45:15Z · body
- 2026-11-07T05:45:18Z · message_queued at 2026-11-07T05:45:18.734Z
- 2026-11-07T05:47:53Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-07T05:47:53Z · message_queued at 2026-11-07T05:47:53.352Z
- 2026-11-07T05:47:53Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: Perfect! The check passed and the engineering report has been written. All the implementation work is complete and the tests are passing. Let me verify the worktree state and request handoff: · stderr: (empty)
- 2026-11-07T05:47:53Z · message_delivered: 2 message(s)
- 2026-11-07T05:48:18Z · message_queued at 2026-11-07T05:48:18.113Z
- 2026-11-07T05:53:23Z · watchdog: auto-resumed engineer to read a deferred handoff message · resume 2/3
- 2026-11-07T05:53:26Z · message_delivered: 1 message(s)
- 2026-11-07T06:07:11Z · engineer stopped by request
- 2026-11-07T06:11:19Z · CTO nudge: held — handoff gate is running
- 2026-11-07T06:25:00Z · handoff failed · remote validation failed: test failure: tests/remote-host-pool.test.ts > TailscaleRunner pool dispatch (#0521) > skips a host after its SSH bundle upload fails, tests/remote-host-pool.test.ts > TailscaleRunner pool dispatch (#0521) > records a queued event while a job waits for a host slot (#0568), tests/remote-host-pool.test.ts > TailscaleRunner pool dispatch (#0521) > runs two jobs on two hosts and queues a third until one frees on thinkpad — fix it in the feature branch and re-run the gate
- 2026-11-07T06:25:00Z · message_queued at 2026-11-07T06:25:00.663Z
- 2026-11-07T06:26:19Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-07T06:31:23Z · message_delivered: 1 message(s)
- 2026-11-07T06:31:28Z · CTO action: restart-stalled-agent (fresh) · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/remote-host-pool.test.ts > hung run recovery end to end (#0729) > shows hung · killing on the active run while the kill SSH is still pending (#0735), tests/remote-host-pool.test.ts > hung run recovery end to end (#0729) > kills a stalled run's container and retries it on another host, tests/remote-host-pool.test.ts > hung run recovery end to end (#0729) > settles validate when hang kill completes but main SSH never resolves and abort is a no-op (#0739) on mini — fix it in the feature branch and re-run the gate
- 2026-11-07T06:40:00Z · engineer stopped by request
- 2026-11-07T06:40:02Z · cli_override, model_override
- 2026-11-07T06:40:15Z · review_cli_override, review_model_override
- 2026-11-07T06:40:16Z · message_queued at 2026-11-07T06:40:16.006Z
- 2026-11-07T06:41:19Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-07T06:58:00Z · body
- 2026-11-07T07:08:40Z · body
- 2026-11-07T07:13:03Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-07T07:13:03Z · message_queued at 2026-11-07T07:13:03.419Z
- 2026-11-07T07:13:03Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: no assistant message · stderr: Reading additional input from stdin... 2026-11-07T06:44:06.202650Z ERROR codex_core::tools::router: error=apply_patch verification failed: Failed to find expected lines in /Users/nick/code/nick/repoos-worktrees/feat/remote-validation-stop-killing-healthy-r/docs/remote-validation.md: **not** `status=running`, so a live…
- 2026-11-07T07:13:03Z · message_delivered: 2 message(s)
- 2026-11-07T07:14:26Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: I can’t see a queued message for #1049 to read. The available queued-message API currently shows only a message for #1047, so I haven’t requested handoff again. Please resend the #1049 message here or make it available in the task queue; I… · stderr: 2026-11-07T07:12:15.132781Z ERROR codex_core::tools::router: error=write_stdin failed: Unknown process id 32150
- 2026-11-07T07:19:30Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 3/3
- 2026-11-07T07:24:46Z · body
- 2026-11-07T07:30:37Z · status active→review
- 2026-11-07T07:30:37Z · message_queued at 2026-11-07T07:30:37.743Z
- 2026-11-07T07:30:37Z · note: shots: skipped — the diff (5 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-07T07:33:01Z · note: review pass 1: needs some work
- 2026-11-07T07:33:01Z · message_delivered: 1 message(s)
- 2026-11-07T07:33:01Z · status review→active
- 2026-11-07T07:38:18Z · body
- 2026-11-07T07:45:25Z · body
- 2026-11-07T07:51:20Z · CTO nudge: held — handoff gate is running
- 2026-11-07T08:13:54Z · note: ui verification failed (10 issue(s)): [request] HTTP 404 for http://127.0.0.1:63511/api/tasks/1049/diff-stats (http://127.0.0.1:63511/api/tasks/1049/diff-stats); [request] Failed to load resource: the server responded with a status of 404 (Not Found) (http://127.0.0.1:63511/api/tasks/1049/diff-stats); [request] HTTP 404 for http://127.0.0.1:63511/api/tasks/1049/engineering-reports (http://127.0.0.1:63511/api/tasks/1049/engineering-reports); [request] Failed to load resource: the server responded
- 2026-11-07T08:13:54Z · message_queued at 2026-11-07T08:13:54.983Z
- 2026-11-07T08:13:58Z · message_delivered: 1 message(s)
- 2026-11-07T08:15:48Z · body
- 2026-11-07T08:22:54Z · body
- 2026-11-07T08:26:20Z · CTO nudge: held — handoff gate is running
- 2026-11-07T08:53:15Z · note: ui verification failed (2 issue(s)): [missing-target] Task debug events with expanded remote details (target "default"): state "drawer:debugLogs" did not render on target "default" — /work has no open drawer/dialog (declare the route that opens it, e.g. /work?task=9999&tab=changes) (http://127.0.0.1:50620/work?shotState=drawer%3AdebugLogs); [missing-target] Task debug events with expanded remote details (target "default"): highlight .debug-event matched nothing on /work (http://127.0.0.1:50620/w
- 2026-11-07T08:53:15Z · message_queued at 2026-11-07T08:53:15.781Z
- 2026-11-07T08:53:18Z · message_delivered: 1 message(s)
- 2026-11-07T08:53:36Z · body
- 2026-11-07T08:59:04Z · body
- 2026-11-07T09:01:20Z · CTO nudge: held — handoff gate is running
- 2026-11-07T09:02:47Z · handoff failed · check failed after 2 automatic retries · repoos check failed: ui-smoke — $ bun scripts/ui-smoke.mjs
- 2026-11-07T09:02:47Z · message_queued at 2026-11-07T09:02:47.863Z
- 2026-11-07T09:06:20Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-07T09:06:37Z · message_delivered: 1 message(s)
- 2026-11-07T09:07:10Z · body
- 2026-11-07T09:33:01Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The earlier handoff’s `ui-smoke` failure is resolved: UI smoke passed on the latest check. However, `repoos check --changed main` still failed two tests in the local fallback: - `remote-validation.test.ts`: one case failed after about 148 … · stderr: (empty)
- 2026-11-07T09:38:04Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 1/3
- 2026-11-07T09:39:09Z · body
- 2026-11-07T09:44:33Z · body
- 2026-11-07T09:46:34Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The required scoped check passed. The remote gate passed on thinkpad, and the local format, lint, build, contrast, and UI smoke checks passed. I could not safely request handoff: `work/1049-remote-validation-stop-killing-healthy-r.md` rema… · stderr: Reading additional input from stdin...
- 2026-11-07T09:51:34Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 2/3
- 2026-11-07T10:26:20Z · message_queued at 2026-11-07T10:26:20.968Z
- 2026-11-07T10:26:21Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-07T10:31:20Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-07T10:46:51Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: Implemented the review fixes and added a Debug panel test proving captured hang evidence is visible when expanded. Updated the remote validation docs and fixed a changed-path test fixture that passed an incorrect Vite config path. The focu… · stderr: Reading additional input from stdin... 2026-11-07T09:51:44.351091Z ERROR codex_models_manager::manager: failed to refresh available models: request timed out 2026-11-07T09:52:09.872788Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when Client(HttpRequest(HttpRequest("http/request fa…
- 2026-11-07T10:46:52Z · message_delivered: 1 message(s)
- 2026-11-07T10:47:13Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: I’m blocked from completing the merge: the only conflict is `work/1049-remote-validation-stop-killing-healthy-r.md`, and I took `main`’s copy. Finishing the merge requires staging and committing, but the task instructions explicitly prohib… · stderr: (empty)
- 2026-11-07T10:51:20Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-07T10:51:32Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: Blocked: the `main` merge has a conflict in `work/1049-remote-validation-stop-killing-healthy-r.md`. I took `main`’s copy, but completing the merge requires staging and committing; the task instructions prohibit both. The latest check pass… · stderr: (empty)
- 2026-11-07T10:56:20Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-07T10:56:32Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: Still blocked: finishing the requested `main` merge requires staging and committing the task-file conflict, which the task instructions forbid. The last check also failed two scoped tests, so I can’t request handoff yet. · stderr: (empty)
- 2026-11-07T11:01:20Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-07T11:01:36Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: Blocked on the unresolved `main` merge conflict in the task file. Resolving it requires staging and committing, which the task instructions prohibit. The last check also failed two scoped tests; I can’t request handoff until those blockers… · stderr: (empty)
- 2026-11-07T11:06:20Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-07T11:08:35Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The isolated `handoff-unification` test passes. The `remote-validation` failure reproduces because its Vitest config uses this worktree as the root, where the unresolved merge leaves Git unable to compute `--changed` tests. That points to … · stderr: (empty)
- 2026-11-07T11:11:20Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
