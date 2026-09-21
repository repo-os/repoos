---
id: "0476"
title: Add privacy-preserving cross-server task search to the macOS Hub
type: feature
status: inbox
priority: p3
area: desktop
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-09-21T11:50:29Z"
updated_at: "2026-09-21T11:52:37Z"
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
