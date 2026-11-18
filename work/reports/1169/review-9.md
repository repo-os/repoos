---
task: "1169"
pass: 9
at: "2026-11-18T15:05:14.900Z"
agent: reviewer
cli: codex
model: gpt-6-luna
branch: feat/qa-pass-macos-repoos-hub-app-build-launc
state: ok
tree_identity: "84cd5c18f:"
---
Repeated review classes: **QA isolation** and **test-host scratch cleanup** are fixed; **incomplete acceptance coverage** is out of scope pending #1174, as the task spec now states. A human should look at this recurring verification gap.

## Verdict

good to go — the in-scope build, launch, discovery, and connection checks are recorded.

## Relevance

still relevant — this pass records the Hub’s in-scope behavior and fixes test-host writes to the user registry.

## Evidence

None

## Bugs

None found

No further findings of these classes were found after grepping: `ServerRegistryStore.applicationSupportDirectory` callers, XCTest termination cleanup, registry tests, the test-host build settings, the QA record and macOS launch instructions, and the changed server-command tests. No new bare `node`, `npm`, or `npx` invocation appears in the diff.

## Edge cases

Signed-in Projects and Tasks remain unverified pending #1174, as recorded in the task spec and QA record. Discovery of a stopped server and secondary Hub features were not exercised. The engineering report’s source commit matches the implementation tree apart from report and task bookkeeping. Per the supplied landing checklist, only the task’s own work file conflicts with main and close-out resolves it; I did not rerun merge-tree.

## Suggestions (non-blocking)

The window-only screenshots described in the QA record are not attached as handoff captures; the task drawer notes that shots were skipped. A human can review the captures from the run’s scratch directory.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

