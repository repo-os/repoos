---
handoff_signal_retry_count: 1
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
updated_at: "2026-11-17T19:23:13Z"
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

