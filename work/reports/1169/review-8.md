---
task: "1169"
pass: 8
at: "2026-11-18T14:18:39.267Z"
agent: reviewer
cli: codex
model: gpt-6-luna
branch: feat/qa-pass-macos-repoos-hub-app-build-launc
state: ok
tree_identity: "84cd5c18f:"
---
Repeated review classes: **QA isolation** and **test-host scratch cleanup** are fixed and covered by tests. **Incomplete acceptance coverage** is correctly recorded as out of scope pending #1174, as the task spec requires. A human should review the recurring gap between this QA pass and signed-in verification.

## Verdict
good to go — the in-scope build, launch, discovery, and connection checks are recorded; signed-in verification is tracked separately.

## Relevance
still relevant — this pass found and fixed test runs writing to the real Hub registry, a distinct issue for the macOS QA workflow.

## Evidence
None

## Bugs
None found

No further findings of these classes were found after grepping: `ServerRegistryStore.applicationSupportDirectory` callers, XCTest cleanup and termination handling, registry tests, Hub launch documentation and QA record, and changed test commands. No new bare `node`, `npm`, or `npx` invocation appears in the diff.

## Edge cases
Signed-in Projects and Tasks, discovery of a stopped server, and several secondary Hub features remain unverified and are explicitly recorded; #1174 tracks signed-in verification. The engineering report’s source commit matches the implementation tree. Merge-tree verification could not complete because the sandbox denied creating a temporary file; the provided landing checklist reports only the task’s own work file conflicts with main.

## Suggestions (non-blocking)
Complete #1174 before relying on signed-in Projects and Tasks in this build.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

