---
id: "0966"
title: "Server freezes (3/4): batched, cached board git queries"
type: refactor
status: active
priority: p1
area: core
depends_on: ["0962"]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/server-freezes-3-4-batched-cached-board-
cli_override: codex
model_override: gpt-6.1-sol
created_at: "2026-10-27T12:02:34Z"
updated_at: "2026-10-28T18:26:59Z"
---
## Problem
Split from #0962. The board computes git state per task/branch (ahead counts, merged checks, work-file history), spawning hundreds of git processes on ~900 tasks and ~100 branches.

## Desired UX
Board git state comes from a handful of batched, cached queries, so the board stays fast however many tasks and branches exist.

## Acceptance criteria
- [ ] Board git reads use: one `for-each-ref` with `%(ahead-behind:main)` and objectname, one `branch --merged main`, one incremental `log --name-only -- work`, one `worktree list --porcelain`.
- [ ] Caches invalidate on ref/HEAD change, not on a timer; per-task/per-branch spawns are removed.
- [ ] UI-polled GET routes (Control worktree-gc, /api/tasks, deployments) never trigger a full index rebuild.
- [ ] Tests with a fake git runner prove the spawn count stays constant as tasks/branches grow.

## Notes for AI
Depends on #0962. Same rules as the other split tasks: no server restarts, no previews, no repoos.toml edits, run only affected tests.

## Activity

- 2026-10-27T12:02:34Z · created · njachowski@gmail.com
- 2026-10-28T18:25:05Z · cli_override, model_override
- 2026-10-28T18:25:28Z · status inbox→ready
- 2026-10-28T18:25:38Z · status ready→active, branch
- 2026-10-28T18:26:59Z · message_queued at 2026-10-28T18:26:59.158Z
