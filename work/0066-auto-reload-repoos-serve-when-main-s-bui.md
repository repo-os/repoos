---
id: "0066"
title: Auto-reload repoos serve when main's build changes
type: feature
status: ready
priority: p2
area: server
assigned_to: ai
created_by: ""
branch: feat/0066-serve-auto-reload
created_at: "2026-08-11T00:17:13Z"
updated_at: "2026-08-11T03:15:24Z"
---
## Activity

- 2026-08-11T00:17:13Z · created · unknown

## Problem

`repoos serve` loads compiled JS from `dist/` once, at process start, and never
reloads. When a task merges to `main` (the done flow) and `bun run build`
writes a new `dist/`, the running server keeps serving the OLD build
indefinitely — the live API/UI silently diverge from main until a human
manually restarts the process. The CLI has a staleness guardrail (the
`.build-info.json` hash warning); the server has no equivalent.

Concrete instance (this repo, 2026-08-11): task #0060 landed the
`/api/models` endpoint and built fresh `dist/` at 07:55, but the serve process
had started at 07:37 — so `/api/models` returned the SPA index.html fallback
and the Agents page model dropdown kept showing the hardcoded three labels.
The feature was live on disk and entirely unserved.

## Desired UX

The serve process always reflects main's current build without human
intervention:

- When `dist/.build-info.json`'s hash changes (a rebuild after a merge), the
  server reloads itself: a replacement process takes over the same port and the
  old one exits, so the API/UI never serve stale code indefinitely.
- **Never orphan a running agent**: a reload is deferred while `AgentRunner`
  has running entries (or waits for them to drain) — the in-memory running
  registry and sessions are not disposable, and restarting mid-turn would
  strand a task's agent exactly as a manual kill does today.
- A human can also trigger a reload on demand (`POST /api/server/restart`) —
  best-effort, same reload path.

## Acceptance criteria

- [ ] On boot the server compares its loaded build hash against the current
      `dist/.build-info.json`; if stale and no agent is running, it reloads
      immediately (stale-boot self-heal).
- [ ] While the server is running, a change to `dist/.build-info.json` (fs
      watch on the file) schedules a reload. If any agent turn is running, the
      reload is **deferred and retried** (or waits) until the runner is idle —
      never kill mid-turn.
- [ ] Reload: spawn a replacement `repoos serve` with the same host/port,
      confirm it is ready (listening + health OK), then the old process exits
      cleanly. If the replacement fails to bind, the old process keeps serving
      (no outage). Zero-downtime via `SO_REUSEPORT` where the runtime supports
      it; otherwise a brief graceful drain is acceptable.
- [ ] `POST /api/server/restart` triggers the same reload path (deferred while
      agents run); returns the reload state (`reloading` / `deferred: n` /
      `not-stale`).
- [ ] Boot-time cleanup still removes previews (0054) and re-homes any state
      the old process held (previews.json already persists to
      `<cacheDir>/previews.json`; verify nothing else needs persisting).
- [ ] Fixture tests: hash-change detection, deferred-while-running behavior,
      replacement readiness handoff (fakebin pattern); `repoos check` passes;
      zero new runtime dependencies.

## Notes for AI

- **The guardrail to mirror**: `src/commands/check.ts` and the CLI's staleness
  warning already compare a hash of `src/` against `dist/.build-info.json`
  (see the build-staleness task 0012) — reuse that hashing approach; the
  server watch should key on the build-info hash, not file mtimes or a timer.
- **Files to touch**: the server entrypoint / `src/server/server.ts` bootstrap
  (capture build hash at startup), a small watcher (node:fs `watch` on
  `dist/.build-info.json`, or a low-frequency stat poll if watch is unreliable
  on the platform), `src/server/agents.ts` `AgentRunner.running()` (already
  exists — reload gating reads it), and a `POST /api/server/restart` route.
- **Self-restart mechanics**: spawn `process.execPath`/`repoos serve` with the
  current `host`/`port` args; pass a `REPOOS_RELOAD=1` env var so the child
  knows it is a replacement and can skip the stale-boot reload (or inherit
  cleanly). Confirm readiness by connecting to the port and hitting
  `/api/health` before the old process exits. Do not reuse an arbitrary fixed
  range of ports.
- **Deferred reload is the important bit**: do NOT attempt hot state migration
  of the AgentRunner; simply refuse/retry while running. This is also the
  behavior a human restart should honor today — killing the server orphans
  agent children (they keep working, but RepoOS loses pause/stream/session).
- **Don't**: don't add a runtime dependency (no `nodemon`/`chokidar`); don't
  reload on `src/` changes (only on built `dist/`); don't drop the preview
  registry or agent sessions on reload without handling them; don't change the
  done flow's merge semantics.
- **Self-hosting rule**: this repo runs itself — after implementing, the
  serve process on 7171 must reload on its own when a future build lands;
  verify with `repoos check` + a live reload observation.

## Scope

- **This task**: boot-staleness self-heal, build-info watch + deferred reload,
  replacement handoff with readiness, `POST /api/server/restart`.
- **Deferred (separate tasks)**: hot-migrating live agent sessions across a
  reload; reloading on `src/` changes in dev; wiring an explicit notification
  (e.g. an SSE `server.reloading` event) to the UI.

## Related

- 0012 · Build-staleness guardrail (the hash mechanism to reuse)
- 0060 · Live model dropdown (the concrete victim of stale serving)
- 0054 · Preview servers (boot-time cleanup of child previews on reload)
- Root incident: /api/models served SPA HTML because serve predated the build

## Activity

- 2026-08-11T00:17:42Z · status ready→active
- 2026-08-11T00:28:12Z · status active→ready
- 2026-08-11T00:28:13Z · status ready→active
- 2026-08-11T03:15:24Z · status active→ready
