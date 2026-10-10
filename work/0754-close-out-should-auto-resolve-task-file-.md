---
id: "0754"
title: Close-out should auto-resolve task-file-only merge conflicts instead of refusing
type: bug
status: review
priority: p1
area: infra
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/close-out-should-auto-resolve-task-file-
created_at: "2026-10-10T12:57:27Z"
updated_at: "2026-10-10T17:34:19Z"
---
## Problem

Divot's #0023 (slide Divot below the native menu bar on cursor reveal) was blocked from Move to done by a merge conflict that existed only in its own task file, `work/0023-slide-divot-below-the-native-menu-bar-on.md`. No code file conflicted. The close-out refused with "1 file has a merge conflict", and the Debugger's merge-conflict tab showed no files, because the task file is bookkeeping, not code.

Running `git merge-tree` on the branch against current `main` confirmed a single conflict, in that task file. The maintainer had to tell the engineer to merge `main` and keep RepoOS's version of the task file, which was the obvious answer and should not need a human.

## Desired behaviour

When the only conflicting paths in a close-out merge are the task's own `work/<id>-*.md` file (RepoOS bookkeeping: status, activity log, branch), the close-out should take `main`'s version of that file automatically, record that it did so in the activity log, and continue. Code conflicts still fail the close-out and go back to the engineer.

## Evidence

- Project: `~/code/nick/divot` (Divot app).
- Task #0023; branch `feat/slide-divot-below-the-native-menu-bar-on`; failing commit `7bca687` ("Merge main into ...").
- Activity log entry at 12:24Z: "close-out repair: merge-conflict", then status returned to active with `needs_input`.
- The fix was a manual `git merge main` on the branch, keeping the RepoOS task file.

## Acceptance criteria

- The close-out merge resolves a conflict whose only paths are the task's own `work/<id>-*.md` file by taking the main side, and logs the choice.
- A conflict in any other path still refuses the close-out and reports the file list, as today.
- The Debugger's merge-conflict tab lists the task-file conflict when it is not auto-resolved, so the file list and the refusal always match.
- A test covers a branch whose only conflict is its own task file (auto-resolves) and one with a code conflict added (refuses).
- `repoos check` passes.

## Notes for AI

AGENTS.md already says the narrow resolution path may take "the task's own bookkeeping file", so this should match the documented intent. Do not widen it to other work files. Keep the change in the close-out merge, not the task-file writer.

## Activity

- 2026-10-10T12:57:27Z · created · njachowski@gmail.com
- 2026-10-10T14:12:58Z · status inbox→ready
- 2026-10-10T14:13:00Z · status ready→active, branch
- 2026-10-10T17:34:19Z · status active→review
