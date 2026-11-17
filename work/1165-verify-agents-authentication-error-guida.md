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
updated_at: "2026-11-17T21:35:43Z"
handoff_signal_retry_count: 2
review_rounds: 1
review_passes: 1
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
- 2026-11-17T20:59:15Z · status active→review
- 2026-11-17T20:59:16Z · message_queued at 2026-11-17T20:59:16.132Z
- 2026-11-17T20:59:16Z · note: shots: skipped — the diff (3 changed paths) touches no capture target's globs — no UI change to capture
- 2026-11-17T21:03:43Z · note: review pass 1: needs some work
- 2026-11-17T21:03:43Z · status review→active
- 2026-11-17T21:03:46Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-17T21:08:59Z · message_queued at 2026-11-17T21:08:59.266Z
- 2026-11-17T21:14:16Z · message_queued at 2026-11-17T21:14:16.987Z
- 2026-11-17T21:19:26Z · message_delivered: 1 message(s)
- 2026-11-17T21:28:15Z · queued message undelivered for 19m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-17T21:28:15Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code unknown) · last assistant: The runner is executing a broad scoped suite: the shared auth utility also touches core model and runner paths, so RepoOS selected 284 changed-path plus safety test files. They’re passing so far. The full scoped gate still has the rendered… · stderr: 2026-11-17T21:20:52.082694Z ERROR codex_core::tools::router: error=apply_patch verification failed: Failed to find expected lines in /Users/nick/code/nick/repoos-worktrees/feat/verify-agents-authentication-error-guida/src/core/models.ts: import { sanitizeSpawnArgs } from "./spawn-safety.js"; 2026-11-17T21:21:53.871426…
- 2026-11-17T21:28:15Z · message_delivered: 2 message(s)
- 2026-11-17T21:35:43Z · message_queued at 2026-11-17T21:35:43.146Z
- 2026-11-17T21:35:43Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
