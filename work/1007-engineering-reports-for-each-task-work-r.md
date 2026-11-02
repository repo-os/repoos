---
id: 1007
title: Engineering reports for each task work round
type: feature
status: active
priority: p2
area: [core, server, web]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/engineering-reports-for-each-task-work-r
created_at: "2026-11-01T18:38:06Z"
updated_at: "2026-11-02T08:28:04Z"
review_rounds: 1
routing_switches: 1
review_passes: 1
last_check_failure: "repoos check at 2026-11-02T07:06:52.240Z: repoos check failed: ui verification failed (2 issue(s)): [request] HTTP 404 for http://127.0.0.1:49479/api/tasks/9999/engineering-reports (http://127.0.0.1:49479/api/tasks/9999/engineering-reports); [request] Failed to load resource: the server responded with a status of 404 (Not Found) (http://127.0.0.1:49479/api/tasks/9999/engineering-reports)"
---
## Problem

Task history shows the final diff and review verdict, but it does not preserve why the engineer chose an approach, what alternatives or failed attempts they tried, what blockers they encountered, or which lessons will help the next engineer. Reviewers often lack that context when assessing the implementation.

## Desired UX

At the end of each engineering round, the engineer produces a concise, durable report after the round’s checks pass and before requesting review. The reviewer reads that report as part of the review. The task Dev tab gains a Report / Chat toggle and a table of engineering rounds, presented consistently with the existing review history.

Each report starts with a TL;DR, then explains what changed and why, approaches tried and what worked or did not, issues or blockers, and useful learnings for future engineers. Aim for 500–600 words and enforce a maximum of 1,000 words. Include a deterministic change summary listing files changed and lines added/removed per file for that round; compute it from recorded Git trees rather than asking the model to count or author it.

## Acceptance criteria

- Persist one report per engineering round as a task-associated, durable artifact that remains available to reviewers and future engineers after the task is merged into main.
- Record round identity, timestamp, coding agent, model, and source-tree identifiers needed to relate the report to the reviewed change.
- Generate the report after the round’s checks pass and before handoff. Ensure it is included in the review context and cannot silently describe a different source tree than the one being reviewed; handle another engineering round after review feedback as a separate report.
- Use a concise report template with TL;DR first, work and rationale, attempted approaches and outcomes, challenges/blockers, and key learnings. Target 500–600 words, with a hard 1,000-word maximum and clear handling when the report exceeds it.
- Generate the changed-file list and per-file line additions/deletions deterministically from the round’s recorded base and final trees, including file additions, deletions, and renames. Keep this generated section distinct from the engineer-authored narrative.
- Require reviewers to read the report and consider its rationale, experiments, and known limitations when producing their review verdict.
- Add a Report / Chat toggle in the task Dev tab and a table of reports with at least round/pass, time, engineer/coding agent, and model. Selecting a row opens the report in a presentation consistent with the Review tab’s reports.
- Test report creation and reviewer delivery, deterministic diff summaries, retries and multiple rounds, missing or stale reports, word limits, and report selection in the UI. Document the lifecycle and report format.

## Notes for AI
Inspect the engineer session lifecycle, handoff checkpoint/commit flow, reviewer prompt construction, and task Dev and Review tabs before choosing storage or UI changes. Keep one immutable report per engineering round and tie it to the exact source diff the reviewer sees. Use RepoOS-managed task/report APIs and lifecycle hooks; do not hand-edit work task files or infer Git line counts from agent prose. Make the report durable in the repository after close-out, and ensure report generation cannot make a passing source check appear to validate a different tree. Preserve reports across review feedback rounds and keep legacy tasks without reports reviewable. Update the engineering and reviewer instructions plus user docs. Run the scoped check before handoff.

## Shots
```json
[
{
"label": "Engineering report history in the task Dev tab",
"target": "default",
"route": "/work?task=1007&tab=agent",
"highlight": "[data-test-id=\"engineering-report-tab\"]",
"steps": [
{
"click": "[data-test-id=\"engineering-report-tab\"]"
},
{
"waitMs": 300
}
]
}
]
```

## Activity

