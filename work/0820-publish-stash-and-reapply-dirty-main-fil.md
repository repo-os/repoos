---
id: "0820"
title: "Publish: stash and reapply dirty main files only when the merge would overwrite them"
type: feature
status: done
priority: p2
area: server
merged_commit: 3ba30d5af11572da4f467a2d303e0b1439e97163
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/publish-stash-and-reapply-dirty-main-fil
created_at: "2026-10-17T15:26:36Z"
updated_at: "2026-10-18T03:38:12Z"
last_close_out_gate_ms: 644383
last_close_out_gate_at: "2026-10-18T03:36:43.510Z"
review_passes: 1
---
## Problem
A close-out merges into the live main checkout (publishCandidate, src/server/integration-orchestrator.ts). The Move to done dirty-main check runs only at the start. If a file in main's checkout is dirty when publish runs (for example a settings change to repoos.toml made during the close-out), the outcome depends on the merge:
- If the feature branch does not touch that file, git merges normally and keeps the dirty edit. Nothing needs to be done.
- If the feature branch does change that file, git refuses the merge ('Your local changes to the following files would be overwritten by merge'), and the close-out fails or restarts.

Checked with git in a scratch repo: the first case merges and keeps the dirty file, the second is refused.

## Desired UX
- At publish time, if main's checkout is dirty in a file the merge would change, stash only those files, run the merge, and pop the stash afterwards.
- The stash is always popped, even when the merge fails or is cancelled.
- If the pop conflicts, keep the stash, do not guess, show a popup with the stash contents, and hand the task to the debugger agent to resolve.
- Dirty files the merge does not touch are never stashed.

## Acceptance criteria
- Test: a dirty file the merge does not touch survives publish unchanged, with no stash created.
- Test: a dirty file the merge would change is stashed, the merge succeeds, and the edit is reapplied on top.
- Test: a merge that fails after stashing still pops the stash.
- Test: a pop conflict keeps the stash, reports it, and does not discard the user's edit.
- Settings auto-commit removal (#0819, item 3) is not required first, but this reduces how often it is needed.

## Notes for AI
Start from publishCandidate in src/server/integration-orchestrator.ts (the publish merge into the live checkout, and the mergedIntoMain handling) and the dirty-main helpers in src/core/git.ts (mainDirtyFilesForCloseOut, and the merge helper around line 1955). Determine which dirty files the merge would touch before stashing (git merge-tree against the merge base). Keep the debugger hand-off for conflicts. Source: user question 2026-10-17 on settings edits during a close-out.

## Activity

- 2026-10-17T15:26:36Z · created · njachowski@gmail.com
- 2026-10-17T15:34:53Z · status inbox→ready
- 2026-10-18T02:34:20Z · status ready→active, branch
- 2026-10-18T02:44:00Z · body
- 2026-10-18T02:46:09Z · body
- 2026-10-18T02:48:37Z · body
- 2026-10-18T02:57:13Z · status active→review
- 2026-10-18T02:57:14Z · note: shots: skipped — the diff (7 changed paths) touches no capture target's globs — no UI change to capture
- 2026-10-18T02:57:54Z · note: review pass 1: good to go
- 2026-10-18T03:21:45Z · close-out gate completed in 364s
- 2026-10-18T03:36:43Z · close-out gate completed in 644s
- 2026-10-18T03:38:12Z · status review→done, release:success
