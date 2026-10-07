# Board events contract (#0728)

RepoOS streams typed events on `GET /api/events` (Server-Sent Events). The CTO
monitor, `repoos watch`, and external driver sessions should treat the following
as the **stable automation feed**.

## Normalized fields

Pass each SSE JSON payload through `projectBoardWatchEvent` in
`src/server/board-events.ts`. When the event is part of the feed, the projection
includes:

| Field | Meaning |
| --- | --- |
| `type` | Original `RepoEvent` type |
| `at` | ISO-8601 UTC timestamp from the server |
| `taskId` | Task id when the event is task-scoped; `null` for board-wide signals |
| `cause` | Short human-readable reason (status change, failure line, review state, …) |
| `evidence` | Links/paths for more context (`task`, `logPath`, `attention`, `closeOutOutcomes`) |

## Event types

| SSE `type` | When it fires | `taskId` | Notes |
| --- | --- | --- | --- |
| `task.updated` | Task frontmatter changed | yes | Emitted only when `status` (or other visible fields) change |
| `task-check.done` | Handoff-finalize or merge-gate check finished | yes | `cause` names `handoff-finalize` or `merge-gate` and pass/fail |
| `review` | Agent review lifecycle | yes | `cause` includes `ready`, `failed`, or `error` text |
| `close-out.outcome` | Move to done ended | yes | `outcome.reason` is the failure line; success cause is `close-out succeeded` |
| `agent.exited` | Engineer/review CLI process ended | yes | `exitCode`, `cause`, optional `logPath` under `.repoos/agent-logs/` |
| `agent.stats` | Live session stats tick | yes | Watch includes only `stats.stalled === true` (silent run / possible hang) |
| `board.alert` | Validated hang/slow-run signal | yes | `alert`: `silentRun` (more kinds when #0720 lands) |
| `attention.updated` | Bell feed changed | null | Refetch `GET /api/attention` for slow-run and host alerts |

Slow validation runs and persistent host hangs will also surface through
`GET /api/attention` once #0720 is enabled; until then, `board.alert` /
`agent.stats` stalled cover the silent-run case.

## CTO heartbeat

`POST /api/cto/heartbeat` records that the CTO (or a human driver supervising
it) is alive. The attention feed raises **`ctoSilent`** when CTO-actionable work
exists (failed/timed-out close-out, tasks in `review`, silent agent runs) and no
heartbeat arrived within `2 × ctoMonitorIntervalMs` (minimum five minutes).

The internal CTO monitor records a heartbeat on every wake (timer or event).

## CLI

```bash
repoos watch [--json] [--task <id>] [--port N]
```

Reconnects after server reloads and re-authenticates on HTTP 401 (#0723). Exits
non-zero when the control plane is unreachable.
