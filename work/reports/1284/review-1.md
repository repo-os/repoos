---
task: "1284"
pass: 1
at: "2026-11-22T12:42:41.176Z"
agent: reviewer
cli: github copilot
model: default
branch: feat/mac-hub-local-server-will-not-start-env-
state: ok
tree_identity: "5fcc4f784:"
---
## Verdict
needs some work — two registry failure paths can lose saved data after reporting failure.

## Relevance
still relevant — the base branch still has the PATH-dependent launcher and destructive WebKit store removal.

## Evidence
None

## Bugs
- **Class: Registry quarantine failure** — `ServerRegistryStore.setAsideUnreadableRegistry` swallows move errors and returns `nil`; `HubAppState.reloadFromDisk` then continues with an empty registry. If quarantine fails, a later save can replace the unreadable registry and lose its entries.
- **Class: Delete transaction rollback** — `HubAppState.deleteServer` mutates `document` and prunes navigation metadata before saving. If `store.save` fails, it returns without restoring them; a later save can persist the deletion despite the failure message.

No further findings of this class were found after grepping: `HubAppState.swift`, `ServerRegistryStore.swift`, related registry tests, all macOS duplicate-ID map sites, WebKit store callers, runtime/path handling, documentation, and new Node/npm/npx invocations.

## Edge cases
The engineering report matches the implementation; later commits only update task/report bookkeeping. Signed Finder launch and real-app remove/re-add remain unverified, and I found no separate human-verification task. Removed servers’ website data remains on disk as documented.

## Suggestions
File the required human-verification task for a signed Finder launch and real-app remove/re-add.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

