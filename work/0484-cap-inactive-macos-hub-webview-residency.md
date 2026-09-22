---
id: "0484"
title: Cap inactive macOS Hub WebView residency with an LRU working set
type: feature
status: ready
priority: p2
area: desktop
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-09-22T14:46:35Z"
updated_at: "2026-09-22T14:52:26Z"
---
Cap the macOS Hub's live WKWebView residency so a user who has visited many RepoOS servers does not retain every page process and DOM in memory.

Current behavior keeps every visited workspace mounted in WorkspaceDetailView to preserve page/history state. That makes instant switching pleasant for a small set of servers, but memory consumption can grow without bound for the intended multi-server use case.

Working-set unit and default budget (PM decision, 2026-09-22):
- The LRU working set is per workspace (RepoOS server), not per page. The Hub keeps exactly one WKWebView per visited server entry (retainedWorkspaceServerIDs), so capping WebViews is capping servers; LRU ordering is over most-recently-used projects.
- Pages within a server need no cap: recents are already bounded persisted metadata (maxRecentRoutesPerServer = 8 plus lastRoutePath, kilobytes on disk), not live page processes.
- Default budget: the active workspace plus the 4 most-recently-used inactive workspaces (5 live WebViews), as a named constant covered by tests. The constant is tunable with evidence; the budget itself must stay explicit.
- Memory-pressure response: warn-level signal trims inactive residency to 2; critical evicts all inactive WebViews. The active workspace is never evicted.
- Eviction drops the WKWebView and the pool's in-memory WKWebsiteDataStore handle for that server; the on-disk per-identifier store survives, so cookies/localStorage persist and a cold return reloads safely.
- Route intent on cold return comes from the existing persisted lastRoutePath mechanism (restorePendingRouteForSelectedServer) - no scraping or bridging of untrusted web content.

Acceptance criteria:
- Keep the active WebView and a small, documented recent-working-set budget; evict least-recently-used inactive WebViews beyond that budget.
- Eviction preserves the per-server WKWebsiteDataStore, so cookies/localStorage survive and re-opening reloads safely.
- Preserve or restore an appropriate per-server route/history intent where feasible without scraping or bridging untrusted web content.
- Release inactive in-memory data-store handles consistently with WebView eviction.
- Make the budget explicit and testable; choose a safe default suitable for normal Mac memory pressure.
- Respond to memory-pressure/lifecycle signals by reducing inactive residency.
- Add unit tests for LRU ordering, eviction, persistence guarantees, and active-workspace protection.
- Document the performance tradeoff: instant switching for the working set versus reload on cold return.

This should preserve the strict no-native-bridge WebKit security boundary.

## Activity

- 2026-09-22T14:46:35Z · created · unknown
- 2026-09-22T14:51:50Z · body
- 2026-09-22T14:52:26Z · status inbox→ready
