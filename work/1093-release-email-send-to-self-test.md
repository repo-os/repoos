---
id: "1093"
title: "Release email: send-to-self test"
type: chore
status: ready
priority: p3
area: server
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-11T05:28:23Z"
updated_at: "2026-11-13T07:10:38Z"
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
