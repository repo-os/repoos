---
id: "1103"
title: Keep review verdict after a take-main's-side merge-conflict fix
type: feature
status: done
priority: p2
area: [web, server]
merged_commit: 6b3c0dee22f34ff082704fdbc1ada9dde1c4e749
assigned_to: ai
created_by: t@t
branch: feat/keep-review-verdict-after-a-take-main-s-
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-14T01:19:52Z"
updated_at: "2026-11-14T07:14:54Z"
last_close_out_gate_ms: 127211
last_close_out_gate_at: "2026-11-14T07:14:38.563Z"
review_passes: 3
last_check_failure: "repoos check at 2026-11-14T05:01:25.504Z: repoos check failed: ui verification failed (4 issue(s)): [request] HTTP 404 for http://127.0.0.1:44283/api/tasks/9999/review/keep-check (http://127.0.0.1:44283/api/tasks/9999/review/keep-check); [request] Failed to load resource: the server responded with a status of 404 (Not Found) (http://127.0.0.1:44283/api/tasks/9999/review/keep-check); [request] HTTP 404 for http://127.0.0.1:44283/api/tasks/9999/review/keep-check (http://127.0.0.1:44283/api/tasks/9999/review/keep-check); [request] Failed t… (truncated)"
review_rounds: 1
handoff_signal_retry_count: 2
engineer_stall_resume_log: "[{\"at\":\"2026-11-14T04:00:36.431Z\",\"reason\":\"clean-exit-without-handoff\"}]"
---
## Problem
After a close-out merge conflict is resolved by merging main into the task branch, the branch tip moves, the review lock sha no longer matches, and `repoos landable` fails with "Review lock". The human must wait for a full re-review even when the resolution only took main's side of a file (e.g. a comment wording clash, #1081) and added nothing new to judge.

## Desired UX
On the close-out failure card (merge conflict) and the Debug tab, after the conflict is resolved, a "Keep review verdict and merge" button appears when the resolution is provably safe: the new merge commit changes the branch vs the reviewed sha only by taking main's version of the conflicting files (the branch-vs-reviewed-sha diff, minus main's own changes, is empty). Clicking it re-pins the review lock to the new tip, records the reason in the task history, and proceeds to close-out. CLI parity: `repoos review keep <id>`. If the resolution is not provably take-main, the button is absent and the normal Review again flow applies.

## Acceptance criteria
1. A server check classifies a post-review merge commit as take-main-only vs other, with tests for both.
2. The button and `repoos review keep <id>` only work for take-main-only; otherwise they refuse with the reason.
3. The lock re-pin is recorded in task history with the old and new sha.
4. `repoos landable` passes after keeping the verdict.
5. UI follows AGENTS.md conventions (shared dialogs, no native confirm).

## Notes
Related to the narrow conflict resolution allowlist in `src/server/conflict-resolution.ts`; do not widen that allowlist. Add the CLI command to the API route parity list.

## Notes for AI
Start from the close-out failure card component and `repoos landable` review-lock check. Reuse the existing merge-base/merge-tree helpers in src/core/git.ts rather than shelling out ad hoc.

## Shots
```json
[
{
"label": "Close-out failure card action context",
"target": "default",
"route": "/work",
"highlight": ".done-error",
"state": "card:doneError"
}
]
```

## Activity

