---
id: "1160"
title: "Remote validation: let any project run its own check command on runners"
type: feature
status: done
priority: p1
area: core
merged_commit: a1a33fe0bd1c66956f80706e190f238242cb315b
assigned_to: ai
created_by: t@t
branch: feat/remote-validation-let-any-project-run-it
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-17T17:06:33Z"
updated_at: "2026-11-18T00:17:43Z"
last_close_out_gate_ms: 777852
last_close_out_gate_at: "2026-11-17T23:30:33.132Z"
review_passes: 5
last_check_failure: "repoos check at 2026-11-17T19:55:37.402Z: repoos check failed: ui verification failed (3 issue(s)): [missing-target] Remote validation command and required tools (target \"default\"): highlight #setting-remoteValidation.command matched nothing on /settings?section=remote-validation (http://127.0.0.1:35065/settings?section=remote-validation); [missing-target] Remote runner host toolchain status (target \"default\"): click #setting-remoteValidation.enabled button: click: Timeout 5000ms exceeded. on /settings?section=remote-validation (http://… (truncated)"
review_rounds: 2
---
## Problem
Remote validation runners only work for projects shaped like the RepoOS repo. The remote half is a fixed `validate.sh` that runs `bun install --frozen-lockfile && bun run build && bun run test` inside the `repoos-ci` image. A project's own `[[check.steps]]` plan (Gradle/Android unit tests, worker and web checks, site builds) is not run remotely, and `docs/remote-validation.md` says "A future `remoteValidation.command` override is not implemented yet". Result: the Tiao project (Android + web + Cloudflare worker, 1 host `bee` running 3 projects) hits load averages of 60-80, close-outs time out (#0131, #0148) and reviews and checks stall, while idle machines (mini, ThinkPad) cannot help. Engineer sessions on runners (#0904, ADR 0009) are design only. Setting up runners for non-bun projects is impossible today.

## Desired UX
Any project can offload its pre-review and close-out gate to the runner pool. Add `remoteValidation.command` (and a per-host `runner = "native"` path for Linux as well as macOS) so a project declares the command(s) the runner executes, for example `./scripts/ci-remote.sh` or the project's own check plan filtered by `runsOn`. Runners need no project-specific bun assumptions: a host prerequisite probe checks the declared toolchain (JDK/Gradle/Android SDK, Node) instead of Docker or bun only. Settings → Remote validation shows the command and a per-host toolchain status. Setting up a host needs one documented, non-sudo path where possible (user-level install under the host user's home) and a clear sudo-only list otherwise.

