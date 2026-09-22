---
id: "0476"
title: Add privacy-preserving cross-server task search to the macOS Hub
type: feature
status: done
priority: p3
area: desktop
story: MacOS native app
assigned_to: ai
created_by: ""
branch: feat/add-privacy-preserving-cross-server-task
cli_override: cursor
model_override: composer-2.5
created_at: "2026-09-21T11:50:29Z"
updated_at: "2026-09-22T02:38:49Z"
merge_conflict_retry_count: 1
review_passes: 1
---
Extend the macOS Hub command palette with an opt-in cross-server task search that helps users locate work without reopening browser tabs.

Acceptance criteria:
- Search is opt-in per server and uses an explicit Hub capability/API rather than reading WebView DOM or browser cookies.
- Results identify server, task number/title/status, and freshness; selecting a result opens the appropriate selected-server RepoOS location.
- Queries are debounced, bounded, cancellable, and do not create a central index or transmit data between user servers.
- Offline and unauthorized servers fail independently and visibly.
- Add privacy/security documentation and tests for result routing, cancellation, and authorization boundaries.

Depends on the Hub summary capability work and the native navigation/command palette task.

## Activity

- 2026-09-21T11:50:29Z · created · unknown
- 2026-09-21T11:52:37Z · body
- 2026-09-21T18:27:17Z · status inbox→ready
- 2026-09-21T20:10:14Z · story
- 2026-09-22T02:07:17Z · cli_override
- 2026-09-22T02:07:20Z · model_override
- 2026-09-22T02:07:22Z · status ready→active, branch
- 2026-09-22T02:15:26Z · status active→review
- 2026-09-22T02:38:49Z · status review→done, release:success
