---
id: "0095"
title: Automate main sync when completing review
type: feature
status: active
priority: p2
area: core
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-11T14:46:35Z"
updated_at: "2026-08-11T15:41:20Z"
---
## Problem

The review state exposes a "Sync with main" button that requires users to manually synchronize a task branch before moving the task to done. If the merge encounters a snag, completion should handle synchronization automatically instead of requiring a separate user action.

## Desired UX

The review state no longer shows a "Sync with main" button. When a user moves a task to done, RepoOS attempts the merge normally. If the merge cannot proceed because the branch needs to be synchronized with main, RepoOS automatically syncs with main and retries the merge. The user sees an error only when RepoOS cannot synchronize with main and complete the merge cleanly.

## Acceptance criteria

- [ ] The "Sync with main" button is removed from the review-state UI.
- [ ] Moving a task from review to done attempts to merge the task branch.
- [ ] If the initial merge hits a synchronization-related snag, RepoOS automatically attempts to sync the task branch with main.
- [ ] After a successful automatic sync, RepoOS retries and completes the merge.
- [ ] No error is shown when automatic synchronization and the subsequent merge succeed.
- [ ] A clear error is returned when RepoOS cannot sync with main or cannot merge cleanly after syncing.
- [ ] Existing review-to-done behavior remains unchanged when the initial merge succeeds.

## Notes for AI

Treat "sync with main" as the repository's existing synchronization operation; reuse its current behavior rather than introducing a new synchronization strategy. Assume automatic synchronization should run only after the initial review-to-done merge encounters a snag, not before every merge. Remove the review-state control without removing synchronization logic that is needed by the automatic fallback. Update the completion flow and relevant UI code, and add or update tests covering direct merge success, successful sync-and-retry, and unrecoverable synchronization or merge failure. Do not add runtime dependencies. Run `repoos check` before marking the task ready for review.

## Activity

- 2026-08-11T14:46:35Z · created · unknown
- 2026-08-11T14:46:46Z · status inbox→ready
- 2026-08-11T15:41:20Z · status ready→active
