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
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-10-21T01:27:17Z"
updated_at: "2026-10-21T03:51:19Z"
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
- 2026-10-21T03:51:19Z · status active→review
