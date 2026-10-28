---
id: "0974"
title: "Git worker hardening: fresh commit-graph, fast lane for short calls, cache survives restarts"
type: bug
status: active
needs_input: true
needs_input_reason: dev-error
needs_input_detail: "RetriableError: Agent turn stopped after repeated resume attempts made no progress"
priority: p0
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/git-worker-hardening-fresh-commit-graph-
cli_override: cursor
model_override: grok-4.7-low
review_cli_override: cursor
review_model_override: composer-2.5
created_at: "2026-10-28T11:30:32Z"
updated_at: "2026-10-28T15:20:16Z"
dev_error_count: 4
engineer_crash_log: "[{\"cli\":\"cursor\",\"model\":\"composer-2.5\",\"at\":\"2026-10-28T15:20:16.639Z\",\"kind\":\"dev-error\"}]"
engineer_failover: "{\"cli\":\"opencode\",\"model\":\"opencode-go/deepseek-v4.1-flash\"}"
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
- A check that is waiting (pressure guard, a heavy slot, the git queue) says so: the check run records the wait reason, the task card and handoff transcript show "waiting: <reason> for Nm", and a wait over 10 minutes is surfaced as needs-input instead of hanging silently. 2026-10-28: #0970's handoff check sat 26 min at 0% CPU behind a stale branch-local pressure guard with nothing on the card. Test.
- Build lock: when `src/` is newer than `dist/`, concurrent `repoos` CLI invocations share one build (a lock file under `dist/` or `.repoos/`); later callers wait for it instead of each starting `tsc` + Vite. 2026-10-28: a hotfix commit on main plus several concurrent CLIs drove load average to 320 and the server stopped answering. Test.
- Fold in #0966 (batched, cached board git queries) where it overlaps; mark #0966 superseded in its body if fully covered.

## Notes for AI
Files: `src/server/git-worker.ts` (queue, timeouts), `src/server/git-worker-entry.ts`, `src/core/git.ts` (`dirLogArgs`, `dirLogCache`, `FULL_DIR_LOG_TIMEOUT_MS`), `src/server/live-index.ts` (`buildIndexWithRetry`). Keep the two driver hotfixes (run-time timeouts, boot retry). Do not edit repoos.toml. Zero runtime dependencies.

## Activity

- 2026-10-28T11:30:32Z · created · njachowski@gmail.com
- 2026-10-28T11:51:20Z · cli_override, model_override
- 2026-10-28T11:51:37Z · status inbox→ready
- 2026-10-28T11:51:45Z · status ready→active, branch
- 2026-10-28T11:52:52Z · body: Acceptance criteria (added 1)
- 2026-10-28T11:52:53Z · message_queued at 2026-10-28T11:52:53.229Z
- 2026-10-28T12:17:18Z · agent exited with an error (codex) · error: You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purchase more credits or try again at 11:43 PM.
- 2026-10-28T12:17:18Z · engineer crash recovery: switched codex + gpt-6.1-sol → opencode + opencode-go/deepseek-v4.1-flash after 1/3 crashes in 30m · error: You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purchase more credits or try again at 11:43 PM.
- 2026-10-28T12:17:24Z · message_delivered: 1 message(s)
- 2026-10-28T12:25:55Z · review_cli_override
- 2026-10-28T12:25:57Z · review_model_override
- 2026-10-28T13:28:52Z · model_override
- 2026-10-28T13:28:59Z · engineer stopped by request
- 2026-10-28T13:28:59Z · needs_input
- 2026-10-28T13:29:29Z · agent exited with an error (codex) · Warning: No project session found with id 'repoos-0974-engineer-fmvs2xndf'; creating a new session with that id.
- 2026-10-28T13:29:29Z · engineer crash recovery: resuming codex + gpt-6-luna (1/3 crashes in 30m) · Warning: No project session found with id 'repoos-0974-engineer-fmvs2xndf'; creating a new session with that id.
- 2026-10-28T13:29:58Z · engineer crash recovery: resuming codex + gpt-6-luna (2/3 crashes in 30m) · Reading additional input from stdin...
- 2026-10-28T13:30:07Z · cli_override, model_override
- 2026-10-28T13:30:08Z · engineer stopped by request
- 2026-10-28T13:30:08Z · needs_input
- 2026-10-28T13:36:24Z · model_override
- 2026-10-28T14:48:07Z · message_queued at 2026-10-28T14:48:07.769Z
- 2026-10-28T14:48:57Z · body: Acceptance criteria (added 1)
- 2026-10-28T14:49:07Z · message_queued at 2026-10-28T14:49:07.215Z
- 2026-10-28T15:20:16Z · agent exited with an error (cursor) · RetriableError: Agent turn stopped after repeated resume attempts made no progress
- 2026-10-28T15:20:16Z · engineer crash recovery: resuming cursor + composer-2.5 (1/3 crashes in 30m) · RetriableError: Agent turn stopped after repeated resume attempts made no progress
