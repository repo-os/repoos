---
id: "1055"
title: Review and safely clean task worktrees
type: chore
status: ready
hold: true
hold_reason: "Rework as a server-side scheduled gc report; no agent/worktree needed (Nick, 2026-11-08). To be deleted."
hold_at: "2026-11-08T02:58:11.434Z"
priority: p2
area: [core, server]
assigned_to: ai
created_by: schedule
branch: feat/review-and-safely-clean-task-worktrees
created_at: "2026-11-07T22:37:10Z"
updated_at: "2026-11-10T23:04:18Z"
review_rounds: 1
routing_switches: 1
routing_escalations: 1
review_passes: 1
handoff_signal_retry_count: 2
engineer_stall_resume_log: "[{\"at\":\"2026-11-08T00:36:58.679Z\",\"reason\":\"clean-exit-without-handoff\"},{\"at\":\"2026-11-08T00:57:13.853Z\",\"reason\":\"clean-exit-without-handoff\"}]"
dev_error_count: 2
---
## Problem

RepoOS leaves a Git worktree and branch behind for every task it runs. Most are cleaned up on close-out, but over time some are left over: merged feature branches that were never collected, and worktrees whose task is done, archived or gone. These add noise and have caused confusing failures, such as close-outs that fail with "feature branch worktree not found". The cleanup must never lose work: unfinished, dirty, unmerged, held, human-owned or in-review work has to stay.

This is the recurring hygiene pass. On each run, review the registered worktrees, remove only the ones RepoOS itself proves safe to remove with its guarded `repoos gc`, and report every worktree that was kept together with the exact reason.

## Acceptance criteria

- [ ] Before changing anything, `repoos status --json` and `repoos gc --dry-run` were run, and the report records the worktree count, the safe candidates, and the protected worktrees with their reasons.
- [ ] If there are safe candidates, cleanup was done only with `repoos gc --yes`, and a second `repoos status --json` plus `repoos gc --dry-run` shows no safe candidates left (or the report says why some remain).
- [ ] If there are no safe candidates, the run changed nothing: `repoos gc --yes` was not run and no worktree or branch was removed. The report says so.
- [ ] The report lists every protected worktree with its exact reason, and the before and after counts.
- [ ] No active, review, held, human-assigned, dirty or unmerged task worktree or branch was removed, and nothing was removed by hand with `git worktree remove` or `git branch -D`.
- [ ] No product code was edited, nothing was pushed, and no unrelated task was started. The diff contains only this task's own task file and report files.

## Notes for AI
Runbook:

0. This scheduled maintenance pass must run with RepoOS rooted at the main checkout, not from its linked task worktree. Before the inventory, check the `repoos status --json` root and warning. If it warns that it is reporting the main checkout because the command was invoked from a linked worktree, stop before `repoos gc --yes` and record the run as blocked for root resolution. In that situation status and GC can associate the current physical worktree with a stale/different task ID; do not treat a candidate matching the current worktree path as safe, even if its reported task status is done. Rerun from the main checkout context.
1. Re-read `AGENTS.md`, `repoos driver brief`, and `repoos list`. Check the live state of any task referenced by a retained worktree before judging it.
2. Run `repoos status --json` and `repoos gc --dry-run`. Record the current count, safe candidates, and protected reasons.
3. If RepoOS reports safe candidates, first confirm none is the physical checkout running this task and that the status root is the expected main checkout. Apply cleanup only with `repoos gc --yes`, then verify with another `repoos status --json` plus `repoos gc --dry-run`.
4. Never remove a worktree or branch by hand. Never clean active, review, held, human-assigned, dirty, or unmerged task work. Do not reset task files to main based only on their path. Leave unresolved done/archived worktrees for the safety rules tracked in #1004.
5. Record before and after counts and every protected worktree with the exact reason in this task's handoff report. If there are no safe candidates, report that and finish without changing anything. If the root-resolution guard fires, report it as a blocker rather than claiming a completed cleanup pass.

Do not edit product code, push, or start unrelated tasks as part of this run.

