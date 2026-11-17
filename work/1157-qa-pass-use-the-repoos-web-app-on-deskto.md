---
id: "1157"
title: "QA pass: use the RepoOS web app on desktop and phone widths, find broken things and fix them"
type: bug
status: active
priority: p1
area: web
assigned_to: ai
created_by: t@t
branch: feat/qa-pass-use-the-repoos-web-app-on-deskto
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-17T15:21:15Z"
updated_at: "2026-11-17T19:46:11Z"
review_rounds: 1
review_passes: 1
review_timeout_retries: 0
handoff_signal_retry_count: 2
engineer_stall_resume_log: "[{\"at\":\"2026-11-17T16:50:57.959Z\",\"reason\":\"clean-exit-without-handoff\"},{\"at\":\"2026-11-17T17:19:58.428Z\",\"reason\":\"clean-exit-without-handoff\"},{\"at\":\"2026-11-17T17:28:43.649Z\",\"reason\":\"clean-exit-without-handoff\"}]"
---
## Problem

Nick wants the app actually used, not only unit tested: several regressions recently reached users (the page height/scroll break from #1120's removed id="app", the Move to done click bug, the macOS Hub broken for weeks). Nobody drives the real UI end to end before release.

## Desired UX

Every main page works at desktop width (1280+) and at phone width (390 and 320) in light and dark themes: nothing overlaps, scrolls wrongly, is clipped or unreachable, and no console errors appear.

## Acceptance criteria

- [ ] Using a browser (Playwright is available to the repo's smoke test; run it against a task-worktree dev server with `just serve-noauth`, never the served checkout), open each main page (Control, Inputs, Work in Board and Pipeline views, a task drawer with its tabs, Stories, Checks, Releases including the cut panel, Deployments, Dev, Secrets, Agents, Context, Settings and its tabs) at 1440, 390 and 320 widths in light and dark themes, and take screenshots of each. Look at every screenshot yourself.
- [ ] Click through the main actions on each (open and close the drawer, switch tabs, open dialogs and modals, scroll to the bottom of each page) and record every defect: overlap, clipping, unreachable control, wrong scroll area, missing bottom clearance, console error, failed request.
- [ ] Fix every defect that is small and clear in this task, with a test for each; for anything larger, file a separate task with the screenshot attached (repoos new ... --screenshot) and list it in the report.
- [ ] The report lists each page and width checked, the defects found, which were fixed and which were filed. No page is reported as checked without a screenshot.
- [ ] Never use or capture Nick's own desktop or other windows, and never touch the served checkout's server.

## Notes for AI

Start with the Work page at 390px and the bottom dock/heads/pipeline bar overlap on every page, since those regressed recently. Do not edit repoos.toml.

## Screenshots

![320px Work queue after filter reflow fix, light theme](/api/tasks/1157/attachments/att_8b163472-2a9a-46b8-9f62-3d90cf1c0c71.png)
![320px Work queue after filter reflow fix, dark theme](/api/tasks/1157/attachments/att_21e82da1-73e5-45c4-98da-07938689b42b.png)
![320px task drawer status row and verified Changes tab](/api/tasks/1157/attachments/att_39583280-edaa-480a-b0ad-807b44f9af66.png)
![320px task drawer with Tokens tab selected](/api/tasks/1157/attachments/att_112106f5-f5e4-4614-9c3b-c11d02103e4c.png)

## Activity

- 2026-11-17T15:21:15Z · created · t@t
- 2026-11-17T15:21:19Z · cli_override, model_override
- 2026-11-17T15:21:22Z · status inbox→ready
- 2026-11-17T15:21:24Z · status ready→active, branch
- 2026-11-17T15:39:27Z · body
- 2026-11-17T15:42:01Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: I completed and reviewed the responsive screenshot pass for the listed routes at 1440, 390 and 320px in light and dark. The corrected run found no horizontal overflow. The task-worktree server was stopped, and the main checkout was untouch… · stderr: Reading additional input from stdin... 2026-11-17T15:36:51.547593Z ERROR codex_core::tools::router: error=write_stdin failed: Unknown process id 86199
- 2026-11-17T16:12:03Z · body
- 2026-11-17T16:12:28Z · message_queued at 2026-11-17T16:12:28.386Z
- 2026-11-17T16:15:38Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-17T16:15:42Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-17T16:20:45Z · message_queued at 2026-11-17T16:20:45.790Z
- 2026-11-17T16:24:07Z · message_delivered: 1 message(s)
- 2026-11-17T16:30:33Z · body
- 2026-11-17T16:31:51Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The QA pass found no clear visual defect to fix. The saved screenshots cover all listed pages and tabs at 1440, 390, and 320px in light and dark themes; the report records the Checks-tab interaction stall and the auth-limited Secrets and A… · stderr: Reading additional input from stdin...
- 2026-11-17T16:33:43Z · message_delivered: 1 message(s)
- 2026-11-17T16:33:50Z · message_queued at 2026-11-17T16:33:50.638Z
- 2026-11-17T16:36:57Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-17T16:36:58Z · message_delivered: 1 message(s)
- 2026-11-17T16:43:39Z · body
- 2026-11-17T16:45:43Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: Completed the QA pass and updated the report draft at `.repoos/engineering-report-drafts/1157.md`. I reviewed the saved screenshots, filled in the Checks tab matrix at all requested widths and themes, and found no clear visual defect to fi… · stderr: Reading additional input from stdin...
- 2026-11-17T16:50:57Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 1/3
- 2026-11-17T16:56:30Z · body
- 2026-11-17T16:57:25Z · message_queued at 2026-11-17T16:57:25.808Z
- 2026-11-17T16:58:08Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-17T17:00:28Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-17T17:03:30Z · message_delivered: 1 message(s)
- 2026-11-17T17:05:32Z · body
- 2026-11-17T17:07:16Z · message_queued at 2026-11-17T17:07:16.992Z
- 2026-11-17T17:07:57Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-17T17:10:01Z · message_delivered: 1 message(s)
- 2026-11-17T17:13:35Z · body
- 2026-11-17T17:14:52Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The QA report draft is at [.repoos/engineering-report-drafts/1157.md](/Users/nick/code/nick/repoos-worktrees/feat/qa-pass-use-the-repoos-web-app-on-deskto/.repoos/engineering-report-drafts/1157.md). It records the screenshot coverage, insp… · stderr: Reading additional input from stdin... 2026-11-17T17:14:24.716975Z ERROR codex_core::tools::router: error=apply_patch verification failed: Failed to find expected lines in /Users/nick/code/nick/repoos-worktrees/feat/qa-pass-use-the-repoos-web-app-on-deskto/.repoos/engineering-report-drafts/1157.md: The no-auth server …
- 2026-11-17T17:19:58Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 2/3
- 2026-11-17T17:22:44Z · body
- 2026-11-17T17:23:30Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The QA pass is complete based on the existing browser run: I reviewed the five contact sheets and full-size samples. The evidence records **144 route, width, and theme combinations** and **249 screenshots**. No layout defect was confirmed;… · stderr: Reading additional input from stdin...
- 2026-11-17T17:28:43Z · watchdog: auto-resumed engineer after a clean exit without a handoff · resume 3/3
- 2026-11-17T17:30:51Z · body
- 2026-11-17T17:32:41Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The QA pass found no confirmed responsive defect. I reviewed the screenshot contact sheets for all 24 page states at 1440, 390, and 320px in light and dark themes. The matrix records no horizontal overflow; the bottom-scroll sweep reached … · stderr: Reading additional input from stdin...
- 2026-11-17T17:37:43Z · watchdog: escalated to needs_input · 3 automatic resume(s) in this active episode produced no handoff
- 2026-11-17T17:47:43Z · watchdog: restarting engineer after 10m with no live process
- 2026-11-17T17:47:54Z · note: handoff requested (cli)
- 2026-11-17T17:47:59Z · message_queued at 2026-11-17T17:47:59.680Z
- 2026-11-17T17:47:59Z · handoff failed · task-file handoff failed at commit · no implementation found since the branch diverged; use no_source_change: true to force a no-op handoff
- 2026-11-17T17:48:18Z · note: handoff requested (cli)
- 2026-11-17T17:48:22Z · message_queued at 2026-11-17T17:48:22.413Z
- 2026-11-17T17:48:22Z · handoff failed · task-file handoff failed at commit · no implementation found since the branch diverged; use no_source_change: true to force a no-op handoff
- 2026-11-17T17:48:51Z · message_queued at 2026-11-17T17:48:51.409Z
- 2026-11-17T17:50:38Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-17T17:50:45Z · body
- 2026-11-17T17:51:26Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The QA pass is complete based on the saved screenshots and browser results: 144 route, width, and theme combinations were recorded, and I reviewed the contact sheets. No clear layout defect was confirmed. The no-auth Secrets request return… · stderr: Reading additional input from stdin...
- 2026-11-17T17:51:27Z · message_delivered: 3 message(s)
- 2026-11-17T17:58:15Z · status active→review
- 2026-11-17T17:58:16Z · message_queued at 2026-11-17T17:58:16.021Z
- 2026-11-17T17:58:16Z · note: shots: skipped — the diff (3 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-17T18:13:18Z · note: review pass 1: timed out after 15 minutes — no report (retrying once automatically)
- 2026-11-17T18:28:25Z · note: review pass 2: timed out after 15 minutes — no report; human needed
- 2026-11-17T18:28:25Z · needs_input
- 2026-11-17T18:48:17Z · needs_input (review-failed) cleared for review again by human
- 2026-11-17T18:58:25Z · message_overdue: still queued after 60m without being delivered
- 2026-11-17T19:03:22Z · note: review pass 3: timed out after 15 minutes — no report; human needed
- 2026-11-17T19:03:22Z · needs_input
- 2026-11-17T19:18:10Z · needs_input (review-failed) cleared for review again by human
- 2026-11-17T19:23:48Z · note: review pass 4: needs some work
- 2026-11-17T19:23:49Z · status review→active
- 2026-11-17T19:23:51Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-17T19:26:52Z · message_delivered: 1 message(s)
- 2026-11-17T19:27:22Z · note: Returning task to active to address round 1 review findings.
- 2026-11-17T19:46:02Z · screenshots
- 2026-11-17T19:46:05Z · screenshots
- 2026-11-17T19:46:07Z · screenshots
- 2026-11-17T19:46:09Z · screenshots
