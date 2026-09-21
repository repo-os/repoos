---
merge_conflict_retry_count: 2
updated_at: "2026-09-21T19:15:41Z"
review_passes: 1
id: "0475"
title: Surface cross-server attention summaries and native notifications in the macOS Hub
type: feature
status: review
priority: p2
area: desktop
assigned_to: ai
created_by: ""
branch: feat/surface-cross-server-attention-summaries
cli_override: cursor
model_override: composer-2.5
created_at: "2026-09-21T11:50:28Z"
---
Use the explicit Hub summary capability to make the native wrapper an attention-management layer rather than a prettier collection of browser tabs.

Acceptance criteria:
- The sidebar displays fresh/stale/unavailable state plus compact attention badges for authorized servers.
- Only the selected server keeps a full interactive WebView session; inactive servers use a bounded, low-frequency summary refresh policy with backoff and no unnecessary persistent streams.
- Server failures are isolated: one unavailable remote cannot block navigation or badge refresh for other servers.
- Native notifications and optional Dock/menu-bar badges are driven by meaningful, deduplicated state transitions, not every poll.
- Notification click behavior opens the relevant server and provides a safe route to the related RepoOS page where possible.
- Users can disable aggregation per server and control notification categories.
- Include tests for scheduling/backoff, stale state, badge transitions, and notification deduplication.

Depends on the macOS registry/WebKit tasks and the Hub read-capability/summary API task.

## Activity

- 2026-09-21T11:50:28Z · created · unknown
- 2026-09-21T11:52:37Z · body
- 2026-09-21T18:27:14Z · status inbox→ready
- 2026-09-21T19:04:48Z · cli_override
- 2026-09-21T19:04:50Z · model_override
- 2026-09-21T19:04:55Z · status ready→active, branch
- 2026-09-21T19:12:15Z · status active→review



