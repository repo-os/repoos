# macOS Hub navigation and recents retention

This note documents how the native Hub stores **route hints** without turning
every server visit into a permanent tab.

## Two different “pin” concepts

| Concept | Storage | Created when |
| --- | --- | --- |
| Pinned server (`ServerEntry.isPinned`) | Server registry entry | User pins a server in the sidebar |
| Pinned task context (`PinnedTaskContext`) | Registry document | User explicitly pins a task route |

Passive navigation never creates a pinned task context.

## Per-server recents

Each server has a bounded MRU list (`HubRecentsRetention.maxRecentRoutesPerServer`,
currently **8**) of `ServerContextRoute` values:

- `path` — same-origin route path (for example `/tasks/0473`)
- optional `title` — display hint only
- `lastVisitedAt` — used for ordering in the command palette

Recording a visit **deduplicates by path**, moves the route to the front, and
updates `lastRoutePath` for relaunch restore. Removing a server prunes its recents
and any pinned contexts that referenced it.

## WebView working set (memory)

Each server workspace uses one isolated `WKWebView`. To cap memory, the Hub keeps a
**working set** of live web views rather than every server visited this session:

| Constant | Value | Meaning |
| --- | --- | --- |
| `HubWorkspaceWebViewResidency.maxInactiveWorkspaceWebViews` | **4** | Inactive servers kept mounted |
| `HubWorkspaceWebViewResidency.maxLiveWorkspaceWebViews` | **5** | Active server plus inactive budget |

**Tradeoff:** switching among servers in the working set is instant (page and
history stay in memory). A **cold return** to an evicted server reloads the web
UI; cookies and `localStorage` survive via the per-server `WKWebsiteDataStore` on
disk, and the shell restores route intent from persisted `lastRoutePath` (same as
relaunch) — no scraping or native bridge to page content.

When macOS reports memory pressure, the Hub shrinks inactive residency (warn → 2
inactive; critical → none). The active workspace is never evicted.

## Relaunch behavior

On launch, the Hub restores:

1. `lastSelectedServerID` from the registry document
2. For that server, `lastRoutePath` when the isolated web workspace is available
   (navigation is requested through `HubNavigationRequest`; until WebKit loads,
   selection still restores at the server level)

## Command palette (`Cmd-K`)

The palette searches display names, origins, recent route titles/paths, pinned
task labels/identifiers, and — when enabled per server — live task hits from
`GET /api/hub/v1/tasks/search`. Local registry rows and the “Add server…” action
are always included; remote queries are debounced, cancellable, and never build a
central index. See [Native Hub cross-server task search](native-hub-cross-server-search.md).

## Shell vs embedded page navigation

Back, forward, and reload target the **embedded RepoOS web view** when it is
active and WebKit reports history. When no web content is loaded, reload falls
back to the native health check for the selected server. The shell sidebar and
registry are never driven by page history.

See [ADR 0006](adr/0006-macos-repoos-hub.md) for the product boundary.
