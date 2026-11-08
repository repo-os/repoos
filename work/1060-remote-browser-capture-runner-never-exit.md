---
id: "1060"
title: "Remote browser capture: runner never exits after completing; reap and force-collect finished captures"
type: bug
status: active
priority: p1
area: server
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/remote-browser-capture-runner-never-exit
cli_override: cursor
model_override: composer-2.5
review_cli_override: github copilot
review_model_override: default
created_at: "2026-11-08T07:43:30Z"
updated_at: "2026-11-08T10:14:09Z"
review_passes: 3
review_rounds: 2
handoff_signal_retry_count: 2
dev_error_count: 2
---
## Problem
Remote browser captures (shots / UI verification on thinkpad, bee, mini) keep stalling. Observed 2026-11-08 on #1048, #1050, #1054, #1056, #1057, #1058, #0963: the runner container writes its result, logs `[browser-capture] runner browser capture completed` (or `reported failures`), and then **stays alive for 15-25+ minutes at ~0% CPU**. The Mac side waits for the run to finish, hits "timed out waiting for the task's browser capture", fails the handoff at verify and retries, which queues another capture. Each failed handoff leaves another stale capture behind, so a task's retries queue behind its own duplicates (queue times of 25-33 minutes with free runner slots). This is the biggest source of wasted time across all tasks today.

Evidence: `docker logs -t` on the runner shows the completed line at, for example, 07:26:32Z while the container was still "Up 16 minutes" at 0.3% CPU; `docker rm -f` of such a container immediately lets the task move on. The #1049 hang watchdog does not reap these because they are shot runs, not validation runs.

Likely root cause: `scripts/remote-runner/capture-browser.ts` (`if (import.meta.main)` block) ends by setting `process.exitCode` and relies on natural process exit. After writing `result.json`, something (a lingering WebKit/Playwright browser child, a preview server handle, or an open socket) keeps the Bun process alive, so the container's entrypoint never exits and the Mac never sees the run finish.

