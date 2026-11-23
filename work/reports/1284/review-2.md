---
task: "1284"
pass: 2
at: "2026-11-22T12:51:28.629Z"
agent: reviewer
cli: github copilot
model: default
branch: feat/mac-hub-local-server-will-not-start-env-
state: ok
tree_identity: "1fbae49f5:"
---
## Verdict
needs some work — failed add/edit saves leave phantom workspace residency state.

## Relevance
still relevant — the task addresses a live Finder/Dock launch failure and remove/re-add crash.

## Evidence
None

## Bugs
- **Class: Transaction rollback completeness** — `HubAppState.saveFromEditor` snapshots the registry and selection, but `noteWorkspaceUsed()` mutates `retainedWorkspaceServerIDs` and `workspaceResidencyLRU` before `store.save()`. A failed add or edit restore neither collection, leaving a phantom server ID retained in workspace state. Remove/re-add and failed-edit paths can affect subsequent residency or eviction behavior.

No further findings of this class were found after grepping: `saveFromEditor`, `deleteServer`, `noteWorkspaceUsed`, `enforceWorkspaceResidencyBudget`, and registry save callers.

## Edge cases
- The earlier quarantine and delete rollback findings are fixed.
- Signed Finder launch, real-Mac remove/re-add, and crash-log verification remain unverified.
- The removed server’s website data intentionally remains orphaned pending human verification.

## Suggestions
Split the real-Mac signed-build verification into a separate human-verify task, including crash-log collection and remove-then-re-add.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