## Acceptance criteria
- A non-bun project (Gradle + web) can set `remoteValidation.command` and have its check gate run on a pool host with results, logs and artifacts returned like the stock gate
- Host probe validates the declared toolchain and reports exactly what is missing
- Docs `docs/remote-validation.md` updated: remove the "not implemented yet" note, add a worked Android/Gradle example
- Tests for command override, probe, fallback to local and queueing across multiple hosts
- Follow-up tasks filed for engineer sessions on runners (#0904 / #0907 / #0912) with a recommended order so heavy engineer work can leave a loaded host

## Notes for AI
Context: Nick's Tiao board on host bee (16 cores, encrypted btrfs, 3 projects) shows load 60-80 and landing timeouts; mini (Apple Silicon, quiet) and ThinkPad (8 cores) are idle-ish. Interim mitigations in use: close-out timeout raised to 30 min, engineer caps. Related: #0520, #0521, #0667, #0907, #0912.

## Shots
```json
[
{
"label": "Remote validation command and required tools",
"target": "default",
"route": "/settings?section=remote-validation",
"highlight": "#setting-remoteValidation\\.command"
},
{
"label": "Remote runner host toolchain status",
"target": "default",
"route": "/settings?section=remote-validation",
"highlight": ".rvr-hosts",
"steps": [
{
"click": "#setting-remoteValidation\\.enabled button"
},
{
"waitMs": 300
}
]
}
]
```

## Activity

- 2026-11-17T17:06:33Z · created · t@t
- 2026-11-17T17:07:55Z · status inbox→ready
- 2026-11-17T17:09:36Z · cli_override, model_override
- 2026-11-17T17:09:37Z · status ready→active, branch
- 2026-11-17T17:10:22Z · message_queued at 2026-11-17T17:10:22.542Z
- 2026-11-17T17:10:38Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-17T17:20:58Z · queued message undelivered for 11m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-17T17:20:58Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code unknown) · last assistant: The scoped check has entered its remote gate on ThinkPad, uploaded the branch, and is building the verified candidate there. The local UI build passed; the remote result will also exercise changed-path tests and the remaining check plan. · stderr: Reading additional input from stdin... 2026-11-17T17:10:49.497991Z ERROR codex_core::tools::router: error=apply_patch verification failed: Failed to find expected lines in /Users/nick/code/nick/repoos-worktrees/feat/remote-validation-let-any-project-run-it/src/core/types.ts: * a job can require via `[[check.steps]] ru…
- 2026-11-17T17:21:15Z · message_delivered: 1 message(s)
- 2026-11-17T17:52:00Z · body
- 2026-11-17T17:54:27Z · status active→review
- 2026-11-17T17:54:27Z · message_queued at 2026-11-17T17:54:27.561Z
- 2026-11-17T17:54:27Z · note: shots: skipped — Docs site skipped: no docs shot declared
- 2026-11-17T18:00:02Z · note: review pass 1: needs some work
- 2026-11-17T18:00:02Z · message_delivered: 1 message(s)
- 2026-11-17T18:00:02Z · status review→active
- 2026-11-17T19:00:39Z · message_queued at 2026-11-17T19:00:39.156Z
- 2026-11-17T19:00:39Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-17T19:00:40Z · body
- 2026-11-17T19:04:49Z · note: ui verification passed: 1 shot captured with clean console (1 shot warning)
- 2026-11-17T19:04:51Z · status active→review
- 2026-11-17T19:04:51Z · message_queued at 2026-11-17T19:04:51.878Z
- 2026-11-17T19:12:55Z · note: review pass 2: needs some work
- 2026-11-17T19:12:55Z · message_delivered: 1 message(s)
- 2026-11-17T19:12:55Z · status review→active
- 2026-11-17T19:24:16Z · body
- 2026-11-17T19:48:05Z · body
- 2026-11-17T19:55:33Z · note: ui verification failed: ui verification failed (3 issue(s)): [missing-target] Remote validation command and required tools (target "default"): highlight #setting-remoteValidation.command matched nothing on /settings?section=remote-validation (http://127.0.0.1:35065/settings?section=remote-validation); [missing-target] Remote runner host toolchain status (target "default"): click #setting-remoteValidation.enabled button: click: Timeout 5000ms exceeded. on /settings?section=remote-validation (http
- 2026-11-17T19:55:34Z · message_queued at 2026-11-17T19:55:34.081Z
- 2026-11-17T19:55:37Z · message_delivered: 1 message(s)
- 2026-11-17T19:56:18Z · body
- 2026-11-17T20:10:43Z · message_queued at 2026-11-17T20:10:43.053Z
- 2026-11-17T20:10:43Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-17T20:15:43Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-17T20:16:16Z · queued message undelivered for 6m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-17T20:16:16Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code unknown) · last assistant: The isolation fix now clears the new project-command variable plus the other runner-injected root/artifact paths from spawned test environments. The isolation regression test passes locally; I’m rerunning the full check to confirm both it … · stderr: (empty)
- 2026-11-17T20:16:16Z · message_delivered: 1 message(s)
- 2026-11-17T20:17:50Z · message_queued at 2026-11-17T20:17:50.836Z
- 2026-11-17T20:47:06Z · body
- 2026-11-17T20:48:56Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-17T20:48:56Z · message_queued at 2026-11-17T20:48:56.412Z
- 2026-11-17T20:48:56Z · ↻ resuming engineer to read queued message
- 2026-11-17T20:48:57Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The changed-path check is green now, including the remote gate and local guards. I’m recording the final environment-isolation correction in the report draft, then I’ll request handoff again with the repaired shot selectors. · stderr: 2026-11-17T20:16:18.855046Z ERROR codex_core::util: Custom tool call output is missing for call id: call_2a452156ae5449a9870fe6a7d4dc70a0 2026-11-17T20:16:24.188966Z ERROR codex_core::tools::router: error=write_stdin failed: Unknown process id 44192 2026-11-17T20:16:24.198948Z ERROR codex_core::util: Custom tool call …
- 2026-11-17T20:48:57Z · status active→review
- 2026-11-17T20:48:57Z · message_delivered: 2 message(s)
- 2026-11-17T20:48:59Z · CTO nudge: held — handoff gate is running
- 2026-11-17T20:49:00Z · note: handoff requested (cli)
- 2026-11-17T20:50:04Z · body
- 2026-11-17T21:00:06Z · note: ui verification passed: 2 of 2 shots captured with clean console (1 shot warning)
- 2026-11-17T21:07:03Z · body
- 2026-11-17T21:07:48Z · status active→review
- 2026-11-17T21:07:49Z · message_queued at 2026-11-17T21:07:49.109Z
- 2026-11-17T21:19:36Z · note: review pass 3: needs some work
- 2026-11-17T21:19:36Z · needs_input
- 2026-11-17T21:48:22Z · status review→active
- 2026-11-17T21:48:24Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-17T21:48:27Z · needs_input
- 2026-11-17T21:48:28Z · message_delivered: 1 message(s)
- 2026-11-17T21:53:02Z · note: adopted orphaned engineer pid 34750
- 2026-11-17T22:09:53Z · body
- 2026-11-17T22:26:38Z · body
- 2026-11-17T22:28:11Z · status active→review
- 2026-11-17T22:31:14Z · note: ui verification passed: 2 of 2 shots captured with clean console (1 shot warning)
- 2026-11-17T22:31:15Z · message_queued at 2026-11-17T22:31:15.725Z
- 2026-11-17T22:37:31Z · note: review pass 4: needs some work
- 2026-11-17T22:37:31Z · needs_input
- 2026-11-17T22:47:48Z · status review→active
- 2026-11-17T22:47:49Z · needs_input
- 2026-11-17T22:47:49Z · message_delivered: 1 message(s)
- 2026-11-17T23:09:07Z · body
- 2026-11-17T23:10:30Z · status active→review
- 2026-11-17T23:13:53Z · note: ui verification passed: 2 of 2 shots captured with clean console (1 shot warning)
- 2026-11-17T23:13:54Z · message_queued at 2026-11-17T23:13:54.638Z
- 2026-11-17T23:15:03Z · note: review pass 5: good to go
- 2026-11-17T23:30:33Z · close-out gate completed in 778s
- 2026-11-17T23:30:50Z · status done→done, release:success
- 2026-11-18T00:17:43Z · message_dropped: 1 queued message(s) discarded — task is done
