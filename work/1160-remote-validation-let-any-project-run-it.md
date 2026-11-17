---
updated_at: "2026-11-17T19:12:55Z"
review_passes: 2
id: "1160"
title: "Remote validation: let any project run its own check command on runners"
type: feature
status: review
priority: p1
area: core
assigned_to: ai
created_by: t@t
branch: feat/remote-validation-let-any-project-run-it
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-17T17:06:33Z"
review_rounds: 1
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

