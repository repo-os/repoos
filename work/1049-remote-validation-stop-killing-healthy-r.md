---
id: 1049
title: "Remote validation: stop killing healthy runs as hung; keep evidence; reap leaked containers"
type: bug
status: ready
priority: p0
area: server
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
cli_override: claude code
model_override: haiku
review_cli_override: codex
review_model_override: gpt-6-luna
created_at: "2026-11-07T03:30:53Z"
updated_at: "2026-11-07T03:51:17Z"
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

## Activity

- 2026-11-07T03:30:53Z · created · njachowski@gmail.com
- 2026-11-07T03:51:05Z · cli_override, model_override
- 2026-11-07T03:51:12Z · model_override
- 2026-11-07T03:51:16Z · review_cli_override
- 2026-11-07T03:51:17Z · review_model_override
- 2026-11-07T03:51:17Z · status inbox→ready
