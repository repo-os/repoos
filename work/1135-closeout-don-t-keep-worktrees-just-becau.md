---
id: "1135"
title: "Closeout: don't keep worktrees just because of the .env symlink RepoOS itself created"
type: bug
status: done
priority: p2
area: core
merged_commit: 36d022261714b4c21ce1ddbb177c6734a639e767
assigned_to: ai
created_by: t@t
branch: feat/closeout-don-t-keep-worktrees-just-becau
created_at: "2026-11-15T17:07:22Z"
updated_at: "2026-11-15T18:30:28Z"
last_close_out_gate_ms: 566982
last_close_out_gate_at: "2026-11-15T18:30:28.793Z"
review_passes: 1
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
- 2026-11-15T17:37:10Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: Now add the unit tests: · stderr: (empty)
- 2026-11-15T17:39:07Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-15T17:42:09Z · message_delivered: 1 message(s)
- 2026-11-15T17:44:07Z · message_queued at 2026-11-15T17:44:07.298Z
- 2026-11-15T17:44:07Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-15T17:49:07Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-15T17:49:09Z · queued message undelivered for 5m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-15T17:49:10Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: Both failures are load-sensitive tests unrelated to this diff (`agent-review.test.ts` even notes the remote-validator race in a comment; `remote-host-pool` passed locally in 176 ms). Re-running the check: · stderr: (empty)
- 2026-11-15T17:52:10Z · message_delivered: 1 message(s)
- 2026-11-15T17:54:07Z · message_queued at 2026-11-15T17:54:07.638Z
- 2026-11-15T17:54:07Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-15T17:57:10Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-15T17:57:10Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: Both failures are load-sensitive tests unrelated to this diff (`agent-review.test.ts` even notes the remote-validator race in a comment; `remote-host-pool` passed locally in 176 ms). Re-running the check: · stderr: (empty)
- 2026-11-15T17:57:11Z · message_delivered: 1 message(s)
- 2026-11-15T17:59:07Z · message_queued at 2026-11-15T17:59:07.522Z
- 2026-11-15T17:59:07Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-15T18:02:10Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-15T18:02:10Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: Both failures are load-sensitive tests unrelated to this diff (`agent-review.test.ts` even notes the remote-validator race in a comment; `remote-host-pool` passed locally in 176 ms). Re-running the check: · stderr: (empty)
- 2026-11-15T18:02:10Z · message_delivered: 1 message(s)
- 2026-11-15T18:03:19Z · message_queued at 2026-11-15T18:03:19.473Z
- 2026-11-15T18:03:19Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-15T18:04:07Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-15T18:06:25Z · queued message undelivered for 3m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-15T18:06:25Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code 130) · last assistant: Both failures are load-sensitive tests unrelated to this diff (`agent-review.test.ts` even notes the remote-validator race in a comment; `remote-host-pool` passed locally in 176 ms). Re-running the check: · stderr: (empty)
- 2026-11-15T18:06:40Z · message_delivered: 1 message(s)
- 2026-11-15T18:06:55Z · body
- 2026-11-15T18:09:07Z · CTO nudge: held — handoff gate is running
- 2026-11-15T18:09:25Z · status active→review
- 2026-11-15T18:09:25Z · message_queued at 2026-11-15T18:09:25.707Z
- 2026-11-15T18:09:25Z · note: shots: skipped — the diff (14 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-15T18:10:17Z · note: review pass 1: good to go
- 2026-11-15T18:30:28Z · close-out gate completed in 567s

