---
id: "0023"
title: Auto-commit task files on creation
type: feature
status: active
priority: p2
area: cli
assigned_to: ai
created_by: ""
branch: feat/0023-auto-commit-task-files
created_at: "2026-08-04T09:13:42Z"
updated_at: "2026-08-04T09:42:47Z"
---
## Activity

- 2026-08-04T09:13:42Z · created · unknown
- 2026-08-04T09:42:47Z · status inbox→active

## Problem

The repo is the source of truth, but `ros new` never commits the task file it
creates. Task files and ADRs pile up untracked for weeks (work/0019, work/0020,
docs/adr/0004 sat uncommitted for over a month before being swept in with 0021's
merge), the roadmap drifts from git truth, and every merge needs a manual
housekeeping sweep to clean up after the planner. Since a new task file is a
complete, deliberate artifact at the moment of creation, there's no reason for it
to linger outside version control.

## Desired UX

- `ros new` creates the task file, then commits ONLY that file with a generated
  message and reports the result ("committed 3a246c0" or a clear warning).
- The commit is surgical and fail-soft: it never stages or touches anything but
  the new file, never amends or force-pushes, uses the user's existing git
  identity, and if anything goes wrong the task file is still created and the
  user is told the file was left uncommitted.
- This is creation-only. Status flips (`ros mv`) and edits to existing task/docs
  files are NOT auto-committed — they stay with the implementing task's commit.

## Acceptance criteria

- [ ] `ros new` writes the task file AND commits just that file (e.g.
      `docs(0023): add task Auto-commit task files on creation`)
- [ ] Only the new file is committed — other staged or dirty files are never
      swept in (no `git add -A`, no plain `git commit` that would pick up
      pre-staged files)
- [ ] Uses the user's existing git identity/config; no amend, no force, no
      bypass of hooks
- [ ] Fail-soft: if git is unavailable (not a repo, no identity, mid-conflict,
      no HEAD), the task is still created, nothing is left partially staged, and
      `ros new` prints a clear "file left uncommitted" warning
- [ ] `ros new` output reports the commit outcome (short hash or the warning)
- [ ] `ros check` passes; no new runtime dependencies (git runs as a subprocess)

## Notes for AI

- `ros new` is `cmdNew` in `src/commands/tasks.ts`; the file is created by
  `createTask` in `src/core/repoos.ts:160`. Add the commit step after the task
  is written and the cache is refreshed.
- Put the git logic in a small shared helper (e.g. `src/core/git.ts`, exported
  through the `createRepoOS()` facade) rather than inline in the command — the
  intent is that `ros start`/`ros done` reuse it when they own the git lifecycle
  later (per AGENTS.md: "branch/worktree creation is RepoOS's job").
- The core of this task is the guardrails. Use `git commit --only -m <msg> --
  <file>` (a.k.a. `-o`): it commits exactly the working-tree content of the
  specified paths and IGNORES anything else that happens to be staged — so a
  dirty tree from unrelated work can't leak into the commit. Do not use plain
  `git add <file> && git commit`, which commits everything staged.
- Fail-soft order: `git rev-parse --is-inside-work-tree` → `git rev-parse --verify
  HEAD` → check a configured `user.name`/`user.email` (`git config` or
  `user.email` present) → stage+commit. On any failure: unstage nothing that
  wasn't staged by us (we staged nothing extra anyway), print the warning, return
  success (exit 0) — the task creation succeeded.
- RepoOS self-hosted facts: `ros` runs compiled JS from `dist/`, so you MUST run
  `bun run build` before `ros check` will reflect your changes; `ros check` is
  the green bar. This task touches git behavior, so test the failure paths by
  hand (a repo with no commits, a tree with pre-staged files, a gitless dir).
- Meta note: this very task file is untracked right now — the exact pain this
  task fixes.

## Scope

- **This task**: commit-on-create for `ros new`, with the fail-soft guardrails.
- **Defer to a SEPARATE task**: auto-committing mutations (status flips via
  `ros mv`, edits to existing files); `ros start`/`ros done` owning branch +
  worktree + commit; a `ros list` warning for untracked files (moot once this
  lands).

## Related

- Motivation: the untracked-file pile-up swept into 0021's merge
  (3a246c0: work/0019, work/0020, docs/adr/0004).
- Same principle as 0012 (build-staleness guardrail): RepoOS taking ownership of
  the safety rails around the repo itself.
- AGENTS.md: RepoOS is already slated to own branch/worktree creation once
  `ros start` exists — this is the first step of that git lifecycle.
