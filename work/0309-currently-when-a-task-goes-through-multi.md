---
id: "0309"
title: Show stale review indicator when new review is pending
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: feat/show-stale-review-indicator-when-new-rev
review_model_override: deepinfra/Qwen/Qwen3-Coder-480B-A35B-Instruct-Turbo
created_at: "2026-08-27T06:06:03Z"
updated_at: "2026-08-27T07:12:48Z"
handoff_signal_retry_count: 2
check_retry_count: 1
---
## Problem

When a task undergoes multiple reviews, the previous review data gets overwritten. However, if a review is currently in progress and a new one is initiated, the UI still displays the old review without indicating that it's outdated. This can confuse users into thinking they're seeing the most recent review when they're not.

## Desired UX

When a new review is initiated while an existing review is still displayed:
- The existing review should remain visible (for context/history)  
- But clearly marked as "stale" with a visual indicator
- Include a message stating that a new review is in progress and will update shortly
- This applies only to the review tab display - the underlying data should still be updated normally

## Acceptance criteria

- [ ] Stale reviews are visually distinguishable from current reviews
- [ ] Clear messaging indicates when a review is stale and being updated
- [ ] New reviews properly replace stale indicators when complete
- [ ] Existing review history is preserved (not deleted)
- [ ] No performance degradation in loading reviews

## Notes for AI

- Focus on frontend changes in the review display component
- Look for existing review-related components in the UI codebase
- Assume the backend already handles multiple review states correctly
- Don't modify review storage or data structures, only display logic
- Check for existing stale/indicator patterns in other parts of the UI for consistency

## Scope

This task covers:
- UI changes to indicate stale reviews
- Display logic updates for review tabs
- Visual indicators and messaging

Out of scope:
- Backend review processing changes
- Review storage modifications
- Notification systems for review completion

## Original prompt

Currently when a task goes through multiple reviews the review just gets overwritten, but if a review is currently happening the stale review is still showing and the user may be confused to think it's a done review, so in those cases we should obviously mark the existing review as stale and state that a new review is coming (still show the stale review in the review tab is ok, but make it clear to the user that it will be updated soon)

## Activity

- 2026-08-27T06:07:17Z · status draft→inbox, title, area, body
- 2026-08-27T06:07:36Z · status inbox→ready
- 2026-08-27T06:07:48Z · review_model_override
- 2026-08-27T06:07:49Z · status ready→active, branch
- 2026-08-27T07:12:45Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been emitted on its own line — the agent's final line must be exactly `::repoos-handoff-ready::` (see #0154/#0155 for signal-line rendering bugs)
- 2026-08-27T07:12:48Z · status review→active
