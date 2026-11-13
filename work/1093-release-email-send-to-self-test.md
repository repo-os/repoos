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
updated_at: "2026-11-13T10:15:21Z"
dev_error_count: 1
engineer_crash_log: "[{\"cli\":\"codex\",\"model\":\"gpt-6-luna\",\"at\":\"2026-11-13T09:56:26.012Z\",\"kind\":\"dev-error\"}]"
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
- 2026-11-13T09:55:19Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code unknown) · last assistant: The remote suite passed, including the new local endpoint test, but the check’s final local guard found formatting in that file and stopped later gates. I’ll apply the repository formatter and rerun the same required scoped check so the tr… · stderr: Reading additional input from stdin... 2026-11-13T07:19:50.830673Z ERROR codex_models_manager::manager: failed to refresh available models: Connection failed: error sending request 2026-11-13T07:20:27.149152Z ERROR codex_api::endpoint::responses_websocket: failed to connect to websocket: IO error: Network is unreachab…
- 2026-11-13T09:55:19Z · message_delivered: 1 message(s)
- 2026-11-13T09:56:25Z · agent exited with an error (codex) · 2026-11-13T09:55:25.713129Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when Client(HttpRequest(HttpRequest("http/request failed: error sending request for url (https://chatgpt.com/backend-api/ps/mcp)")))
- 2026-11-13T09:56:26Z · engineer crash recovery: resuming codex + gpt-6-luna (1/3 crashes in 30m) · 2026-11-13T09:55:25.713129Z ERROR rmcp::transport::worker: worker quit with fatal: Transport channel closed, when Client(HttpRequest(HttpRequest("http/request failed: error sending request for url (https://chatgpt.com/backend-api/ps/mcp)…
- 2026-11-13T10:06:30Z · needs_input
- 2026-11-13T10:15:21Z · message_queued at 2026-11-13T10:15:21.720Z
- 2026-11-13T10:15:21Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
