---
id: "0954"
title: "Bug: one task's activity/bookkeeping commits land on another task's branch and move its HEAD during its handoff check"
type: bug
status: active
needs_input: true
needs_input_reason: dev-error
needs_input_detail: "engineer keeps crashing (3 in 30m): a human-set task override (codex + gpt-6-luna) is pinned, so RepoOS did not replace it. Review the crash detail and either fix the environment, change the override, or resume manually."
priority: p1
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/bug-one-task-s-activity-bookkeeping-comm
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-24T23:57:03Z"
updated_at: "2026-10-25T12:29:27Z"
handoff_signal_retry_count: 2
dev_error_count: 10
engineer_stall_resume_log: "[{\"at\":\"2026-10-25T12:19:20.905Z\",\"reason\":\"clean-exit-without-handoff\"}]"
engineer_crash_log: "[{\"cli\":\"codex\",\"model\":\"gpt-6-luna\",\"at\":\"2026-10-25T12:28:31.757Z\",\"kind\":\"dev-error\"},{\"cli\":\"codex\",\"model\":\"gpt-6-luna\",\"at\":\"2026-10-25T12:28:44.989Z\",\"kind\":\"dev-error\"},{\"cli\":\"codex\",\"model\":\"gpt-6-luna\",\"at\":\"2026-10-25T12:29:04.333Z\",\"kind\":\"dev-error\"}]"
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
The confirmed cause was preview-child RepoOS servers started from task worktrees for task previews and handoff screenshot capture. The child inherited REPOOS_PREVIEW_CHILD=1 and used that worktree as config.root, but still started the task watchdog, supervisor, and agent/recovery machinery. Those processes scan all active tasks; agents.ts recordTaskActivity and engineer-crash-recovery write task files and commitTaskFile(config.root, ...) therefore committed task A bookkeeping into the preview child’s task B worktree. This advanced B’s HEAD during its handoff check and added A’s task file to B’s branch diff. The fix makes preview APIs read-only, disables recovery/watchdog/close-out processing in non-control-plane servers, and refuses all commits from preview children in commitFiles as defense in depth. Handoff validation now tolerates a HEAD advance only if the full commit diff is exactly the current task’s own work/<id>-*.md file; unrelated task files and source changes still fail.

## More evidence: it is the handoff itself
Stopping #0951's preview did not end it: a NEW preview server for #0951 (pid 19962, port 61116, parent = the main server) appeared within minutes, started by the handoff's own UI-review shot capture. That preview is a full RepoOS server rooted in the task worktree, so while the handoff check runs it commits other tasks' bookkeeping (docs(0950)/docs(0952) update task / record handoff failure / resume stalled engineer) into the worktree under test, moving HEAD, which fails the handoff ('the worktree changed while the gate was running'), 4 times on #0951. Every UI task with declared shots hits this whenever another task is active. Needed: the server started for previews and shot capture (REPOOS_PREVIEW_CHILD / --preview-overrides mode) must be read-only for task files: no activity recorder, no stalled-engineer watchdog, no auto-engineering, no commitTaskFile/commitFiles (guard at the shared helper in src/core/git.ts as defence in depth and at the callers). Test: start a server in preview mode over a worktree, mutate other tasks, assert no commit appears in that worktree.

## Activity

