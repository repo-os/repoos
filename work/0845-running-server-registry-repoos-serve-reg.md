---
id: "0845"
title: "Running-server registry: repoos serve registers itself in ~/.repoos/servers (plus repoos servers)"
type: feature
status: done
priority: p2
area: [server, cli]
merged_commit: 7d467da49c44a3214c474ef672956220ba30742d
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/running-server-registry-repoos-serve-reg
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-19T05:59:37Z"
updated_at: "2026-10-21T00:05:52Z"
last_close_out_gate_ms: 298612
last_close_out_gate_at: "2026-10-19T07:48:47.981Z"
review_passes: 3
last_check_failure: "repoos check at 2026-10-19T07:27:53.466Z: repoos check failed: server-side finalization timed out (deadline exceeded)"
review_rounds: 2
---
## Problem
RepoOS Hub's Add server sheet wants to list locally running RepoOS servers, but there is no central place that says what is running. It brute-force probes ports 7000-7999 (unreliable, #0844). The only machine-wide file today is `~/.repoos/services.json`, which lists just the repos installed with `repoos service` (launchd), including stale `status: running` entries, and nothing for a plain `repoos serve` (for example the lightingai project on 7559).

## Desired UX
Every real `repoos serve` registers itself, so any tool (the Hub, `repoos servers`, scripts) can see what is running without scanning.

Registry layout (this is the contract the Hub task depends on):
- Directory `~/.repoos/servers/` (create with 0700), **one file per running server**: `<port>.json`, written atomically (write temp + rename).
- JSON: `{ "schema": 1, "port": 7559, "host": "127.0.0.1", "pid": 12345, "root": "/abs/path/to/repo", "projectName": "lightingai", "version": "0.5.71", "startedAt": "ISO-8601", "kind": "server" }`.
- Written once the server is listening; refreshed on config reload if the project name changes; removed on clean shutdown (SIGINT/SIGTERM/exit handlers).
- **Never registered:** preview servers (`REPOOS_PREVIEW_CHILD` / `--preview-overrides`), task worktree servers, ephemeral test servers (port 0), or any server started with `REPOOS_NO_REGISTRY=1`.
- A new `repoos servers` command lists registered servers (port, project, root, pid, uptime), validates each (pid alive AND `GET /api/health` answers with the same root), marks or removes stale entries (`--prune`), supports `--json`.
- A server that finds a stale file for its own port (dead pid) overwrites it; if the pid is alive and the root differs, startup reports the port conflict clearly.

## Acceptance criteria
- Tests: serve writes `<port>.json` atomically with the documented fields once listening and removes it on clean exit; preview/worktree/test servers write nothing; a second registration for the same port with a dead pid overwrites; a live pid with a different root is reported as a conflict.
- Tests: `repoos servers` lists valid entries, flags/prunes stale ones (dead pid or health mismatch), supports `--json`; never lists a preview server.
- Registry reads and writes never throw into server startup (best effort, logged once); permissions are user-only.
- Documented in docs/architecture.md (or a new docs/server-registry.md) and user-docs/cli.md, including the Hub contract above.
- No new runtime dependency.

## Notes for AI
Look at src/server/server.ts (listen callback and shutdown hooks), src/core/runtime.ts, src/commands/status.ts and src/core/services (the existing `~/.repoos/services.json`) for conventions; do not reuse services.json for this (different lifecycle). Related: #0844 (Hub scan fix) and the Hub registry-reader task that depends on this one. Source: Nick, 2026-10-19.

## Activity

- 2026-10-19T05:59:37Z · created · njachowski@gmail.com
- 2026-10-19T06:09:11Z · status inbox→ready
- 2026-10-19T06:09:14Z · cli_override, model_override
- 2026-10-19T06:09:16Z · status ready→active, branch
- 2026-10-19T06:13:54Z · body
- 2026-10-19T06:14:46Z · body
- 2026-10-19T06:16:28Z · body
- 2026-10-19T06:25:08Z · status active→review
- 2026-10-19T06:25:09Z · note: shots: skipped — Docs site skipped: no docs shot declared
- 2026-10-19T06:26:52Z · note: review pass 1: needs some work
- 2026-10-19T06:26:53Z · status review→active
- 2026-10-19T06:29:40Z · body
- 2026-10-19T06:32:24Z · body
- 2026-10-19T06:40:45Z · status active→review
- 2026-10-19T06:40:47Z · note: shots: skipped — Docs site skipped: no docs shot declared
- 2026-10-19T06:42:11Z · note: review pass 2: needs some work
- 2026-10-19T06:42:12Z · status review→active
- 2026-10-19T06:44:04Z · body
- 2026-10-19T06:47:11Z · body
- 2026-10-19T07:27:52Z · CTO action: restart-stalled-agent (fresh) · agent exited without emitting the handoff signal
- 2026-10-19T07:27:53Z · message_queued at 2026-10-19T07:27:53.123Z
- 2026-10-19T07:32:00Z · body
- 2026-10-19T07:34:58Z · body
- 2026-10-19T07:36:54Z · body
- 2026-10-19T07:37:56Z · status active→review
- 2026-10-19T07:37:58Z · note: shots: skipped — Docs site skipped: no docs shot declared
- 2026-10-19T07:39:23Z · note: review pass 3: good to go
- 2026-10-19T07:48:47Z · close-out gate completed in 299s
- 2026-10-19T07:49:32Z · status review→done, release:success
- 2026-10-19T09:41:58Z · message_overdue: still queued after 60m without being delivered
- 2026-10-19T13:55:07Z · message_overdue: still queued after 60m without being delivered
- 2026-10-19T14:51:12Z · message_overdue: still queued after 60m without being delivered
- 2026-10-19T15:43:30Z · message_overdue: still queued after 60m without being delivered
- 2026-10-19T16:19:54Z · message_overdue: still queued after 60m without being delivered
- 2026-10-19T19:46:47Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T04:26:29Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T11:08:20Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T15:31:56Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T16:09:58Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T17:21:45Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T18:33:40Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T19:47:06Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T20:10:44Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T21:10:05Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T21:57:01Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T22:12:32Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T23:15:30Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T23:17:43Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T00:05:52Z · message_overdue: still queued after 60m without being delivered
