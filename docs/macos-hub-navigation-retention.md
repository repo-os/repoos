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

## Relaunch behavior

On launch, the Hub restores:

1. `lastSelectedServerID` from the registry document
2. For that server, `lastRoutePath` when the isolated web workspace is available
   (navigation is requested through `HubNavigationRequest`; until WebKit loads,
   selection still restores at the server level)

## Command palette (`Cmd-K`)

The palette searches display names, origins, recent route titles/paths, pinned
task labels/identifiers, and the “Add server…” action. It never queries server
content or fans out network requests.

## Shell vs embedded page navigation

Back, forward, and reload target the **embedded RepoOS web view** when it is
active and WebKit reports history. When no web content is loaded, reload falls
back to the native health check for the selected server. The shell sidebar and
registry are never driven by page history.

See [ADR 0006](adr/0006-macos-repoos-hub.md) for the product boundary.
