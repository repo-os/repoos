---
task: "1167"
pass: 2
at: "2026-11-17T20:02:27.512Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/qa-pass-use-the-macos-hub-app-after-the-
state: ok
tree_identity: "d2e919e8e:"
---
## Verdict
`needs some work` — Startup health still writes Nick's servers.json; health changes also silently drop Cmd-K searches.

## Relevance
`still relevant` — the #1155 premise holds, and the URL-subtitle plus offline-row fixes are real improvements worth landing.

## Evidence
None

## Bugs
- **Class: QA isolation / forbidden state write** — `HubAppState.refreshHealth(persistToDisk:)` only skips its own `store.save`; it still mutates `document`. Any later save flushes those health stamps: `recordRouteVisit` → `persistQuietly()` runs on every web `didFinish` (`ServerWebView.swift:383`, `HubAppState.swift:350-362`), as do `updateWorkspaceAccentColor`, `selectServer` and pin/edit. This happened: Nick's real `servers.json` now has all 8 `lastHealthAt` = `2026-11-17T19:45:59Z` (five flipped to `unreachable`) while `updatedAt` stayed `18:38:53Z`, mtime `19:46:15Z` — the round-2 LaunchServices launch. So AC4 is violated again, and the report's "no saved entry in the normal registry was changed during round two" and "changes only in-memory state" are false. `testStartupHealthRefresh…WithoutWritingRegistry` passes only because it never saves afterwards; add a save-after-sweep assertion. Fix by keeping startup health in a volatile map rather than `document`.
- **Class: search lifecycle/cancellation** — `HubCrossServerTaskSearchEngine.configure` calls `cancel()` whenever the health map changes, clearing `serverLines`/`remoteResults` and setting `isSearching = false`. `HubCommandPaletteView` only calls `scheduleSearch` on `query` change, so a startup sweep or load-failure refresh silently discards the typed query's results with no retry until the user edits it. Re-run the search, or defer the clear while one is active.

No further findings of this class were found after grepping: `store.save`/`persistQuietly` callers, `document.entries` mutators, `refreshHealth`/`refreshAllHealth`/`applyHealthCheck` callers, engine `configure`/`cancel` callers, `ServerHandle`/`bindHost` consumers, `effectiveServeBannerNetwork` tests, `REPOOS_HUB_SUPPORT_DIRECTORY` docs/tests.

## Edge cases
- `ServerWebWorkspaceView.onChange(of: loadFailure)` also fires for `.blockedNavigation` and `.httpStatus`, where the server is reachable; gate on connectivity failures.
- Attention badges (4 / 3+) still show on the offline row in round-2 capture 03 — stale counts for an unreachable server.
- Health stamps now persist only via unrelated saves, so stored and in-memory state can disagree across launches.

## Suggestions
- Attach round-one `01`–`11` (still in `~/Library/Caches/RepoOS/task-1167-shots/`); the report cites them for light mode, add-server, edit/remove, Settings and Cmd-K, but only four round-2 images are in the drawer.
- The round-2 window-only captures are sound; 04's offline icon is small but legible.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

