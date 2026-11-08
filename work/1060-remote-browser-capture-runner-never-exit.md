---
id: "1060"
title: "Remote browser capture: runner never exits after completing; reap and force-collect finished captures"
type: bug
status: review
needs_merge: true
priority: p1
area: server
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/remote-browser-capture-runner-never-exit
cli_override: codex
model_override: gpt-6.1-terra
review_cli_override: codex
review_model_override: gpt-6-luna
created_at: "2026-11-08T07:43:30Z"
updated_at: "2026-11-08T13:53:12Z"
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
- 2026-11-08T08:23:05Z · status active→review
- 2026-11-08T13:53:12Z · needs_merge
