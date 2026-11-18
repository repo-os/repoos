---
id: "1164"
title: Verify Secrets page behavior with authenticated access
type: bug
status: review
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/verify-secrets-page-behavior-with-authen
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-17T17:53:29Z"
updated_at: "2026-11-18T04:38:49Z"
review_passes: 3
review_rounds: 2
---
## Problem
During task #1157 browser QA using the auth-less preview server, GET /api/project-environments returned 401 and the Secrets page displayed a failure state. The endpoint requires sign-in; this run could not verify the normal authenticated product flow or whether the no-auth failure state provides useful guidance.

## Desired UX
The signed-in user can view project environment names and values according to the existing security model, and an unsigned session receives a clear, non-confusing state.

## Acceptance criteria
- Verify the Secrets page as a signed-in user in a suitable test environment.
- Verify the unsigned 401 state is handled clearly without exposing secret values.
- If a product defect reproduces, fix it with a regression test; otherwise record why the observed state is expected.

## Notes for AI
The initial evidence is an auth-less 401, not proof of a signed-in regression. QA screenshot attached.

## Shots
```json
[
{
"label": "Secrets sign-in required state",
"target": "default",
"route": "/secrets?shotState=secrets%3Aunauthorized",
"highlight": "[role=\"alert\"]"
},
{
"label": "Secrets environment with masked keys",
"target": "default",
"route": "/secrets?shotState=secrets%3Apopulated",
"highlight": ".secrets-ledger"
}
]
```

## Screenshots

![Secrets page in auth-less QA session showing environment request failure](/api/tasks/1164/attachments/att_eb9a3e8d-d591-4d6c-a639-d647337d3acc.png)

## Activity

- 2026-11-17T17:53:29Z · created · t@t
- 2026-11-17T17:53:29Z · screenshots
- 2026-11-18T00:17:38Z · cli_override, model_override
- 2026-11-18T00:17:40Z · status inbox→ready
- 2026-11-18T00:17:41Z · status ready→active, branch
- 2026-11-18T00:22:57Z · body
- 2026-11-18T00:24:50Z · body
- 2026-11-18T00:27:02Z · note: ui verification passed: 1 of 1 shot captured with clean console
- 2026-11-18T00:27:03Z · status active→review
- 2026-11-18T00:27:03Z · message_queued at 2026-11-18T00:27:03.161Z
- 2026-11-18T00:30:23Z · note: review pass 1: needs some work
- 2026-11-18T00:30:23Z · message_delivered: 1 message(s)
- 2026-11-18T00:30:23Z · status review→active
- 2026-11-18T00:30:26Z · CTO nudge: held — remote validation is running
- 2026-11-18T00:37:46Z · body
- 2026-11-18T00:40:17Z · body
- 2026-11-18T00:43:30Z · CTO nudge: held — handoff gate is running
- 2026-11-18T00:44:44Z · note: ui verification passed: 1 of 1 shot captured with clean console
- 2026-11-18T00:44:44Z · status active→review
- 2026-11-18T00:44:45Z · message_queued at 2026-11-18T00:44:45.020Z
- 2026-11-18T00:50:54Z · note: review pass 2: needs some work
- 2026-11-18T00:50:54Z · message_delivered: 1 message(s)
- 2026-11-18T00:50:55Z · status review→active
- 2026-11-18T00:58:30Z · message_queued at 2026-11-18T00:58:30.658Z
- 2026-11-18T00:58:30Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-18T01:00:22Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-18T01:05:36Z · queued message undelivered for 7m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-18T01:05:36Z · message_delivered: 1 message(s)
- 2026-11-18T01:15:43Z · body
- 2026-11-18T01:17:38Z · status active→review
- 2026-11-18T01:24:15Z · note: ui verification passed: 1 of 1 shot captured with clean console
- 2026-11-18T01:24:16Z · note: review pass 3: needs some work
- 2026-11-18T01:24:16Z · needs_input
- 2026-11-18T01:24:19Z · message_queued at 2026-11-18T01:24:19.068Z
- 2026-11-18T02:30:10Z · message_overdue: still queued after 60m without being delivered
- 2026-11-18T03:41:20Z · status review→active
- 2026-11-18T03:41:23Z · needs_input
- 2026-11-18T03:41:23Z · message_delivered: 1 message(s)
- 2026-11-18T03:43:13Z · body
- 2026-11-18T03:57:13Z · note: adopted orphaned engineer pid 20173
- 2026-11-18T04:03:15Z · body
- 2026-11-18T04:16:03Z · engineer stopped by request
- 2026-11-18T04:16:06Z · status active→review
- 2026-11-18T04:16:06Z · status review→active
- 2026-11-18T04:17:45Z · body
- 2026-11-18T04:37:06Z · body
- 2026-11-18T04:38:49Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: exited with code 0 · last assistant: The scoped check passed: the remote build and changed-path tests, format/lint, contrast audit, and UI smoke test were green. The 401 create-dialog recovery test is present, both screenshots are declared, and the engineering report draft is… · stderr: Reading additional input from stdin... 2026-11-18T04:29:49.278004Z ERROR codex_models_manager::manager: failed to refresh available models: request timed out
- 2026-11-18T04:38:49Z · status active→review
