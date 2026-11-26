---
id: "1290"
title: "Hand-off: finish or clearly report an uncommitted merge"
type: bug
status: done
priority: p2
area: [core, server]
merged_commit: edea2a3a5b6b271070508decf5262e9d99227933
assigned_to: ai
created_by: t@t
branch: feat/hand-off-finish-or-clearly-report-an-unc
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-25T23:55:22Z"
updated_at: "2026-11-26T02:12:56Z"
last_close_out_gate_ms: 160912
last_close_out_gate_at: "2026-11-26T02:12:34.062Z"
review_passes: 1
last_check_failure: "repoos check at 2026-11-26T01:05:31.008Z: repoos check failed: server-side finalization timed out (deadline exceeded)"
---
## Problem

When main moves, a reviewed task can conflict and go back to its engineer, who merges main into the task branch. If the engineer resolves the files but never commits the merge, the worktree stays mid-merge and hand-off cannot succeed.

Hand-off commits with a path list (`git commit -m <msg> -- <paths>`: `commitStagedOnly` in `src/server/review-guard.ts`, `commitDirtyFiles` in `src/core/git.ts`). Git refuses that during a merge with `fatal: cannot do a partial commit during a merge.` (reproduced in a throwaway repo). The jainotes project (task 0013) hit this: repeated failed hand-offs, a check run that still reported a `<<<<<<< HEAD` marker, and a manual `git merge --quit` to get unstuck.

## Desired UX

- Merge in progress and everything resolved: hand-off completes it as a real two-parent merge commit and carries on. No human or engineer action needed.
- Unresolved conflicts or leftover conflict markers: hand-off fails with a plain message naming the files and saying to resolve them and commit the merge. Nothing is committed or discarded.

## Acceptance criteria

- A regression test reproduces the failure: a task worktree with a resolved but uncommitted merge of main hands off successfully, and the resulting commit has both parents.
- A test with unmerged paths and one with leftover conflict markers (including after `git add`) each fail with the file names, leaving the worktree and `MERGE_HEAD` intact.
- Unmerged paths are detected before anything resets the index. The guard currently starts with `git reset HEAD -- .`, which would hide them.
- The completed merge commit does not revert main's changes to other tasks' `work/` files or reports: main's copy wins, as in the existing foreign-bookkeeping rule (#1076). The task's own task file follows the documented main's-copy rule. A test covers this.
- `repoos.toml` and generated `dist/` stay protected as today.
- The WIP checkpoint path (`commitDirtyFiles`) does not silently do nothing or damage merge state while a merge is in progress.
- RepoOS never uses or recommends `git merge --quit` to get past this.
- Docs that describe the hand-off commit step are updated.

## Notes for AI

- `hasInProgressGitOperation` in `src/core/git.ts` already detects `MERGE_HEAD`. For rebase or cherry-pick in progress, a clear failure message is enough.
- The cause of the leftover marker seen by the jainotes check was not traced; investigate whether the staged or working copy could differ.
- #1288 also touches hand-off failure reporting; keep this change focused.

## Activity

- 2026-11-25T23:55:22Z · created · t@t
- 2026-11-25T23:55:27Z · status inbox→ready
- 2026-11-25T23:55:28Z · cli_override, model_override
- 2026-11-25T23:55:29Z · status ready→active, branch
- 2026-11-26T00:13:32Z · message_queued at 2026-11-26T00:13:32.053Z
- 2026-11-26T00:13:32Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-26T00:18:32Z · CTO nudge: held — handoff gate is running
- 2026-11-26T00:48:19Z · message_queued at 2026-11-26T00:48:19.313Z
- 2026-11-26T01:05:31Z · watchdog: check wait escalated · waiting: waiting for serialized local fallback (1 ahead, position 2); slot holder 45123 is dead for 46m · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-26T01:05:31Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-26T01:34:48Z · note: handoff requested (cli)
- 2026-11-26T01:34:55Z · needs_input
- 2026-11-26T01:34:55Z · message_delivered: 1 message(s)
- 2026-11-26T01:35:01Z · watchdog: check wait escalated · waiting: waiting for serialized local fallback (1 ahead, position 2); slot holder 45123 is dead for 1h 16m · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-26T01:36:28Z · CTO nudge: held — handoff gate is running
- 2026-11-26T01:52:02Z · body
- 2026-11-26T01:52:16Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-26T01:52:58Z · status active→review
- 2026-11-26T01:52:58Z · message_queued at 2026-11-26T01:52:58.453Z
- 2026-11-26T01:52:58Z · note: shots: skipped — the diff (8 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-26T01:53:42Z · note: review pass 1: good to go
- 2026-11-26T02:12:34Z · close-out gate completed in 161s
- 2026-11-26T02:12:51Z · status done→done, release:success
- 2026-11-26T02:12:56Z · message_dropped: 1 queued message(s) discarded — task is done
