---
id: "0965"
title: "Server freezes (2/4): route remaining sync git spawns through the git worker + guard test"
type: bug
status: inbox
priority: p1
area: core
depends_on: ["0962"]
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-27T11:47:15Z"
updated_at: "2026-10-28T16:39:00Z"
---
## Problem
Split from #0962. Even after #0962's git worker lands, synchronous child processes (execFileSync/spawnSync/execSync) are still reachable from the server's request handlers and timers: worktreeStatus() callers (task-watchdog.ts ~323, indexer.ts ~104), the sync `git log` walk (indexer.ts ~76, story-definition-files.ts ~230), worktree-gc.ts sweep, and per-branch isAncestor checks. Each blocks the single HTTP thread for 0.1-0.3 s per call, which is what freezes the UI.

## Desired UX
No server request or timer ever waits on a blocking git spawn; a slow git call delays only the answer that needs it.

## Acceptance criteria
- [ ] Every call site above goes through #0962's git worker (async, queued, per-call timeout) instead of a sync spawn.
- [ ] A guard test fails if execFileSync/spawnSync/execSync is reachable from src/server request handlers or timers (allowlist only CLI-only paths, each with a reason).
- [ ] Existing tests pass; `repoos check --changed main` passes.

## Notes for AI
Depends on #0962 (git worker). Keep the diff to moving these call sites; do not redesign endpoints here (that is a separate task). Never restart the RepoOS server, never run `repoos serve`, never request a preview, do not touch repoos.toml. Run only the affected test files, not the full suite, before handoff.

## Resolution
Delivered by #0962 (git worker) and #0974 (fast lane, watchdog moved to the worker), both on main 2026-10-28. Verified by the driver at da375ec47:
- `src/server` has no `execFileSync`/`spawnSync`/`execSync` outside test files.
- The remaining server imports from `core/indexer`, `core/story-definition-files` and `core/worktree-gc` run no git: `buildIndex(config, { skipGit: true })` in agents.ts, `ensureStoryNumbers(config, new Map())` at boot, and `sweepStaleWorktrees` used only as a type in server.ts. `LiveIndex.refreshAll()` (sync) has no server caller.
- `src/ui-app/tests/server-git-blocking-guard.test.ts` bans sync child-process APIs, sync git calls and sync git read helpers across server code, and passes (204 tests).
No branch: nothing left to merge.


## Activity

- 2026-10-27T11:47:15Z · created · njachowski@gmail.com
- 2026-10-28T16:39:00Z · body: Resolution (added)
