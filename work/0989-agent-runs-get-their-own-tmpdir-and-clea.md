---
id: "0989"
title: Agent runs get their own TMPDIR and clean it up
type: bug
status: active
needs_input: true
needs_input_reason: dev-error
needs_input_detail: "Error: [aborted] read ECONNRESET"
priority: p1
area: server
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/agent-runs-get-their-own-tmpdir-and-clea
cli_override: cursor
model_override: grok-4.7-low
created_at: "2026-10-31T08:30:59Z"
updated_at: "2026-10-31T15:25:33Z"
dev_error_count: 2
engineer_crash_log: "[{\"cli\":\"cursor\",\"model\":\"grok-4.7-low\",\"at\":\"2026-10-31T15:25:03.027Z\",\"kind\":\"dev-error\"}]"
---
## Problem

The CTO board monitor launches a coding agent every 5 minutes (`ctoMonitorIntervalMs`, default 300000). opencode is a Bun-compiled binary that extracts ~5.4 MB `.<hash>-00000000.so` files into /tmp on every launch and never deletes them. On a host with a /tmp quota this filled /tmp in about 10 days and writes failed with "Disk quota exceeded". The same applies to any agent run RepoOS spawns.

## Desired UX

Repeated agent runs leave nothing behind in /tmp, and an idle board does not keep launching agents.

## Acceptance criteria

- [ ] Each agent run RepoOS spawns gets its own TMPDIR (under a RepoOS-owned directory) which is removed when the run ends, including on crash and timeout.
- [ ] Repeated monitor runs leave no new files in /tmp (a test or script shows file counts before and after).
- [ ] Leftover per-run directories from a killed server are swept at the next boot.
- [ ] The CTO monitor skips or backs off its run when the board is idle (no active or review tasks and nothing changed since the last run); the rule is documented.
- [ ] `repoos.toml` settings for the backoff, if any, get a Settings control per AGENTS.md.

## Notes for AI

Start from where agent processes are spawned (`src/server/agents.ts` and the CTO monitor). Every one-shot call must still record its usage (AGENTS.md). Do not change how agents are selected.

## Activity

- 2026-10-31T08:30:59Z · created · njachowski@gmail.com
- 2026-10-31T08:31:24Z · cli_override, model_override
- 2026-10-31T08:31:28Z · status inbox→ready
- 2026-10-31T11:43:42Z · status ready→active, branch
- 2026-10-31T11:48:56Z · watchdog: auto-surfaced stuck task · status active→ready · agent never started — no session exists for this task · next step: resume the session manually from the task's worktree and check for uncommitted work
- 2026-10-31T11:50:19Z · status ready→active
- 2026-10-31T12:55:44Z · engineer stopped by request
- 2026-10-31T13:11:42Z · note: adopted orphaned engineer pid 54869
- 2026-10-31T13:15:24Z · engineer stopped by request
- 2026-10-31T13:15:26Z · model_override
- 2026-10-31T14:51:24Z · agent exited with an error (cursor) · RetriableError: Agent turn stopped after repeated resume attempts made no progress
- 2026-10-31T14:51:24Z · engineer crash recovery: resuming cursor + grok-4.7-low (1/3 crashes in 30m) · RetriableError: Agent turn stopped after repeated resume attempts made no progress
- 2026-10-31T15:25:33Z · engineer crash recovery: resuming cursor + grok-4.7-low (1/12 crashes in 30m) · Error: [aborted] read ECONNRESET
