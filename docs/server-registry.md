# Running-server registry

Every long-lived **control-plane** `repoos serve` registers itself under
`~/.repoos/servers/` so tools (RepoOS Hub, `repoos servers`, scripts) can
discover what is running without scanning ports.

This is separate from `~/.repoos/services.json`, which tracks repos installed
with `repoos service` (launchd/systemd). A plain `repoos serve` never writes
`services.json`.

## Layout

- Directory: `~/.repoos/servers/` (created with mode `0700`)
- One file per server: `<port>.json`, written atomically (temp file + rename,
  mode `0600`)

Example `7559.json`:

```json
{
  "schema": 1,
  "port": 7559,
  "host": "127.0.0.1",
  "pid": 12345,
  "root": "/abs/path/to/repo",
  "projectName": "lightingai",
  "version": "0.5.71",
  "startedAt": "2026-10-19T12:00:00.000Z",
  "kind": "server",
  "activeEngineers": 1,
  "engineersUpdatedAt": "2026-10-19T12:05:00.000Z"
}
```

| Field | Meaning |
| --- | --- |
| `schema` | Contract version (`1`) |
| `port` / `host` | Connectable endpoint (`host` is loopback when bound on `0.0.0.0`) |
| `pid` | Serve process PID at registration time |
| `root` | Canonical absolute repo root |
| `projectName` | Display name (`projectDisplayName`) |
| `version` | Running RepoOS install version |
| `startedAt` | ISO-8601 time when this listener registered |
| `kind` | Always `"server"` for control-plane serves |
| `activeEngineers` | Live engineer turns in that server; refreshed every 5s (#0871) |
| `engineersUpdatedAt` | Last refresh of `activeEngineers` |

## Lifecycle

- **Written** once the HTTP listener has bound.
- **Refreshed** when `repoos.toml` is reloaded and the project display name changes.
- **Removed** on clean shutdown when the registry file still names this process's
  PID (`handle.close`, including SIGINT/SIGTERM from `repoos serve`). After an
  auto-reload handover the replacement overwrites the file first; the exiting
  parent does not delete that entry.

Registry I/O is best-effort: failures are logged once and never block startup.

## Never registered

- Preview children (`REPOOS_PREVIEW_CHILD=1`)
- `repoos serve --preview-overrides` (preview config overlay active)
- Servers rooted at a **linked task worktree**
- Ephemeral test servers (`port: 0`)
- Anything with `REPOOS_NO_REGISTRY=1`

## Port conflicts

Before bind, if a registry file for this port names a **live** PID for a
**different** `root`, startup fails with a clear error. A **dead** PID is
treated as stale and overwritten on register.

## CLI

```bash
repoos servers           # human table: port, project, root, pid, uptime, engineers, validity
repoos servers --json    # machine-readable list + validity + activeEngineers
repoos servers --prune   # delete stale entries (dead PID or failed health), then list
```

Validation for each entry:

1. PID is alive (`kill -0`)
2. `GET /api/health` returns `ok` with the same canonical `root`

Stale reasons: `dead-pid`, `unreachable`, `health-mismatch`. `--prune` deletes
any entry that fails validation (including health mismatch while the PID is still
alive).

## Hub contract

RepoOS Hub’s Add-server sheet reads this directory (not port scanning). The
JSON shape above is the stable contract — bump `schema` only with a migration
story.

Implementation: `src/core/server-registry.ts`, wired from `src/server/server.ts`.
