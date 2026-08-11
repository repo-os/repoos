---
id: "0096"
title: Make agent previews server-owned and protect the main server port
type: bug
status: ready
priority: p1
area: server
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-11T15:13:09Z"
updated_at: "2026-08-11T15:22:46Z"
---
## Activity

- 2026-08-11T15:13:09Z · created · unknown


## Problem

RepoOS already has a managed preview API and `PreviewManager`, but agent
missions and task guidance still tell engineers to run `repoos serve` directly,
often with the example `--port 7171`. Port 7171 is normally the main RepoOS
server. Multiple UI agents therefore compete with the control plane and with
each other instead of requesting task-scoped previews.

This has become a recurring failure rather than a theoretical risk. During the
2026-08-11 incident, tasks 0089 and 0049 launched worktree servers on 7171. One
failed with `EADDRINUSE`; another entered the auto-reload handoff on that port,
logged that its replacement was ready, and released the listener. The
replacement did not remain healthy. Port 7171 ended with no listener while two
`repoos serve --port 7171` processes remained alive and all three engineering
agents were orphaned under PID 1.

Choosing deterministic ports from task ids does not solve ownership: ports are
limited to 1–65535, other repos and applications can use the same value, stale
processes retain ports, and allocation still races. Preview ports and lifecycle
must be owned by RepoOS, not selected by agents.

## Desired UX

An agent that needs to verify a UI asks RepoOS for that task's preview. RepoOS
validates the task/run/worktree, builds the correct worktree, allocates a free
ephemeral port, starts or reuses the managed preview, and returns the verified
URL in the agent transcript. The agent never chooses a port or launches a
long-lived `repoos serve` process.

The main server remains reachable throughout concurrent agent work, preview
rebuilds, failed preview starts, and reloads. A preview failure is isolated to
that task and produces an actionable error without affecting other previews or
the main RepoOS process.

## Acceptance criteria

- [ ] Agent launch and resume missions explicitly prohibit direct `repoos
      serve`/manual port selection and provide one structured, task-scoped way
      to request a preview.
- [ ] The request is handled by the trusted RepoOS server/runner and reuses
      `PreviewManager`; agents do not receive a general process-launch API.
- [ ] RepoOS supplies the actual main API endpoint to the agent workflow rather
      than assuming the control plane is always on port 7171.
- [ ] Preview requests validate the task id, current run/session, registered
      worktree and branch, and allowed task state before starting anything.
- [ ] Concurrent previews for at least three tasks receive distinct
      OS-allocated ports and serve each task's own worktree build.
- [ ] Repeated requests for the same task are idempotent and return the existing
      healthy preview URL.
- [ ] Add defense in depth for managed agent processes: an accidental direct
      `repoos serve` attempt is rejected with guidance to request a managed
      preview and cannot bind the main server port.
- [ ] A port-allocation race, bind failure, failed health check, or failed
      reload leaves no listenerless `repoos serve` process behind and does not
      disturb the main server or other previews.
- [ ] Reload handoff tests prove the old listener is retained or successfully
      rebound unless a verified replacement remains healthy; a log line saying
      "replacement is up" cannot precede a listenerless outcome.
- [ ] Preview processes and registry entries are reaped when their task leaves
      `active`/`review`, when explicitly stopped, and during crash/restart
      reconciliation.
- [ ] Replace unsafe `repoos serve --port 7171` guidance in `AGENTS.md`, the
      `repoos init` AGENTS template, docs, and non-done task specifications with
      the managed-preview workflow.
- [ ] Integration test: run a real main server plus multiple fixture agents
      requesting previews, rebuild one worktree, and assert continuously that
      the main `/api/health` remains reachable on its original port.
- [ ] `repoos check` passes.

## Notes for AI

- Existing preview orchestration is in `src/server/preview.ts`; it already uses
  an OS-assigned ephemeral port, checks health, persists a registry, and owns
  cleanup. Extend this path rather than adding a second preview implementation.
- Agent missions and process spawning are in `src/server/agents.ts`. A narrowly
  scoped environment marker/capability can support CLI defense in depth, but
  do not rely on prompt instructions alone.
- HTTP routes are in `src/server/server.ts`; current routes include
  `POST /api/tasks/:id/preview` and the corresponding stop action. Prefer an
  internal structured runner request when possible. If the agent calls HTTP,
  use the actual injected API URL and a short-lived task/run capability.
- Reload ownership is in `src/server/reload.ts`. Cover the drain/rebind edge
  case observed in this incident and ensure failed bind-only server processes
  terminate instead of retaining timers/watchers.
- Update both this repo's `AGENTS.md` and the scaffolded template string in
  `src/commands/init.ts`; they are separate sources.
- Do not use deterministic task-derived ports, kill arbitrary processes that
  happen to own a port, expose a general shell endpoint, or weaken agent
  sandboxes.
- Follow ADR-0005: agents express intent; RepoOS performs privileged process and
  network lifecycle operations.

## Related

- 0054 — managed task worktree previews on ephemeral ports
- 0066 — main server auto-reload and replacement handoff
- 0087 — release agent processes when tasks leave active
- 0090 — persist agent sessions and survive server reloads
- ADR-0005 — agents use RepoOS APIs for privileged operations

## Activity

- 2026-08-11T15:22:46Z · status inbox→ready
