---
id: "1061"
title: "Checks: stop RepoOS bookkeeping commits from invalidating a running check"
type: bug
status: active
priority: p2
area: [core, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/checks-stop-repoos-bookkeeping-commits-f
cli_override: cursor
model_override: composer-2.5
review_cli_override: github copilot
review_model_override: default
created_at: "2026-11-08T08:18:13Z"
updated_at: "2026-11-08T15:31:49Z"
---
## Problem
A task's check (build, tests, UI smoke, remote validation) is refused with "the worktree changed while the gate was running (HEAD moved from X to Y) — the check result no longer describes what is committed" whenever the branch tip moves while the check runs. On 2026-11-08 this repeatedly failed handoffs and forced full re-runs (each 10-60 minutes). The tip moved because of:
- RepoOS's own bookkeeping commits written automatically during the check (for example `docs(1057): record review pass 1`, `docs: record engineering report for #...`, `docs(<id>): update task`), not an agent edit;
- the automatic `WIP: engineer self-check checkpoint (#id)` commits created around each check;
- occasionally a person or a driver merging main into the worktree, or an engineer writing a report draft while the check runs.
Today none of those edits can change the result of the check (bookkeeping lives under `work/`), yet they invalidate it.

## Desired behavior
1. While a check or handoff is in flight for a task, RepoOS defers its own bookkeeping commits for that task's branch (activity records, review notes, report records, status updates) and applies them after the check ends, so the tip cannot move mid-run because of the server.
2. The "tree changed" comparison ignores changes that cannot affect the check result: paths under `work/**` (task file, `work/reports/**`) and `.repoos/**` bookkeeping. A change to any other path still invalidates the check, as today. If the changed paths cannot be determined, fail closed (treat as changed).
3. While a check runs, the task's worktree source files are protected from engineer edits (read-only or a pre-write guard) with a clear message to the agent: "A check is running; wait for it to finish." Bookkeeping paths under `work/` stay writable for RepoOS. The protection is released when the check ends (pass, fail or cancel), including after a crash (no stale locks).
4. The refusal message says exactly what moved the tip (commit subject and which paths), so a real code change is distinguishable from bookkeeping.

## Acceptance criteria
- Test: a bookkeeping-only commit (under `work/`) landing during a check does not invalidate the check.
- Test: a commit touching `src/**` during a check does invalidate it, with the changed paths named in the message.
- Test: server bookkeeping writes for a task are queued while its check runs and applied after, in order, and none is lost on crash/restart.
- Test: engineer write attempts to source files during a check are blocked with the clear message; writes to `work/` bookkeeping succeed; the lock is released after pass, fail, cancel and server restart.
- Test: fails closed when the diff of changed paths cannot be computed.
- `docs/` and `user-docs/check.md` describe the behavior; `repoos check --changed main` passes. Do NOT edit `repoos.toml`.

## Notes for AI
Start from src/server/handoff.ts (the "worktree changed while the gate was running" refusal), the WIP checkpoint commit code, and the bookkeeping writers (activity/report/status commits, `docs(<id>): ...`). Reuse the review-lock machinery if it fits. Keep the scope to these four behaviors. Related: #0598 (protect a task worktree from edits after handoff) landed earlier; read it first and extend rather than duplicate.

## Activity

- 2026-11-08T08:18:13Z · created · njachowski@gmail.com
- 2026-11-08T08:45:19Z · cli_override, model_override
- 2026-11-08T08:45:25Z · review_cli_override, review_model_override
- 2026-11-08T14:28:51Z · status inbox→ready
- 2026-11-08T15:10:02Z · status ready→active, branch
- 2026-11-08T15:27:05Z · message_queued at 2026-11-08T15:27:05.003Z
- 2026-11-08T15:27:05Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-08T15:29:09Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-08T15:31:49Z · body