- 2026-11-14T01:19:52Z · created · t@t
- 2026-11-14T01:19:53Z · needs_input
- 2026-11-14T01:19:56Z · body: Notes for AI (added)
- 2026-11-14T01:46:15Z · needs_input
- 2026-11-14T03:28:38Z · cli_override, model_override
- 2026-11-14T03:28:45Z · status inbox→ready
- 2026-11-14T03:28:46Z · status ready→active, branch
- 2026-11-14T03:29:52Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: I haven’t implemented the task or run the required check, so I can’t request handoff. The key safety rule still needs a precise implementation: prove that the branch tip after the conflict resolution contains no changes beyond the reviewed… · stderr: Reading additional input from stdin...
- 2026-11-14T03:36:52Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The task is still incomplete, so I’m not sending the handoff signal. I added a conservative take-main merge classifier and two focused tests, but haven’t wired them into the server route, review lock update, close-out flow, CLI, or UI. The… · stderr: Reading additional input from stdin...
- 2026-11-14T03:42:06Z · CTO action: restart-stalled-agent (fresh) · agent exited without emitting the handoff signal
- 2026-11-14T03:42:56Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: I couldn’t complete task #1103. The worktree currently contains only an untracked classifier and two focused tests; the server route, review lock re-pin, task history entry, CLI command, and UI action are not implemented. I did not run the… · stderr: Reading additional input from stdin...
- 2026-11-14T03:55:25Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: I could not complete task #1103, so I’m not emitting the handoff signal. The build passed, but `REPOOS_CHECK_CHANGED=main repoos check` failed remotely: 123 test files passed, and one test in `agent-review.test.ts` expected HTTP 409 but re… · stderr: (empty)
- 2026-11-14T04:00:36Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 1/3
- 2026-11-14T04:18:11Z · body
- 2026-11-14T04:35:43Z · body
- 2026-11-14T04:37:27Z · body
- 2026-11-14T04:40:01Z · note: ui verification passed: 1 of 1 shot captured with clean console
- 2026-11-14T04:40:02Z · status active→review
- 2026-11-14T04:40:02Z · message_queued at 2026-11-14T04:40:02.390Z
- 2026-11-14T04:42:04Z · note: review pass 1: needs some work
- 2026-11-14T04:42:04Z · message_delivered: 1 message(s)
- 2026-11-14T04:42:04Z · status review→active
- 2026-11-14T04:57:30Z · body
- 2026-11-14T05:01:22Z · note: ui verification failed: ui verification failed (4 issue(s)): [request] HTTP 404 for http://127.0.0.1:44283/api/tasks/9999/review/keep-check (http://127.0.0.1:44283/api/tasks/9999/review/keep-check); [request] Failed to load resource: the server responded with a status of 404 (Not Found) (http://127.0.0.1:44283/api/tasks/9999/review/keep-check); [request] HTTP 404 for http://127.0.0.1:44283/api/tasks/9999/review/keep-check (http://127.0.0.1:44283/api/tasks/9999/review/keep-check); [request] Faile
- 2026-11-14T05:01:22Z · message_queued at 2026-11-14T05:01:22.444Z
- 2026-11-14T05:01:25Z · message_delivered: 1 message(s)
- 2026-11-14T05:17:05Z · message_queued at 2026-11-14T05:17:05.045Z
- 2026-11-14T05:17:05Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-14T05:18:25Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-14T05:21:39Z · body
- 2026-11-14T05:23:01Z · note: adopted orphaned engineer pid 47344
- 2026-11-14T05:23:17Z · status active→review
- 2026-11-14T05:38:08Z · note: ui verification passed: 1 of 1 shot captured with clean console
- 2026-11-14T05:38:09Z · note: review pass 2: needs some work — clamped by automated verification: browser verification: Handoff browser verification recorded 4 blocking issue(s): [request] HTTP 404 for http://127.0.0.1:44283/api/tasks/9999/review/keep-check; [request] Failed to load resource: the server responded with a status of 404 (Not Found); [request] HTTP 404 for http://127.0.0.1:44283/api/tasks/9999/review/keep-check; [request] Failed to load resource: the server responded with a status of 404 (Not Found)
- 2026-11-14T05:38:10Z · message_queued at 2026-11-14T05:38:10.506Z
- 2026-11-14T07:11:39Z · note: review pass 3: good to go
- 2026-11-14T07:12:11Z · message_overdue: still queued after 60m without being delivered
- 2026-11-14T07:14:38Z · close-out gate completed in 127s
- 2026-11-14T07:14:54Z · status done→done, release:success
