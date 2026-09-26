---
id: "0512"
title: Close-out silently discards uncommitted task-worktree changes; handoff commit captured a stale style.css
type: bug
status: inbox
priority: p1
area: server
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-09-26T03:50:30Z"
updated_at: "2026-09-26T03:50:30Z"
---
## Problem 1: close-out drops uncommitted work in the task worktree

MTD merges only the branch's commits, then `removeWorktree` (`src/core/git.ts`)
runs `git worktree remove --force`, deleting any uncommitted changes in the
task's worktree without a word. Nothing in close-out
(`src/server/routes/tasks.ts` done route, `src/server/integration-orchestrator.ts`)
inspects the *task worktree* for uncommitted changes; the "uncommitted changes"
modal only checks `main`.

### Fix
- Before enqueueing a close-out, check the task worktree (`git status
  --porcelain`, ignoring `dist/` and gitignored paths). If dirty, return the
  file list like the dirty-main response and show the same style of modal:
  **Commit & continue** (commit them on the task branch through the review
  guard's commit path, then close out — the merge gate still runs the full
  check) or **Cancel**. Never remove a worktree that still has uncommitted
  changes unless the human chose to discard them explicitly.
- Test: a close-out with an uncommitted change in the task worktree does not
  merge or remove the worktree without the human's choice; "Commit & continue"
  lands the change on `main`.

## Problem 2: the handoff commit captured a stale file

### Incident (#0506, 2026-09-26, times UTC)
- 02:49:40 engineer (opencode) edited
  `src/ui-app/src/style.css` in the worktree to delete the unused
  `.agent-tool-cmd` rule. The edit tool reported success
  (`.repoos/agent-logs/0506.out.log`).
- 02:50–02:54 engineer ran `bun run fmt`, `bun run build`,
  `REPOOS_CHECK_CHANGED=main repoos check` (twice) and the full `bun run test`.
  It never touched `style.css` again.
- 02:54:24–02:54:42 server handoff finalization ran the scoped `repoos check`
  in the worktree; 02:54:42 the review guard (`guardReviewTransition`,
  `git add -A` + commit) created `4441f30c feat(0506): implement …`.
  **That commit's `style.css` still contains `.agent-tool-cmd`** (unchanged
  from main), i.e. at 02:54:42 the file on disk had the rule back.
- 02:54:51 `style.css` mtime; the working tree now had the rule deleted again,
  leaving an uncommitted diff (fixed by hand in `7756fb0c`).
- The reviewer (started 02:54:43) only ran read-only commands.

So something wrote the real worktree `style.css` back to its old content during
the checks and restored the edited version about nine seconds after the commit.
The likely shape is a test or check step that saves the stylesheet, modifies or
replaces it, and restores it at the end (or on process exit). A quick search
found only fixture-repo writers (`close-out-reason.test.ts`,
`pre-commit-hook.test.ts`, `check-stylesheet-config.test.ts`), so the writer is
still unidentified.

### Fix
- Find the writer: run the scoped and full check in a worktree with an edited
  `style.css` and watch for writes (e.g. `fs_usage`/`fswatch` on the file, or
  instrument tests that resolve `../src/style.css`). Also check the
  `css-layers` / `theme-contrast` / `ui-smoke` steps and Vite build plugins.
- Whatever it is must never modify files in the checkout under test; use a
  temp copy.
- Defense in depth: the handoff commit step should verify the worktree is
  unchanged since the check started (e.g. compare `git status --porcelain` +
  content hashes before `check` and before `commit`), and fail loudly rather
  than commit a tree the check mutated.
- Test: a check run in a worktree with an uncommitted source edit leaves that
  edit byte-for-byte intact, and the handoff commit contains it.

## Activity

- 2026-09-26T03:50:30Z · created · unknown
