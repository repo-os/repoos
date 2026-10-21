---
id: "0889"
title: "Crash recovery relaunch fails when the resume prompt contains NUL bytes: sanitize prompt arguments"
type: bug
status: review
priority: p2
area: server
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/crash-recovery-relaunch-fails-when-the-r
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-21T01:27:17Z"
updated_at: "2026-10-21T03:52:14Z"
last_check_failure: "repoos check at 2026-10-21T03:30:35.724Z: repoos check failed: the worktree changed while the gate was running (HEAD moved from 3b3cd293 to 969b3573) — the check result no longer describes what is committed, so the handoff was refused. Nothing was lost: the change is still in the worktree. Re-run the handoff once the worktree is stable."
dev_error_count: 5
---
## Problem
On 2026-10-21 ~09:26 local, #0877's engineer crashed and the new crash recovery (#0869) tried to relaunch it. The relaunch failed with: `engineer crash recovery: start failed — The argument 'args[6]' must be a string without null bytes. Received "Working directory: ..."`. The resume prompt (working-directory preamble plus the Task Context Pack) contains at least one NUL byte, which Node rejects as a spawn argument. A manual `repoos start 0877` then worked, so the failure is specific to the recovery path's prompt (likely a field in the context pack built from the task body, a diff or a log excerpt that carries a NUL). Until fixed, a crashed engineer whose context contains a NUL stays dead and flagged needs_input.

## Desired UX
Any prompt or argument handed to an agent CLI is sanitized before spawn (NUL bytes stripped or replaced), on every start, resume and recovery path. A crash recovery never fails because of the prompt's content.

## Acceptance criteria
- Find which field of the resume preamble or Task Context Pack carried the NUL for #0877 and add a regression test with a NUL in that field.
- One shared sanitizer is applied to every string passed as a spawn argument for agent CLIs (opencode, cursor, codex, copilot and others); do not patch only the recovery path.
- Table-driven test across start, resume, recovery and message-delivery paths with a NUL in the task body, a log line and a path.
- If sanitizing changes the prompt, record one line in the task activity.

## Notes for AI
Relevant code: src/server/engineer-crash-recovery.ts, src/server/agents.ts (resumePreamble, buildTaskContextPack, the spawn call sites), src/core/ context-pack code. Run the lifecycle tests (agent-concurrency, engineer-crash-recovery, engineer-stall-resume, message-queueing) in small groups.

## Activity

- 2026-10-21T01:27:17Z · created · njachowski@gmail.com
- 2026-10-21T02:03:57Z · status inbox→ready
- 2026-10-21T02:04:07Z · cli_override, model_override
- 2026-10-21T02:04:09Z · status ready→active, branch
- 2026-10-21T02:14:52Z · message_queued at 2026-10-21T02:14:52.810Z
- 2026-10-21T02:14:53Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-21T02:20:05Z · agent exited with an error (opencode) · error: Transport
- 2026-10-21T02:20:05Z · engineer crash recovery: resuming opencode + opencode-go/deepseek-v4.1-flash (1/3 crashes in 30m) · error: Transport
- 2026-10-21T02:20:13Z · message_delivered: 1 message(s)
- 2026-10-21T02:23:56Z · needs_input
- 2026-10-21T02:24:10Z · status active→ready
- 2026-10-21T02:24:11Z · engineer stopped by request
- 2026-10-21T02:24:18Z · status ready→active
- 2026-10-21T02:25:58Z · agent exited with an error (opencode) · error: Upstream request failed: Endpoint is unavailable.
- 2026-10-21T02:25:58Z · engineer crash recovery: resuming opencode + opencode-go/deepseek-v4.1-flash (2/3 crashes in 30m) · error: Upstream request failed: Endpoint is unavailable.
- 2026-10-21T02:28:12Z · needs_input
- 2026-10-21T02:28:25Z · status active→ready
- 2026-10-21T02:28:25Z · engineer stopped by request
- 2026-10-21T02:28:34Z · status ready→active
- 2026-10-21T02:30:11Z · engineer stopped by request
- 2026-10-21T02:30:13Z · cli_override, model_override
- 2026-10-21T02:30:31Z · status active→ready
- 2026-10-21T02:30:46Z · status ready→active
- 2026-10-21T02:47:00Z · body
- 2026-10-21T02:50:18Z · agent exited with an error (cursor) · RetriableError: Agent turn stopped after repeated resume attempts made no progress
- 2026-10-21T02:50:18Z · engineer crash recovery: resuming cursor + composer-2.5 (1/3 crashes in 30m) · RetriableError: Agent turn stopped after repeated resume attempts made no progress
- 2026-10-21T02:50:22Z · engineer crash recovery: resuming cursor + composer-2.5 (2/3 crashes in 30m) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-10-21T02:50:30Z · engineer crash recovery: surfaced instead of switching — a human-set task override (cursor + composer-2.5) is pinned, so RepoOS did not replace it (3/3 crashes in 30m)
- 2026-10-21T02:51:16Z · needs_input
- 2026-10-21T02:54:09Z · body
- 2026-10-21T02:54:42Z · body
- 2026-10-21T02:55:43Z · body
- 2026-10-21T03:08:15Z · body
- 2026-10-21T03:08:44Z · body
- 2026-10-21T03:09:16Z · body
- 2026-10-21T03:38:26Z · body
- 2026-10-21T03:50:38Z · body
- 2026-10-21T03:51:21Z · status active→review
- 2026-10-21T03:51:23Z · note: shots: skipped — the diff (14 changed paths) touches no capture target's globs — no UI change to capture
- 2026-10-21T03:52:14Z · note: review pass 1: good to go
