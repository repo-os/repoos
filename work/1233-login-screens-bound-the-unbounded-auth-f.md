---
id: "1233"
title: "Login screens: bound the unbounded auth fetches so a stalled server cannot hang the login spinner"
type: feature
status: inbox
needs_input: true
needs_input_reason: underspecified
needs_input_detail: "missing sections: Desired UX"
priority: p3
area: web
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-19T15:31:05Z"
updated_at: "2026-11-19T15:31:23Z"
---
## Problem
LoginView.checkStatus performs its own plain fetch("/api/auth/status") and /api/auth/me calls with no AbortController or timeout signal (found in the #1226 slow-network QA review, round 1, declared out of scope there). On a stalled server the login page's spinner hangs until the browser's default timeout, the same endless-spinner class #1226 fixed for the auth store (auth.ts now bounds /api/auth/me at 6s).

## Acceptance criteria
- Both login-screen fetches carry a bounded abort signal and render a plain-English retryable error on timeout, matching the auth store's behavior.
- Unit test covers the stall path; no endless spinner.

## Notes for AI
Reuse the pattern and timeout from src/ui-app/src/stores/auth.ts (AUTH_ME_TIMEOUT_MS + AbortController). Do not change the auth store's contract.

## Desired UX
When the RepoOS server is slow or stalled, the login screen explains what happened in plain English and offers a retry — it never leaves a spinner running until the browser's default timeout.

## Activity

- 2026-11-19T15:31:05Z · created · t@t
- 2026-11-19T15:31:06Z · needs_input
- 2026-11-19T15:31:23Z · body: Desired UX (added)
