---
id: "1259"
title: "Work board: apply queue search and filters on wide screens, with a search input"
type: feature
status: active
priority: p2
area: web
depends_on: ["1257"]
assigned_to: ai
created_by: t@t
branch: feat/work-board-apply-queue-search-and-filter
cli_override: claude code
model_override: haiku
created_at: "2026-11-20T00:57:29Z"
updated_at: "2026-11-20T04:56:21Z"
---
## Problem
Search and quick filters only exist on the phone queue (below 720 px). The desktop board at 720 px and up can only receive them from a URL, so a user cannot set one on a wide screen (#1257 gap).

## Desired UX
A search control on the desktop board that uses the same predicate and URL keys as the phone queue (src/ui-app/src/lib/workQueueFilters.ts), with the same chip bar and Clear filters.

## Acceptance criteria
- A search input on the desktop board filters columns and writes q/priority/area/story/mine to the URL.
- Chips, Clear filters and reload behave as in docs/qa/2026-11-filter-persistence-qa.md.
- Covered by headless WebKit fixtures at 375, 768 and 1280 px.

## Notes for AI
Headless Playwright only, against fixtures. Do not touch repoos.toml. Reuse the shared predicate; do not fork it.

## Activity

- 2026-11-20T00:57:29Z · created · t@t
- 2026-11-20T00:57:30Z · needs_input
- 2026-11-20T00:57:41Z · body: Desired UX (added 1, removed 1); Notes for AI (added)
- 2026-11-20T00:57:41Z · needs_input
- 2026-11-20T01:42:04Z · status inbox→ready
- 2026-11-20T01:42:10Z · cli_override, model_override
- 2026-11-20T04:07:05Z · status ready→active, branch
- 2026-11-20T04:20:09Z · body
- 2026-11-20T04:42:22Z · CTO nudge: held — handoff gate is running
- 2026-11-20T04:56:21Z · handoff failed · remote validation failed: test failure: tests/agent-review.test.ts > agent review before human sign-off (#0101) > routes reviewer chat to its own session and serves the conversation on mini — fix it in the feature branch and re-run the gate
- 2026-11-20T04:56:21Z · message_queued at 2026-11-20T04:56:21.715Z
