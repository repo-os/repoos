---
id: "1093"
title: "Release email: send-to-self test"
type: chore
status: active
priority: p3
area: server
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/release-email-send-to-self-test
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-11T05:28:23Z"
updated_at: "2026-11-13T09:55:19Z"
---
## Problem
The release-email tests (#1071) inject a fake fetch and check the send loop, but nothing drives the real sendEmail wiring from a cut through to the Resend request. A regression in the From header or the request shape would pass the current suite.

## Acceptance criteria
1. One test runs deliverCutReleaseEmail through the real sendEmail path against a local fake Resend endpoint.
2. It asserts the request shape, the From header and one message per recipient.
3. It uses fake keys and sends no real mail.

## Notes for AI
See src/server/email.ts and src/server/release-email.ts. Do not put any real key in the test.

## Activity

- 2026-11-11T05:28:23Z · created · njachowski@gmail.com
- 2026-11-11T05:28:24Z · needs_input
- 2026-11-11T05:28:38Z · body: Problem (added); Acceptance criteria (added); Notes for AI (added)
- 2026-11-11T07:43:59Z · needs_input
- 2026-11-13T07:10:36Z · cli_override, model_override
- 2026-11-13T07:10:38Z · status inbox→ready
- 2026-11-13T07:10:40Z · status ready→active, branch
- 2026-11-13T07:17:56Z · body
- 2026-11-13T08:34:24Z · message_queued at 2026-11-13T08:34:24.432Z
- 2026-11-13T08:34:24Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-13T08:50:12Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-13T09:55:19Z · queued message undelivered for 81m and the engineer produced no output — ending the turn so it is delivered
