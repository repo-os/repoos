---
task: "1167"
pass: 6
at: "2026-11-17T22:49:34.916Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/qa-pass-use-the-macos-hub-app-after-the-
state: ok
tree_identity: "2d8e8a7e5:"
---
Repeated review classes: earlier passes kept finding (1) QA isolation / forbidden writes to Nick's registry, (2) status/health staleness across every consumer of the shared entry (sidebar, overlay, Dock, search), (3) cross-server search cancellation, (4) user-docs drift, and (5) startup-learned identity not persisted. All five now look fixed: the volatile overlay is written only by the explicit `persistToDisk: true` path, identity is copied into the document and saved at `HubAppState.swift:727-737` with a relaunch/edit test, the docs match the health-gated badges, and `cancel()` clears results. The recurring pattern — each round fixed one consumer of shared health/document state and missed the next — is worth a human's attention, but I found no remaining blocking instance.

## Verdict
`good to go` — code and tests are sound; drawer captures are round-2 stale and only four screens were attached. STALE-EVIDENCE-ONLY

## Relevance
`still relevant` — the #1155 premise holds and this branch fixes real Hub defects (registry isolation, stale health, offline badges, identity persistence).

## Evidence
- Capture 2 (`02-repoos-control-loaded.png`): shows the pre-branch `1` / `3+` badge row and old subtitle, which this branch replaces.
- Capture 3 (`03-offline-row-before-relaunch.png`): offline row still shows attention badges; current code hides them (`ServerSidebarView.swift:381`, `HubServerTabStrip.swift:341`).
- Missing at HEAD: light appearance, add-by-URL, edit/remove, Settings, ⌘K (AC1/AC2/AC5).

## Bugs
None found

No further findings of this class were found after grepping: every `volatileHealthByServerID` use, `document.entries` writers (`setPinned`, `updateAttentionPreferences`, `updateWorkspaceAccentColor`, `reorder`, `deleteServer`, `saveFromEditor`), `refreshHealth`/`refreshAllHealth` callers, `lastHealth` consumers (row, tab strip, popover, Dock, search), `ServerEntry` encode/decode symmetry, `REPOOS_HUB_SUPPORT_DIRECTORY` docs/tests, and the serve banner host path.

## Edge cases
- `refreshHealth` still captures `index` before `await checkHealth` (`HubAppState.swift:703-725`); deleting or reordering during the launch sweep now also persists identity onto a neighbouring entry. Pre-existing, not new.
- The engineering report's source tree (`14ce3bc`) predates HEAD (`2d8e8a7`); this pass reviews the three-file identity fix from the diff, not the report.
- Nick's real registry still carries the round-1/2 health stamps; unrecoverable and disclosed.
- Editing a loopback server's URL keeps the old `localProjectPath` (pre-existing), so Start could target the old project root.

## Suggestions (non-blocking)
- Re-attach HEAD captures for all AC2 screens (light/dark, add, edit/remove, Settings, ⌘K); the four drawer images are round-2.
- `try? store.save` on identity change silently drops failures; log it.
- `deleteServer` leaves the removed server's volatile overlay entry; clear it.
- `user-docs/macos-hub.md:196` says "reachable" where the code requires `.healthy`.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

