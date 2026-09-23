---
id: "0492"
title: Treat incomplete reviewer output as a failed/incomplete r…
type: feature
status: draft
priority: p2
area: general
assigned_to: ai
created_by: hello@repoos.org
branch: ""
pm_cli_override: cursor
pm_model_override: composer-2.5
created_at: "2026-09-23T04:31:37Z"
updated_at: "2026-09-23T04:31:38Z"
---
Treat incomplete reviewer output as a failed/incomplete review, not a successful review pass. Currently, RepoOS records any non-empty reviewer output as state: ok and increments review_passes, even if the reviewer never emits one of the required verdicts (good to go, needs some work, back to the drawing board). This leaves tasks in review with a partial ‘thinking aloud’ report, no actionable outcome, and confusing UI state.
Require a parseable verdict before marking a review complete or incrementing review_passes. If output is non-empty but has no valid verdict, persist it for debugging but mark the review as incomplete, clearly surface that state in the task drawer/card, do not show ‘review passed,’ do not trigger auto-bounce, and provide a retry action. Add tests for empty output, partial output without a verdict, and each valid verdict.

## Original prompt

Treat incomplete reviewer output as a failed/incomplete review, not a successful review pass. Currently, RepoOS records any non-empty reviewer output as state: ok and increments review_passes, even if the reviewer never emits one of the required verdicts (good to go, needs some work, back to the drawing board). This leaves tasks in review with a partial ‘thinking aloud’ report, no actionable outcome, and confusing UI state.
Require a parseable verdict before marking a review complete or incrementing review_passes. If output is non-empty but has no valid verdict, persist it for debugging but mark the review as incomplete, clearly surface that state in the task drawer/card, do not show ‘review passed,’ do not trigger auto-bounce, and provide a retry action. Add tests for empty output, partial output without a verdict, and each valid verdict.

## Screenshots

![Screenshot-2026-09-23-at-11.31.11](/api/tasks/0492/attachments/screenshot-1.png)

## Activity

- 2026-09-23T04:31:37Z · created · hello@repoos.org
- 2026-09-23T04:31:38Z · screenshots
