---
task: "1167"
pass: 5
at: "2026-11-17T22:03:46.562Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/qa-pass-use-the-macos-hub-app-after-the-
state: ok
tree_identity: "c591a3855:"
---
## Verdict
`needs some work` — startup-learned identity is shown but never persisted, so local Start/Stop can disappear after relaunch.

## Relevance
`still relevant` — the #1155 premise holds; this pass fixed real sidebar, offline, search and badge defects and added useful QA isolation.

## Evidence
None

## Bugs
- **Class: startup identity persistence** — `VolatileServerHealth` (`HubAppState.swift`) with `refreshHealth(persistToDisk: false)` keeps `name`, `repositoryName` and `localProjectPath` learned by the launch sweep only in memory; no save copies them into `ServerRegistryDocument` (the reorder path deliberately restores persisted values at `:900-910`). A loopback server whose project path is learned only at launch never saves it, so after quitting and relaunching with the service stopped the sidebar Start/Stop/Restart entries and the offline overlay's Start are gone (`ServerModels.swift:354-357`, `ServerWebWorkspaceView.swift:105-107`) even though the Hub "has seen the project path" (`user-docs/macos-hub.md:585`). Editing such a server is worse: `saveFromEditor(.edit)` drops the overlay (`:677`) and saves the persisted entry, losing the path in-session. Legacy fallback names (`updateRepositoryIdentity`) likewise revert to the address on an offline launch instead of upgrading once, as main persisted them. Persist the identity fields (not health/timestamps) when learned or on the next save, with a launch-check-then-edit/relaunch test.

No further findings of this class were found after grepping: every `VolatileServerHealth` use, `document.entries` writers (`saveFromEditor`, `setPinned`, `deleteServer`, `updateAttentionPreferences`, `updateWorkspaceAccentColor`, `reorder`, `reloadFromDisk`), `refreshHealth`/`refreshAllHealth` callers, all `localProjectPath`/`repositoryName` readers, and the add/edit/pin/save tests.

## Edge cases
- `refreshHealth` captures one index before `await checkHealth` and reuses it (`:703-724`); deleting an earlier server during the launch sweep or from the offline overlay's Remove can write the result to a neighbour. Pre-existing, but the new load-failure/retry call sites make it more reachable.
- Nick's real registry still carries the round-1/2 health stamps; the code prevents repeats, but that external change cannot be undone.
- The round-4 report's code tree (`14ce3bc`) equals HEAD's; only docs commits follow, but no current-round report covers the docs fix.

## Suggestions (non-blocking)
- Captures: drawer `03-offline-row-before-relaunch.png` still shows the 4/3+ badges this branch hides; light mode, add/edit/remove, Settings and ⌘K have no drawer capture (round-1 files remain in `~/Library/Caches/RepoOS/task-1167-shots/`). Re-capture at HEAD.
- `user-docs/macos-hub.md:196-197` says counts show "while the server is reachable"; the code requires `.healthy`, so invalid-response servers also hide them.
- `retryWorkspace` waits for the health check before reloading, so Retry can stall for the timeout; reload first and refresh concurrently.
- `deleteServer` leaves the removed server's volatile overlay entry behind.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

