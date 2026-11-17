---
id: "1165"
title: Verify Agents authentication error guidance
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/verify-agents-authentication-error-guida
cli_override: codex
model_override: gpt-6-luna
created_at: "2026-11-17T17:53:39Z"
updated_at: "2026-11-17T20:56:50Z"
---
## Problem
During task #1157 browser QA, Agents displayed a configured Cursor CLI authentication error in the local auth-less environment. No valid Cursor test credential was available, so this does not establish that the signed-in product flow is broken. The error presentation and remediation guidance were not validated in a configured environment.

## Desired UX
Agents clearly distinguishes missing local CLI authentication from RepoOS account errors and gives an actionable next step without leaking credentials.

## Acceptance criteria
- Reproduce with an appropriately configured test environment and verify normal Agents behavior.
- Verify the missing-CLI-authentication state explains the required user action.
- Fix and test any confirmed product defect, or document that the observed state is expected configuration feedback.

## Notes for AI
The attached screenshot shows the unconfigured local CLI state only; do not treat it as a confirmed auth-flow regression.

## Screenshots

![Agents page displaying missing Cursor CLI authentication in local QA environment](/api/tasks/1165/attachments/att_4e9349f4-3948-44a9-877c-298ea98ad9bc.png)

## Activity

- 2026-11-17T17:53:39Z · created · t@t
- 2026-11-17T17:53:40Z · screenshots
- 2026-11-17T20:48:43Z · cli_override, model_override
- 2026-11-17T20:48:50Z · status inbox→ready
- 2026-11-17T20:48:53Z · status ready→active, branch
- 2026-11-17T20:53:24Z · body
- 2026-11-17T20:56:50Z · body
