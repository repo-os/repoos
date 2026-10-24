---
id: "0954"
title: "Bug: one task's activity/bookkeeping commits land on another task's branch and move its HEAD during its handoff check"
type: bug
status: inbox
priority: p1
area: core
assigned_to: ""
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-24T23:57:03Z"
updated_at: "2026-10-24T23:57:03Z"
---
## Problem

With several tasks running at once, RepoOS bookkeeping commits for task A ("docs(0950): record activity", "docs(0950): resume stalled engineer") are being committed onto task B's worktree/branch (seen on #0951's branch, and earlier on #0947 with docs(0948)/docs(0943)/docs(0946) commits). Consequences, each observed today:

1. Task B's HEAD moves while its handoff check runs, so the handoff fails with "the worktree changed while the gate was running (HEAD moved from X to Y) — the check result no longer describes what is committed", even after two automatic retries (#0951).
2. Task B's diff then contains task A's work file, which fails the task-scope landing check and conflicts with main, forcing a manual "restore from main and re-review" round (#0947, #0943, #0951).
3. Task B's review lock goes stale because HEAD moved after review.

The commits are only task-file bookkeeping, and the close-out has an allowance for them, but the handoff check does not, and the scope check does not.

## Desired behavior

A task's bookkeeping commits go to main (the control checkout), never into another task's worktree. Find which code path commits task-file updates and why it can run with a task worktree as its working directory (likely a git cwd resolved from the wrong place, or a shared helper such as `commitTaskFile` / `patchTaskFile` using the process cwd). The handoff check must also tolerate task-file-only commits made by RepoOS itself on the same branch, exactly like close-out does (#0600), so a bookkeeping commit during the gate does not invalidate the result.

## Acceptance criteria

- [ ] Reproduce with a test: two task worktrees, update task A's activity while task B's handoff check runs; assert B's HEAD and diff are unchanged and the commit lands on main only.
- [ ] Root cause identified and fixed (document it in the task note), not worked around by retrying.
- [ ] Handoff comparison ignores commits that change only the task's own `work/<id>-*.md` file (consistent with the close-out rule), and still fails on real source changes.
- [ ] A task's branch diff never contains another task's `work/*.md` after a normal run with parallel tasks.
- [ ] Update `docs/close-out-pipeline.md` or the handoff docs if they describe this behavior.

## Notes for AI

- Related older notes in AGENTS.md: "commands run in worktrees append activity lines to other tasks' work files (restore from main)". Fix the cause instead of relying on that rule.
- Run every test touching task-file commits (`commitTaskFile`, patchTaskFile, handoff gate, worktree guard) in small groups, then `repoos check --changed main`.

## Activity

- 2026-10-24T23:57:03Z · created · njachowski@gmail.com
