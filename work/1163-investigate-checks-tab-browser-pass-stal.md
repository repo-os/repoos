---
id: "1163"
title: Investigate Checks tab browser pass stall
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/investigate-checks-tab-browser-pass-stal
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-17T17:53:05Z"
updated_at: "2026-11-17T21:19:33Z"
review_rounds: 2
review_passes: 2
handoff_signal_retry_count: 2
deferred_handoff_resume_count: 1
---
During task #1157 responsive QA, a Playwright pass attempted to visit Checks tabs Now, Runs, Test Suite and Check Plan across 1440, 390 and 320px in both themes. It captured the Now tab at 390px, then the repeated interaction/screenshot run slowed and was stopped before the other tabs were verified. The default Checks route works and rendered without a page exception in the main screenshot matrix, so this report does not establish a product regression. Reproduce tab navigation directly and determine whether the stall is in the app or in repeated screenshot capture; if a product issue reproduces, fix it with a regression test. Evidence attached.

## Problem
A QA browser pass over the Checks tabs (Now, Runs, Test Suite and Check Plan) slowed during repeated screenshot capture. Only Now at 390px was captured in that attempt. The default Checks route rendered in the main matrix without an app page exception, so this is an incomplete interaction check rather than a confirmed product regression.

## Desired UX
All Checks tabs can be navigated and inspected at desktop and phone widths without the app becoming unresponsive.

## Acceptance criteria
Reproduce direct tab clicks and page navigation without repeated screenshots. Verify Now, Runs, Test Suite and Check Plan at representative desktop and narrow widths. Determine whether the stall is in the app or the browser capture harness. Fix and add a regression test if an app defect reproduces; otherwise document that conclusion.

## Notes for AI
Screenshot shows the Checks Now tab at 390px. The attempt captured the main page successfully, then slowed while iterating other tabs and screenshots. Treat this as a report of an incomplete pass until direct interaction reproduces an app fault.

## Investigation outcome
The direct tab pass found no navigation hang. Review identified a separate app lifecycle defect: the Checks page kept polling /api/local-check-slots every 5 seconds after unmount. The interval is now cleared on teardown, and a fake-timer test verifies no request fires after unmount. The headless WebKit pass exercised the built Checks page through Now, Runs, Test suite and Check plan at 1440, 390 and 320px in both light and dark mode; all routes and selected tabs matched, and no horizontal overflow or page exception occurred. The original repeated-capture slowdown remains unattributed and is open as follow-up work; this investigation does not claim that the capture harness caused it.

## Screenshots

![Checks Now tab at 390px; remaining tab pass stalled](/api/tasks/1163/attachments/att_74d71204-0ee4-4123-b20c-1b5a9abd7d7d.png)

## Activity

