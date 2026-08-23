---
id: "0264"
title: Add favorites section to Coding Agent + Model Modal
type: feature
status: active
priority: p2
area: general
assigned_to: ai
created_by: hello@repoos.org
branch: feat/add-favorites-section-to-coding-agent-mo
model_override: default
created_at: "2026-08-22T17:08:06Z"
updated_at: "2026-08-23T10:58:37Z"
check_retry_count: 2
review_rounds: 1
---
## Overview

Add a favorites feature to the Coding Agent + Model Modal, allowing users to quickly access their most-used coding agent and model combinations.

## User Experience

### Favorites Section
- Add a star icon in the first position of each Coding Agents selection row
- Clicking the star toggles the favorite status for that agent + model combination
- Display a dedicated "Favorites" section above the full list that shows only favorited combinations
- When expanded, the favorites section shows all saved agent + model pairs in the same format as the main list

### Adding/Removing Favorites
- Add a star icon to the far right of each model row in the current model list UI
- Star should be interactive (clickable toggle)
- Visual feedback when a model is added to favorites (filled/highlighted star)
- Visual feedback when a model is removed from favorites (empty/unhighlighted star)

### Persistence
- Favorites should persist across sessions (store in local storage or user preferences)
- Maintain the order in which items were added to favorites

## Acceptance Criteria

- [ ] Star icon appears in the first position of each Coding Agents row
- [ ] Star icon appears on the far right of each model row in the list
- [ ] Clicking a star adds/removes the agent + model combination from favorites
- [ ] Favorites section displays above the main list when favorites exist
- [ ] Favorites section is collapsible/expandable
- [ ] Clicking star in favorites section removes item from favorites
- [ ] Favorite status persists across browser sessions
- [ ] Visual distinction between favorited and non-favorited items
- [ ] Works with all coding agent + model combinations
- [ ] No performance degradation with large agent/model lists

## Notes
- Consider visual hierarchy: favorites should be prominent but not overwhelming
- Star icon should have clear hover states and active states
- Empty state messaging if no favorites have been selected

## Activity

- 2026-08-22T17:58:58Z · body
- 2026-08-22T18:01:48Z · status inbox→ready
- 2026-08-22T18:02:00Z · cli_override
- 2026-08-22T18:02:06Z · model_override
- 2026-08-22T18:02:14Z · pm_model_override
- 2026-08-22T18:02:18Z · pm_model_override
- 2026-08-22T18:02:26Z · status ready→active, branch
- 2026-08-22T19:19:47Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been emitted on its own line — the agent's final line must be exactly `::repoos-handoff-ready::` (see #0154/#0155 for signal-line rendering bugs)
- 2026-08-22T19:19:48Z · status review→active
- 2026-08-23T04:54:56Z · model_override
- 2026-08-23T08:21:09Z · status active→review
- 2026-08-23T08:21:47Z · status review→active
- 2026-08-23T08:48:25Z · handoff failed · check failed after 2 automatic retries · repoos check failed: [preview] 2026-08-23T08:47:15.875Z #0001 started — url=http://127.0.0.1:53517 pid=3011 port=53517 · stderr | tests/release-agent.test.ts > release agent when a task leaves active (#0087) > stops the live agent when a direct task-file edit to review is picked up by the watcher · [preview] 2026-08-23T08:47:17.737Z #0001 exited — preview process 3011 exited on its own · stderr | tests/agent-review.test.ts > agent review before human sign-off (#0101) > returns a task to active when review findings are auto-bounced to the engineer · [preview] 2026-08-23T08:47:38.291Z #0001 started — url=http://127.0.0.1:53608 pid=21491 port=53608 · stderr | tests/agent-review.test.ts > agent review before human sign-off (#0101) > routes reviewer chat to its own session and serves the conversation · [preview] 2026-08-23T08:47:53.021Z #0001 started — url=http://127.0.0.1:53628 pid=26549 port=53628 · error: script "test" exited with code 143
- 2026-08-23T10:58:37Z · cli_override