- 2026-10-24T23:57:03Z · created · njachowski@gmail.com
- 2026-10-25T00:30:23Z · body: Root cause found (driver, 2026-10-25) (added)
- 2026-10-25T01:04:24Z · body: More evidence: it is the handoff itself (added)
- 2026-10-25T01:04:49Z · status inbox→ready
- 2026-10-25T01:04:57Z · cli_override, model_override
- 2026-10-25T01:04:58Z · status ready→active, branch
- 2026-10-25T01:10:16Z · body: Root cause found (driver, 2026-10-25) (added 1, removed 1)
- 2026-10-25T01:10:16Z · message_queued at 2026-10-25T01:10:16.639Z
- 2026-10-25T01:11:55Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-25T01:15:32Z · body
- 2026-10-25T01:17:41Z · body
- 2026-10-25T01:18:58Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-10-25T01:18:58Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-25T01:18:58Z · message_delivered: 1 message(s)
- 2026-10-25T01:36:00Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-25T01:41:21Z · agent exited with an error (codex) · error: You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purchase more credits or try again at 11:18 AM.
- 2026-10-25T01:41:21Z · engineer crash recovery: resuming codex + gpt-6-luna (1/3 crashes in 30m) · error: You’ve hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purchase more credits or try again at 11:18 AM.
- 2026-10-25T01:41:30Z · engineer crash recovery: resuming codex + gpt-6-luna (2/3 crashes in 30m) · Reading additional input from stdin...
- 2026-10-25T01:41:38Z · engineer crash recovery: surfaced instead of switching — a human-set task override (codex + gpt-6-luna) is pinned, so RepoOS did not replace it (3/3 crashes in 30m)
- 2026-10-25T01:47:25Z · cli_override, model_override
- 2026-10-25T01:48:01Z · needs_input
- 2026-10-25T01:48:01Z · message_queued at 2026-10-25T01:48:01.698Z
- 2026-10-25T01:50:19Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-25T02:49:41Z · message_overdue: still queued after 60m without being delivered
- 2026-10-25T02:58:54Z · body
- 2026-10-25T03:02:39Z · engineer stopped by request
- 2026-10-25T03:03:27Z · status active→ready
- 2026-10-25T03:03:43Z · status ready→active
- 2026-10-25T03:03:46Z · message_delivered: 1 message(s)
- 2026-10-25T03:03:52Z · message_queued at 2026-10-25T03:03:52.808Z
- 2026-10-25T03:06:55Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-25T03:08:41Z · body
- 2026-10-25T03:18:43Z · body
- 2026-10-25T03:55:47Z · engineer stopped by request
- 2026-10-25T03:56:29Z · status active→ready
- 2026-10-25T03:57:05Z · status ready→active
- 2026-10-25T03:57:09Z · message_delivered: 1 message(s)
- 2026-10-25T03:57:16Z · message_queued at 2026-10-25T03:57:16.528Z
- 2026-10-25T03:59:06Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-25T04:54:55Z · agent exited with an error (cursor) · RetriableError: Agent turn stopped after repeated resume attempts made no progress
- 2026-10-25T04:54:55Z · engineer crash recovery: resuming cursor + composer-2.5 (1/3 crashes in 30m) · RetriableError: Agent turn stopped after repeated resume attempts made no progress
- 2026-10-25T04:54:57Z · message_delivered: 1 message(s)
- 2026-10-25T04:55:01Z · engineer crash recovery: resuming cursor + composer-2.5 (2/3 crashes in 30m) · Error: [internal]
- 2026-10-25T04:55:08Z · engineer crash recovery: surfaced instead of switching — a human-set task override (cursor + composer-2.5) is pinned, so RepoOS did not replace it (3/3 crashes in 30m)
- 2026-10-25T05:07:46Z · cli_override, model_override
- 2026-10-25T05:08:00Z · needs_input
- 2026-10-25T05:30:18Z · status active→ready
- 2026-10-25T05:30:34Z · status ready→active
- 2026-10-25T05:54:05Z · message_queued at 2026-10-25T05:54:05.146Z
- 2026-10-25T05:54:05Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-25T06:07:21Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-25T08:52:03Z · message_overdue: still queued after 60m without being delivered
- 2026-10-25T08:57:44Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-25T08:57:45Z · message_delivered: 1 message(s)
- 2026-10-25T08:59:45Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-25T09:08:54Z · message_queued at 2026-10-25T09:08:54.348Z
- 2026-10-25T09:08:54Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-25T09:13:38Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-25T09:13:41Z · message_delivered: 1 message(s)
- 2026-10-25T09:13:56Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-25T09:19:07Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 1/3 in 30m
- 2026-10-25T10:02:06Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-25T10:07:11Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 1/3 in 30m
- 2026-10-25T10:14:34Z · message_queued at 2026-10-25T10:14:34.643Z
- 2026-10-25T10:14:35Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-25T10:19:34Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-25T10:34:22Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-25T10:34:23Z · message_delivered: 1 message(s)
- 2026-10-25T10:34:31Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-25T10:39:39Z · CTO action: restart-stalled-agent (fresh) · agent exited without emitting the handoff signal
- 2026-10-25T11:13:07Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 1/3 in 30m
- 2026-10-25T11:28:48Z · agent exited with an error (codex) · Reading additional input from stdin...
- 2026-10-25T11:28:48Z · engineer crash recovery: resuming codex + gpt-6-luna (1/3 crashes in 30m) · Reading additional input from stdin...
- 2026-10-25T11:34:19Z · message_queued at 2026-10-25T11:34:19.386Z
- 2026-10-25T11:34:19Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-25T11:35:14Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-25T11:40:10Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-25T11:40:10Z · needs_input
- 2026-10-25T11:40:11Z · message_delivered: 1 message(s)
- 2026-10-25T11:45:12Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 1/3 in 30m
- 2026-10-25T12:14:07Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-25T12:19:20Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 1/3 in 30m
- 2026-10-25T12:28:31Z · agent exited with an error (codex) · 2026-10-25T12:28:30.609191Z ERROR codex_core::session: failed to record rollout items: thread 01a17300-56d9-7e41-b049-c00b10cbe884 not found
- 2026-10-25T12:28:31Z · engineer crash recovery: resuming codex + gpt-6-luna (1/3 crashes in 30m) · 2026-10-25T12:28:30.609191Z ERROR codex_core::session: failed to record rollout items: thread 01a17300-56d9-7e41-b049-c00b10cbe884 not found
- 2026-10-25T12:28:44Z · engineer crash recovery: resuming codex + gpt-6-luna (2/3 crashes in 30m) · Reading additional input from stdin...
- 2026-10-25T12:29:04Z · engineer crash recovery: surfaced instead of switching — a human-set task override (codex + gpt-6-luna) is pinned, so RepoOS did not replace it (3/3 crashes in 30m)
- 2026-10-25T12:29:26Z · cli_override, model_override
