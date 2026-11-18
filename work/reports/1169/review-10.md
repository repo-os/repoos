---
task: "1169"
pass: 10
at: "2026-11-18T15:37:14.438Z"
agent: reviewer
cli: codex
model: gpt-6-luna
branch: feat/qa-pass-macos-repoos-hub-app-build-launc
state: ok
tree_identity: "84cd5c18f:"
---
Repeated review classes: **QA isolation** and **test-host scratch cleanup** are fixed and covered by tests; **incomplete acceptance coverage** is explicitly deferred to human task #1174. A human should look at this recurring verification pattern.

## Verdict
good to go — the in-scope QA and registry-isolation fix are recorded; signed-in verification is tracked separately.

## Relevance
still relevant — this pass records the Hub’s build, launch, discovery, and connection checks and fixes test-host writes to the user registry.

## Evidence
None

## Bugs
None found

No further findings of these classes were found after grepping: `ServerRegistryStore.applicationSupportDirectory` callers, XCTest termination cleanup, registry tests, test-host build settings, the QA record, and changed server-command tests. No new bare `node`, `npm`, or `npx` invocation appears in the diff.

## Edge cases
Signed-in Projects and Tasks remain unverified pending #1174, as the task spec requires. Discovery of a stopped server and secondary Hub features were not exercised. The engineering report source matches the reviewed implementation tree apart from report and task bookkeeping. The supplied landing checklist reports only the task’s own work file conflicts with main; I did not rerun merge-tree.

## Suggestions (non-blocking)
The window-only captures are described in the QA record but not attached as handoff captures. A human can review them from the run’s scratch directory.

## Automated verification
- Browser console-error check: skipped; UI handoff browser verification did not apply.
- Guard negative-test evidence: skipped; no check guard rules were materially changed.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

