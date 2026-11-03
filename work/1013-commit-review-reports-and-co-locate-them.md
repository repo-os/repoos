---
id: 1013
title: Commit review reports and co-locate them with engineering reports
type: feature
status: active
priority: p2
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/commit-review-reports-and-co-locate-them
created_at: "2026-11-03T05:23:01Z"
updated_at: "2026-11-03T14:34:27Z"
handoff_signal_retry_count: 1
dev_error_count: 1
engineer_crash_log: "[{\"cli\":\"opencode\",\"model\":\"opencode-go/deepseek-v4.1-flash\",\"at\":\"2026-11-03T09:38:49.222Z\",\"kind\":\"dev-error\"}]"
---
## Problem
Engineering reports are committed under `work/engineering-reports/<id>/round-N.json`. Review reports live in gitignored cache (`.repoos/reviews/<id>/`), so they vanish with the machine and future agents/humans never see why a task went through several rounds. Both are essential history of one loop (engineer changes, writes report, reviewer reviews, repeat) and should be tracked together.

## Desired UX
- Review reports are committed in the repo, in the same per-task place as engineering reports (e.g. `work/reports/<id>/` with engineer and review rounds side by side, or interleaved by round). Migrate existing engineering reports (only #0997 so far) and keep readers (Dev/Review tabs, reviewer's "earlier reports" lookup in `review.ts`) working.
- Landable Task scope check, close-out, and handoff-drift rules treat both report kinds as this task's own bookkeeping, never another task's.
- Dev tab UI fix: the new engineering Chat/Report view is not laid out like the Review tab. Reuse the Review tab's layout and styling exactly (screenshots attached: the Review tab, and the Dev tab as it is now). Report goes on the LEFT and Chat on the RIGHT of the sub-tab selector, and the model/agent selector row sits ABOVE the selector so it is always visible.

## Acceptance criteria
- [ ] Review reports are written to the shared tracked location and survive a fresh clone.
- [ ] Engineering and review reports for one task live together; existing files migrated, parser reads old locations.
- [ ] Committing a review report does not invalidate the review lock (lock sha vs worktree HEAD), nor trip the Move to done drift check or the "worktree clean" check; add tests.
- [ ] Task scope exemption in `isForbiddenTaskScopePath` covers the new location, still fails for other tasks' reports.
- [ ] `user-docs/engineering-reports.md`, review docs and AGENTS.md updated where they describe locations.

## Notes for AI
Main design risk: the review lock records the reviewed HEAD sha, so committing the review report after the review moves HEAD. Decide whether the report commit is excluded from the lock/drift comparison (like `work/*.md`-only commits, #0600) or written by close-out. See `src/server/review.ts` (~line 488), `src/server/engineering-reports.ts`, `src/core/landable.ts`.

## Shots
```json
[
{
"label": "Dev tab: model/agent row above the Report-left/Chat-right selector",
"target": "default",
"route": "/work?task=0997&tab=agent",
"highlight": ".review-toolbar"
}
]
```

## Screenshots

![Review tab: model row above, REPORT left / CHAT right (the layout to copy)](/api/tasks/1013/attachments/att_a9fa8210-fdaf-49ca-a91c-56d0d069efec.png)
![Dev tab today: Chat left / Report right, model row below the selector (to fix)](/api/tasks/1013/attachments/att_12e255b3-f63f-4d94-95a5-aff5091335f9.png)

## Activity

- 2026-11-03T05:23:01Z · created · njachowski@gmail.com
- 2026-11-03T05:53:32Z · status inbox→ready
- 2026-11-03T05:53:35Z · status ready→active, branch
- 2026-11-03T05:55:37Z · body: Desired UX (added 1)
- 2026-11-03T05:55:37Z · message_queued at 2026-11-03T05:55:37.514Z
- 2026-11-03T05:55:38Z · screenshots
- 2026-11-03T05:55:39Z · screenshots
- 2026-11-03T05:55:43Z · message_queued at 2026-11-03T05:55:43.965Z
- 2026-11-03T05:57:43Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-03T07:05:09Z · message_overdue: still queued after 60m without being delivered
- 2026-11-03T07:12:21Z · body
- 2026-11-03T07:28:48Z · engineer stopped by request
- 2026-11-03T07:28:55Z · message_delivered: 2 message(s)
- 2026-11-03T07:33:02Z · body
- 2026-11-03T07:42:35Z · message_queued at 2026-11-03T07:42:35.381Z
- 2026-11-03T07:42:35Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-03T07:47:35Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-03T07:53:32Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-03T07:57:11Z · engineer stopped by request
- 2026-11-03T07:57:44Z · message_delivered: 1 message(s)
- 2026-11-03T07:59:22Z · body
- 2026-11-03T08:41:23Z · note: adopted orphaned engineer pid 47491
- 2026-11-03T08:48:50Z · body
- 2026-11-03T08:51:22Z · CTO nudge: held — remote validation is running
- 2026-11-03T09:03:32Z · note: click [data-test-id="engineering-report-tab"]: click: Timeout 5000ms exceeded. on /work?task=0997&tab=agent
- 2026-11-03T09:03:32Z · note: highlight .review-pane-tabs matched nothing on /work?task=0997&tab=agent
- 2026-11-03T09:11:22Z · message_queued at 2026-11-03T09:11:22.095Z
- 2026-11-03T09:11:22Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-03T09:14:15Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-03T09:28:06Z · body
- 2026-11-03T09:29:17Z · watchdog: check wait escalated · waiting: waiting for a Playwright slot — position 2 (1 ahead); slot holder has made no progress for 30 minutes (no heartbeat) for 7s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-03T09:31:02Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-03T09:36:37Z · body
- 2026-11-03T09:38:48Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-03T09:38:49Z · agent exited with an error (opencode) · ✗ handoff deferred — read the queued message(s) first, then request review again
- 2026-11-03T09:38:49Z · engineer crash recovery: resuming opencode + opencode-go/deepseek-v4.1-flash (1/3 crashes in 30m) · ✗ handoff deferred — read the queued message(s) first, then request review again
- 2026-11-03T09:39:07Z · needs_input
- 2026-11-03T09:39:08Z · message_delivered: 1 message(s)
- 2026-11-03T09:39:39Z · watchdog: check wait escalated · waiting: waiting for a local check slot (2 ahead, position 3); waiting behind #1004 check (pid 14438, alive), #1005 check (pid 80663, alive); slot holder has made no progress for 30 minutes (no heartbeat) for 9s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-03T09:46:09Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-03T09:47:56Z · watchdog: check wait escalated · waiting: waiting for a local check slot (2 ahead, position 3); waiting behind #1004 check (pid 99152, alive), #1005 check (pid 80663, alive); slot holder has made no progress for 30 minutes (no heartbeat) for 3s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-03T09:50:56Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-03T09:51:11Z · watchdog: check wait escalated · waiting: waiting for a local check slot (2 ahead, position 3); waiting behind #1004 check (pid 2771, alive), #1005 check (pid 80663, alive); slot holder has made no progress for 30 minutes (no heartbeat) for 14s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-03T09:52:56Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-03T10:00:50Z · body
- 2026-11-03T10:12:18Z · CTO nudge: held — machine under pressure (system load is high (8.5× per CPU, limit 3×) — waiting for headroom before starting more work)
- 2026-11-03T10:22:17Z · message_queued at 2026-11-03T10:22:17.170Z
- 2026-11-03T10:22:17Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-03T10:27:12Z · body
- 2026-11-03T10:27:17Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-03T10:28:19Z · watchdog: check wait escalated · waiting: waiting for a Playwright slot — position 2 (1 ahead); slot holder has made no progress for 30 minutes (no heartbeat) for 9s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-03T10:29:04Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-11-03T13:53:28Z · note: stopped orphaned engineer pid 55099
- 2026-11-03T14:04:25Z · message_overdue: still queued after 60m without being delivered
- 2026-11-03T14:34:27Z · watchdog: restarting engineer after 27m with no live process