Context: `repoos gc` is the only sanctioned way to remove worktrees and branches; it decides what is safe. Worktrees outside RepoOS's managed task-worktree directory (for example other tools' worktrees) are not this task's to remove. This task comes from the "Safe worktree cleanup" schedule in `schedules/`; a normal run has an empty code diff, so there is nothing for the scoped check to test beyond the task's own files. Once #1004 lands and changes what `repoos gc` collects, update this runbook and the schedule template to match.

## Activity

- 2026-11-07T22:37:10Z · created · schedule
- 2026-11-07T23:51:45Z · status ready→active, branch
- 2026-11-07T23:53:24Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: I stopped before cleanup because the only GC candidate is this active #1055 worktree. `repoos status --json` warned that it was reporting the main checkout and associated the candidate with task #1008, so running `repoos gc --yes` could re… · stderr: Reading additional input from stdin...
- 2026-11-07T23:59:36Z · body
- 2026-11-08T00:00:34Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: `REPOOS_CHECK_CHANGED=main repoos check` passed. The report records the before snapshot, all retained reasons, and the blocker. The cleanup is still incomplete: the sole GC candidate is this active #1055 worktree, though RepoOS associates … · stderr: (empty)
- 2026-11-08T00:07:56Z · CTO nudge: held — handoff gate is running
- 2026-11-08T00:14:50Z · status active→review
- 2026-11-08T00:14:50Z · message_queued at 2026-11-08T00:14:50.884Z
- 2026-11-08T00:14:50Z · note: shots: skipped — the diff (3 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-08T00:16:19Z · note: review pass 1: needs some work
- 2026-11-08T00:16:20Z · message_delivered: 1 message(s)
- 2026-11-08T00:16:20Z · status review→active
- 2026-11-08T00:21:28Z · body
- 2026-11-08T00:22:56Z · CTO nudge: held — handoff gate is running
- 2026-11-08T00:31:54Z · status active→review
- 2026-11-08T00:31:54Z · message_queued at 2026-11-08T00:31:54.637Z
- 2026-11-08T00:31:54Z · note: shots: skipped — the diff (5 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-08T00:31:55Z · message_delivered: 1 message(s)
- 2026-11-08T00:31:55Z · status review→active
- 2026-11-08T00:36:58Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 1/3
- 2026-11-08T00:40:53Z · body
- 2026-11-08T00:41:52Z · status active→review
- 2026-11-08T00:41:53Z · note: shots: skipped — the diff (5 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-08T00:41:54Z · message_queued at 2026-11-08T00:41:54.383Z
- 2026-11-08T00:41:54Z · status review→active
- 2026-11-08T00:41:56Z · CTO nudge: held — handoff gate is running
- 2026-11-08T00:52:03Z · status active→review
- 2026-11-08T00:52:03Z · message_queued at 2026-11-08T00:52:03.834Z
- 2026-11-08T00:52:03Z · note: shots: skipped — the diff (6 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-08T00:52:05Z · message_delivered: 2 message(s)
- 2026-11-08T00:52:05Z · status review→active
- 2026-11-08T00:57:13Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 1/3
- 2026-11-08T01:01:20Z · body
- 2026-11-08T01:01:58Z · status active→review
- 2026-11-08T01:01:59Z · note: shots: skipped — the diff (6 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-08T01:02:01Z · message_queued at 2026-11-08T01:02:01.610Z
- 2026-11-08T01:02:02Z · status review→active
- 2026-11-08T01:02:04Z · CTO nudge: held — handoff gate is running
- 2026-11-08T01:02:20Z · message_queued at 2026-11-08T01:02:20.394Z
- 2026-11-08T01:02:56Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-08T01:07:57Z · message_delivered: 2 message(s)
- 2026-11-08T01:07:58Z · CTO action: restart-stalled-agent (fresh) · agent exited without emitting the handoff signal
- 2026-11-08T01:10:52Z · body
- 2026-11-08T01:12:16Z · body
- 2026-11-08T01:12:36Z · status active→review
- 2026-11-08T01:12:37Z · note: shots: skipped — the diff (6 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-08T01:12:38Z · message_queued at 2026-11-08T01:12:38.227Z
- 2026-11-08T01:12:38Z · status review→active
- 2026-11-08T01:12:40Z · CTO nudge: held — handoff gate is running
- 2026-11-08T01:12:46Z · status active→review
- 2026-11-08T01:12:46Z · message_queued at 2026-11-08T01:12:46.870Z
- 2026-11-08T01:12:46Z · note: shots: skipped — the diff (7 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-08T01:12:47Z · message_delivered: 2 message(s)
- 2026-11-08T01:12:47Z · status review→active
- 2026-11-08T01:17:58Z · CTO action: restart-stalled-agent (fresh) · agent exited without emitting the handoff signal
- 2026-11-08T01:21:36Z · body
- 2026-11-08T01:22:33Z · status active→review
- 2026-11-08T01:22:34Z · note: shots: skipped — the diff (8 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-08T01:22:35Z · message_queued at 2026-11-08T01:22:35.250Z
- 2026-11-08T01:22:35Z · status review→active
- 2026-11-08T01:22:37Z · CTO nudge: held — handoff gate is running
- 2026-11-08T01:32:56Z · status active→review
- 2026-11-08T01:32:57Z · message_queued at 2026-11-08T01:32:57.109Z
- 2026-11-08T01:32:57Z · note: shots: skipped — the diff (9 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-08T01:32:58Z · message_delivered: 2 message(s)
- 2026-11-08T01:32:58Z · status review→active
- 2026-11-08T01:35:09Z · body: Notes for AI (added 3, removed 2)
- 2026-11-08T01:35:09Z · message_queued at 2026-11-08T01:35:09.338Z
- 2026-11-08T01:37:56Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-08T01:38:38Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-08T01:40:50Z · body
- 2026-11-08T01:42:26Z · body
- 2026-11-08T01:42:46Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-08T01:42:46Z · message_queued at 2026-11-08T01:42:46.171Z
- 2026-11-08T01:42:46Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code unknown · last assistant: The final check passed on the report and run-instruction changes. I caught and fixed one trailing blank line afterward, so I’m rerunning the check against the exact final tree before requesting review again. · stderr: (empty)
- 2026-11-08T01:42:46Z · status active→review
- 2026-11-08T01:42:46Z · message_delivered: 2 message(s)
- 2026-11-08T01:42:46Z · note: handoff requested (cli)
- 2026-11-08T01:43:14Z · CTO nudge: held — handoff gate is running
- 2026-11-08T01:53:45Z · message_queued at 2026-11-08T01:53:45.479Z
- 2026-11-08T01:53:45Z · handoff failed · task-file handoff failed at check · repoos check failed: ui-smoke — $ bun scripts/ui-smoke.mjs
- 2026-11-08T01:53:45Z · message_delivered: 1 message(s)
- 2026-11-08T01:54:01Z · agent exited with an error (codex) · 2026-11-08T01:53:51.237776Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when Client(HttpRequest(HttpRequest("http/request failed: error sending request for url (https://chatgpt.com/backend-api/ps/mcp)")))
- 2026-11-08T02:04:01Z · watchdog: restarting engineer after 10m with no live process
- 2026-11-08T02:04:18Z · agent exited with an error (codex) · 2026-11-08T02:04:08.348375Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when Client(HttpRequest(HttpRequest("http/request failed: error sending request for url (https://chatgpt.com/backend-api/ps/mcp)")))
- 2026-11-08T02:06:14Z · needs_input
- 2026-11-08T02:09:55Z · body
- 2026-11-08T02:10:19Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The cleanup run is blocked by the linked-worktree root mismatch. `repoos status --json` warned that it was reporting `/Users/nick/code/nick/repoos`; it associated this physical #1055 worktree with #1008. The dry run reported 0 safe candida… · stderr: Reading additional input from stdin...
- 2026-11-08T02:10:20Z · note: handoff requested (cli)
- 2026-11-08T02:13:14Z · CTO nudge: held — handoff gate is running
- 2026-11-08T02:19:16Z · status active→review
- 2026-11-08T02:19:16Z · message_queued at 2026-11-08T02:19:16.780Z
- 2026-11-08T02:19:16Z · note: shots: skipped — the diff (10 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-08T02:19:18Z · message_delivered: 1 message(s)
- 2026-11-08T02:19:18Z · status review→active
- 2026-11-08T02:24:32Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — task-file handoff failed at check · repoos check failed: ui-smoke — $ bun scripts/ui-smoke.mjs · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-11-08T02:24:32Z · note: handoff requested (cli)
- 2026-11-08T02:28:14Z · CTO nudge: held — handoff gate is running
- 2026-11-08T02:35:04Z · message_queued at 2026-11-08T02:35:04.158Z
- 2026-11-08T02:35:04Z · handoff failed · task-file handoff failed at review · Engineering report draft is missing: .repoos/engineering-report-drafts/1055.md
- 2026-11-08T02:35:04Z · message_delivered: 1 message(s)
- 2026-11-08T02:44:06Z · message_queued at 2026-11-08T02:44:06.548Z
- 2026-11-08T02:48:14Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-08T02:51:13Z · body
- 2026-11-08T02:52:03Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-08T02:52:03Z · message_queued at 2026-11-08T02:52:03.094Z
- 2026-11-08T02:52:03Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: `repoos check` passed, including remote validation, the full test suite, UI smoke, contrast audit, and repository checks. I’m requesting review now; the cleanup report still records the root-resolution guard and that no unsafe cleanup was … · stderr: (empty)
- 2026-11-08T02:52:03Z · status active→review
- 2026-11-08T02:52:03Z · message_delivered: 2 message(s)
- 2026-11-08T02:52:03Z · note: handoff requested (cli)
- 2026-11-08T02:52:16Z · status active→review
- 2026-11-08T02:52:17Z · message_queued at 2026-11-08T02:52:17.211Z
- 2026-11-08T02:52:17Z · note: shots: skipped — the diff (11 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-08T02:52:19Z · message_delivered: 1 message(s)
- 2026-11-08T02:52:19Z · status review→active
- 2026-11-08T02:53:14Z · CTO nudge: held — handoff gate is running
- 2026-11-08T02:58:11Z · held, held-reason, held-at
- 2026-11-08T03:00:50Z · handoff failed · remote validation failed: test failure: gate exit 137 on bee — fix it in the feature branch and re-run the gate
- 2026-11-08T03:00:50Z · message_queued at 2026-11-08T03:00:50.509Z
- 2026-11-08T04:10:19Z · message_overdue: still queued after 60m without being delivered
- 2026-11-08T05:34:24Z · message_overdue: still queued after 60m without being delivered
- 2026-11-08T05:35:10Z · status active→ready
- 2026-11-08T05:35:10Z · note: task abandoned
- 2026-11-08T06:05:19Z · message_overdue: still queued after 60m without being delivered
- 2026-11-08T06:20:03Z · message_overdue: still queued after 60m without being delivered
- 2026-11-08T08:45:27Z · message_overdue: still queued after 60m without being delivered
- 2026-11-08T12:23:50Z · message_overdue: still queued after 60m without being delivered
- 2026-11-08T14:22:24Z · message_overdue: still queued after 60m without being delivered
- 2026-11-08T17:16:07Z · message_overdue: still queued after 60m without being delivered
- 2026-11-09T10:42:25Z · message_overdue: still queued after 60m without being delivered
- 2026-11-09T11:21:55Z · message_overdue: still queued after 60m without being delivered
- 2026-11-09T14:51:43Z · message_overdue: still queued after 60m without being delivered
- 2026-11-09T18:25:49Z · message_overdue: still queued after 60m without being delivered
- 2026-11-09T19:03:53Z · message_overdue: still queued after 60m without being delivered
- 2026-11-10T00:39:48Z · message_overdue: still queued after 60m without being delivered
- 2026-11-10T04:29:27Z · message_overdue: still queued after 60m without being delivered
- 2026-11-10T05:00:00Z · message_overdue: still queued after 60m without being delivered
- 2026-11-10T08:24:40Z · message_overdue: still queued after 60m without being delivered
- 2026-11-10T11:04:26Z · message_overdue: still queued after 60m without being delivered
- 2026-11-10T13:31:44Z · message_overdue: still queued after 60m without being delivered
- 2026-11-10T17:26:30Z · message_overdue: still queued after 60m without being delivered
- 2026-11-10T23:04:18Z · message_overdue: still queued after 60m without being delivered