- 2026-11-01T18:38:06Z · created · njachowski@gmail.com
- 2026-11-01T18:38:07Z · needs_input
- 2026-11-01T18:38:31Z · needs_input, body: Notes for AI (added)
- 2026-11-01T18:38:54Z · status inbox→ready
- 2026-11-02T02:14:13Z · status ready→active, branch
- 2026-11-02T02:25:09Z · body
- 2026-11-02T02:30:50Z · message_queued at 2026-11-02T02:30:50.063Z
- 2026-11-02T02:30:50Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-02T02:35:50Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-02T02:41:16Z · body
- 2026-11-02T02:45:17Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-02T02:45:18Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-11-02T02:45:18Z · message_delivered: 1 message(s)
- 2026-11-02T02:45:29Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-11-02T02:54:08Z · CTO action: restart-stalled-agent (fresh) · agent exited without emitting the handoff signal
- 2026-11-02T03:05:54Z · body
- 2026-11-02T03:15:24Z · body
- 2026-11-02T03:16:18Z · engineer stopped by request
- 2026-11-02T03:17:53Z · held, held-reason, held-at
- 2026-11-02T03:54:12Z · released
- 2026-11-02T03:55:36Z · engineer stopped by request
- 2026-11-02T03:55:37Z · held, held-reason, held-at
- 2026-11-02T04:16:30Z · released
- 2026-11-02T04:25:03Z · message_queued at 2026-11-02T04:25:03.601Z
- 2026-11-02T04:25:03Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-02T04:30:03Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-02T04:33:29Z · body
- 2026-11-02T04:46:17Z · body
- 2026-11-02T04:48:58Z · body
- 2026-11-02T04:49:16Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-02T04:49:16Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-11-02T04:49:16Z · message_delivered: 1 message(s)
- 2026-11-02T05:00:36Z · body
- 2026-11-02T05:02:23Z · watchdog: check wait escalated · waiting: waiting for a Playwright slot — position 2 (1 ahead); slot holder has made no progress for 30 minutes (no heartbeat) for 4s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-02T05:03:38Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-02T05:04:16Z · body
- 2026-11-02T05:13:38Z · handoff failed · remote validation failed: test failure: tests/server-git-blocking-guard.test.ts > server git blocking guard > does not import and call synchronous Git read helpers from server code on bee — fix it in the feature branch and re-run the gate
- 2026-11-02T05:13:40Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/server-git-blocking-guard.test.ts > server git blocking guard > does not import and call synchronous Git read helpers from server code on bee — fix it in the feature branch and re-run the gate · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-11-02T05:13:40Z · note: handoff requested (cli)
- 2026-11-02T05:23:12Z · handoff failed · task-file handoff failed at check · remote validation failed: test failure: tests/server-git-blocking-guard.test.ts > server git blocking guard > does not import and call synchronous Git read helpers from server code on thinkpad — fix it in the feature branch and re-run the gate
- 2026-11-02T05:30:10Z · CTO action: restart-stalled-agent (resume) · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/server-git-blocking-guard.test.ts > server git blocking guard > does not import and call synchronous Git read helpers from server code on bee — fix it in the feature branch and re-run the gate
- 2026-11-02T05:40:04Z · message_queued at 2026-11-02T05:40:04.492Z
- 2026-11-02T05:40:04Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-02T05:41:38Z · body
- 2026-11-02T05:45:04Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-02T05:55:15Z · body
- 2026-11-02T05:57:39Z · body
- 2026-11-02T06:08:37Z · body
- 2026-11-02T06:10:49Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-02T06:10:49Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-11-02T06:10:49Z · message_delivered: 1 message(s)
- 2026-11-02T06:11:45Z · watchdog: check wait escalated · waiting: waiting for a Playwright slot — position 2 (1 ahead); slot holder has made no progress for 30 minutes (no heartbeat) for 6s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-02T06:12:15Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-02T06:35:57Z · note: ui verification failed (2 issue(s)): [missing-target] Task Dev tab with engineering report history (target "default"): state "drawer:reviewWithBranch" did not render on target "default" — /work?task=1007&tab=dev has no open drawer/dialog (declare the route that opens it, e.g. /work?task=9999&tab=changes) (http://127.0.0.1:61925/work?task=1007&tab=dev&shotState=drawer%3AreviewWithBranch); [missing-target] Task Dev tab with engineering report history (target "default"): highlight [data-test-id="en
- 2026-11-02T06:37:04Z · body
- 2026-11-02T06:45:04Z · message_queued at 2026-11-02T06:45:04.466Z
- 2026-11-02T06:45:04Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-02T06:48:15Z · body
- 2026-11-02T06:50:04Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-02T06:50:06Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-02T06:50:06Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-11-02T06:50:07Z · message_delivered: 1 message(s)
- 2026-11-02T07:06:48Z · note: ui verification failed (2 issue(s)): [request] HTTP 404 for http://127.0.0.1:49479/api/tasks/9999/engineering-reports (http://127.0.0.1:49479/api/tasks/9999/engineering-reports); [request] Failed to load resource: the server responded with a status of 404 (Not Found) (http://127.0.0.1:49479/api/tasks/9999/engineering-reports)
- 2026-11-02T07:07:12Z · body
- 2026-11-02T07:14:05Z · note: adopted orphaned engineer pid 96547
- 2026-11-02T07:18:35Z · body
- 2026-11-02T07:51:12Z · status active→review
- 2026-11-02T07:52:01Z · note: review pass 1: needs some work
- 2026-11-02T07:52:02Z · status review→active
- 2026-11-02T07:52:04Z · CTO nudge: held — remote validation is running
- 2026-11-02T08:10:09Z · body
- 2026-11-02T08:19:03Z · message_queued at 2026-11-02T08:19:03.918Z
- 2026-11-02T08:19:04Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-02T08:24:03Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-02T08:24:43Z · body
- 2026-11-02T08:28:04Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-02T08:28:04Z · message_delivered: 1 message(s)
