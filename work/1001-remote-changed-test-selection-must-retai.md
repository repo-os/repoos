---
id: 1001
title: Remote changed-test selection must retain its base ref
type: bug
status: inbox
priority: p1
area: [core, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-11-01T14:19:48Z"
updated_at: "2026-11-01T14:19:48Z"
---
## Problem
Remote validation receives the task commit but may not have the requested base ref such as main. scripts/select-test-files.mjs then cannot compute a merge base and safely falls back to the entire suite. On 2026-11-01, #0998's remote runner reported that main was not a valid object and expanded a scoped check to all 645 test files. This wastes many minutes and large bundle uploads on ordinary changes.

## Desired UX
Remote and local checks select the same changed test files plus the configured always-run safety set, using the exact validated base. A full-suite fallback remains when the base or selection cannot be verified.

## Acceptance criteria
- Remote validation carries or fetches the exact base commit needed by changed-path selection and verifies it before selecting tests.
- A runner checkout containing only the candidate commit can still compute the same changed-file selection as the local worktree without uploading unrelated history.
- When the base is genuinely unavailable or the changed-file list cannot be verified, the runner clearly reports why and falls back to the full suite; it never silently narrows tests.
- Add integration tests reproducing a remote bundle with no main branch, comparing local and remote test-file selections for the same candidate/base, plus missing-base fallback coverage.
- Preserve always-run safety suites, fullSuitePaths, release behavior, close-out selection, and candidate-tree validation.
- Update remote-validation and check documentation with the base-ref contract and fallback behavior.

## Notes for AI
Inspect scripts/select-test-files.mjs, scripts/run-tests.mjs, src/server/remote-validation.ts, docs/remote-validation.md, and the #0998 logs. Keep validation fail-closed and do not change the test set merely to make a run faster.

## Activity

- 2026-11-01T14:19:48Z · created · njachowski@gmail.com
