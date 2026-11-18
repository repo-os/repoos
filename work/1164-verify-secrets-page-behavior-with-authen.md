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
updated_at: "2026-11-18T00:27:02Z"
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

## Screenshots

![Secrets page in auth-less QA session showing environment request failure](/api/tasks/1164/attachments/att_eb9a3e8d-d591-4d6c-a639-d647337d3acc.png)

## Activity

- 2026-11-17T17:53:29Z · created · t@t
- 2026-11-17T17:53:29Z · screenshots
- 2026-11-18T00:17:38Z · cli_override, model_override
- 2026-11-18T00:17:40Z · status inbox→ready
- 2026-11-18T00:17:41Z · status ready→active, branch
- 2026-11-18T00:27:02Z · status active→review
