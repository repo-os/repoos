---
id: "0923"
title: repoos gc must spare the candidate worktree of a running close-out
type: bug
status: review
priority: p1
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/repoos-gc-must-spare-the-candidate-workt
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-10-22T06:06:09Z"
updated_at: "2026-10-22T11:31:29Z"
---
## Problem
The CLI `repoos gc` (src/commands/gc.ts cmdGc) calls sweepStaleWorktrees without `activeJobIds`, so src/core/worktree-gc.ts removes every repoos/integrate/<id> candidate worktree, including one whose close-out is queued, running or recovering. Only the boot sweep passes activeJobIds. Incident 2026-10-22: Nick ran `repoos gc` while #0909's close-out was validating; its candidate worktree was deleted under the running test step, leaving an orphaned check process and a close-out that could never finish until it was cancelled.

## Desired UX
Every caller of the sweep (CLI gc, API, boot) spares candidates with a live integration job (queued/syncing/validating/publishing); gc prints 'kept: close-out job still active'. The task's own feature worktree is never affected.

Also (Nick, 2026-10-22):
- Guard: gc refuses to remove anything for a task whose close-out or engineer/reviewer is active, and says which task blocked it. A --force flag is not offered for candidates of running jobs.
- Button: add a 'Clean up worktrees' action on the Control page, System resources > Codebase column, next to the git worktrees count (which already shows the number). It shows a dry-run preview first (what would be removed, what is kept and why), then a confirm dialog from the shared dialog components, and is disabled with a reason while any close-out is running.
- The existing 'N git worktrees — run repoos gc' warning links to that action.

## Acceptance criteria
- A test: a job in validating phase for <id> means gc (default, --yes and --dry-run) keeps repoos/integrate/<id>.
- A finished or failed job's candidate is still removed.

## Notes for AI
Derive activeJobIds inside sweepStaleWorktrees when the caller omits it, so no caller can forget it.

## Activity

- 2026-10-22T06:06:09Z · created · njachowski@gmail.com
- 2026-10-22T06:08:22Z · body: Desired UX (added 5, removed 1)
- 2026-10-22T11:07:01Z · status inbox→ready
- 2026-10-22T11:07:05Z · cli_override, model_override
- 2026-10-22T11:07:06Z · status ready→active, branch
- 2026-10-22T11:11:54Z · body
- 2026-10-22T11:15:02Z · body
- 2026-10-22T11:17:27Z · body
- 2026-10-22T11:26:11Z · handoff failed · remote validation failed: test failure: tests/api-route-parity.test.ts > API route parity > every /api route is covered by a CLI command or the UI-only allowlist on mini — fix it in the feature branch and re-run the gate
- 2026-10-22T11:31:29Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/api-route-parity.test.ts > API route parity > every /api route is covered by a CLI command or the UI-only allowlist on mini — fix it in the feature branch and re-run the gate · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-22T11:31:29Z · note: handoff requested (cli)
