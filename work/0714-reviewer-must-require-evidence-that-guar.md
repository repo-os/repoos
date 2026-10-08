---
updated_at: "2026-10-08T14:35:02Z"
review_passes: 2
id: "0714"
title: "Reviewer must require evidence that guard tests fail on bad input, and fail on console errors"
type: feature
status: review
priority: p2
area: server
assigned_to: ai
created_by: ""
branch: feat/reviewer-must-require-evidence-that-guar
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-06T09:14:56Z"
review_rounds: 1
dev_error_count: 1
---
Field report from tuk-private (RepoOS v0.5.66). Source rows in tuk-private/repoos/docs/repoos-feedback.md. Rows 27 and 30: reviewer approved a change with a vue-i18n console error and a dead guard rule.

## Problem
The review process can approve a change even when browser verification emits a console error, as reported for vue-i18n, and can accept a guard rule whose tests never demonstrate that the rule rejects prohibited input. Passing-only or happy-path tests do not establish that a guard is active. These gaps weaken review confidence and allow regressions or ineffective safeguards to land.

## Acceptance criteria
- Browser-based review verification treats unexpected browser console errors as a failure that blocks approval, and reports the error details in the review result. Errors are not silently ignored; any deliberate exception is narrow, explicit, and documented.
- For every guard rule added or materially changed, review evidence includes a test showing that representative prohibited input is rejected, alongside a passing case for valid input where applicable. A test that only exercises valid input does not satisfy this requirement.
- The review result identifies the relevant test evidence and whether the console-error check passed, failed, or could not run; inability to run required verification is not presented as a successful check.
- Automated tests cover both a detected console error blocking review and a negative guard test demonstrating rejection of bad input, including any documented exception behavior.

## Notes for AI
Trace the existing reviewer, browser-smoke, and guard-test flows before changing behavior; reuse their current reporting and failure mechanisms rather than creating a parallel review path. Scope the negative-test requirement to guard rules introduced or materially changed by the reviewed work, and make the bad-input case assert the actual rejection condition rather than merely invoking the rule. Treat browser console errors as failures by default while preserving only intentional, narrowly scoped exceptions with an explanation. Keep the task focused on server/reviewer behavior and its tests; no user-interface change is required.

## Activity

- 2026-10-06T09:14:56Z · created · unknown
- 2026-10-06T09:14:57Z · needs_input
- 2026-10-07T17:11:07Z · needs_input
- 2026-10-07T17:11:39Z · body
- 2026-10-07T17:42:50Z · status inbox→ready
- 2026-10-08T14:06:47Z · cli_override, model_override
- 2026-10-08T14:06:50Z · status ready→active, branch
- 2026-10-08T14:07:21Z · agent exited with an error (cursor) · RetriableError: [resource_exhausted] Error
- 2026-10-08T14:08:43Z · needs_input
- 2026-10-08T14:15:28Z · body
- 2026-10-08T14:16:25Z · body
- 2026-10-08T14:23:01Z · status active→review
- 2026-10-08T14:23:01Z · note: shots: skipped — the diff (8 changed paths) touches no [[preview.paths]] globs — no UI change to capture
- 2026-10-08T14:24:06Z · note: review pass 1: needs some work
- 2026-10-08T14:24:06Z · status review→active
- 2026-10-08T14:26:27Z · body
- 2026-10-08T14:27:51Z · body
- 2026-10-08T14:33:53Z · status active→review
- 2026-10-08T14:33:53Z · note: shots: skipped — the diff (8 changed paths) touches no [[preview.paths]] globs — no UI change to capture
- 2026-10-08T14:35:02Z · note: review pass 2: good to go

