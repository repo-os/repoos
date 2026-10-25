---
id: "0952"
title: "Task side panel: one top-line chip, at most one card and one status line above the tabs, help text in info popovers"
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/task-side-panel-one-top-line-chip-at-mos
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-10-24T23:16:59Z"
updated_at: "2026-10-25T11:47:09Z"
check_retry_count: 2
last_check_failure: "repoos check at 2026-10-25T03:49:15.287Z: repoos check failed: server-side finalization timed out (deadline exceeded)"
handoff_signal_retry_count: 1
engineer_stall_resume_log: "[{\"at\":\"2026-10-25T02:27:40.464Z\",\"reason\":\"clean-exit-without-handoff\"}]"
dev_error_count: 11
engineer_crash_log: "[{\"cli\":\"cursor\",\"model\":\"composer-2.5\",\"at\":\"2026-10-25T09:42:35.946Z\",\"kind\":\"dev-error\"},{\"cli\":\"cursor\",\"model\":\"composer-2.5\",\"at\":\"2026-10-25T09:43:29.158Z\",\"kind\":\"dev-error\"}]"
---
## Problem

The task side panel gets cluttered when a task reaches review or hits issues. Examples are in the attached screenshots (#0943, #0945, #0947, #0950):

- The top line (task number, file name, priority) fills up with long, low-value chips: "CHECKS PASSED · 37S", "CHECKS FAILED · 4M 15S", "Reviewer failed — no report", "REVIEW FINDINGS", "CHECKS RUNNING ON REMOTE HOST · STEP — · TESTS 6/595 FILES · 2M 47S". The line is too small for sentences, so the file name wraps to many lines (one screenshot has it 8 lines tall).
- Large cards stack above the tabs ("Not moved to review...", "Not landable yet", "WAITING FOR YOU", "TL;DR — WHAT HAPPENED", the remote-handoff run text), several at once, pushing the tabs far down the panel.
- Cards end with canned explanatory paragraphs ("Read the latest review report, then send it to the engineer...", "Try Review again from the Review tab...", "This task stays active until the checks pass.") that take up space on every view.
- Status cards appear in inconsistent places, sometimes splitting the rows above the preview line.

## Desired UX

1. Top line (task number, file name, priority): at most ONE dynamic chip, a few words max (for example "Checks failed", "Reviewer timed out", "Needs input"), never a sentence, no durations, and never a chip that restates the status already shown (do not show "Review findings" when the task is in Review). Success and routine facts ("Checks passed · 37s") are not chips at all: they live in the Review / Debug / log tabs. A duration only appears, as a red/warning treatment on the chip, when it was longer than expected. The file name is never more than 2 lines; if it would be, the chip is too long.
2. Anything longer than a few words goes BELOW the preview line and ABOVE the tabs, never above the preview line and never splitting the rows above it. This is the only region where status content may appear.
3. At most ONE card plus ONE status line in that region. The card is the single most important thing (for example the "Waiting for you" card, or the landable summary, or the failure), and the status line is a one-liner like "Confirming handoff · active just now" or "Running repoos check… (progress bar)". If several states apply, show the highest-priority card and fold the rest into it as short lines or into the tabs; define the priority order in one place.
4. No canned help paragraphs in cards. Replace "Read the latest review report…", "Try Review again…", "This task stays active until the checks pass" and similar with a small info icon (keyboard-focusable, works on touch) that opens a styled popover with that text. Do not use a native title tooltip (AGENTS.md convention).
5. The TL;DR "what happened" content is merged into the one card or moved behind the info popover; it must not be a separate large card.

## Acceptance criteria

- [ ] The top line shows at most one dynamic chip of a few words, with no duration (except a red over-expected-duration treatment), and never restates the current status.
- [ ] "Checks passed · Ns", "Review findings", "Checks failed · 4m 15s", "Reviewer failed — no report" style chips are gone or reduced to a short label; their detail is available in the log/Review/Debug tabs.
- [ ] The file name wraps to at most 2 lines at the panel widths in the screenshots, and the layout is verified at narrow and wide panel widths.
- [ ] All status cards render only between the preview line and the tabs; nothing renders between the title/state rows and the preview line.
- [ ] At most one card and one status line are visible in that region at any time, chosen by a single documented priority function with a unit test covering the combinations seen in the screenshots (review failed no report, not landable, handoff failed, checks running, confirming handoff, checks failed after retries, waiting for you).
- [ ] All canned explanatory paragraphs are replaced by an info icon with an accessible popover (keyboard focus, touch, `data-overlay-layer` where teleported); no native title tooltips.
- [ ] Existing actions (Send to engineer, Review again, Dismiss, Restart work, Move to done) remain reachable from the one card.
- [ ] Declare `## Shots` with the drawer states from the screenshots (review failed, not landable, checks running, confirming handoff, checks failed after retries) at a normal and a narrow panel width, and look at them yourself.
- [ ] Update affected tests and user-docs; the contrast audit and hard-coded-color guard pass in all themes.

## Notes for AI

- The panel is `src/ui-app/src/components/TaskDrawer.vue` (large) and its sub-components; find where the top-line chips and the status cards are produced and consolidate them behind one status-summary computation rather than editing each card.
- Do not change what the server reports; this is presentation and priority only.
- #0950 and #0951 edit views and style.css; keep style.css edits small and merge main often.
- Run every test touching the drawer in small groups, then `repoos check --changed main`.

## Where the removed detail goes
Nothing that is removed from the top line or from the cards above the tabs may become unreachable. Add a new sub-tab in the Debug tab (for example "Status details" or "Why is this task here?") that lists every status and issue card and chip that used to appear above the tabs: the review-failed / no-report detail, the not-landable checklist, handoff and remote-validation failures, checks running/progress, retries exhausted, the TL;DR what-happened text, and the full canned guidance paragraphs. The info popovers in the panel can link to it. Acceptance: that Debug sub-tab shows all of those states with their full text and actions' hints, driven by the same status data, and has a test and a shot.

## Shots
```json
[
{
"label": "statusReviewFailed status at 1280px",
"target": "default",
"route": "/work?task=9999&tab=details",
"highlight": ".drawer-pre-tabs",
"state": "drawer:statusReviewFailed",
"viewportWidth": 1280
},
{
"label": "statusReviewFailed status at 760px",
"target": "default",
"route": "/work?task=9999&tab=details",
"highlight": ".drawer-pre-tabs",
"state": "drawer:statusReviewFailed",
"viewportWidth": 760
},
{
"label": "statusHandoffFailed status at 1280px",
"target": "default",
"route": "/work?task=9999&tab=details",
"highlight": ".drawer-pre-tabs",
"state": "drawer:statusHandoffFailed",
"viewportWidth": 1280
},
{
"label": "statusHandoffFailed status at 760px",
"target": "default",
"route": "/work?task=9999&tab=details",
"highlight": ".drawer-pre-tabs",
"state": "drawer:statusHandoffFailed",
"viewportWidth": 760
},
{
"label": "statusChecksRunning status at 1280px",
"target": "default",
"route": "/work?task=9999&tab=details",
"highlight": ".drawer-pre-tabs",
"state": "drawer:statusChecksRunning",
"viewportWidth": 1280
},
{
"label": "statusChecksRunning status at 760px",
"target": "default",
"route": "/work?task=9999&tab=details",
"highlight": ".drawer-pre-tabs",
"state": "drawer:statusChecksRunning",
"viewportWidth": 760
},
{
"label": "statusConfirmingHandoff status at 1280px",
"target": "default",
"route": "/work?task=9999&tab=details",
"highlight": ".drawer-pre-tabs",
"state": "drawer:statusConfirmingHandoff",
"viewportWidth": 1280
},
{
"label": "statusConfirmingHandoff status at 760px",
"target": "default",
"route": "/work?task=9999&tab=details",
"highlight": ".drawer-pre-tabs",
"state": "drawer:statusConfirmingHandoff",
"viewportWidth": 760
},
{
"label": "statusChecksFailed status at 1280px",
"target": "default",
"route": "/work?task=9999&tab=details",
"highlight": ".drawer-pre-tabs",
"state": "drawer:statusChecksFailed",
"viewportWidth": 1280
},
{
"label": "statusChecksFailed status at 760px",
"target": "default",
"route": "/work?task=9999&tab=details",
"highlight": ".drawer-pre-tabs",
"state": "drawer:statusChecksFailed",
"viewportWidth": 760
},
{
"label": "Debug status details",
"target": "default",
"route": "/work?task=9999&tab=debug",
"highlight": ".debug-status-detail",
"steps": [
{
"click": "button[data-test-id=\"debug-tab-status\"]"
}
],
"state": "drawer:statusReviewFailed",
"viewportWidth": 1280
}
]
```

## Screenshots

![25](/api/tasks/0952/attachments/att_2aafd889-22f6-440a-afec-6e552e0a61e9.webp)
![26](/api/tasks/0952/attachments/att_15b67ed1-6e21-43de-9c1d-e56fdf5f128c.png)
![27](/api/tasks/0952/attachments/att_9bdca9d7-c3e7-4069-b6b5-8036d1557a50.png)
![28](/api/tasks/0952/attachments/att_e49a8f74-06ef-4c87-89b7-1b48f575b282.png)
![29](/api/tasks/0952/attachments/att_96536d88-947b-4b2c-9279-a82ee2310531.png)
![30](/api/tasks/0952/attachments/att_01cb47fc-4b2c-4d27-930f-33a45bbb86f7.png)
![31](/api/tasks/0952/attachments/att_c40fe1bc-06ea-4813-86b2-73c9f40fb982.png)

## Activity

- 2026-10-24T23:16:59Z · created · njachowski@gmail.com
- 2026-10-24T23:17:06Z · screenshots
- 2026-10-24T23:17:33Z · body: Where the removed detail goes (added)
- 2026-10-24T23:17:55Z · status inbox→ready
- 2026-10-24T23:18:01Z · cli_override, model_override
- 2026-10-24T23:18:02Z · status ready→active, branch
- 2026-10-24T23:19:29Z · body
- 2026-10-24T23:22:27Z · body
- 2026-10-24T23:23:26Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-24T23:35:48Z · body
- 2026-10-24T23:39:23Z · body
- 2026-10-24T23:51:07Z · handoff failed · remote validation failed: test failure: tests/done-error-placement.test.ts > move-to-done inline error placement > renders in the task panel below the Move to done button, tests/reviewer-thinking-state.test.ts > reviewer thinking state in the task panel (#0209) > labels a previous-round report and withholds sign-off while a new review is pending, tests/task-drawer-check-chip.test.ts > task drawer check chip (#0564) > starts with the local machine from the SSE event, then upgrades to the remote host when its durable row lands mid-gate on bee — fix it in the feature branch and re-run the gate
- 2026-10-24T23:55:54Z · message_queued at 2026-10-24T23:55:54.440Z
- 2026-10-24T23:56:53Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-24T23:59:08Z · body
- 2026-10-25T00:04:45Z · body
- 2026-10-25T00:08:24Z · body
- 2026-10-25T00:09:33Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-25T00:09:33Z · message_delivered: 1 message(s)
- 2026-10-25T00:22:03Z · body
- 2026-10-25T00:25:03Z · body
- 2026-10-25T00:26:31Z · body
- 2026-10-25T00:31:54Z · message_queued at 2026-10-25T00:31:54.176Z
- 2026-10-25T00:31:54Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-25T00:36:16Z · body
- 2026-10-25T00:36:54Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-25T00:37:21Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-25T00:37:21Z · message_delivered: 1 message(s)
- 2026-10-25T00:37:30Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-25T00:38:34Z · message_queued at 2026-10-25T00:38:34.195Z
- 2026-10-25T00:39:42Z · body
- 2026-10-25T00:41:48Z · body
- 2026-10-25T00:45:19Z · body
- 2026-10-25T00:46:31Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-10-25T00:46:32Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-25T00:46:32Z · message_delivered: 1 message(s)
- 2026-10-25T00:47:45Z · body
- 2026-10-25T00:48:22Z · body
- 2026-10-25T00:50:09Z · note: loading state detected: loading text "Loading changes…" on /work?task=9999&tab=changes
- 2026-10-25T00:51:55Z · CTO nudge: held — remote validation is running
- 2026-10-25T00:53:05Z · body
- 2026-10-25T00:55:21Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-25T00:57:01Z · note: loading state detected: loading text "Loading changes…" on /work?task=9999&tab=changes
- 2026-10-25T01:02:11Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 1/3 in 30m
- 2026-10-25T01:03:45Z · body
- 2026-10-25T01:04:19Z · body
- 2026-10-25T01:07:21Z · body
- 2026-10-25T01:16:48Z · body
- 2026-10-25T01:20:29Z · body
- 2026-10-25T01:21:34Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-25T01:26:46Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 2/3 in 30m
- 2026-10-25T01:28:44Z · body
- 2026-10-25T01:39:05Z · message_queued at 2026-10-25T01:39:05.680Z
- 2026-10-25T01:39:06Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-25T01:40:08Z · agent exited with an error (codex) · 2026-10-25T01:39:59.587995Z ERROR codex_core::session: failed to record rollout items: thread 01a170aa-dc7b-7231-a134-9b6e54862525 not found
- 2026-10-25T01:40:08Z · engineer crash recovery: resuming codex + gpt-6-luna (1/3 crashes in 30m) · 2026-10-25T01:39:59.587995Z ERROR codex_core::session: failed to record rollout items: thread 01a170aa-dc7b-7231-a134-9b6e54862525 not found
- 2026-10-25T01:40:12Z · message_delivered: 1 message(s)
- 2026-10-25T01:40:21Z · engineer crash recovery: resuming codex + gpt-6-luna (2/3 crashes in 30m) · Reading additional input from stdin...
- 2026-10-25T01:40:28Z · engineer crash recovery: surfaced instead of switching — a human-set task override (codex + gpt-6-luna) is pinned, so RepoOS did not replace it (3/3 crashes in 30m)
- 2026-10-25T01:47:26Z · cli_override, model_override
- 2026-10-25T01:47:59Z · needs_input
- 2026-10-25T01:47:59Z · message_queued at 2026-10-25T01:47:59.741Z
- 2026-10-25T01:50:06Z · body
- 2026-10-25T01:50:24Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-25T01:52:34Z · body
- 2026-10-25T01:52:56Z · body
- 2026-10-25T02:00:59Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-10-25T02:01:00Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-25T02:01:00Z · message_delivered: 1 message(s)
- 2026-10-25T02:05:41Z · body
- 2026-10-25T02:06:55Z · CTO nudge: held — remote validation is running
- 2026-10-25T02:10:44Z · body
- 2026-10-25T02:20:47Z · body
- 2026-10-25T02:21:31Z · body
- 2026-10-25T02:27:40Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 1/3 in 30m
- 2026-10-25T02:27:43Z · message_queued at 2026-10-25T02:27:43.811Z
- 2026-10-25T02:31:55Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-25T02:37:02Z · body
- 2026-10-25T02:38:32Z · body
- 2026-10-25T02:38:49Z · body
- 2026-10-25T02:39:09Z · body
- 2026-10-25T02:39:17Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-10-25T02:39:17Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-25T02:39:18Z · message_delivered: 1 message(s)
- 2026-10-25T02:41:29Z · body
- 2026-10-25T02:54:56Z · body
- 2026-10-25T03:01:56Z · message_queued at 2026-10-25T03:01:56.674Z
- 2026-10-25T03:01:58Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-25T03:03:31Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-25T03:06:23Z · body
- 2026-10-25T03:07:53Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-10-25T03:07:53Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review
- 2026-10-25T03:07:54Z · message_delivered: 1 message(s)
- 2026-10-25T03:10:33Z · body
- 2026-10-25T04:12:24Z · message_queued at 2026-10-25T04:12:24.058Z
- 2026-10-25T04:12:25Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-25T04:12:28Z · agent exited with an error (cursor) · RetriableError: Agent turn stopped after repeated resume attempts made no progress
- 2026-10-25T04:12:28Z · engineer crash recovery: resuming cursor + composer-2.5 (1/3 crashes in 30m) · RetriableError: Agent turn stopped after repeated resume attempts made no progress
- 2026-10-25T04:12:37Z · message_delivered: 1 message(s)
- 2026-10-25T04:12:42Z · engineer crash recovery: resuming cursor + composer-2.5 (2/3 crashes in 30m) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-10-25T04:12:56Z · engineer crash recovery: surfaced instead of switching — a human-set task override (cursor + composer-2.5) is pinned, so RepoOS did not replace it (3/3 crashes in 30m)
- 2026-10-25T05:07:59Z · cli_override, model_override
- 2026-10-25T05:30:55Z · cli_override, model_override
- 2026-10-25T05:30:59Z · cli_override
- 2026-10-25T05:31:00Z · model_override
- 2026-10-25T05:31:10Z · engineer stopped by request
- 2026-10-25T05:31:10Z · needs_input
- 2026-10-25T05:31:36Z · status active→ready
- 2026-10-25T05:31:37Z · engineer stopped by request
- 2026-10-25T05:31:44Z · status ready→active
- 2026-10-25T06:06:49Z · message_queued at 2026-10-25T06:06:49.204Z
- 2026-10-25T06:06:50Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-25T06:12:01Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-25T06:13:37Z · agent exited with an error (opencode) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-10-25T06:13:37Z · engineer crash recovery: resuming opencode + opencode-go/hy4-preview (1/3 crashes in 30m) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-10-25T06:13:38Z · message_delivered: 1 message(s)
- 2026-10-25T06:14:59Z · engineer crash recovery: resuming opencode + opencode-go/hy4-preview (2/3 crashes in 30m) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-10-25T06:16:30Z · engineer crash recovery: surfaced instead of switching — a human-set task override (opencode + opencode-go/hy4-preview) is pinned, so RepoOS did not replace it (3/3 crashes in 30m)
- 2026-10-25T08:52:04Z · cli_override, model_override
- 2026-10-25T08:52:14Z · needs_input
- 2026-10-25T08:52:16Z · message_queued at 2026-10-25T08:52:16.496Z
- 2026-10-25T08:53:54Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-25T09:08:56Z · body
- 2026-10-25T09:16:53Z · body
- 2026-10-25T09:42:35Z · agent exited with an error (cursor) · RetriableError: Agent turn stopped after repeated resume attempts made no progress
- 2026-10-25T09:42:35Z · engineer crash recovery: resuming cursor + composer-2.5 (1/3 crashes in 30m) · RetriableError: Agent turn stopped after repeated resume attempts made no progress
- 2026-10-25T09:43:09Z · message_delivered: 1 message(s)
- 2026-10-25T09:43:29Z · engineer crash recovery: resuming cursor + composer-2.5 (2/3 crashes in 30m) · Error: [unavailable] getaddrinfo ENOTFOUND api2.cursor.sh
- 2026-10-25T09:49:35Z · message_queued at 2026-10-25T09:49:35.605Z
- 2026-10-25T09:49:40Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-25T09:54:34Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-25T10:15:47Z · needs_input
- 2026-10-25T10:15:47Z · message_queued at 2026-10-25T10:15:47.735Z
- 2026-10-25T11:13:10Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: test failure: tests/done-error-placement.test.ts > move-to-done inline error placement > renders in the task panel below the Move to done button, tests/reviewer-thinking-state.test.ts > reviewer thinking state in the task panel (#0209) > labels a previous-round report and withholds sign-off while a new review is pending, tests/task-drawer-check-chip.test.ts > task drawer check chip (#0564) > starts with the local machine from the SSE event, then upgrades to the remote host when its durable row lands mid-gate on bee — fix it in the feature branch and re-run the gate · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-25T11:13:10Z · note: handoff requested (cli)
- 2026-10-25T11:13:20Z · message_overdue: still queued after 60m without being delivered
- 2026-10-25T11:28:06Z · message_overdue: still queued after 60m without being delivered
- 2026-10-25T11:29:30Z · cli_override, model_override
- 2026-10-25T11:29:32Z · message_delivered: 2 message(s)
- 2026-10-25T11:30:06Z · message_queued at 2026-10-25T11:30:06.975Z
- 2026-10-25T11:31:10Z · body
- 2026-10-25T11:34:20Z · CTO nudge: held — an undelivered message is already queued
- 2026-10-25T11:47:09Z · CTO nudge: held — an undelivered message is already queued
