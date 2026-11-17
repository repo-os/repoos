---
task: "1167"
pass: 3
at: "2026-11-17T20:21:47.662Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/qa-pass-use-the-macos-hub-app-after-the-
state: ok
tree_identity: "8f45ddb97:"
---
## Verdict
`needs some work` — the startup-health overlay undoes edits, and Cmd-K keeps stale remote results after dismissal; both are regressions in the round-3 fix.

## Relevance
`still relevant` — the #1155 premise holds and the isolation, banner and sidebar fixes are worth landing.

## Evidence
None

## Bugs
- **Class: volatile-overlay staleness** — `HubAppState.saveFromEditor(.edit)` (`HubAppState.swift:668-683`) writes the edited name/healthy state into `document`, then `publishEntries()` (`:849`) re-applies `volatileHealthByServerID` (`:41`) over it. The startup sweep (`:73`, `:798`) leaves an overlay for every server at launch, so editing a server before reselecting it shows the old name and can still show it Offline after a successful save; only a later `refreshHealth(persistToDisk: true)` clears it. Drop the edited server's overlay (or stop overlaying identity fields) and add an edit-after-sweep test.
- **Class: search lifecycle/cancellation** — `HubCrossServerTaskSearchEngine.cancel()`/`cancelWork()` (`HubCrossServerTaskSearchEngine.swift:63-74`) no longer clear `remoteResults`/`serverLines`, and `configure` clears them only when health changes (`:25-36`). Dismiss Cmd-K after a search, then reopen (`presentCommandPalette` → `configure`, `HubAppState.swift:331`) with unchanged health: the palette starts with an empty query, but `CommandPaletteMatcher.buildItems` includes remote results when tokens are empty (`HubNavigationModels.swift:255-270`), so the previous query's rows reappear with no footer. Clear results in `cancel()` or whenever `currentQuery == nil`.
- **Class: attention staleness for unhealthy servers** — the diff hides row/tab/popover badges unless healthy, but the Dock badge still counts them: `HubAttentionCoordinator.updateDockBadge` → `HubNotificationEngine.dockBadgeTransition` filters only freshness (`HubNotificationEngine.swift:118-122`), and coordinator entries never receive volatile health because `refreshHealth` does not call `syncAttentionCoordinator`. An offline server keeps contributing its last attention total.

No further findings of this class were found after grepping: `document.entries` writers and `upsertEntry` callers, `publishEntries`/`volatileHealthByServerID` uses, `refreshHealth`/`refreshAllHealth`/`syncAttentionCoordinator` callers, engine `configure`/`cancel`/`scheduleSearch` callers and palette state, `attentionTotal`/`dockBadgeTransition` consumers, `ServerHandle`/`bindHost` producers, `effectiveServeBannerNetwork` tests/docs, `REPOOS_HUB_SUPPORT_DIRECTORY` registration.

## Edge cases
- `refreshHealth` captures `index` before `await checkHealth` and indexes again after (`HubAppState.swift:702-707`); deleting or reordering during the sequential startup sweep can crash or write the wrong entry (pre-existing, more reachable now).
- `applyHealthCheck` now stamps `lastHealthAt` on failures and no longer bumps `updatedAt` (`ServerModels.swift:236-239`); correct for display, but `lastHealthAt` no longer means "last success".
- Nick's real registry still carries the round-1/2 health stamps; code prevents repeats but the external data change stands and there is no snapshot to restore.

## Suggestions
- Attach fresh HEAD captures plus the missing round-one light-mode/add/edit/Settings/Cmd-K shots; drawer capture 03 is round-2 and shows the very badges this branch now hides. The report admits no round-3 launch, so AC1/AC5 visual coverage is stale.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

