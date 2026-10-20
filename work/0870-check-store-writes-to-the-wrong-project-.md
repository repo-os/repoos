---
id: "0870"
title: Check store writes to the wrong project root (LightingAI wrote repoos/.repoos/checks.db into the RepoOS checkout)
type: bug
status: active
priority: p2
area: core
assigned_to: human
created_by: njachowski@gmail.com
branch: feat/check-store-writes-to-the-wrong-project-
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-10-20T12:06:26Z"
updated_at: "2026-10-20T22:21:52Z"
dev_error_count: 2
engineer_crash_log: "[{\"cli\":\"opencode\",\"model\":\"opencode-go/deepseek-v4.1-flash\",\"at\":\"2026-10-20T21:46:23.850Z\",\"kind\":\"dev-error\"},{\"cli\":\"opencode\",\"model\":\"opencode-go/deepseek-v4.1-flash\",\"at\":\"2026-10-20T21:47:02.554Z\",\"kind\":\"dev-error\"}]"
---
## Problem
On 2026-10-20 an untracked folder repoos/.repoos/checks.db(+shm,+wal) appeared in the RepoOS main checkout and blocked two green tasks from landing (Move to done: "main has 3 uncommitted files"). It held four pre-review check runs (task_id 0861, scope changed:main, machine air) whose worktree was a LightingAI worktree. LightingAI uses the nested layout (workDir repoos/work, cache repoos/.repoos). The likely cause is a check run for the LightingAI project that used LightingAI's relative cache dir against this repo's root (getCheckStore(repoRoot, cacheDir) in src/core/check-store.ts), not confirmed. A task_id from this project also leaked into those rows. Separately, the root .gitignore ignores `.repoos/*` only at the repo root, so a nested `.repoos/` shows up as untracked.

## Desired UX
A check run always records into the project that owns the worktree it ran in, never another project's checkout, regardless of process cwd or inherited env. A nested .repoos folder is never left untracked in a project checkout.

## Acceptance criteria
- Reproduce or rule out: a `repoos check` for a LightingAI worktree launched with cwd or REPOOS_* env pointing at the RepoOS checkout writes only into LightingAI's cache; add a test using two temp repos with different layouts.
- Check-store root is derived from the task's own project (worktree's git common dir / config), not from cwd; inherited REPOOS_TASK_ID/REPOOS_ROOT from another project is ignored or rejected with a clear error.
- Root .gitignore covers nested `**/.repoos/*` while keeping `!.repoos/canary.txt` tracked.
- Document the rule in docs/ (architecture or check docs).

## Notes for AI
Evidence: the SQLite file's rows (check_runs) and worktree column named a lightingai-worktrees path; LightingAI's repoos.toml sets workDir = "repoos/work". Cross-project servers share one machine and one `repoos` binary (a bun link to this repo's dist), so process-level environment is the likely leak. Do not touch LightingAI's repo.

## Activity

- 2026-10-20T12:06:26Z · created · njachowski@gmail.com
- 2026-10-20T21:34:53Z · status inbox→ready
- 2026-10-20T21:34:59Z · cli_override, model_override
- 2026-10-20T21:35:00Z · status ready→active, branch
- 2026-10-20T21:46:23Z · agent exited with an error (opencode) · the agent process exited with an error — open the task to see the full output
- 2026-10-20T21:46:23Z · engineer crash recovery: resuming opencode + opencode-go/deepseek-v4.1-flash (1/3 crashes in 30m) · the agent process exited with an error — open the task to see the full output
- 2026-10-20T21:47:02Z · engineer crash recovery: resuming opencode + opencode-go/deepseek-v4.1-flash (2/3 crashes in 30m) · the agent process exited with an error — open the task to see the full output
- 2026-10-20T21:47:33Z · body
- 2026-10-20T21:53:36Z · body
- 2026-10-20T21:56:44Z · body
- 2026-10-20T22:00:14Z · body
- 2026-10-20T22:01:15Z · body
- 2026-10-20T22:01:49Z · body
- 2026-10-20T22:02:30Z · body
- 2026-10-20T22:07:32Z · body
- 2026-10-20T22:09:10Z · body
- 2026-10-20T22:17:58Z · body
- 2026-10-20T22:21:35Z · needs_input
- 2026-10-20T22:21:44Z · assigned_to
