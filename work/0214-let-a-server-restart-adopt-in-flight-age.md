---
id: "0214"
title: Let a server restart adopt in-flight agent turns instead of deferring or killing them
type: feature
status: review
priority: p3
area: server
assigned_to: ai
created_by: ""
branch: feat/let-a-server-restart-adopt-in-flight-age
created_at: "2026-08-15T06:28:51Z"
updated_at: "2026-08-15T20:43:35Z"
review_rounds: 1
---
## Problem

`ReloadManager` (`src/server/reload.ts`, task #0066) defers a server restart/reload while any agent turn is running, and for good reason: `AgentRunner.start` (`src/server/agents.ts:1895`) spawns each agent child with `stdio: ["ignore", "pipe", "pipe"]` and pipes `stdout`/`stderr` directly into the parent process's memory via `proc.stdout.on("data", ...)`. Nothing about the child's output is persisted independently of the parent process staying alive. If the server exited while a turn was in flight:

- The pipe's read end disappears with the parent, so the child's next stdout write gets `EPIPE` — in practice this crashes/kills the child, not just silences it.
- The new server boots with an empty in-memory runner registry (`this.entries`, `this.sessions` in `AgentRunner`). It has no record that PID X belongs to task Y. Even in a hypothetical world where the child survived, the new process has no way to reattach to it — the task would just look like it has nothing running, and a later `/start` call could spawn a *second* agent into the same (already dirty) worktree, corrupting whatever the first agent was doing.

Today's fix is deferral: wait until the turn naturally ends before swapping servers. That's safe but means a needed restart (e.g. after a server-code fix lands) can be stuck waiting for however long agents keep working — potentially a long time under real load.

## Desired behavior

Make a restart safe to force at any time by giving in-flight turns something durable to survive a server swap:

- Redirect each agent child's stdout/stderr to a per-task log file (in `.repoos/` alongside other per-task state) instead of only an in-memory pipe. A file descriptor doesn't break when the reading process restarts — the child keeps writing successfully regardless of what's on the other end.
- Persist a small durable registry mapping task id → PID, workdir, branch, runId before/during any reload (or continuously, e.g. written alongside `this.entries`).
- On boot, the new server reconciles against that registry: for each entry, check whether the PID is still alive (`process.kill(pid, 0)` doesn't throw), and if so, re-attach — tail the log file to catch up whatever was written during the handoff gap, restore the in-memory session/entry so `runner.isRunning(id)` correctly reports true again, and resume live streaming to SSE clients from that point.
- Stale entries (PID no longer alive) are dropped, not adopted — this must not resurrect genuinely-dead sessions.

## Acceptance criteria

- [ ] A server restart triggered via `POST /api/server/restart` (or the auto-reload watcher) while an agent turn is running no longer needs to defer — the new server comes up with that task still correctly reporting `running: true` in its output stats.
- [ ] The task's live output (SSE `agent.output`) is unbroken from the UI's point of view across the swap — a client watching the stream sees a brief gap at most, not a reset or lost history.
- [ ] If the child process actually did die during the handoff window, the new server correctly reports it as not running (no resurrection of dead sessions).
- [ ] `ReloadManager`'s existing close-out deferral (0143 — reload parked while a close-out pipeline holds the repo lock) is unchanged; this task only removes the *agent-turn* deferral, not the close-out one.
- [ ] Add a test that starts an agent turn, kills and replaces the server process (or simulates the equivalent registry-reset), and asserts the new process correctly adopts the still-running child.
- [ ] `repoos check` passes.

## Notes for AI

- Read `src/server/reload.ts` in full first — the header comment documents today's deferral design precisely; this task changes the agent-turn deferral path specifically, not the whole reload flow.
- Read `AgentRunner` in `src/server/agents.ts` (`start`, `this.entries`, `this.sessions`, the `onData` handler) — that's where output capture and the in-memory registry live today.
- Keep the close-out (#0143) deferral behavior untouched — only the "defer while `running > 0`" agent-turn path in `reload.ts` should change.
- This was scoped out live while investigating why a reload sat deferred during routine work — see task #0210 and the review-relevance work (`src/server/review.ts`) landed around the same time for context on why the question came up.

## Related

- 0066 · Auto-reload for `repoos serve` (original reload/defer implementation) — done; this task changes its agent-turn deferral behavior specifically.
- 0143 · (close-out reload parking) — done; must remain unchanged by this task.

## Activity

- 2026-08-15T06:28:51Z · created · unknown
- 2026-08-15T12:53:31Z · status inbox→ready
- 2026-08-15T17:02:20Z · model_override
- 2026-08-15T17:02:23Z · status ready→active, branch
- 2026-08-15T17:19:03Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been emitted on its own line — the agent's final line must be exactly `::repoos-handoff-ready::` (see #0154/#0155 for signal-line rendering bugs)
- 2026-08-15T20:28:31Z · model_override
- 2026-08-15T20:43:35Z · model_override
