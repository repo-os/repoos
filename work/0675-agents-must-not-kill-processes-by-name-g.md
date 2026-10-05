---
id: "0675"
title: Agents must not kill processes by name; give each agent its own process group
type: bug
status: inbox
priority: p1
area: server
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-10-05T16:58:32Z"
updated_at: "2026-10-05T16:58:32Z"
---
## Problem

Engineer agents routinely clean up the dev servers they started with machine-wide pattern kills: `pkill -f "vite"`, `pkill -f "bun --watch src/server.ts"`, `pkill -f "bun run --filter ..."`. In one project's agent logs these appeared 9, 9 and 6 times in three tasks. These match every process on the laptop with that name, so they killed the owner's long-running dev server (SIGTERM, exit 143) and can kill other projects' servers. Separately, `repoos serve` processes started from an agent shell (plain, nohup, new session, and a launchd service) were all SIGTERMed within ~15-45 s, interrupting work in flight; the only stable placement was a foreground process in the app's Terminal panel. Cause of the serve kills is not identified.

## Desired UX

An agent run can start and stop its own helper processes without ever affecting anything else, and the default engineer instructions say so.

- Run each agent turn in its own process group/session; at the end of the turn kill that group (and only that group). Report leaked children in the task log.
- Default engineer/reviewer instructions (and the AGENTS.md template) include: never kill by name or pattern; start helpers on a free high port, remember the PID, kill only that PID; prefer finite commands.
- Optional guard: detect `pkill`/`killall` with a pattern in agent shell tool calls and warn or block.
- Investigate and document why a detached `repoos serve` started from an agent shell dies within a minute (and what `repoos service` does differently).

## Acceptance criteria

- A test that spawns an agent stub which starts a child, then ends its turn; the child is gone, and an unrelated process with a similar name is untouched.
- Instructions/template updated; docs mention the supported way to run the server for unattended work.
- `repoos check` passes.

## Notes for AI

Evidence comes from building a real 30-task project (opex, a Vue + Bun + Postgres app) with cheap agents on one laptop over ~9 hours. Read `AGENTS.md` first. Never hand-edit work/*.md; use RepoOS commands or APIs. Verify any claim you rely on against the current source before changing behaviour. Where a related task exists it is listed under "See also"; coordinate rather than duplicate.

## Activity

- 2026-10-05T16:58:32Z · created · unknown