- 2026-11-17T17:53:05Z · created · t@t
- 2026-11-17T17:53:05Z · screenshots
- 2026-11-17T17:53:07Z · needs_input
- 2026-11-17T17:53:52Z · body: Problem (added)
- 2026-11-17T17:53:57Z · body: Desired UX (added)
- 2026-11-17T17:54:02Z · body: Acceptance criteria (added)
- 2026-11-17T17:54:07Z · body: Notes for AI (added)
- 2026-11-17T19:17:49Z · cli_override, model_override
- 2026-11-17T19:17:56Z · status inbox→ready
- 2026-11-17T19:17:59Z · status ready→active, needs_input, branch
- 2026-11-17T19:23:13Z · message_queued at 2026-11-17T19:23:13.390Z
- 2026-11-17T19:23:51Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-17T19:28:26Z · body
- 2026-11-17T19:28:55Z · queued message undelivered for 6m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-17T19:28:57Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code unknown) · last assistant: Remote validation hit a stale incremental bundle base, then retried with a full bundle and is now cloning it for build and tests. The retry is proceeding normally so far; I’m continuing to wait for the actual check verdict. · stderr: Reading additional input from stdin...
- 2026-11-17T19:34:14Z · message_queued at 2026-11-17T19:34:14.033Z
- 2026-11-17T19:39:28Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-11-17T19:39:30Z · note: handoff requested (cli)
- 2026-11-17T19:40:40Z · CTO nudge: held — handoff gate is running
- 2026-11-17T19:42:26Z · message_queued at 2026-11-17T19:42:26.196Z
- 2026-11-17T19:42:26Z · handoff failed · task-file handoff failed at review · Engineering report draft is missing: .repoos/engineering-report-drafts/1163.md
- 2026-11-17T19:45:39Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-17T19:47:51Z · message_queued at 2026-11-17T19:47:51.789Z
- 2026-11-17T19:53:07Z · message_delivered: 1 message(s)
- 2026-11-17T19:56:22Z · body
- 2026-11-17T19:57:34Z · handoff_deferred: 3 queued message(s) must be read before review
- 2026-11-17T19:57:35Z · message_queued at 2026-11-17T19:57:35.118Z
- 2026-11-17T19:57:35Z · ↻ resuming engineer to read queued message
- 2026-11-17T19:57:35Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The remote validation has now passed, including the changed UI tests and the headless browser gate. Local formatting, lint, build, CSS checks and rendered contrast also passed; the final local UI smoke check is running. Once it completes, … · stderr: 2026-11-17T19:53:08.801845Z ERROR codex_core::util: Custom tool call output is missing for call id: call_523f4daeb65c4913a4d0147d011d945e 2026-11-17T19:53:16.617210Z ERROR codex_core::util: Custom tool call output is missing for call id: call_523f4daeb65c4913a4d0147d011d945e 2026-11-17T19:53:21.197654Z ERROR codex_cor…
- 2026-11-17T20:04:21Z · message_delivered: 4 message(s)
- 2026-11-17T20:07:38Z · body
- 2026-11-17T20:08:36Z · CTO nudge: held — handoff gate is running
- 2026-11-17T20:18:23Z · status active→review
- 2026-11-17T20:18:23Z · message_queued at 2026-11-17T20:18:23.330Z
- 2026-11-17T20:18:23Z · note: shots: skipped — the diff (3 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-17T20:23:49Z · note: review pass 1: needs some work
- 2026-11-17T20:23:49Z · message_delivered: 1 message(s)
- 2026-11-17T20:23:49Z · status review→active
- 2026-11-17T20:25:47Z · body: Investigation outcome (added)
- 2026-11-17T20:25:47Z · message_queued at 2026-11-17T20:25:47.838Z
- 2026-11-17T20:29:13Z · body
- 2026-11-17T20:30:42Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-17T20:32:08Z · body
- 2026-11-17T20:33:41Z · handoff_deferred: 1 queued message(s) must be read before review
- 2026-11-17T20:33:41Z · message_queued at 2026-11-17T20:33:41.191Z
- 2026-11-17T20:33:41Z · ↻ resuming engineer to read queued message
- 2026-11-17T20:33:41Z · message_delivered: 2 message(s)
- 2026-11-17T20:39:45Z · CTO nudge: held — handoff gate is running
- 2026-11-17T20:51:35Z · note: ui verification passed: 1 shot captured with clean console
- 2026-11-17T20:51:37Z · status active→review
- 2026-11-17T20:51:38Z · message_queued at 2026-11-17T20:51:38.027Z
- 2026-11-17T20:53:14Z · note: review pass 2: needs some work
- 2026-11-17T20:53:14Z · status review→active
- 2026-11-17T20:53:17Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-17T20:58:26Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — task-file handoff failed at review · Engineering report draft is missing: .repoos/engineering-report-drafts/1163.md · next step: the handoff signal may not have been detected — ask the agent to put `::repoos-handoff-ready::` at the start of a line (preferably alone) after checks pass
- 2026-11-17T20:58:27Z · note: handoff requested (cli)
- 2026-11-17T20:59:18Z · CTO nudge: held — handoff gate is running
- 2026-11-17T21:07:48Z · message_delivered: 1 message(s)
- 2026-11-17T21:12:45Z · note: ui verification passed: 1 shot captured with clean console
- 2026-11-17T21:12:46Z · message_queued at 2026-11-17T21:12:46.728Z
- 2026-11-17T21:12:46Z · handoff failed · task-file handoff failed at review · Engineering report draft is missing: .repoos/engineering-report-drafts/1163.md
- 2026-11-17T21:15:26Z · body: Investigation outcome (added 1, removed 1)
- 2026-11-17T21:15:26Z · message_queued at 2026-11-17T21:15:26.572Z
- 2026-11-17T21:15:43Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-17T21:17:25Z · body
- 2026-11-17T21:18:50Z · handoff_deferred: 2 queued message(s) must be read before review
- 2026-11-17T21:18:50Z · message_queued at 2026-11-17T21:18:50.388Z
- 2026-11-17T21:18:50Z · ↻ resuming engineer to read queued message
- 2026-11-17T21:18:50Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The scoped check passed, including the remote tests and UI smoke gate. The smoke pass now directly navigates all four Checks tabs at 1440, 390, and 320px in light and dark themes; the original repeated-screenshot slowdown itself remains un… · stderr: 2026-11-17T21:07:50.019191Z ERROR codex_core::util: Custom tool call output is missing for call id: call_523f4daeb65c4913a4d0147d011d945e 2026-11-17T21:08:07.632226Z ERROR codex_core::util: Custom tool call output is missing for call id: call_523f4daeb65c4913a4d0147d011d945e 2026-11-17T21:08:14.705900Z ERROR codex_cor…
- 2026-11-17T21:19:33Z · message_delivered: 3 message(s)
