---
id: 1004
title: Make retained worktree cleanup safe and actionable
type: chore
status: review
needs_merge: true
priority: p2
area: [core, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/make-retained-worktree-cleanup-safe-and-
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-11-01T15:50:52Z"
updated_at: "2026-11-03T05:30:54Z"
---
## Problem
The 2026-11-01 cleanup found 48 registered worktrees: 28 were clean feature worktrees whose branches were already merged into main, and 16 were protected. Running `repoos gc --yes` removed the safe candidates; the current count is 21 with zero remaining cleanup candidates and 16 protected worktrees.

The protected set revealed several different cases: 12 tasks marked done (six with commits not in main; six with uncommitted changes limited to work/*.md, while #0664 also has uncommitted repository files); #0652 is archived but still has ready status; #0794 is human-assigned and ready; #1000 and #1001 are active. Four additional registered worktrees are outside RepoOS's managed task-worktree directory (three Codex worktrees and /private/tmp/pre-merge-0960).

The current warning gives one total and suggests `repoos gc`, but does not make clear which entries are safe to remove, why others are retained, or that normal maintenance only collects integration candidates.

## Desired UX
Make cleanup run automatically for worktrees that RepoOS can prove are safe to remove, and explain retained worktrees by reason. Derive fail-closed rules for completed, archived, missing, dirty, and unmerged task branches. Keep active or human-owned work protected; preserve any source or task data that is not proven redundant with the canonical main checkout. Make dry-run output and the worktree warning distinguish safe cleanup candidates from protected entries and worktrees outside RepoOS's control.

## Acceptance criteria
- Audit each currently retained RepoOS task worktree and record its task status, branch commits relative to main, changed source paths, dirty paths, and safe disposition.
- Automatically reclaim clean, merged worktrees for resolved tasks according to tested lifecycle rules, without requiring an operator to discover and run `repoos gc --yes`.
- Define and test when dirty work/*.md changes in resolved worktrees can be replaced by canonical main task files; never clean them based on path alone if they contain unique task data.
- Keep any unmerged source changes, unexplained dirty files, active-agent worktrees, and human-assigned worktrees unless a safe RepoOS workflow resolves them.
- Decide and test how archived-but-ready tasks are treated; do not equate archive metadata with proof that branch contents are disposable.
- Do not inspect or remove external Codex worktrees or `/private/tmp/pre-merge-0960` as RepoOS task worktrees.
- Add tests for safe merged-and-clean branches, task-file-only dirt, unmerged commits, dirty source files, archived-ready tasks, active tasks, and task files that have unique noncanonical content.
- Report candidate and retained counts with actionable reasons; `repoos gc --dry-run` and status output agree.
- Update worktree-GC documentation to describe the automatic policy and its safety limits.

## Notes for AI
Use the 2026-11-01 findings as evidence, then re-check every live task and worktree before implementation. Do not delete a branch merely because its task says done or archived; prove its relevant tree is represented in main. Use RepoOS commands for task lifecycle changes. Preserve the four non-RepoOS worktrees and the active/human work listed above.


## Activity

- 2026-11-01T15:50:52Z · created · njachowski@gmail.com
- 2026-11-01T15:54:14Z · title
- 2026-11-01T15:54:15Z · body: Problem (added 3, removed 1)
- 2026-11-01T15:54:16Z · body: Desired UX (added 1, removed 1)
- 2026-11-01T15:54:17Z · body: Acceptance criteria (added 9, removed 7)
- 2026-11-01T15:54:19Z · body: Notes for AI (added 1, removed 1)
- 2026-11-01T19:43:56Z · status inbox→ready
- 2026-11-02T13:28:18Z · cli_override
- 2026-11-02T13:28:24Z · model_override
- 2026-11-02T13:28:35Z · status ready→active, branch
- 2026-11-02T16:47:02Z · status active→review
- 2026-11-03T00:32:53Z · status review→active
- 2026-11-03T02:14:21Z · status active→review
- 2026-11-03T02:32:19Z · status review→active
- 2026-11-03T04:18:52Z · status active→review
- 2026-11-03T05:30:54Z · needs_merge
