---
id: "0954"
title: "Bug: one task's activity/bookkeeping commits land on another task's branch and move its HEAD during its handoff check"
type: bug
status: ready
priority: p1
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-24T23:57:03Z"
updated_at: "2026-10-25T01:04:49Z"
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

## Root cause found (driver, 2026-10-25)
The stray bookkeeping commits come from a task PREVIEW server. #0951 had a managed preview (port 65253, process 'repoos-use-the-full-window-height...' with cwd = #0951's worktree), and #0947 had one earlier (port 52520). A preview is a full RepoOS server rooted in the task worktree, so its engineer-activity recorder (src/server/agents.ts, 'record activity') and stalled-engineer watchdog (src/server/engineer-crash-recovery.ts, 'resume stalled engineer') ran against EVERY active task and committed those tasks' work-file updates into the preview's own worktree. That moved the task's HEAD during its handoff check (failed 3 times for #0951) and put other tasks' work files in its diff. This is the same duplicate-server hazard AGENTS.md describes for serve-noauth. Stopping the preview (repoos preview <id> --stop) cured it immediately. Fix: previews must run in a mode that records no task activity, runs no watchdog or auto-engineering, and never commits (a read-only, UI-only server for the worktree), and/or the preview start should refuse to write task files. Add a test that a preview-mode server does not commit task files. Also consider auto-stopping a task's preview when its handoff gate starts.

## More evidence: it is the handoff itself
Stopping #0951's preview did not end it: a NEW preview server for #0951 (pid 19962, port 61116, parent = the main server) appeared within minutes, started by the handoff's own UI-review shot capture. That preview is a full RepoOS server rooted in the task worktree, so while the handoff check runs it commits other tasks' bookkeeping (docs(0950)/docs(0952) update task / record handoff failure / resume stalled engineer) into the worktree under test, moving HEAD, which fails the handoff ('the worktree changed while the gate was running'), 4 times on #0951. Every UI task with declared shots hits this whenever another task is active. Needed: the server started for previews and shot capture (REPOOS_PREVIEW_CHILD / --preview-overrides mode) must be read-only for task files: no activity recorder, no stalled-engineer watchdog, no auto-engineering, no commitTaskFile/commitFiles (guard at the shared helper in src/core/git.ts as defence in depth and at the callers). Test: start a server in preview mode over a worktree, mutate other tasks, assert no commit appears in that worktree.

## Activity

- 2026-10-24T23:57:03Z · created · njachowski@gmail.com
- 2026-10-25T00:30:23Z · body: Root cause found (driver, 2026-10-25) (added)
- 2026-10-25T01:04:24Z · body: More evidence: it is the handoff itself (added)
- 2026-10-25T01:04:49Z · status inbox→ready
