---
id: "1135"
title: "Closeout: don't keep worktrees just because of the .env symlink RepoOS itself created"
type: bug
status: active
priority: p2
area: core
assigned_to: ai
created_by: t@t
branch: feat/closeout-don-t-keep-worktrees-just-becau
created_at: "2026-11-15T17:07:22Z"
updated_at: "2026-11-15T17:37:09Z"
---
## Problem
After `repoos done` merged #1128 (branch commit e23a1db4e is on main), the task card shows Done but also "Needs input": "the worktree for feat/publish-repoos-hub-android-apk-on-github was kept because it had uncommitted changes the merge did not carry: .env".

That `.env` is a symlink (`.env -> ~/code/nick/repoos/.env`) that RepoOS creates when it sets up the worktree. It's gitignored in main and identical to main's file, so nothing is lost. A Done card asking the user for input is confusing.

## Acceptance criteria
- When closeout checks for leftover changes, it ignores files RepoOS provisioned into the worktree: the .env symlink, and anything else that's a symlink to the main checkout or is gitignored in main.
- A real uncommitted change still keeps the worktree and still shows Needs input.
- Add a test for the symlinked .env case.

## Notes for AI
Look at the worktree cleanup in the closeout path (the code behind `repoos done` and the "worktree was kept" message) and at where the .env symlink is created when a worktree is set up.

## Activity

- 2026-11-15T17:07:22Z · created · t@t
- 2026-11-15T17:15:35Z · status inbox→ready
- 2026-11-15T17:15:37Z · status ready→active, branch
- 2026-11-15T17:34:07Z · message_queued at 2026-11-15T17:34:07.214Z
- 2026-11-15T17:34:07Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-15T17:37:09Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
