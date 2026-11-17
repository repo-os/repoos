---
task: "1167"
pass: 1
at: "2026-11-17T19:24:42.412Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/qa-pass-use-the-macos-hub-app-after-the-
state: ok
tree_identity: "5e2a07c87:"
---
## Verdict
`needs some work` — Non-isolated launch rewrote Nick's real servers.json; the sidebar still shows healthy/green while offline (09), unfiled.

## Relevance
`still relevant` — the #1155 premise holds and the URL-subtitle fix is correct; the QA evidence and isolation gaps are what need work.

## Evidence
None

## Bugs
- **Class: QA isolation / forbidden state write** — the non-isolated first launch ran `HubAppState.convenience init` → `refreshAllHealth` → `refreshHealth` → `store.save`; Nick's real `~/Library/Application Support/RepoOS Hub/servers.json` now has all 8 entries' `updatedAt` = 2026-11-17T18:38:53Z and two new `lastHealthAt` stamps from that run (mtime 02:39:01). AC4 forbids touching the saved data; "I made no saved-server changes" is inaccurate at file level, and Nick's Hub now shows the QA check times.
- **Class: status-indicator staleness (retry asymmetry)** — capture 09 is labelled "Offline row" but its icon is green: the overlay comes from `webModel.loadFailure`, while the sidebar reads `entry.lastHealth`, refreshed only at init and `selectServer` (which early-returns for the current row). The overlay's Retry only reloads the web view (`ServerWebWorkspaceView.swift:54`), unlike `ConnectionFailureBanner`'s retry; the stale `.healthy` also leaves "Stop local server" in the context menu and cross-server search polling a dead entry. Neither fixed nor filed (AC3).

No further findings of this class were found after grepping: `applicationSupportDirectory` callers; `refreshAllHealth`/`refreshHealth` callers (init, selectServer, banner, local-service start); `lastHealth` consumers (`ServerIconView`, `HubServerTabStrip`, `ServerActionsMenuModel`, `HubCrossServerTaskSearchEngine`); `repositoryName` consumers (popover, tooltip, accent-cookie match, command palette); sibling tests; `macos/README.md` and `user-docs/macos-hub.md`.

## Edge cases
- `serve-noauth` did not bind `0.0.0.0`: the #0464 guard in `src/server/server.ts` forces auth-less previews to `127.0.0.1`; only the banner (`src/commands/serve.ts:289`) prints `0.0.0.0` and a Tailnet URL. No task was filed for that misleading banner.
- The red/unreachable row after a fresh launch was never captured, so "relaunch keeps Offline state" is unverified; 09 shows the pre-relaunch stale state.

## Suggestions
- Attach the 11 PNGs with `repoos update 1167 --screenshot …`; they exist only in `~/Library/Caches/RepoOS/task-1167-shots/`, so the drawer shows none. Relabel 09.
- Document `REPOOS_HUB_SUPPORT_DIRECTORY` in `macos/README.md` so the next QA run isolates before its first launch.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