## Desired behavior
1. The runner exits as soon as it has written `result.json` and logged the completion line: call `process.exit(process.exitCode ?? 0)` after logging (and in the catch path), after best-effort cleanup (close browsers, stop previews) with a short bounded timeout so cleanup cannot itself hang.
2. Belt and braces on the Mac side: when collecting a remote capture, treat the presence of `result.json` (or the completion log line) as completion, collect the artifacts and tear the container down, instead of waiting for the container to exit.
3. Extend the hang watchdog / leaked-container reaper (from #1049) to shot-capture runs: a capture container that logged its completion line and has been idle (CPU ~0) for more than a short grace period (for example 2 minutes) is collected and removed.
4. A failed or timed-out handoff cancels or reaps its own outstanding capture jobs so retries do not queue behind stale duplicates for the same task.

## Acceptance criteria
- Test: capture-browser's entry exits the process after writing result.json even when a handle is left open (simulate with a pending timer/server) within a bounded time.
- Test: the Mac-side collector finishes when `result.json` exists though the container is still running, and removes the container.
- Test: the reaper/watchdog removes a shot-capture container that logged completion and has been idle past the grace period, and does not touch a capture still producing output.
- Test: a failed handoff cancels that task's queued/running captures.
- Debug UI / events show when a capture was force-collected or reaped and why.
- `repoos check --changed main` passes; docs/remote-validation.md updated.

## Notes for AI
Files: scripts/remote-runner/capture-browser.ts (entry at the bottom), src/server/remote-validation.ts (remote capture collection, watchdog, reaper from #1049), src/server/ui-handoff-gate.ts ("timed out waiting for the task's browser capture"). Do NOT edit repoos.toml. Do not widen scope beyond capture lifecycle. Context: filed from live diagnosis on thinkpad/bee/mini containers.

## Activity

- 2026-11-08T07:43:30Z · created · njachowski@gmail.com
- 2026-11-08T07:43:34Z · cli_override, model_override, review_cli_override, review_model_override
- 2026-11-08T07:43:36Z · status inbox→ready
- 2026-11-08T07:43:37Z · status ready→active, branch
- 2026-11-08T07:45:15Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: Task #1060 is **not ready for handoff**. The runner now writes `result.json` atomically, bounds preview cleanup to three seconds, and explicitly exits after logging. A subprocess test with a live timer passes; the focused test file passed … · stderr: Reading additional input from stdin...
- 2026-11-08T07:52:24Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: Task #1060 remains **incomplete**, so I have not emitted the handoff signal. The runner now exits explicitly after bounded preview cleanup and publishes its result atomically. I also added a first Tailscale collector implementation and a s… · stderr: Reading additional input from stdin...
- 2026-11-08T08:04:25Z · message_queued at 2026-11-08T08:04:25.156Z
- 2026-11-08T08:08:14Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-08T08:08:36Z · body
- 2026-11-08T08:21:28Z · body
- 2026-11-08T08:22:14Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-08T08:22:14Z · message_queued at 2026-11-08T08:22:14.156Z
- 2026-11-08T08:22:14Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: no assistant message · stderr: (empty)
- 2026-11-08T08:22:14Z · message_delivered: 2 message(s)
- 2026-11-08T08:23:05Z · status active→review
- 2026-11-08T08:23:05Z · message_queued at 2026-11-08T08:23:05.818Z
- 2026-11-08T08:23:05Z · note: shots: skipped — the diff (13 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-08T08:24:42Z · note: review pass 1: needs some work
- 2026-11-08T08:24:42Z · status review→active
- 2026-11-08T08:24:44Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-08T08:29:13Z · message_delivered: 1 message(s)
- 2026-11-08T08:33:02Z · message_queued at 2026-11-08T08:33:02.422Z
- 2026-11-08T08:38:28Z · body
- 2026-11-08T08:38:31Z · watchdog: check wait escalated · waiting: waiting for a Playwright slot — position 2 (1 ahead); slot holder 3793 is dead for 0s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-08T08:39:01Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-08T08:39:15Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-08T08:39:15Z · message_queued at 2026-11-08T08:39:15.451Z
- 2026-11-08T08:39:15Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: no assistant message · stderr: (empty)
- 2026-11-08T08:39:15Z · message_delivered: 2 message(s)
- 2026-11-08T08:42:12Z · agent exited with an error (codex) · 2026-11-08T08:42:12.387156Z ERROR codex_core::session: failed to record rollout items: thread 01a1ba1c-eb96-77a0-8ad1-e1a00c386531 not found
- 2026-11-08T08:45:18Z · cli_override, model_override
- 2026-11-08T08:45:24Z · review_cli_override, review_model_override
- 2026-11-08T08:45:26Z · needs_input
- 2026-11-08T08:52:09Z · agent exited with an error (cursor) · RetriableError: Connection stalled repeatedly
- 2026-11-08T09:01:42Z · needs_input
- 2026-11-08T09:08:24Z · body
- 2026-11-08T09:14:09Z · message_queued at 2026-11-08T09:14:09.537Z
- 2026-11-08T09:14:09Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-08T09:14:11Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-08T09:16:18Z · body
- 2026-11-08T09:17:20Z · status active→review
- 2026-11-08T09:17:21Z · note: shots: skipped — the diff (16 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-08T09:17:49Z · message_queued at 2026-11-08T09:17:49.664Z
- 2026-11-08T09:21:32Z · note: review pass 2: needs some work
- 2026-11-08T09:21:32Z · status review→active
- 2026-11-08T09:21:34Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-08T09:23:16Z · message_queued at 2026-11-08T09:23:16.389Z
- 2026-11-08T09:28:26Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-11-08T09:28:26Z · note: handoff requested (cli)
- 2026-11-08T09:29:09Z · CTO nudge: held — handoff gate is running
- 2026-11-08T09:33:45Z · message_delivered: 1 message(s)
- 2026-11-08T09:39:16Z · message_queued at 2026-11-08T09:39:16.399Z
- 2026-11-08T09:39:16Z · handoff failed · task-file handoff failed at check · repoos check failed: check-fmt:check — Formatting failed — run `bun run fmt` to fix:
- 2026-11-08T09:44:09Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-08T09:45:56Z · body
- 2026-11-08T09:50:49Z · body
- 2026-11-08T09:51:26Z · handoff_deferred: 2 queued message(s) must be read before review
- 2026-11-08T09:51:27Z · message_queued at 2026-11-08T09:51:27.040Z
- 2026-11-08T09:51:27Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: Implementing shared reaper logic, Hetzner capture polling, background reaping, and cancellation honesty. · stderr: (empty)
- 2026-11-08T09:51:27Z · message_delivered: 3 message(s)
- 2026-11-08T09:53:18Z · message_queued at 2026-11-08T09:53:18.470Z
- 2026-11-08T09:53:18Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-08T09:54:09Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-08T09:58:33Z · body
- 2026-11-08T09:59:02Z · status active→review
- 2026-11-08T09:59:03Z · note: shots: skipped — the diff (19 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-08T09:59:35Z · message_queued at 2026-11-08T09:59:35.564Z
- 2026-11-08T10:01:29Z · note: review pass 3: needs some work
- 2026-11-08T10:01:29Z · needs_input
- 2026-11-08T10:04:47Z · status review→active
- 2026-11-08T10:04:47Z · note: send-back — returned to active for engineer follow-up
- 2026-11-08T10:04:49Z · needs_input
- 2026-11-08T10:04:49Z · message_queued at 2026-11-08T10:04:49.662Z
- 2026-11-08T10:04:49Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-08T10:09:56Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — task-file handoff failed at check · repoos check failed: check-fmt:check — Formatting failed — run `bun run fmt` to fix: · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-11-08T10:09:56Z · note: handoff requested (cli)
- 2026-11-08T10:13:25Z · message_delivered: 1 message(s)
- 2026-11-08T10:14:09Z · CTO nudge: held — handoff gate is running
