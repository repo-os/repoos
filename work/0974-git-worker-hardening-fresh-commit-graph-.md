---
id: "0974"
title: "Git worker hardening: fresh commit-graph, fast lane for short calls, cache survives restarts"
type: bug
status: inbox
priority: p0
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-28T11:30:32Z"
updated_at: "2026-10-28T11:30:32Z"
---
## Problem
On 2026-10-28 RepoOS was unusable for hours because of git:
- The repo's commit-graph was a week stale, so the full `git log --name-only -- work` walk (used for the board's last-commit facts and dependency blockers) took 2–5 minutes instead of ~5 s. Rebuilding it by hand (`git commit-graph write --reachable --changed-paths`) fixed the speed.
- The git worker (#0962) serializes every call. Quick commands (handoff's 9 s `git-command`) queued behind that walk and failed. (A driver hotfix now starts each timeout when the job runs and caps queue wait at 3 min.)
- A timeout kills the worker child, which throws away the in-memory `dirLogCache`, so the next request starts the cold walk again: a feedback loop.
- At boot the index build timed out, `repoos serve` exited, and launchd restarted it into the same cold walk: 10 failed starts. (A driver hotfix now retries the boot build 3 times.)

## Desired UX
Git work never makes the board or a handoff hang, and the slow path cannot come back silently as the repo grows.

## Acceptance criteria
- Commit-graph kept fresh: RepoOS writes `git commit-graph write --reachable --changed-paths --split` after its own commits (debounced), and/or on a periodic maintenance tick; a stale or missing graph is detected and rebuilt in the background. Test with a fake git.
- Short calls (`git-command`, `run-git`, small reads) run in a separate fast lane (a second worker child or an in-process async path) and never wait behind `git-overview`, `build-index`, `task-facts` or `dependency-blockers`. Test: a quick call completes while a slow call is running.
- The `dirLogCache` survives a worker restart (persist it under `.repoos/cache/` keyed by HEAD, or keep it in the parent), so a timeout never forces a cold full walk. Test.
- `repoos stats` / the STUCK log shows queue wait vs run time per git job.
- Fold in #0966 (batched, cached board git queries) where it overlaps; mark #0966 superseded in its body if fully covered.

## Notes for AI
Files: `src/server/git-worker.ts` (queue, timeouts), `src/server/git-worker-entry.ts`, `src/core/git.ts` (`dirLogArgs`, `dirLogCache`, `FULL_DIR_LOG_TIMEOUT_MS`), `src/server/live-index.ts` (`buildIndexWithRetry`). Keep the two driver hotfixes (run-time timeouts, boot retry). Do not edit repoos.toml. Zero runtime dependencies.

## Activity

- 2026-10-28T11:30:32Z · created · njachowski@gmail.com
