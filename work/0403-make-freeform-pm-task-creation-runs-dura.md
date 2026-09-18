---
id: "0403"
title: Make freeform PM task-creation runs durable and reload-resumable
type: feature
status: inbox
priority: p2
area: server
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-09-18T04:50:04Z"
updated_at: "2026-09-18T04:50:04Z"
---
## Problem

`createFreeformTask` (the "New task" panel's freeform flow) kicks off the PM
agent via a fire-and-forget async closure that calls `runPrompt()`
(`src/server/agents.ts:2645`). Confirmed by reading the code:

- `runPrompt()` spawns the CLI with plain `spawn(cmd, args, { cwd, stdio:
  [...] })` — **not** `detached: true` (contrast with `server/reload.ts`'s
  replacement spawn, which deliberately uses `detached: process.platform !==
  "win32"` so it survives the parent's reload).
- Output is buffered in in-memory `Buffer[]` arrays only — no durable
  per-run log file (contrast with a normal task turn, which writes to
  `.repoos/agent-logs/<taskId>.{out,err}.log`).
- Nothing durable records that the run is in flight. `src/server/pm-runs.ts`'s
  `pmWorking` map is explicitly in-memory by design ("a server restart kills
  the runs along with the registry, so a stale 'working' flag cannot outlive
  the process") — correct for the flag, but it also means there is no
  registry entry (contrast with `.repoos/agents.json`, which tracks
  `{taskId, pid, workdir, branch, runId}` for real task-turn agents) for a
  new server process to find and re-attach to.
- The `Promise` `runPrompt()` returns lives inside the request handler's
  closure in the OLD process. When that process exits (a reload), the await
  chain is gone — even if the spawned CLI process somehow survived, there is
  no code path left to receive its result and turn it into a task.

Net effect: a server reload/restart during a freeform PM run (evidenced live
in this session, #0402 — created at `T`, server reload completed `T+23s`)
silently kills the in-flight PM call. The user sees no specific error — the
freeform flow's generic "agent-failed" fallback saves the raw prompt as a
`draft` task instead. There is no durable trace of what actually happened
(no log file, no registry entry, nothing survives a page reload once the
in-memory buffer is gone) — this session diagnosed it only by correlating
task-creation and server-reload timestamps in `.repoos/logs/system.log`,
which is fragile and won't always be possible.

Regular task-turn agents (engineer, reviewer, PM chat) already solve both
halves of this problem:
- **Durable logging**: `.repoos/agent-logs/<taskId>.{out,err}.log`, readable
  after the fact regardless of process lifetime.
- **Reload-resumability**: the child is spawned detached, `.repoos/agents.json`
  records enough to find it again, and `AgentRunner.adoptRunningAgents()`
  (`src/server/agents.ts:2951`) re-attaches on the new process's boot,
  replaying/continuing to stream its output rather than losing the run.

The freeform PM call was never extended to use this machinery — plausibly
because it runs before a task id exists to key a log file or registry entry
by. The client already generates and holds a `freeformRunId` (a random UUID,
see `TaskDrawer.vue`) for exactly this run, before any task exists — that is
the natural key to use instead of a task id.

## Desired behavior

1. **Durable logging**: every freeform PM run gets a real, durable output log
   (e.g. `.repoos/agent-logs/freeform-<runId>.{out,err}.log`), independent of
   whether the server process handling it is still alive when it finishes.
2. **Durable run record**: a registry entry (mirroring `.repoos/agents.json`)
   recording enough to find and re-attach to the spawned process later:
   runId, pid, cwd, the original prompt/explanation text, and start time.
3. **Detached spawn**: the freeform PM's CLI process survives a parent
   reload, the same way `reload.ts`'s replacement process and `AgentRunner`'s
   task-turn children already do.
4. **Reload-resumable**: on boot, alongside `adoptRunningAgents()`, scan for
   freeform runs whose process is still alive and re-attach (resume
   streaming their output to any client still watching that `runId`, per the
   existing `repo.outputs[runId]` mechanism); for one whose process already
   exited while no server was up to receive the result, read its durable log
   and complete the normal post-processing (parse the PM's output, create the
   task) that would otherwise have run inline.
5. **Durable, surfaced error state**: when a freeform run fails for a
   reason worth showing (crash, non-zero exit, timeout — not just "no PM
   agent configured"), persist that outcome against the runId and surface it
   like the task-card error states already shown elsewhere (review/MTD
   failures) — not just the current silent "draft" fallback with an
   ephemeral, page-reload-losable error string. A user who navigates away and
   back (or whose page reloaded because the server did) should still be able
   to see that their freeform submission failed and why.

## Notes for AI

- Read `src/server/pm-runs.ts`, `src/server/reload.ts` (the detached-spawn +
  `AbandonProcessGroup` pattern), and `AgentRunner.adoptRunningAgents()`
  (`src/server/agents.ts:2951`) in full before starting — this task is
  explicitly about extending an existing, working pattern to a path that
  never got it, not inventing a new mechanism.
- `pm-runs.ts`'s `pmWorking` map being in-memory is correct and should stay
  that way — a live "is it working right now" flag legitimately dies with
  the process. The gap this task closes is one layer down: the underlying
  run and its result need to survive a restart even though the *flag* need
  not.
- The client-generated `freeformRunId` (see `TaskDrawer.vue`) is already the
  right key for all of the above — no new id scheme needed.
- Related, already-fixed-this-session: `TaskDrawer.vue`'s reopen-drawer flow
  had its own stale-`freeformRunId` bug (a leftover run's buffered output
  rendering as if a new PM run were live) — unrelated root cause, but the
  same general area of the code; be aware both bugs can look superficially
  similar ("stale-looking PM activity in the New Task panel") from a user's
  perspective.

## Acceptance criteria

- [ ] A freeform PM run's output survives a server reload — a run in flight
      when the server restarts is not silently lost.
- [ ] A durable log file exists per freeform run, inspectable after the fact
      regardless of whether the server that started it is still running.
- [ ] A freeform run that fails (not just "no agent configured") surfaces a
      specific, durable error the user can still see after a page/server
      reload — not just a generic draft with no error trace.
- [ ] `repoos check` passes.

## Activity

- 2026-09-18T04:50:04Z · created · unknown
