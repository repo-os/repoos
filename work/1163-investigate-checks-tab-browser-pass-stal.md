---
id: "1163"
title: Investigate Checks tab browser pass stall
type: bug
status: review
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/investigate-checks-tab-browser-pass-stal
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-17T17:53:05Z"
updated_at: "2026-11-17T20:18:23Z"
handoff_signal_retry_count: 2
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
