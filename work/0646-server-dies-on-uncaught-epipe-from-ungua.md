---
id: "0646"
title: Server dies on uncaught EPIPE from unguarded child stdin writes; log EPIPE with context
type: bug
status: ready
priority: p1
area: [server, core]
assigned_to: ai
created_by: ""
branch: ""
review_cli_override: cursor
review_model_override: composer-2.5
created_at: "2026-10-04T08:56:04Z"
updated_at: "2026-10-04T08:58:36Z"
---
## Problem
The control-plane server exits with `fatal: Uncaught exception — EPIPE: broken pipe, write` (see `.repoos/logs/system.log`). It has happened 12 times, four times on 2026-10-03 and four on 2026-10-04 (08:07:49Z, 08:11:47Z, 08:16:06Z, 08:43:16Z). `registerFatalHandlersOnce` in `src/server/server.ts` turns every uncaught exception into `process.exit(1)`, so a stray EPIPE takes the whole server down with no clean shutdown (serve lock left behind) and nothing restarts it when started via `just restart` (nohup).

Two child-process stdin writes have no `error` listener on the stdin stream, so a child that exits before reading (e.g. an `ssh` to a remote validation host that drops or times out) emits EPIPE as an uncaught exception:
- `src/server/remote-validation.ts` `runLocalWithStdin` — `child.stdin?.end(stdin)`; only `child.on("error")` is attached, which does not cover stdin stream errors. Best fit for the timing (remote validation hosts thinkpad/bee/mini were active at each crash).
- `src/core/models.ts` ~line 308 — `proc.stdin?.write(...)` to the codex app-server.

The fatal log line has no stack (`stack: undefined`: the thrown value is not an `Error` instance under Bun), so the origin of each EPIPE is unknowable from the log.

## Desired UX
The server survives a child process closing its stdin early. If an EPIPE (or any uncaught error) does reach the process-level handler, the log says where it came from.

## Acceptance criteria
- [ ] `runLocalWithStdin` and the `models.ts` stdin write attach a `stdin` `error` handler; an EPIPE there resolves the promise as a failed exec / empty result and is logged at warn/debug with the command name, not thrown. A test spawns a child that exits immediately and writes a large stdin payload, and asserts no uncaught exception.
- [ ] Audit other `spawn`/`execFile` call sites in `src/server` and `src/core` that write to `child.stdin` and guard them the same way (shared helper preferred).
- [ ] The fatal handler logs a useful record for non-Error throws: error name, `code`, `syscall`, `String(err)`, and a captured stack (`new Error().stack` fallback), plus the `origin` argument of `uncaughtException`.
- [ ] A process-level EPIPE (`code === "EPIPE"`, `syscall === "write"`) is logged at error level with that context and does NOT exit the server; everything else keeps the current log-and-exit behaviour. Test the classification.
- [ ] `docs/` note (e.g. architecture or debugging) records the incident and the rule: every child stdin write needs an error handler.

## Notes for AI
Discovered 2026-10-04 while diagnosing why the 7171 server kept dying. Initial theories (OOM/jetsam, `repoos check` killing the server) were ruled out: no kill record, `check.ts` has no kill path, and `serve-reaper.ts` orphan sweep only targets deleted temp-dir roots. Evidence is in `.repoos/logs/system.log` (`grep EPIPE`).

## Activity

- 2026-10-04T08:56:04Z · created · unknown
- 2026-10-04T08:58:34Z · review_cli_override
- 2026-10-04T08:58:35Z · review_model_override
- 2026-10-04T08:58:36Z · status inbox→ready
