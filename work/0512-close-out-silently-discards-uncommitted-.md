---
id: "0512"
title: Close-out silently discards uncommitted task-worktree changes; handoff commit captured a stale style.css
type: bug
status: done
priority: p1
area: server
assigned_to: ai
created_by: ""
branch: feat/close-out-silently-discards-uncommitted-
cli_override: opencode
model_override: opencode-go/space-bunny-free
created_at: "2026-09-26T03:50:30Z"
updated_at: "2026-09-27T00:55:28Z"
---
## Problem

Two related holes let work that is part of what was tested get lost, or let
something untested ride along. Both violate one invariant:

> **What is tested is what is committed, and nothing uncommitted is ever deleted.**

### 1. Close-out silently discards uncommitted task-worktree changes

MTD merges only the branch's commits, then `cleanup()`
(`src/server/integration-orchestrator.ts`) calls `removeWorktree`
(`src/core/git.ts`), which runs `git worktree remove --force`, deleting any
uncommitted changes in the task's worktree without a word. Nothing in close-out
(`src/server/routes/tasks.ts` done route, `integration-orchestrator.ts`) inspects
the *task worktree* for uncommitted changes; the "uncommitted changes" modal and
the publish-time guard only check `main`. An edit made after the last handoff
commit (for example a fix applied to the worktree while the task sits in
`review`) is neither tested by the merge gate nor kept.

Verified: plain `git worktree remove` (no `--force`) removes a worktree that
contains only ignored files (`dist/`, `node_modules`) but refuses one with
modified or untracked files, so dropping `--force` by default gives the guard for
free without breaking normal cleanup.

### 2. The handoff commit can capture a tree that differs from what was tested

Same gap seen from the other side. Also raised in review of #0520: the remote
pre-review gate bundles `HEAD`, but the handoff step commits any uncommitted
working-tree edits afterwards, so they run through neither the remote suite nor
the (skipped) local suite.

#### Incident (#0506, 2026-09-26, times UTC)
- 02:49:40 engineer (opencode) edited
  `src/ui-app/src/style.css` in the worktree to delete the unused
  `.agent-tool-cmd` rule. The edit tool reported success
  (`.repoos/agent-logs/0506.out.log`).
- 02:50–02:54 engineer ran `bun run fmt`, `bun run build`,
  `REPOOS_CHECK_CHANGED=main repoos check` (twice) and the full `bun run test`.
  It never touched `style.css` again; its last action (02:54:11) was a read-only
  `git status`.
- 02:54:24–02:54:42 server handoff finalization ran the scoped `repoos check`
  in the worktree; 02:54:42 the review guard (`guardReviewTransition`,
  `git add -A` + commit) created `4441f30c feat(0506): implement …`.
  **That commit's `style.css` still contains `.agent-tool-cmd`** (unchanged
  from main), i.e. at 02:54:42 the file on disk had the rule back.
- 02:54:51 `style.css` mtime; the working tree now had the rule deleted again,
  leaving an uncommitted diff (fixed by hand in `7756fb0c`).
- The reviewer (started 02:54:43) only ran read-only commands.

Something wrote the old content back during the checks and restored the edited
version about nine seconds after the commit. The writer is **still unidentified**
(see Out of scope). What is known: not the engineer's tool calls, and no
`git stash` or save-and-restore in the handoff or check code. The fix below does
not depend on knowing who it was.

## Fix

1. **Commit before the gate.** In handoff finalization and the pre-review gate
   (including the remote path of #0520), commit the worktree first through the
   review guard's commit path, then run the gate against that `HEAD` (local or
   remote). Tested == committed.
2. **Verify nothing changed underneath.** After the gate, check that
   `git status --porcelain` (ignoring gitignored paths) is clean and `HEAD` is
   unchanged. Otherwise fail loudly instead of moving to `review`.
3. **`removeWorktree` is non-force by default.** Add an explicit `force` option;
   only intentional discards pass it (restart/reset, and GC of worktrees that are
   merged AND clean). If cleanup is refused because the tree is dirty, keep the
   worktree, log the file list, and set `needs_input` (reason names the dirty
   files) instead of deleting.
4. **Guard close-out before enqueueing.** Check the task worktree with
   `git status --porcelain` (gitignored paths excluded). If dirty, return the file
   list like the dirty-main response and show the same style of modal:
   **Commit & continue** (commit on the task branch through the review guard's
   commit path, then close out; the merge gate still validates what was committed)
   or **Cancel**. Never remove a worktree with uncommitted changes unless the
   human chose to discard them explicitly.
5. **Restart / reset (`resetWorktree`)** also force-discards. Decide whether it
   should warn or stash first; at minimum list what will be lost in the
   confirmation.

## Acceptance

- Test: close-out with an uncommitted change in the task worktree does not merge
  or remove the worktree without the human's choice; "Commit & continue" lands
  the change on `main`.
- Test: `removeWorktree` refuses a worktree with modified or untracked files,
  removes one with only ignored files, and removes a dirty one only with
  `force: true`.
- Test: cleanup on a dirty feature worktree keeps it, warns, and flags
  `needs_input`.
- Test: a check run in a worktree with an uncommitted source edit leaves that
  edit byte-for-byte intact, and the handoff commit contains it (committed before
  the gate).
- Test: if the tree or `HEAD` changes during the gate, handoff fails loudly and
  does not reach `review`.
- Docs: `docs/close-out-pipeline.md` (the worktree GC/cleanup section) states the
  invariant.

## Out of scope

- **Finding the writer of the #0506 `style.css` flip.** Open-ended
  investigation: reproduce with the scoped and full check running in a worktree
  with an edited file while watching it (`fs_usage`/`fswatch`), and rule in or out
  another agent session in that worktree, a test or Vite plugin that saves and
  restores the file, and an editor. File separately if it recurs.
- #0520 depends on point 1 (commit before the remote gate).

## Activity

- 2026-09-26T03:50:30Z · created · unknown
- 2026-09-26T09:41:27Z · status inbox→ready
- 2026-09-26T16:26:16Z · body
- 2026-09-26T16:30:26Z · cli_override, model_override
- 2026-09-26T16:30:52Z · model_override
- 2026-09-26T16:31:45Z · status ready→active, branch
- 2026-09-27T00:33:15Z · status active→review
- 2026-09-27T00:55:28Z · status review→done, release:success
