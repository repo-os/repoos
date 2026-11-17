---
task: "1167"
pass: 4
at: "2026-11-17T21:19:28.902Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/qa-pass-use-the-macos-hub-app-after-the-
state: ok
tree_identity: "e813e972e:"
---
## Verdict
`needs some work` — code is sound; `user-docs/macos-hub.md` still documents the pre-branch subtitle and badge behaviour this diff replaces.

## Relevance
`still relevant` — the QA pass found and fixed real Hub defects (launch-time registry writes, stale health, offline badges); the isolation env var remains useful.

## Evidence
None

## Bugs
- **Class: user-docs drift** — `user-docs/macos-hub.md` contradicts shipped behaviour: `:324-325` says the subtitle shows "origin URL or repository label" (now always the origin — `ServerSidebarView.swift`, `ServerSidebarRowLayout.subtitle`); `:380-381`/`:385` say an offline server "keeps its last counts on screen", and `:334-335`/`:626-628` say the Dock badge sums all servers with attention enabled and falls back to last-known counts, while this branch hides row/tab/popover badges for non-healthy servers (`ServerSidebarView.swift:382,456`, `HubServerTabStrip.swift:341`) and drops them from the Dock total (`HubNotificationEngine.swift:121`). `:198-200` also promises attention counts in the popover for every row. Update these lines to match.

No further findings of this class were found after grepping: `subtitle(for:)`/`sidebarSubtitle` readers, every `attentionTotal` badge surface (row, tab strip, popover, Dock), `user-docs/macos-hub.md`, `macos/README.md`, `docs/native-hub-webkit.md`, and `HubNotificationEngine` callers.

## Edge cases
- `refreshHealth` captures `document.entries` index before the `await` and indexes again after (`HubAppState.swift:703-725`); deleting/reordering during a check can trap or write the wrong entry. Pre-existing, but this branch adds call sites (load-failure, Retry), so it is more reachable.
- The engineering report's source commit (`8f45ddb`) is one checkpoint behind HEAD (`e813e972`); the three newest fixes are unreported. I verified them from the diff: overlay cleared on edit, `cancel()` clears results, healthy-gated badges/Dock all correct.
- Nick's real registry still carries the round-1/2 health stamps (no snapshot); launch-time writes are now prevented, and the report discloses this.

## Suggestions
- Replace the round-2 captures with HEAD ones: light appearance, add-by-URL, edit/remove, Settings and ⌘K have no capture at all, and `03-offline-row-before-relaunch.png` shows the stale `4 / 3+` badges this branch now hides.
- Drop the dead overlay entry in `deleteServer` for tidiness; it is currently only cleared on edit/reload.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

