---
id: "0962"
title: "Server freezes: move all git reads off the HTTP thread, batch and cache them"
type: bug
status: review
needs_merge: true
priority: p0
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/server-freezes-move-all-git-reads-off-th
cli_override: codex
model_override: gpt-6.1-sol
created_at: "2026-10-26T07:54:06Z"
updated_at: "2026-10-26T19:30:12Z"
---
## Problem
The RepoOS server (single Bun main thread) repeatedly freezes or becomes unusably slow (UI never loads, accepts then resets connections) because it runs blocking git child processes per task/branch on the same thread that serves HTTP. With ~910 tasks, ~100 branches, 27 worktrees, each spawn costs 0.1-0.3 s on macOS (syspolicyd). Fixed one loop at a time so far (live-index per-file git, dir-log walk cache, async ahead-count cache, GET /api/system/worktree-gc preview cache) but others remain: worktreeStatus() callers (task-watchdog.ts, indexer.ts), per-task `git rev-list --count`, per-branch `merge-base --is-ancestor` (worktree-gc.ts, task-dependencies.ts, worktree-handoff-guard.ts, done.ts), sync `git log --name-only -- work` walks (indexer.ts:76, story-definition-files.ts).

## Desired UX
The UI loads in under a second and stays responsive no matter how many tasks/branches/engineers exist. A slow git call can delay only the answer that needs it.

## Acceptance criteria
1. No synchronous child process (execFileSync/spawnSync/execSync) is reachable from the server's request handlers or timers; a test/lint guard fails the build if one is added under src/server or the code it calls.
2. Git reads for the board come from a small set of batched, cached queries: one `for-each-ref` with `%(ahead-behind:main)` + objectname, one `branch --merged main`, one incremental `log --name-only -- work`, one `worktree list --porcelain`; caches invalidate on ref/HEAD change (not a timer), and per-task/per-branch spawns are removed.
3. Git work runs in a worker (Bun Worker or child process) with a request queue and per-call timeout; the HTTP thread never awaits a spawn inline.
4. Every HTTP request logs duration; a request open >10 s logs "STUCK <route>" plus in-flight git calls and their age.
5. UI-polled GET routes (Control page worktree-gc, /api/tasks, deployments) never trigger a full index rebuild.
6. Measured: with 900 tasks / 100 branches the server answers /api/auth/session and /api/tasks in <200 ms warm and within 5 s of boot, and stays that way for 1 h with two engineers running.
Also cap local build/test fan-out (see #0961) and keep agents at nice 10.

## Notes for AI
Read HANDOFF-2026-10-25.md in the repo root first (evidence, hypotheses, file/line suspects). Do not restart the server yourself; ask the human. Never run `just serve-noauth` or request previews while editing server git code.

## Sub-item: replace the GET /api/tasks "dump everything" endpoint
`GET /api/tasks` returns all ~910 tasks with full markdown bodies plus per-task enrichers (dependency blockers, review status, preview targets, checkpoint recovery, pending handoff). It is a synchronous handler, so it blocks the whole server for ~45 s (was 60+ s before dependency-state caching, adfa259c9). No UI code calls it (the UI uses /api/board; only POST /api/tasks is used); the route is only listed in src/cli/api-route-parity.ts, so callers are external scripts/agents. It does not scale (grows with every task ever filed) and nobody needs 900 bodies as context.
Build, and keep CLI/API parity per AGENTS.md:
1. `GET /api/tasks/:id/context`: the task, its dependencies and dependents, related tasks (same story/area, recent neighbours) as short summaries, latest review verdict, branch/worktree status. This is what engineer/PM agents need.
2. `GET /api/tasks?fields=id,title,status,priority&status=...&limit=...&cursor=...`: a light, filterable, paged list without bodies; make `repoos list` and similar commands use it.
3. Keep the full dump only behind `?full=1`, made async/chunked so it cannot block the HTTP thread; add a test that fails if the default response grows with body size.
Acceptance: default list <200 ms warm with 900 tasks; context endpoint <100 ms; no per-task sync git in either.

## Activity

- 2026-10-26T07:54:06Z · created · njachowski@gmail.com
- 2026-10-26T07:54:12Z · needs_input
- 2026-10-26T07:54:21Z · body: Problem (added 1, removed 1); Desired UX (added 1, removed 1); Acceptance criteria (added 7, removed 1); Notes for AI (added 1, removed 1)
- 2026-10-26T08:49:23Z · needs_input
- 2026-10-26T09:21:57Z · body: Sub-item: replace the GET /api/tasks "dump everything" endpoint (added)
- 2026-10-26T09:27:53Z · released
- 2026-10-26T09:28:10Z · status inbox→active
- 2026-10-26T09:28:17Z · cli_override, model_override
- 2026-10-26T09:28:17Z · branch
- 2026-10-26T19:14:26Z · status active→review
- 2026-10-26T19:30:12Z · needs_merge
