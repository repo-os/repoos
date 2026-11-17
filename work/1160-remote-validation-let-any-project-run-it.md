---
id: "1160"
title: "Remote validation: let any project run its own check command on runners"
type: feature
status: active
priority: p1
area: core
assigned_to: ai
created_by: t@t
branch: feat/remote-validation-let-any-project-run-it
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-17T17:06:33Z"
updated_at: "2026-11-17T17:09:37Z"
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
