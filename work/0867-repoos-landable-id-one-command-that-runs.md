---
id: "0867"
title: "repoos landable <id>: one command that runs the landing pre-checks"
type: feature
status: active
priority: p1
area: [core, server]
story: "Autopilot: the CTO handles the routine, humans handle exceptions"
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/repoos-landable-id-one-command-that-runs
cli_override: opencode
model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-10-20T12:05:58Z"
updated_at: "2026-10-20T19:30:34Z"
last_handoff_failure_fingerprint: "check|remote validation failed: test failure: tests/send-to-engineer-note.test.ts > Send to engineer note dialog (#0295) > still sends when opening the dialog dismissed the drawer's modal, tests/task-drawer-ui-changes-rows.test.ts > Changes → UI changes rows (#0611) > orders UI changes toolbar actions with Add shot on the right (#0778), tests/task-drawer-ui-changes-rows.test.ts > Changes → UI changes rows (#0611) > shows a UI-changes empty state for an unmanaged, shot-less task on mini — fix it in the feature branch and re-run the gate"
last_handoff_failure_sha: d33b16451366a286d4e279e35eba6afee7719b45
---
## Problem
Whether a task in review can actually land is decided by a handful of manual checks that live in driver prose and AGENTS.md: the lock sha equals the worktree HEAD, the worktree is clean, the branch merges with main (conflicts only in the task's own work/<id>-*.md), the diff has no repoos.toml and no other tasks' work/ files, and main has no blocking dirty files. Each driver re-does these by hand and gets them wrong sometimes. On 2026-10-20 #0860 had a "good to go" review on a HEAD that still conflicted with main in src/core/types.ts, and the conflict was only discovered when Move to done refused; reviews kept re-running on the same unchanged commit.

## Desired UX
`repoos landable <id>` prints a short pass/fail checklist for every pre-check with the reason and the exact next step (e.g. "src/core/types.ts conflicts with main: merge main into the branch, keep both sides"), exits non-zero when not landable, and supports `--json`. The same result is shown in the task drawer next to Move to done. The reviewer and the review prompt can use it so a branch that cannot merge cannot get "good to go" without saying so.

## Acceptance criteria
- Checks: current review verdict is good to go on the current pass; lock sha equals worktree HEAD (missing lock is a warning); worktree clean; merge-tree conflicts classified as own-task-file-only vs source; no repoos.toml or other tasks' work/inputs/stories files in the diff; main has no blocking dirty files (listing them and who owns them: repoos.toml, reminders/, schedules/, unknown).
- Read-only: never edits, commits, or moves status.
- `--json` output has a stable shape; exit code 0 only when landable.
- Drawer shows the same result; the Move to done button explains a failing check.
- Table-driven tests for every check and each failure message; docs in user-docs/cli.md and docs/close-out-pipeline.md; AGENTS.md landing paragraph points at the command.

## Notes for AI
The close-out approval policy already computes most of these checks: `evaluateApprovalPolicy` / `evaluateAutoApprove` (src/core/approval-policy.ts, src/server/approval-policy.ts, #0686/#0727) cover verdict, blocking bugs, gate state, branch conflict via `git merge-tree`, handoff drift (worktree HEAD equals the lock sha), blocked machinery paths, and main-dirty. Build `repoos landable` on that same preflight (expose its result for a task regardless of whether approval is enabled) so the command, auto-approval and Move to done can never disagree, and add only the missing checks (conflict classification: own task file only vs source; other tasks' work files in the diff; naming which dirty files on main block and who owns them). The CLI wraps the HTTP API like the other control-plane commands (user-docs/cli.md, Control plane). Also see docs/cto-autopilot.md.

## Shots
```json
[
{
"label": "Task drawer landing pre-checks with a failing merge with main",
"target": "default",
"route": "/work?task=9999&tab=changes",
"highlight": ".landable-checks",
"steps": [
{
"waitFor": ".landable-checks"
}
],
"state": "drawer:landable"
}
]
```

## Activity

- 2026-10-20T12:05:58Z · created · njachowski@gmail.com
- 2026-10-20T12:18:11Z · story
- 2026-10-20T12:20:42Z · body: Notes for AI (added 1, removed 1)
- 2026-10-20T17:21:58Z · status inbox→ready
- 2026-10-20T17:22:05Z · cli_override, model_override
- 2026-10-20T17:22:07Z · status ready→active, branch
- 2026-10-20T17:40:34Z · body
- 2026-10-20T17:55:28Z · body
- 2026-10-20T17:58:56Z · body
- 2026-10-20T18:04:11Z · body
- 2026-10-20T18:07:29Z · body
- 2026-10-20T18:18:58Z · handoff failed · remote validation failed: test failure: tests/send-to-engineer-note.test.ts > Send to engineer note dialog (#0295) > still sends when opening the dialog dismissed the drawer's modal, tests/task-drawer-ui-changes-rows.test.ts > Changes → UI changes rows (#0611) > orders UI changes toolbar actions with Add shot on the right (#0778), tests/task-drawer-ui-changes-rows.test.ts > Changes → UI changes rows (#0611) > shows a UI-changes empty state for an unmanaged, shot-less task on bee — fix it in the feature branch and re-run the gate
- 2026-10-20T18:24:15Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/send-to-engineer-note.test.ts > Send to engineer note dialog (#0295) > still sends when opening the dialog dismissed the drawer's modal, tests/task-drawer-ui-changes-rows.test.ts > Changes → UI changes rows (#0611) > orders UI changes toolbar actions with Add shot on the right (#0778), tests/task-drawer-ui-changes-rows.test.ts > Changes → UI changes rows (#0611) > shows a UI-changes empty state for an unmanaged, shot-less task on bee — fix it in the feature branch and re-run the gate · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-20T18:24:15Z · note: handoff requested (cli)
- 2026-10-20T18:27:22Z · message_queued at 2026-10-20T18:27:22.380Z
- 2026-10-20T18:31:05Z · handoff failed · task-file handoff failed at check · remote validation failed: test failure: tests/send-to-engineer-note.test.ts > Send to engineer note dialog (#0295) > still sends when opening the dialog dismissed the drawer's modal, tests/task-drawer-ui-changes-rows.test.ts > Changes → UI changes rows (#0611) > orders UI changes toolbar actions with Add shot on the right (#0778), tests/task-drawer-ui-changes-rows.test.ts > Changes → UI changes rows (#0611) > shows a UI-changes empty state for an unmanaged, shot-less task on mini — fix it in the feature branch and re-run the gate
- 2026-10-20T18:37:38Z · message_delivered: 1 message(s)
- 2026-10-20T18:37:39Z · CTO action: restart-stalled-agent (resume) · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/send-to-engineer-note.test.ts > Send to engineer note dialog (#0295) > still sends when opening the dialog dismissed the drawer's modal, tests/task-drawer-ui-changes-rows.test.ts > Changes → UI changes rows (#0611) > orders UI changes toolbar actions with Add shot on the right (#0778), tests/task-drawer-ui-changes-rows.test.ts > Changes → UI changes rows (#0611) > shows a UI-changes empty state for an unmanaged, shot-less task on bee — fix it in the feature branch and re-run the gate
- 2026-10-20T18:47:36Z · message_queued at 2026-10-20T18:47:36.186Z
- 2026-10-20T18:47:36Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-20T18:51:16Z · body
- 2026-10-20T19:10:06Z · body
- 2026-10-20T19:18:02Z · body
- 2026-10-20T19:30:34Z · body
