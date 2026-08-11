---
id: "0087"
title: Release a task's agent process and worktree resources when it leaves active
type: bug
status: review
priority: p1
area: server
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-11T13:20:44Z"
updated_at: "2026-08-11T15:13:36Z"
---
## Activity

- 2026-08-11T13:20:44Z · created · unknown


## Problem

A task's agent process is only ever killed by an explicit `POST
/api/tasks/:id/pause` — that is the single place `runner.stop(id)` is called
(`src/server/server.ts:863`). Nothing releases the agent when the task leaves
`active` by any other route: not the `active → review` transition an agent
performs on itself at the end of its own checklist, not `review → done`, not a
direct `PATCH /api/tasks/:id` status edit, and not a status change made by
editing the task file on disk.

The only cleanup wired to a status transition today is `stopPreviewIfLeft`
(`src/server/server.ts:388`), which stops the task's *preview* server when the
task leaves `active`/`review`. The agent process itself has no equivalent.

Observed live: `#0069`'s agent was still running **3h54m** after the task had
already reached `done` — visible in `ps` as a live `opencode run` process
against a worktree whose task was long finished. It was consuming CPU the
whole time, competing with the agents actually working on other tasks. It had
to be killed by hand. This is not a one-off: the same leak happens on every
normal `active → review` self-transition, it's just less visible because those
processes usually exit on their own shortly afterward.

Two costs, both real:

1. **Resource leak / CPU contention.** Leaked agents accumulate and slow down
   the tasks that *are* running. During this session, leaked agents plus a
   batch of untimed model probes had roughly ten stray processes competing
   with three live agents, which is a plausible contributor to tasks that
   normally take 5-20 minutes appearing to take far longer.
2. **The board lies about what's running.** `GET /api/agents/running` is
   backed by the same registry, so a task can read as finished while its
   process is still alive (or the reverse after a server restart, which
   wipes the in-memory registry while the OS processes keep going).

## Desired UX

- When a task leaves `active` — to `review`, to `done`, to `ready`, or to any
  other status, by any route (agent self-transition, API PATCH, UI action, or
  a direct file edit picked up by the watcher) — its agent process is stopped
  and its registry entry released, the same way the preview already is.
- No orphaned `opencode`/`claude`/`qwen`/`codex` process outlives the task it
  was spawned for.
- `GET /api/agents/running` reflects reality: a task listed as running has a
  live process, and a task not listed has none.

## Acceptance criteria

- [ ] Leaving `active` stops the task's agent via the same graceful path
      `/pause` uses (`runner.stop`: SIGTERM, then SIGKILL after the existing
      grace period) — not a bare SIGKILL.
- [ ] The cleanup fires for every route that can change status, not just the
      HTTP ones: `PATCH /api/tasks/:id`, the `/done` close-out, and a status
      change made by editing the task file directly on disk (the watcher /
      `LiveIndex.applyFileChange` path). Hooking it next to the existing
      `stopPreviewIfLeft` `onStatusChange` callback is the natural shape, but
      confirm that callback actually fires on the file-watcher path too — if
      it doesn't, that gap is part of this task.
- [ ] `review → done` releases the agent **before** `completeTask` removes the
      worktree, so the worktree is never torn out from under a live process.
      Note the ordering: `done.ts` already calls `removeWorktree`/`deleteBranch`
      at the end of a successful close-out.
- [ ] A task whose agent has already exited on its own is a clean no-op — the
      cleanup must be idempotent and must not error or log noise for the
      common case.
- [ ] Regression test: a task in `active` with a live (fixture-binary) agent,
      transitioned to `review`, ends with no live process and no registry
      entry. Follow the existing fakebin pattern in
      `src/ui-app/tests/agent-drivers.test.ts` / `json-events.test.ts`.
- [ ] `repoos check` passes.

## Notes for AI

- Files to touch: `src/server/server.ts` (the `stopPreviewIfLeft`
  `onStatusChange` hook around line 388, the `/done` route, the PATCH route),
  `src/server/agents.ts` (`AgentRunner.stop`/`cleanup` — already idempotent,
  reuse it rather than adding a second kill path), possibly
  `src/server/live-index.ts` if the file-watcher status-change path needs its
  own hook.
- **Reuse `runner.stop(id)`** — do not write a new process-killing routine. It
  already does SIGTERM → SIGKILL-after-grace and clears the registry via
  `cleanup()`, and `cleanup()` already flushes the trailing output line and
  runs the 0077 board-divergence self-heal. Bypassing it would lose all of
  that.
- **Do not** kill the agent when a task moves *into* `review` if the intent is
  for the human to keep chatting with it — check 0053, which deliberately
  keeps logs and chat available during `review`. Resolve this tension
  explicitly: the agent *turn* (the process) should end, while the *session*
  (transcript + resumable session id, held in `sessions`, not `entries`)
  must survive so a follow-up message can still resume it. `stop()` already
  only clears `entries`, so this should fall out naturally — but verify it,
  and state the conclusion in the PR.
- Out of scope: reconciling the in-memory registry against real OS processes
  after a server restart (the registry is wiped while processes survive —
  that's a separate, larger problem). Note it if you hit it; don't fix it here.

## Related

- 0053 · Keep agent logs and chat available in review state — the constraint
  that the session must survive even when the process is stopped.
- 0077 · Harden the review-status readback — its self-heal runs inside
  `AgentRunner.cleanup()`, which is why cleanup must go through `stop()`.
- 0047 · Move-to-done — where `removeWorktree`/`deleteBranch` happen, and why
  ordering matters.

## Activity

- 2026-08-11T13:30:50Z · status inbox→ready
- 2026-08-11T15:13:36Z · status ready→review
